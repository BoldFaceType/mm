// Gate G1 — GGUF decoding correctness.
//
// Every expected value comes from tests/fixtures/expected.json, produced by the
// official `gguf` Python package (the llama.cpp reference implementation). No
// expectation in this file is derived from the JavaScript under test.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { listTensors, loadGGUF } from "../../GGUFLoader.js";

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

// Q4/Q5 scales are fp16, so a decoded value carries at most ~1e-3 relative
// error against the float64 reference. Exact equality is not the contract;
// element ordering and magnitude are.
const TOL = 1e-5;

test("G1.1 listTensors reports every fixture tensor with its quant type", () => {
  const listed = listTensors(buffer("fixtures.gguf"));
  const byName = new Map(listed.map((t) => [t.name, t]));

  for (const [name, want] of Object.entries(expected.tensors)) {
    const got = byName.get(name);
    assert.ok(got, `tensor '${name}' missing from listTensors output`);
    assert.equal(got.quantType, want.quantType, `${name}: quant type`);
    assert.deepEqual(got.shape, want.shape, `${name}: shape`);
  }
});

test("G1.2 decoded values match the llama.cpp reference, element for element", async () => {
  const tensors = await loadGGUF(buffer("fixtures.gguf"));

  for (const [name, want] of Object.entries(expected.tensors)) {
    const got = tensors.get(name);
    assert.ok(got, `tensor '${name}' missing from loadGGUF output`);
    assert.equal(
      got.data.length,
      want.values.length,
      `${name}: decoded element count`,
    );

    let worst = 0;
    let worstAt = -1;
    for (let i = 0; i < want.values.length; i++) {
      const ref = want.values[i];
      const err = Math.abs(got.data[i] - ref) / Math.max(1, Math.abs(ref));
      if (err > worst) {
        worst = err;
        worstAt = i;
      }
    }
    assert.ok(
      worst <= TOL,
      `${name} (${want.quantType}): worst relative error ${worst.toExponential(3)} at index ` +
        `${worstAt} (got ${got.data[worstAt]}, reference ${want.values[worstAt]}); ` +
        `tolerance ${TOL}`,
    );
  }
});

test("G1.3 decoded output is never all zeros for a non-degenerate tensor", async () => {
  const tensors = await loadGGUF(buffer("fixtures.gguf"));
  for (const [name] of Object.entries(expected.tensors)) {
    const { data } = tensors.get(name);
    assert.ok(
      data.some((v) => v !== 0),
      `${name}: decoded to all zeros`,
    );
  }
});

test("G1.4 half-block ordering: first and seventeenth elements are distinct halves", async () => {
  // Q4_x and Q5_x pack 32 values per block as low nibbles for y[0..15] and
  // high nibbles for y[16..31]. An interleaved decoder puts the high nibble of
  // byte 0 at y[1] instead of y[16]. The fixture seeds y[0], y[1], y[16] and
  // y[17] with four distinct extreme values, so the two layouts cannot agree.
  const tensors = await loadGGUF(buffer("fixtures.gguf"));
  for (const tname of ["Q4_0", "Q4_1", "Q5_0", "Q5_1"]) {
    const name = `test.${tname.toLowerCase()}`;
    const want = expected.tensors[name];
    const got = tensors.get(name);
    for (const i of [0, 1, 16, 17]) {
      assert.ok(
        Math.abs(got.data[i] - want.values[i]) <=
          TOL * Math.max(1, Math.abs(want.values[i])),
        `${name}: element ${i} is ${got.data[i]}, reference ${want.values[i]} — ` +
          `block element ordering does not match llama.cpp`,
      );
    }
  }
});
