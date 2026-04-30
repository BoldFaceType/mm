"use strict"

// GGUF tensor quant type IDs (from ggml.h)
const GGUF_TYPE = {
  F32:    0,
  F16:    1,
  Q4_0:   2,
  Q4_1:   3,
  Q5_0:   6,
  Q5_1:   7,
  Q8_0:   8,
  Q8_1:   9,
  Q2_K:  10,
  Q3_K:  11,
  Q4_K:  12,
  Q5_K:  13,
  Q6_K:  14,
  Q8_K:  15,
  I8:    24,
  I16:   25,
  I32:   26,
  I64:   27,
  F64:   28,
}

const GGUF_TYPE_NAME = Object.fromEntries(Object.entries(GGUF_TYPE).map(([k, v]) => [v, k]))

// GGUF metadata value type IDs
const META_TYPE = {
  UINT8:   0,
  INT8:    1,
  UINT16:  2,
  INT16:   3,
  UINT32:  4,
  INT32:   5,
  FLOAT32: 6,
  BOOL:    7,
  STRING:  8,
  ARRAY:   9,
  UINT64: 10,
  INT64:  11,
  FLOAT64: 12,
}

// IEEE 754 half-float (FP16) → JS float64
function fp16ToFloat32(h) {
  const sign     = (h >> 15) & 1
  const exp      = (h >> 10) & 0x1F
  const mantissa =  h        & 0x3FF
  if (exp === 0) {
    // subnormal / zero
    return (sign ? -1 : 1) * Math.pow(2, -14) * (mantissa / 1024)
  }
  if (exp === 31) {
    return mantissa === 0 ? (sign ? -Infinity : Infinity) : NaN
  }
  return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + mantissa / 1024)
}

// Sequential cursor reader over an ArrayBuffer
class GGUFReader {
  constructor(buffer) {
    this.buffer = buffer
    this.view   = new DataView(buffer)
    this.offset = 0
  }

  readU8()  { return this.view.getUint8(this.offset++) }
  readI8()  { const v = this.view.getInt8(this.offset);    this.offset += 1; return v }
  readU16() { const v = this.view.getUint16(this.offset, true); this.offset += 2; return v }
  readI16() { const v = this.view.getInt16(this.offset, true);  this.offset += 2; return v }
  readU32() { const v = this.view.getUint32(this.offset, true); this.offset += 4; return v }
  readI32() { const v = this.view.getInt32(this.offset, true);  this.offset += 4; return v }
  readF32() { const v = this.view.getFloat32(this.offset, true); this.offset += 4; return v }
  readF64() { const v = this.view.getFloat64(this.offset, true); this.offset += 8; return v }

  // JavaScript numbers can exactly represent integers up to 2^53
  readU64() {
    const lo = this.view.getUint32(this.offset, true)
    const hi = this.view.getUint32(this.offset + 4, true)
    this.offset += 8
    return hi * 0x100000000 + lo
  }

  readI64() {
    const lo = this.view.getUint32(this.offset, true)
    const hi = this.view.getInt32(this.offset + 4, true)
    this.offset += 8
    return hi * 0x100000000 + lo
  }

  readFP16() { return fp16ToFloat32(this.readU16()) }

  readString() {
    const len   = this.readU64()
    const bytes = new Uint8Array(this.buffer, this.offset, len)
    this.offset += len
    return new TextDecoder().decode(bytes)
  }

  readMetaValue(value_type) {
    switch (value_type) {
      case META_TYPE.UINT8:   return this.readU8()
      case META_TYPE.INT8:    return this.readI8()
      case META_TYPE.UINT16:  return this.readU16()
      case META_TYPE.INT16:   return this.readI16()
      case META_TYPE.UINT32:  return this.readU32()
      case META_TYPE.INT32:   return this.readI32()
      case META_TYPE.FLOAT32: return this.readF32()
      case META_TYPE.BOOL:    return this.readU8() !== 0
      case META_TYPE.STRING:  return this.readString()
      case META_TYPE.UINT64:  return this.readU64()
      case META_TYPE.INT64:   return this.readI64()
      case META_TYPE.FLOAT64: return this.readF64()
      case META_TYPE.ARRAY: {
        const elem_type = this.readU32()
        const count     = this.readU64()
        const arr = []
        for (let i = 0; i < count; i++) arr.push(this.readMetaValue(elem_type))
        return arr
      }
      default:
        throw new Error(`GGUFLoader: unknown metadata value type ${value_type}`)
    }
  }
}

