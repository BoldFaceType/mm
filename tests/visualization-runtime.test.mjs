import test from "node:test";
import assert from "node:assert/strict";

import { rebuildVisualizationObject } from "../src/app/visualization-runtime.js";
import { DataManager } from "../src/data/data-manager.js";

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

test("rebuildVisualizationObject enriches params with GGUF originalQuantType", () => {
  const originalLoad = DataManager.load;
  DataManager.load = (url, type) => {
    if (type === "gguf" && url === "test.gguf") {
      return {
        tensorInfos: [
          { name: "test_tensor", typeName: "Q4_0" },
        ],
      };
    }
    return null;
  };

  const params = {
    init: "gguf",
    url: "test.gguf",
    tensor: "test_tensor",
    left: {
      init: "gguf",
      url: "test.gguf",
      tensor: "missing_tensor"
    }
  };

  /** @type {any} */
  let capturedParams = null;
  class MatMulMock {
    constructor(p) {
      capturedParams = p;
      return {
        group: { rotation: { x: 0 } },
        center: () => {},
        setLegends: () => {},
        initAnimation: () => {},
        getBoundingBox: () => ({ h: 1, w: 1, d: 1 })
      };
    }
  }

  rebuildVisualizationObject({
    obj: null,
    params,
    viz: { MatMul: MatMulMock },
    util: { bbhwd: () => ({ h: 1, w: 1, d: 1 }) },
    getContext: () => ({}),
    scene: { add: () => {} },
    camera: {},
    orbit: {},
    requestCameraPositionSave: () => {},
    updateTitle: () => {},
  });

  assert.equal(capturedParams?.originalQuantType, "Q4_0");
  assert.equal(capturedParams?.left.originalQuantType, undefined);

  DataManager.load = originalLoad;
});
