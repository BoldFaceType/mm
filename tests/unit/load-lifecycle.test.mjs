// Gate G6 — load state and cache lifecycle.
//
// The defects: a pending load rendered placeholder zeros that were
// indistinguishable from real weights; failures only reached the console;
// local buffers were keyed by filename, so replacing a file with another of
// the same name kept serving the old decoded tensor; and a slow load could
// commit after a newer selection had already been made.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { beforeEach } from "node:test";

import {
  GGUF_STATUS,
  ggufState,
  ggufTensorList,
  registerLocalGGUFBuffer,
  requestGGUFTensor,
  resetGGUFState,
} from "../../viz.js";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);

function buffer(name) {
  const b = fs.readFileSync(path.join(FIXTURES, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

beforeEach(() => resetGGUFState());

test("G6.1 a tensor moves idle -> loading -> ready", async () => {
  const src = registerLocalGGUFBuffer("a.gguf", buffer("fixtures.gguf"));
  assert.equal(ggufState(src, "test.f32").status, GGUF_STATUS.IDLE);

  const pending = requestGGUFTensor(src, "test.f32");
  assert.equal(ggufState(src, "test.f32").status, GGUF_STATUS.LOADING);

  const result = await pending;
  assert.equal(result.status, GGUF_STATUS.READY);
  assert.equal(result.stale, false);
  assert.equal(ggufState(src, "test.f32").status, GGUF_STATUS.READY);
});

test("G6.2 a failure lands in the error state with a usable message", async () => {
  const src = registerLocalGGUFBuffer("b.gguf", buffer("mixed.gguf"));

  const result = await requestGGUFTensor(src, "bad.q4_k");
  assert.equal(result.status, GGUF_STATUS.ERROR);
  assert.match(result.error, /unsupported.*Q4_K/i);

  const state = ggufState(src, "bad.q4_k");
  assert.equal(state.status, GGUF_STATUS.ERROR);
  assert.match(state.error, /Q4_K/);
});

test("G6.3 a failed request leaves no cached tensor behind", async () => {
  const src = registerLocalGGUFBuffer("c.gguf", buffer("mixed.gguf"));
  await requestGGUFTensor(src, "no.such.tensor");

  // The next request for the same key must retry, not serve a stale success.
  const again = await requestGGUFTensor(src, "no.such.tensor");
  assert.equal(again.status, GGUF_STATUS.ERROR);
});

test("G6.4 replacing a local file with the same name invalidates its cache", async () => {
  const src = registerLocalGGUFBuffer("model.gguf", buffer("fixtures.gguf"));
  const first = await requestGGUFTensor(src, "test.f32");
  assert.equal(first.status, GGUF_STATUS.READY);
  assert.ok(ggufTensorList(src).some((t) => t.name === "test.f32"));

  // Same filename, different bytes — the old index and decoded tensors must go.
  const src2 = registerLocalGGUFBuffer("model.gguf", buffer("mixed.gguf"));
  assert.equal(src2, src, "the source key is still derived from the filename");

  assert.equal(
    ggufState(src, "test.f32").status,
    GGUF_STATUS.IDLE,
    "the previously decoded tensor must not survive the replacement",
  );

  const listing = ggufTensorList(src);
  assert.equal(listing.length, 0, "the stale index must be dropped too");

  const after = await requestGGUFTensor(src, "test.f32");
  assert.equal(
    after.status,
    GGUF_STATUS.ERROR,
    "the replacement file has no tensor by that name",
  );

  const good = await requestGGUFTensor(src, "good.q8_0");
  assert.equal(good.status, GGUF_STATUS.READY);
});

test("G6.5 re-registering identical bytes does not invalidate the cache", async () => {
  const bytes = buffer("fixtures.gguf");
  const src = registerLocalGGUFBuffer("same.gguf", bytes);
  await requestGGUFTensor(src, "test.f32");

  registerLocalGGUFBuffer("same.gguf", bytes);
  assert.equal(ggufState(src, "test.f32").status, GGUF_STATUS.READY);
});

test("G6.6 an older in-flight request reports itself stale", async () => {
  const src = registerLocalGGUFBuffer("d.gguf", buffer("fixtures.gguf"));

  const first = requestGGUFTensor(src, "test.f32");
  const second = requestGGUFTensor(src, "test.q8_0");

  const [a, b] = await Promise.all([first, second]);

  assert.equal(a.stale, true, "the superseded request must be marked stale");
  assert.equal(b.stale, false, "the newest request must not be");
  assert.equal(a.status, GGUF_STATUS.READY, "staleness is not failure");
});

test("G6.7 the newest request wins regardless of completion order", async () => {
  const src = registerLocalGGUFBuffer("e.gguf", buffer("mixed.gguf"));

  const failing = requestGGUFTensor(src, "bad.q4_k");
  const good = requestGGUFTensor(src, "good.q8_0");
  const [f, g] = await Promise.all([failing, good]);

  assert.equal(f.stale, true);
  assert.equal(g.stale, false);
  assert.equal(g.status, GGUF_STATUS.READY);
});

test("G6.8 state is tracked per tensor, not per file", async () => {
  const src = registerLocalGGUFBuffer("f.gguf", buffer("mixed.gguf"));
  await requestGGUFTensor(src, "bad.q4_k");
  await requestGGUFTensor(src, "good.q8_0");

  assert.equal(ggufState(src, "bad.q4_k").status, GGUF_STATUS.ERROR);
  assert.equal(ggufState(src, "good.q8_0").status, GGUF_STATUS.READY);
});
