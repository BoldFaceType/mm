import test from "node:test";
import assert from "node:assert/strict";
import { GGUFLoader } from "../src/data/gguf-loader.js";

// Helper to encode a 32-bit float to a 16-bit float integer
function fp32ToFp16(f) {
  const f32 = new Float32Array([f]);
  const u32 = new Uint32Array(f32.buffer)[0];
  const sign = (u32 >> 16) & 0x8000;
  let exp = ((u32 >> 23) & 0xff) - 127 + 15;
  let frac = (u32 >> 13) & 0x3ff;

  if (exp <= 0) {
    // Denormals or zero
    frac = ((u32 & 0x7fffff) | 0x800000) >> (1 - exp + 13);
    exp = 0;
  } else if (exp >= 31) {
    // Infinity or NaN
    exp = 31;
    frac = 0;
  }
  return sign | (exp << 10) | frac;
}

test("GGUFLoader parses valid MVP structure", () => {
  // Construct a minimal GGUF ArrayBuffer
  // Magic(4) + Version(4) + TensorCount(8) + MetadataCount(8) = 24 bytes
  const buffer = new ArrayBuffer(1024);
  const view = new DataView(buffer);

  // Header
  view.setUint32(0, 0x46554747, true); // 'GGUF'
  view.setUint32(4, 3, true); // version = 3
  view.setBigUint64(8, 1n, true); // 1 tensor
  view.setBigUint64(16, 1n, true); // 1 metadata kv

  let offset = 24;

  // Metadata 1: key="test.key", type=8 (String), val="value"
  const key = "test.key";
  view.setBigUint64(offset, BigInt(key.length), true);
  offset += 8;
  for (let i = 0; i < key.length; i++) {
    view.setUint8(offset++, key.charCodeAt(i));
  }
  view.setUint32(offset, 8, true); // type = String
  offset += 4;
  const val = "value";
  view.setBigUint64(offset, BigInt(val.length), true);
  offset += 8;
  for (let i = 0; i < val.length; i++) {
    view.setUint8(offset++, val.charCodeAt(i));
  }

  // Tensor 1: name="tensor.1", dims=2, [10, 20], type=0 (F32), offset=0
  const tname = "tensor.1";
  view.setBigUint64(offset, BigInt(tname.length), true);
  offset += 8;
  for (let i = 0; i < tname.length; i++) {
    view.setUint8(offset++, tname.charCodeAt(i));
  }
  view.setUint32(offset, 2, true);
  offset += 4; // nDims
  view.setBigUint64(offset, 10n, true);
  offset += 8; // dim 0
  view.setBigUint64(offset, 20n, true);
  offset += 8; // dim 1
  view.setUint32(offset, 0, true);
  offset += 4; // type F32
  view.setBigUint64(offset, 0n, true);
  offset += 8; // offset = 0

  // create a slice matching the true size
  const finalBuffer = buffer.slice(0, offset);

  const loader = new GGUFLoader();
  const success = loader.parse(finalBuffer);

  assert.ok(success);
  assert.equal(loader.version, 3);
  assert.equal(loader.tensorCount, 1);
  assert.equal(loader.metadataKvCount, 1);

  assert.equal(loader.getMetadata("test.key"), "value");

  const infos = loader.getTensorInfos();
  assert.equal(infos.length, 1);
  assert.equal(infos[0].name, "tensor.1");
  // user shape is reversed from GGUF storage:
  assert.deepEqual(infos[0].shape, [20, 10]);
  assert.equal(infos[0].typeName, "F32");
  assert.equal(infos[0].byteOffset, 0);
});

