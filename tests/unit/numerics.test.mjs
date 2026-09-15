// Gate G3 — the two inherited numerical defects in viz.js.
//
// viz.js is imported unmodified; tests/helpers/three-hook.mjs substitutes a
// stub for three.js so the module can load without a DOM.

import assert from "node:assert/strict";
import test from "node:test";

import { Array2D } from "../../viz.js";

const softmaxRow = (values) =>
  Array.from(
    Array2D.fromInit(1, values.length, (_i, j) => values[j], "softmax").data,
  );

const close = (a, b, tol = 1e-5) => Math.abs(a - b) <= tol;

test("G3.1 softmax is shift-invariant for extreme negative logits", () => {
  // The defect: row_max initialised to 0, so an all-negative row keeps rmax=0,
  // every exp() underflows, the denominator is 0, and 0/0 -> NaN -> 0.
  const got = softmaxRow([-1000, -1001]);
  const want = [0.7310585786300049, 0.2689414213699951];

  assert.ok(
    close(got[0], want[0]) && close(got[1], want[1]),
    `softmax([-1000,-1001]) = [${got}], expected [${want}]`,
  );
});

test("G3.2 softmax rows sum to 1", () => {
  for (const row of [
    [-1000, -1001],
    [-1, -2, -3],
    [0, 0, 0, 0],
    [1, 2, 3],
    [100, 101, 102],
    [-50, 50],
  ]) {
    const got = softmaxRow(row);
    const sum = got.reduce((a, b) => a + b, 0);
    assert.ok(close(sum, 1, 1e-4), `row [${row}] -> [${got}], sum ${sum}`);
  }
});

test("G3.3 softmax agrees with the shifted-exponential definition", () => {
  const row = [-3.25, 0.5, 2.75, -1];
  const max = Math.max(...row);
  const exps = row.map((x) => Math.exp(x - max));
  const denom = exps.reduce((a, b) => a + b, 0);
  const want = exps.map((e) => e / denom);

  const got = softmaxRow(row);
  got.forEach((v, i) =>
    assert.ok(close(v, want[i]), `index ${i}: ${v} vs ${want[i]}`),
  );
});

test("G3.4 softmax of a uniform row is uniform", () => {
  const got = softmaxRow([-7, -7, -7, -7]);
  got.forEach((v) => assert.ok(close(v, 0.25), `got ${v}, expected 0.25`));
});

test("G3.5 Array2D.map returns a mapped array of the same shape", () => {
  // The defect: map() allocates new Float32Array(n) with n undefined.
  const a = Array2D.fromInit(3, 4, (i, j) => i * 4 + j);
  const b = a.map((x) => x * 2);

  assert.equal(b.h, 3);
  assert.equal(b.w, 4);
  assert.equal(b.data.length, 12);
  for (let i = 0; i < 12; i++) {
    assert.equal(b.data[i], i * 2, `element ${i}`);
  }
});

test("G3.6 Array2D.map does not mutate the source", () => {
  const a = Array2D.fromInit(2, 2, () => 3);
  const b = a.map((x) => x + 1);
  assert.deepEqual(Array.from(a.data), [3, 3, 3, 3]);
  assert.deepEqual(Array.from(b.data), [4, 4, 4, 4]);
});

test("G3.7 Array2D.map handles the degenerate 0-element case", () => {
  const a = Array2D.fromInit(0, 0, () => 1);
  const b = a.map((x) => x);
  assert.equal(b.data.length, 0);
});
