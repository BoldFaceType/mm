// Gate G5 — explicit tensor-to-matrix mapping.
//
// The defect: loaded values were wrapped into the configured matrix with
// modulo indexing, so a 4096x4096 tensor shown in a 12x8 matrix silently
// displayed a tiled fold of itself and called it the weights.

import assert from "node:assert/strict";
import test from "node:test";

import { ggufCropInit } from "../../viz.js";

// A 3x4 tensor with values encoding their own position: r*10 + c.
const tensor = {
  shape: [3, 4],
  data: Float32Array.from([
    0, 1, 2, 3,
    10, 11, 12, 13,
    20, 21, 22, 23,
  ]),
};

const render = (init, h, w) => {
  const out = [];
  for (let i = 0; i < h; i++) {
    const row = [];
    for (let j = 0; j < w; j++) row.push(init(i, j, h, w));
    out.push(row);
  }
  return out;
};

test("G5.1 an exact-fit crop reproduces the tensor", () => {
  const init = ggufCropInit(tensor, {});
  assert.deepEqual(render(init, 3, 4), [
    [0, 1, 2, 3],
    [10, 11, 12, 13],
    [20, 21, 22, 23],
  ]);
});

test("G5.2 a smaller matrix takes the top-left crop, not a fold", () => {
  const init = ggufCropInit(tensor, {});
  assert.deepEqual(render(init, 2, 2), [
    [0, 1],
    [10, 11],
  ]);
});

test("G5.3 the crop origin selects a sub-block", () => {
  const init = ggufCropInit(tensor, { row0: 1, col0: 2 });
  assert.deepEqual(render(init, 2, 2), [
    [12, 13],
    [22, 23],
  ]);
});

test("G5.4 reading past the tensor yields 0, never a wrapped value", () => {
  // Modulo indexing would make element (3, 0) read row 0 again.
  const init = ggufCropInit(tensor, {});
  const grid = render(init, 5, 6);
  assert.deepEqual(grid[3], [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(grid[4], [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(grid[0], [0, 1, 2, 3, 0, 0]);
});

test("G5.5 out-of-range reads are reported, not silent", () => {
  const init = ggufCropInit(tensor, {});
  render(init, 5, 6);
  assert.ok(
    init.outOfRange > 0,
    "the init function should count reads that fell outside the tensor",
  );

  const exact = ggufCropInit(tensor, {});
  render(exact, 3, 4);
  assert.equal(exact.outOfRange, 0);
});

test("G5.6 transpose swaps the axes", () => {
  const init = ggufCropInit(tensor, { transpose: true });
  assert.deepEqual(render(init, 4, 3), [
    [0, 10, 20],
    [1, 11, 21],
    [2, 12, 22],
    [3, 13, 23],
  ]);
});

test("G5.7 transpose composes with the crop origin", () => {
  const init = ggufCropInit(tensor, { transpose: true, row0: 1, col0: 1 });
  // Transposed tensor is 4x3; origin (1,1) starts at transposed element (1,1),
  // which is original element (1,1) = 11.
  assert.deepEqual(render(init, 2, 2), [
    [11, 21],
    [12, 22],
  ]);
});

test("G5.8 a negative or non-integer origin is clamped to a valid one", () => {
  const init = ggufCropInit(tensor, { row0: -5, col0: 1.7 });
  assert.deepEqual(render(init, 1, 2), [[1, 2]]);
});

test("G5.9 the init function exposes the source extent it was built from", () => {
  const init = ggufCropInit(tensor, { row0: 1 });
  assert.deepEqual(init.sourceShape, [3, 4]);
  assert.deepEqual(init.origin, [1, 0]);
});
