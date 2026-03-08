import test from "node:test";
import assert from "node:assert/strict";

import {
  createSimulationRuntime,
  requestAnimationStep,
  setAnimationPause,
  stepSimulation,
} from "../src/app/simulation-runtime.js";

test("createSimulationRuntime uses default values", () => {
  const runtime = createSimulationRuntime();

  assert.deepEqual(runtime, {
    anim_pause: false,
    anim_step: false,
    last_render: 0,
    last_anim: 0,
    last_anim_alg: "none",
    last_anim_spin: 0,
  });
});

test("stepSimulation only steps while paused when a step is requested", () => {
  const runtime = createSimulationRuntime();
  const params = {
    anim: {
      alg: "orbit",
      speed: 1,
    },
  };
  let bumpCount = 0;
  const obj = {
    bump() {
      bumpCount += 1;
    },
  };

  setAnimationPause(runtime, true);
  stepSimulation(runtime, params, obj, 1001);
  assert.equal(bumpCount, 0);

  requestAnimationStep(runtime);
  stepSimulation(runtime, params, obj, 2002);
  assert.equal(bumpCount, 1);
  assert.equal(runtime.anim_step, false);

  stepSimulation(runtime, params, obj, 3003);
  assert.equal(bumpCount, 1);

  setAnimationPause(runtime, false);
  stepSimulation(runtime, params, obj, 4004);
  assert.equal(bumpCount, 2);
});