test("GGUFLoader dequantizes Q4_0 correctly", () => {
  const buffer = new ArrayBuffer(1024);
  const view = new DataView(buffer);

  // Header
  view.setUint32(0, 0x46554747, true); // 'GGUF'
  view.setUint32(4, 3, true); // version = 3
  view.setBigUint64(8, 1n, true); // 1 tensor
  view.setBigUint64(16, 0n, true); // 0 metadata kv

  let offset = 24;

  // Tensor 1: name="q4_0_tensor", dims=1, [32], type=2 (Q4_0), offset=0
  const tname = "q4_0_tensor";
  view.setBigUint64(offset, BigInt(tname.length), true);
  offset += 8;
  for (let i = 0; i < tname.length; i++) {
    view.setUint8(offset++, tname.charCodeAt(i));
  }
  view.setUint32(offset, 1, true);
  offset += 4; // nDims = 1
  view.setBigUint64(offset, 32n, true);
  offset += 8; // dim 0 = 32
  view.setUint32(offset, 2, true);
  offset += 4; // type Q4_0 = 2
  view.setBigUint64(offset, 0n, true);
  offset += 8; // offset = 0

  // Alignment padding
  const padding = (32 - (offset % 32)) % 32;
  offset += padding;

  // Q4_0 Data Block
  const dataStartOffset = offset;
  const d_fp16 = fp32ToFp16(2.0); // Scale = 2.0
  view.setUint16(offset, d_fp16, true);
  offset += 2; // Delta

  // Set first 16 values to -8 to 7, and next 16 to -8 to 7
  // So vi will contain two values
  for (let i = 0; i < 16; i++) {
    const v0 = (i % 16) - 8;
    const v1 = ((15 - i) % 16) - 8;
    // v0 = (vi & 0x0f) - 8 => vi_low = v0 + 8
    // v1 = (vi >> 4) - 8   => vi_high = v1 + 8
    const vi_low = (v0 + 8) & 0x0f;
    const vi_high = (v1 + 8) & 0x0f;
    const vi = (vi_high << 4) | vi_low;
    view.setUint8(offset++, vi);
  }

  const finalBuffer = buffer.slice(0, offset);
  const loader = new GGUFLoader();
  const success = loader.parse(finalBuffer);

  assert.ok(success);

  const tensorData = loader.getTensorData("q4_0_tensor");
  assert.ok(tensorData);
  assert.equal(tensorData.data.length, 32);

  // Verify first 16 values
  for (let i = 0; i < 16; i++) {
    const expected_v0 = (i % 16) - 8;
    const expected_v1 = ((15 - i) % 16) - 8;
    assert.equal(tensorData.data[i], expected_v0 * 2.0);
    assert.equal(tensorData.data[i + 16], expected_v1 * 2.0);
  }
});

test("GGUFLoader dequantizes Q8_0 correctly", () => {
  const buffer = new ArrayBuffer(1024);
  const view = new DataView(buffer);

  // Header
  view.setUint32(0, 0x46554747, true); // 'GGUF'
  view.setUint32(4, 3, true); // version = 3
  view.setBigUint64(8, 1n, true); // 1 tensor
  view.setBigUint64(16, 0n, true); // 0 metadata kv

  let offset = 24;

  const tname = "q8_0_tensor";
  view.setBigUint64(offset, BigInt(tname.length), true);
  offset += 8;
  for (let i = 0; i < tname.length; i++) {
    view.setUint8(offset++, tname.charCodeAt(i));
  }
  view.setUint32(offset, 1, true);
  offset += 4;
  view.setBigUint64(offset, 32n, true);
  offset += 8;
  view.setUint32(offset, 8, true);
  offset += 4; // type Q8_0 = 8
  view.setBigUint64(offset, 0n, true);
  offset += 8;

  const padding = (32 - (offset % 32)) % 32;
  offset += padding;

  const d_fp16 = fp32ToFp16(0.5); // Scale = 0.5
  view.setUint16(offset, d_fp16, true);
  offset += 2;

  for (let i = 0; i < 32; i++) {
    view.setInt8(offset++, i - 16);
  }

  const finalBuffer = buffer.slice(0, offset);
  const loader = new GGUFLoader();
  const success = loader.parse(finalBuffer);
  assert.ok(success);

  const tensorData = loader.getTensorData("q8_0_tensor");
  assert.ok(tensorData);
  assert.equal(tensorData.data.length, 32);

  for (let i = 0; i < 32; i++) {
    assert.equal(tensorData.data[i], (i - 16) * 0.5);
  }
});