// Parse header, metadata KVs and tensor info records.
// Returns { metadata, tensor_infos, data_start }.
function parseGGUFStructure(buffer) {
  // Check magic "GGUF" (bytes 0x47 0x47 0x55 0x46 in file order)
  const magic = new Uint8Array(buffer, 0, 4)
  if (magic[0] !== 0x47 || magic[1] !== 0x47 || magic[2] !== 0x55 || magic[3] !== 0x46) {
    throw new Error('GGUFLoader: not a GGUF file (magic mismatch)')
  }

  const r = new GGUFReader(buffer)
  r.offset = 4

  const version = r.readU32()
  if (version < 2 || version > 3) {
    console.warn(`GGUFLoader: version ${version} may not be fully supported (expected 2 or 3)`)
  }

  const tensor_count        = r.readU64()
  const metadata_kv_count   = r.readU64()

  // Read metadata key-value pairs (we need 'general.alignment')
  const metadata = {}
  for (let i = 0; i < metadata_kv_count; i++) {
    const key        = r.readString()
    const value_type = r.readU32()
    metadata[key]    = r.readMetaValue(value_type)
  }

  const alignment = metadata['general.alignment'] || 32

  // Read tensor info records
  const tensor_infos = []
  for (let i = 0; i < tensor_count; i++) {
    const name   = r.readString()
    const n_dims = r.readU32()
    const dims   = []
    for (let d = 0; d < n_dims; d++) dims.push(r.readU64())
    const type   = r.readU32()
    const offset = r.readU64()
    tensor_infos.push({ name, dims, type, offset })
  }

  // Data section starts at the next alignment boundary after the info section
  const data_start = Math.ceil(r.offset / alignment) * alignment

  return { metadata, tensor_infos, data_start, alignment }
}

// --- Dequantization helpers ---

// F16 → F32 array
function dequantizeF16(bytes, n) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2)
  const out  = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = fp16ToFloat32(view.getUint16(i * 2, true))
  return out
}

// Q8_0: 34-byte blocks — fp16 scale + 32×int8
function dequantizeQ8_0(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = Math.floor(n / 32)
  for (let b = 0; b < nblocks; b++) {
    const base = b * 34
    const d    = fp16ToFloat32(view.getUint16(base, true))
    for (let i = 0; i < 32; i++) out[b * 32 + i] = d * view.getInt8(base + 2 + i)
  }
  return out
}

// Q4_0: 18-byte blocks — fp16 scale + 16 bytes (32 packed 4-bit values), offset by -8
function dequantizeQ4_0(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = Math.floor(n / 32)
  for (let b = 0; b < nblocks; b++) {
    const base = b * 18
    const d    = fp16ToFloat32(view.getUint16(base, true))
    for (let i = 0; i < 16; i++) {
      const byte = view.getUint8(base + 2 + i)
      out[b * 32 + i * 2 + 0] = d * ((byte & 0xF) - 8)
      out[b * 32 + i * 2 + 1] = d * ((byte >> 4) - 8)
    }
  }
  return out
}

// Q4_1: 20-byte blocks — fp16 scale + fp16 min + 16 bytes (32 packed 4-bit values)
function dequantizeQ4_1(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = Math.floor(n / 32)
  for (let b = 0; b < nblocks; b++) {
    const base = b * 20
    const d    = fp16ToFloat32(view.getUint16(base, true))
    const m    = fp16ToFloat32(view.getUint16(base + 2, true))
    for (let i = 0; i < 16; i++) {
      const byte = view.getUint8(base + 4 + i)
      out[b * 32 + i * 2 + 0] = d * (byte & 0xF) + m
      out[b * 32 + i * 2 + 1] = d * (byte >> 4)  + m
    }
  }
  return out
}

