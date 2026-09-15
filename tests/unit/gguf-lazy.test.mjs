// Gate G4 — per-tensor decoding.
//
// The defect: loadGGUF() dequantized every tensor in the file and the caller
// kept one. Decoded Float32 storage costs 4 bytes per weight, so a 7B model
// needs ~28 GB before the visualization allocates anything.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  decodeStats,
  loadTensor,
  openGGUF,
  resetDecodeStats,
} from "../../GGUFLoader.js";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);

const expected = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, "expected.json"), "utf8"),
);

function buffer(name) {
  const b = fs.readFileSync(path.join(FIXTURES, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

const TOL = 1e-5;

test("G4.1 openGGUF indexes without decoding anything", () => {
  resetDecodeStats();
  const index = openGGUF(buffer("many.gguf"));
  assert.equal(index.tensors.length, 24);
  assert.equal(
    decodeStats().tensorsDecoded,
    0,
    "opening a file must not decode any tensor",
  );
  assert.equal(decodeStats().elementsDecoded, 0);
});

test("G4.2 loadTensor decodes exactly one tensor", () => {
  const index = openGGUF(buffer("many.gguf"));
  resetDecodeStats();

  const t = loadTensor(index, "blk.7.weight");

  assert.equal(decodeStats().tensorsDecoded, 1);
  assert.equal(
    decodeStats().elementsDecoded,
    t.data.length,
    "no elements beyond the requested tensor may be decoded",
  );
  assert.deepEqual(t.shape, [16, 256]);
});

test("G4.3 a second selection reuses the index and decodes only the new tensor", () => {
  const index = openGGUF(buffer("many.gguf"));
  loadTensor(index, "blk.1.weight");
  resetDecodeStats();

  const t = loadTensor(index, "blk.2.weight");

  assert.equal(decodeStats().tensorsDecoded, 1);
  assert.equal(decodeStats().elementsDecoded, t.data.length);
});

test("G4.4 loadTensor values match the llama.cpp reference", () => {
  const index = openGGUF(buffer("fixtures.gguf"));
  for (const [name, want] of Object.entries(expected.tensors)) {
    const got = loadTensor(index, name);
    assert.equal(got.data.length, want.values.length, `${name}: length`);
    for (let i = 0; i < want.values.length; i++) {
      const ref = want.values[i];
      const err = Math.abs(got.data[i] - ref) / Math.max(1, Math.abs(ref));
      assert.ok(err <= TOL, `${name}: element ${i} ${got.data[i]} vs ${ref}`);
    }
  }
});

test("G4.5 an undecodable tensor does not poison the rest of the file", () => {
  // Whole-file decoding throws on mixed.gguf. Per-tensor decoding must still
  // hand back the tensor the user actually asked for.
  const index = openGGUF(buffer("mixed.gguf"));
  assert.deepEqual(
    index.tensors.map((t) => [t.name, t.supported]),
    [
      ["good.q8_0", true],
      ["bad.q4_k", false],
    ],
  );

  const good = loadTensor(index, "good.q8_0");
  const want = expected.mixed["good.q8_0"];
  assert.equal(good.data.length, want.length);
  for (let i = 0; i < want.length; i++) {
    assert.ok(
      Math.abs(good.data[i] - want[i]) <= TOL * Math.max(1, Math.abs(want[i])),
      `element ${i}: ${good.data[i]} vs ${want[i]}`,
    );
  }

  assert.throws(() => loadTensor(index, "bad.q4_k"), /unsupported.*Q4_K/i);
});

test("G4.6 an unknown tensor name throws and names what is available", () => {
  const index = openGGUF(buffer("mixed.gguf"));
  assert.throws(
    () => loadTensor(index, "no.such.tensor"),
    (err) => {
      assert.match(err.message, /no\.such\.tensor/);
      assert.match(err.message, /good\.q8_0/, "should list available tensors");
      return true;
    },
  );
});

test("G4.7 the decoded-memory budget is enforced before allocation", () => {
  const index = openGGUF(buffer("many.gguf"));
  const info = index.tensors.find((t) => t.name === "blk.0.weight");

  assert.throws(
    () => loadTensor(index, "blk.0.weight", { maxDecodedBytes: 1024 }),
    (err) => {
      assert.match(err.message, /too large|budget|memory/i);
      assert.match(
        err.message,
        new RegExp(String(info.decodedBytes)),
        "the error should state how much the tensor would need",
      );
      return true;
    },
  );

  // And the same call succeeds once the budget allows it.
  assert.ok(
    loadTensor(index, "blk.0.weight", {
      maxDecodedBytes: info.decodedBytes,
    }).data.length > 0,
  );
});

test("G4.8 loadTensor validates bounds on the tensor it is asked for", () => {
  const index = openGGUF(buffer("truncated.gguf"));
  // The truncation removes the tail, so an early tensor still reads fine while
  // a late one does not. Both outcomes must be correct, not merely safe.
  const last = index.tensors[index.tensors.length - 1];
  assert.throws(
    () => loadTensor(index, last.name),
    /out of bounds|truncated|beyond/i,
  );
});
