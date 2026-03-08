import test from "node:test";
import assert from "node:assert/strict";
import { GGUFLoader } from "../src/data/gguf-loader.js";

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