// Q5_0: 22-byte blocks — fp16 scale + uint32 high-bit mask + 16 bytes low nibbles, offset -16
function dequantizeQ5_0(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = Math.floor(n / 32)
  for (let b = 0; b < nblocks; b++) {
    const base = b * 22
    const d    = fp16ToFloat32(view.getUint16(base, true))
    const qh   = view.getUint32(base + 2, true)
    for (let i = 0; i < 16; i++) {
      const byte = view.getUint8(base + 6 + i)
      const xh0  = (qh >>> (i * 2 + 0)) & 1
      const xh1  = (qh >>> (i * 2 + 1)) & 1
      out[b * 32 + i * 2 + 0] = d * (((byte & 0xF) | (xh0 << 4)) - 16)
      out[b * 32 + i * 2 + 1] = d * (((byte >> 4)  | (xh1 << 4)) - 16)
    }
  }
  return out
}

// Q5_1: 24-byte blocks — fp16 scale + fp16 min + uint32 high-bit mask + 16 bytes low nibbles
function dequantizeQ5_1(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = Math.floor(n / 32)
  for (let b = 0; b < nblocks; b++) {
    const base = b * 24
    const d    = fp16ToFloat32(view.getUint16(base, true))
    const m    = fp16ToFloat32(view.getUint16(base + 2, true))
    const qh   = view.getUint32(base + 4, true)
    for (let i = 0; i < 16; i++) {
      const byte = view.getUint8(base + 8 + i)
      const xh0  = (qh >>> (i * 2 + 0)) & 1
      const xh1  = (qh >>> (i * 2 + 1)) & 1
      out[b * 32 + i * 2 + 0] = d * ((byte & 0xF) | (xh0 << 4)) + m
      out[b * 32 + i * 2 + 1] = d * ((byte >> 4)  | (xh1 << 4)) + m
    }
  }
  return out
}

// Q6_K: 256-element super-blocks — 210 bytes each
// Layout: ql[128] + qh[64] + scales[16] (int8) + d (fp16)
// Reference: llama.cpp ggml-quants.c dequantize_row_q6_K
function dequantizeQ6_K(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = Math.floor(n / 256)
  for (let b = 0; b < nblocks; b++) {
    const base = b * 210
    const d    = fp16ToFloat32(view.getUint16(base + 208, true)) // at offset 128+64+16
    // Process two groups of 128 elements each
    for (let g = 0; g < 2; g++) {
      const ql_off = base + g * 64          // x[i].ql advances by 64 each group
      const qh_off = base + 128 + g * 32   // x[i].qh advances by 32 each group
      const sc_off = base + 192 + g * 8    // x[i].scales advances by 8 each group
      const y_off  = b * 256 + g * 128
      for (let l = 0; l < 32; l++) {
        const is   = Math.floor(l / 16)
        const ql0  = view.getUint8(ql_off + l)
        const ql32 = view.getUint8(ql_off + l + 32)
        const qh_v = view.getUint8(qh_off + l)
        const q1   = ((ql0  & 0xF) | (((qh_v >>> 0) & 3) << 4)) - 32
        const q2   = ((ql32 & 0xF) | (((qh_v >>> 2) & 3) << 4)) - 32
        const q3   = ((ql0  >>> 4)  | (((qh_v >>> 4) & 3) << 4)) - 32
        const q4   = ((ql32 >>> 4)  | (((qh_v >>> 6) & 3) << 4)) - 32
        out[y_off + l +  0] = d * view.getInt8(sc_off + is + 0) * q1
        out[y_off + l + 32] = d * view.getInt8(sc_off + is + 2) * q2
        out[y_off + l + 64] = d * view.getInt8(sc_off + is + 4) * q3
        out[y_off + l + 96] = d * view.getInt8(sc_off + is + 6) * q4
      }
    }
  }
  return out
}

// Q8_K: 256-element super-blocks — 292 bytes each
// Layout: d (float32, 4 bytes) + qs[256] (int8) + bsums[16] (int16, unused for dequant)
// Reference: llama.cpp ggml-quants.c dequantize_row_q8_K
function dequantizeQ8_K(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = Math.floor(n / 256)
  for (let b = 0; b < nblocks; b++) {
    const base = b * 292
    const d    = view.getFloat32(base, true)
    for (let i = 0; i < 256; i++) out[b * 256 + i] = d * view.getInt8(base + 4 + i)
  }
  return out
}

