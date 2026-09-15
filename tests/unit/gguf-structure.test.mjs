// Gate G2 — GGUF structural safety: unsupported types, bounds, ranks.
//
// The failure these gates exist to prevent: a tensor the loader cannot decode
// silently becoming a plausible-looking field of zeros in the visualization.

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

function buffer(name) {
  const b = fs.readFileSync(path.join(FIXTURES, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

test("G2.1 an unsupported quant type is rejected, not zero-filled", async () => {
  await assert.rejects(
    () => loadGGUF(buffer("unsupported.gguf")),
    (err) => {
      assert.match(
        err.message,
        /Q4_K/,
        "the error should name the quant type that could not be decoded",
      );
      assert.match(
        err.message,
        /unsupported/i,
        "the error should say the type is unsupported",
      );
      return true;
    },
    "loading a Q4_K tensor must throw rather than return zeros",
  );
});

test("G2.2 an unsupported type is still listed, flagged as undecodable", () => {
  const listed = listTensors(buffer("unsupported.gguf"));
  assert.equal(listed.length, 1);
  assert.equal(listed[0].quantType, "Q4_K");
  assert.equal(
    listed[0].supported,
    false,
    "listTensors should mark tensors the decoder cannot handle",
  );
});

test("G2.3 every supported fixture tensor is listed as supported", () => {
  for (const t of listTensors(buffer("fixtures.gguf"))) {
    assert.equal(t.supported, true, `${t.name} (${t.quantType})`);
  }
});

test("G2.4 a truncated data section is rejected before any decode", async () => {
  await assert.rejects(
    () => loadGGUF(buffer("truncated.gguf")),
    (err) => {
      assert.match(
        err.message,
        /out of bounds|truncated|beyond/i,
        `expected a bounds error, got: ${err.message}`,
      );
      return true;
    },
    "a tensor whose byte range runs past the end of the file must throw",
  );
});

test("G2.5 a non-GGUF buffer is rejected with a clear message", async () => {
  const junk = new Uint8Array(1024).fill(0x41).buffer;
  await assert.rejects(
    () => loadGGUF(junk),
    /magic mismatch|not a GGUF/i,
  );
});

test("G2.6 rank-3 tensors are reported with their full dims", () => {
  const listed = listTensors(buffer("rank3.gguf"));
  const cube = listed.find((t) => t.name === "test.rank3");
  const flat = listed.find((t) => t.name === "test.rank2");

  assert.ok(cube, "rank-3 tensor missing from listing");
  assert.equal(cube.rank, 3, "rank should be reported");
  // GGUF stores dims innermost-first: a numpy (2,3,64) tensor is dims [64,3,2].
  assert.deepEqual(cube.dims, [64, 3, 2], "full dims should be preserved");

  assert.ok(flat, "rank-2 tensor missing from listing");
  assert.equal(flat.rank, 2);
  assert.deepEqual(flat.shape, [5, 64]);
});
