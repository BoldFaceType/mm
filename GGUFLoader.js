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
  const nblocks = n / 32
  for (let b = 0; b < nblocks; b++) {
    const base = b * 34
    const d    = fp16ToFloat32(view.getUint16(base, true))
    for (let i = 0; i < 32; i++) out[b * 32 + i] = d * view.getInt8(base + 2 + i)
  }
  return out
}

// Block element ordering, for the four legacy 4/5-bit types below.
//
// llama.cpp packs a 32-element block into 16 bytes as two halves, NOT as
// interleaved pairs: the low nibble of byte j is element j, and the high
// nibble of byte j is element j + 16.
//
//   ggml-quants.c, dequantize_row_q4_0:
//     y[i*qk + j + 0 ] = (x[i].qs[j] & 0x0F) - 8) * d
//     y[i*qk + j + qk/2] = ((x[i].qs[j] >>  4) - 8) * d
//
// Decoding them as (2j, 2j+1) pairs produces a permutation of the right
// values, which looks plausible in a visualization and is wrong everywhere.

// Q4_0: 18-byte blocks — fp16 scale + 16 bytes (32 packed 4-bit values), offset by -8
function dequantizeQ4_0(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = n / 32
  for (let b = 0; b < nblocks; b++) {
    const base = b * 18
    const d    = fp16ToFloat32(view.getUint16(base, true))
    const y    = b * 32
    for (let j = 0; j < 16; j++) {
      const byte = view.getUint8(base + 2 + j)
      out[y + j     ] = d * ((byte & 0x0F) - 8)
      out[y + j + 16] = d * ((byte >>  4)  - 8)
    }
  }
  return out
}

// Q4_1: 20-byte blocks — fp16 scale + fp16 min + 16 bytes (32 packed 4-bit values)
function dequantizeQ4_1(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = n / 32
  for (let b = 0; b < nblocks; b++) {
    const base = b * 20
    const d    = fp16ToFloat32(view.getUint16(base, true))
    const m    = fp16ToFloat32(view.getUint16(base + 2, true))
    const y    = b * 32
    for (let j = 0; j < 16; j++) {
      const byte = view.getUint8(base + 4 + j)
      out[y + j     ] = d * (byte & 0x0F) + m
      out[y + j + 16] = d * (byte >>  4)  + m
    }
  }
  return out
}

// Q5_0: 22-byte blocks — fp16 scale + uint32 high-bit mask + 16 bytes low nibbles, offset -16
//
// The fifth bit of element j lives in bit j of qh; the fifth bit of element
// j + 16 lives in bit j + 16. llama.cpp writes this as:
//   xh_0 = ((qh >> j) << 4) & 0x10
//   xh_1 =  (qh >> (j + 12)) & 0x10
function dequantizeQ5_0(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = n / 32
  for (let b = 0; b < nblocks; b++) {
    const base = b * 22
    const d    = fp16ToFloat32(view.getUint16(base, true))
    const qh   = view.getUint32(base + 2, true)
    const y    = b * 32
    for (let j = 0; j < 16; j++) {
      const byte = view.getUint8(base + 6 + j)
      const xh0  = ((qh >>> j) << 4) & 0x10
      const xh1  =  (qh >>> (j + 12)) & 0x10
      out[y + j     ] = d * (((byte & 0x0F) | xh0) - 16)
      out[y + j + 16] = d * (((byte >>  4)  | xh1) - 16)
    }
  }
  return out
}