// Dispatch dequantization by type
function dequantize(bytes, type, n) {
  switch (type) {
    case GGUF_TYPE.F32:  {
      // F32 values are stored in native little-endian order
      const view = new DataView(bytes.buffer, bytes.byteOffset, n * 4)
      const out  = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = view.getFloat32(i * 4, true)
      return out
    }
    case GGUF_TYPE.F16:  return dequantizeF16(bytes, n)
    case GGUF_TYPE.Q4_0: return dequantizeQ4_0(bytes, n)
    case GGUF_TYPE.Q4_1: return dequantizeQ4_1(bytes, n)
    case GGUF_TYPE.Q5_0: return dequantizeQ5_0(bytes, n)
    case GGUF_TYPE.Q5_1: return dequantizeQ5_1(bytes, n)
    case GGUF_TYPE.Q8_0: return dequantizeQ8_0(bytes, n)
    case GGUF_TYPE.Q6_K: return dequantizeQ6_K(bytes, n)
    case GGUF_TYPE.Q8_K: return dequantizeQ8_K(bytes, n)
    default:
      console.warn(`GGUFLoader: unsupported quant type ${GGUF_TYPE_NAME[type] ?? type}, returning zeros`)
      return new Float32Array(n)
  }
}

// Byte size of the raw (quantized) tensor data for a given type and element count
function tensorByteSize(type, numel) {
  switch (type) {
    case GGUF_TYPE.F32:  return numel * 4
    case GGUF_TYPE.F16:  return numel * 2
    case GGUF_TYPE.Q4_0: return Math.floor(numel / 32) * 18
    case GGUF_TYPE.Q4_1: return Math.floor(numel / 32) * 20
    case GGUF_TYPE.Q5_0: return Math.floor(numel / 32) * 22
    case GGUF_TYPE.Q5_1: return Math.floor(numel / 32) * 24
    case GGUF_TYPE.Q8_0: return Math.floor(numel / 32) * 34
    case GGUF_TYPE.Q6_K: return Math.floor(numel / 256) * 210
    case GGUF_TYPE.Q8_K: return Math.floor(numel / 256) * 292
    default:             return 0
  }
}

// Compute 2D shape from GGUF dims array.
// GGUF stores dims in reverse (column-major) order: dims[0] is the innermost (fastest) dimension.
// For a weight matrix W of shape [rows, cols], GGUF stores dims = [cols, rows].
// We return [rows, cols] = [dims[1], dims[0]] for 2-D tensors.
function dimsToShape(dims) {
  if (dims.length === 0) return [1, 1]
  if (dims.length === 1) return [1, dims[0]]
  return [dims[1], dims[0]]
}

// ---

/**
 * List tensors in a GGUF file without dequantizing.
 * @param {ArrayBuffer} buffer
 * @returns {Array<{name: string, shape: [number,number], quantType: string, byteSize: number}>}
 */
export function listTensors(buffer) {
  const { tensor_infos } = parseGGUFStructure(buffer)
  return tensor_infos.map(({ name, dims, type }) => {
    const numel     = dims.reduce((a, b) => a * b, 1)
    const shape     = dimsToShape(dims)
    const quantType = GGUF_TYPE_NAME[type] ?? `type_${type}`
    const byteSize  = tensorByteSize(type, numel)
    return { name, shape, quantType, byteSize }
  })
}

/**
 * Parse and dequantize all tensors in a GGUF file.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Map<string, {data: Float32Array, shape: [number,number], quantType: string}>>}
 */
export async function loadGGUF(buffer) {
  const { tensor_infos, data_start } = parseGGUFStructure(buffer)
  const result = new Map()
  for (const { name, dims, type, offset } of tensor_infos) {
    const numel    = dims.reduce((a, b) => a * b, 1)
    const byteSize = tensorByteSize(type, numel)
    const bytes    = new Uint8Array(buffer, data_start + offset, byteSize)
    const data     = dequantize(bytes, type, numel)
    const shape    = dimsToShape(dims)
    const quantType = GGUF_TYPE_NAME[type] ?? `type_${type}`
    result.set(name, { data, shape, quantType })
  }
  return result
}
