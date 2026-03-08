import test from "node:test";
import assert from "node:assert/strict";

import { rebuildVisualizationObject } from "../src/app/visualization-runtime.js";

test("rebuildVisualizationObject disposes old object and wires new object", () => {
  const calls = {
    sceneRemove: [],
    sceneAdd: [],
    updateTitle: 0,
    oldDisposeAll: 0,
    newCenter: 0,
  };

  const oldObj = {
    group: { id: "old-group" },
    getBoundingBox: () => ({ h: 2, w: 2, d: 2 }),
    disposeAll: () => {
      calls.oldDisposeAll += 1;
    },
  };

  const newGroup = { rotation: { x: 0 }, id: "new-group" };
  const createdObj = {
    group: newGroup,
    getBoundingBox: () => ({ h: 2, w: 2, d: 2 }),
    center: () => {
      calls.newCenter += 1;
    },
    setLegends: () => {},
    initAnimation: () => {},
  };

  class MatMulMock {
    constructor() {
      return createdObj;
    }
  }

  const scene = {
    remove: (group) => calls.sceneRemove.push(group),
    add: (group) => calls.sceneAdd.push(group),
  };

  const result = rebuildVisualizationObject({
    obj: oldObj,
    params: { any: "value" },
    viz: { MatMul: MatMulMock },
    util: { bbhwd: (bb) => bb },
    getContext: () => ({ stub: true }),
    scene,
    camera: { position: { x: 1, y: 1, z: 1, set() {} } },
    orbit: { update() {} },
    requestCameraPositionSave: () => {},
    updateTitle: () => {
      calls.updateTitle += 1;
    },
  });

  assert.equal(result, createdObj);
  assert.equal(calls.oldDisposeAll, 1);
  assert.equal(calls.newCenter, 1);
  assert.deepEqual(calls.sceneRemove, [oldObj.group]);
  assert.deepEqual(calls.sceneAdd, [newGroup]);
  assert.equal(calls.updateTitle, 1);
});