// Q5_1: 24-byte blocks — fp16 scale + fp16 min + uint32 high-bit mask + 16 bytes low nibbles
function dequantizeQ5_1(bytes, n) {
  const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out     = new Float32Array(n)
  const nblocks = n / 32
  for (let b = 0; b < nblocks; b++) {
    const base = b * 24
    const d    = fp16ToFloat32(view.getUint16(base, true))
    const m    = fp16ToFloat32(view.getUint16(base + 2, true))
    const qh   = view.getUint32(base + 4, true)
    const y    = b * 32
    for (let j = 0; j < 16; j++) {
      const byte = view.getUint8(base + 8 + j)
      const xh0  = ((qh >>> j) << 4) & 0x10
      const xh1  =  (qh >>> (j + 12)) & 0x10
      out[y + j     ] = d * ((byte & 0x0F) | xh0) + m
      out[y + j + 16] = d * ((byte >>  4)  | xh1) + m
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
  const nblocks = n / 256
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


// --- Type support table ---
//
// One place decides what this loader can decode. Everything else — dispatch,
// byte-size arithmetic, the `supported` flag on a listing — reads from here,
// so a type can never be half-supported.
//
// block: elements per block. type_size: bytes per block.
// Q8_K is deliberately absent: it is a runtime-only type used for dot-product
// intermediates and does not appear in GGUF files, so a decoder for it could
// never be exercised or verified. See docs/adr/ADR-0003.
const QUANT_SPEC = {
  [GGUF_TYPE.F32]:  { block:   1, type_size:  4, decode: (bytes, n) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, n * 4)
    const out  = new Float32Array(n)
    for (let i = 0; i < n; i++) out[i] = view.getFloat32(i * 4, true)
    return out
  } },
  [GGUF_TYPE.F16]:  { block:   1, type_size:  2, decode: dequantizeF16 },
  [GGUF_TYPE.Q4_0]: { block:  32, type_size: 18, decode: dequantizeQ4_0 },
  [GGUF_TYPE.Q4_1]: { block:  32, type_size: 20, decode: dequantizeQ4_1 },
  [GGUF_TYPE.Q5_0]: { block:  32, type_size: 22, decode: dequantizeQ5_0 },
  [GGUF_TYPE.Q5_1]: { block:  32, type_size: 24, decode: dequantizeQ5_1 },
  [GGUF_TYPE.Q8_0]: { block:  32, type_size: 34, decode: dequantizeQ8_0 },
  [GGUF_TYPE.Q6_K]: { block: 256, type_size: 210, decode: dequantizeQ6_K },
}

const typeName = type => GGUF_TYPE_NAME[type] ?? `type_${type}`

/** True when this loader can decode the given GGUF quant type id. */
export function isSupportedType(type) {
  return Object.prototype.hasOwnProperty.call(QUANT_SPEC, type)
}

/** Human-readable list of the quant types this loader decodes. */
export const SUPPORTED_TYPE_NAMES = Object.keys(QUANT_SPEC).map(t => typeName(Number(t)))

/**
 * Byte size of the raw (quantized) tensor data.
 * Throws for unsupported types and for element counts that do not fill whole
 * blocks — both indicate the file cannot be decoded correctly, and guessing a
 * size here is how a bad read turns into plausible-looking numbers.
 */
function tensorByteSize(type, numel) {
  const spec = QUANT_SPEC[type]
  if (!spec) {
    throw new Error(
      `GGUFLoader: unsupported quant type ${typeName(type)}. ` +
      `Supported: ${SUPPORTED_TYPE_NAMES.join(', ')}`
    )
  }
  if (numel % spec.block !== 0) {
    throw new Error(
      `GGUFLoader: ${typeName(type)} tensor has ${numel} elements, ` +
      `not a multiple of its ${spec.block}-element block size`
    )
  }
  return (numel / spec.block) * spec.type_size
}

// Dispatch dequantization by type. Unsupported types throw; they are never
// filled with zeros, because a zero-filled tensor is indistinguishable from
// real data once it reaches the visualization.
function dequantize(bytes, type, n) {
  const spec = QUANT_SPEC[type]
  if (!spec) {
    throw new Error(
      `GGUFLoader: unsupported quant type ${typeName(type)}. ` +
      `Supported: ${SUPPORTED_TYPE_NAMES.join(', ')}`
    )
  }
  return spec.decode(bytes, n)
}

// Compute 2D shape from GGUF dims array.
// GGUF stores dims in reverse (column-major) order: dims[0] is the innermost
// (fastest) dimension. For a weight matrix W of shape [rows, cols], GGUF
// stores dims = [cols, rows], so we return [rows, cols] = [dims[1], dims[0]].
// For rank > 2 this collapses the trailing dims; callers that need the real
// extents read `dims` and `rank` from the listing instead.
function dimsToShape(dims) {
  if (dims.length === 0) return [1, 1]
  if (dims.length === 1) return [1, dims[0]]
  return [dims[1], dims[0]]
}

// Locate one tensor's byte range and verify it lies inside the file.
function tensorRange(info, data_start, byteLength) {
  const numel    = info.dims.reduce((a, b) => a * b, 1)
  const byteSize = tensorByteSize(info.type, numel)
  const start    = data_start + info.offset
  const end      = start + byteSize
  if (start < 0 || end > byteLength) {
    throw new Error(
      `GGUFLoader: tensor '${info.name}' byte range [${start}, ${end}) is out of bounds ` +
      `for a ${byteLength}-byte file (truncated or corrupt)`
    )
  }
  return { numel, byteSize, start, end }
}

// ---

/**
 * List tensors in a GGUF file without decoding any of them.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Array<{
 *   name: string, shape: [number, number], dims: number[], rank: number,
 *   quantType: string, supported: boolean, numel: number,
 *   byteSize: number|null, decodedBytes: number
 * }>}
 */
export function listTensors(buffer) {
  const { tensor_infos } = parseGGUFStructure(buffer)
  return tensor_infos.map(({ name, dims, type }) => {
    const numel     = dims.reduce((a, b) => a * b, 1)
    const supported = isSupportedType(type)
    let byteSize = null
    if (supported) {
      try {
        byteSize = tensorByteSize(type, numel)
      } catch {
        byteSize = null
      }
    }
    return {
      name,
      shape: dimsToShape(dims),
      dims,
      rank: dims.length,
      quantType: typeName(type),
      supported,
      numel,
      byteSize,
      decodedBytes: numel * 4,
    }
  })
}

/**
 * Parse and dequantize every tensor in a GGUF file.
 *
 * Decodes the whole file into Float32Array storage (4 bytes per weight), so it
 * is only appropriate for small files. Prefer loadTensor() for anything else.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Map<string, {data: Float32Array, shape: [number,number], quantType: string}>>}
 */
export async function loadGGUF(buffer) {
  const { tensor_infos, data_start } = parseGGUFStructure(buffer)
  const result = new Map()
  // Validate every tensor before decoding any, so a file that cannot be fully
  // read fails before it has produced a partial, plausible-looking result.
  const ranges = tensor_infos.map(info => tensorRange(info, data_start, buffer.byteLength))
  tensor_infos.forEach((info, i) => {
    const { numel, byteSize, start } = ranges[i]
    const bytes = new Uint8Array(buffer, start, byteSize)
    result.set(info.name, {
      data: dequantize(bytes, info.type, numel),
      shape: dimsToShape(info.dims),
      quantType: typeName(info.type),
    })
  })
  return result
}
