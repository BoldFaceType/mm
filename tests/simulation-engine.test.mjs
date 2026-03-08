import test from "node:test";
import assert from "node:assert/strict";

import { SimulationEngine } from "../src/app/simulation-engine.js";

test("SimulationEngine initializes with default values", () => {
  const engine = new SimulationEngine();

  assert.equal(engine.anim_pause, false);
  assert.equal(engine.anim_step, false);
  assert.equal(engine.last_render, 0);
  assert.equal(engine.last_anim, 0);
  assert.equal(engine.last_anim_alg, "none");
  assert.equal(engine.last_anim_spin, 0);
  assert.deepEqual(engine.execution_graph, []);
  assert.equal(engine.current_step_index, 0);
  assert.equal(engine.activation_cache.size, 0);
});

test("stepSimulation only steps while paused when a step is requested", () => {
  const engine = new SimulationEngine();
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

  engine.setAnimationPause(true);
  engine.stepSimulation(params, obj, 1001);
  assert.equal(bumpCount, 0);

  engine.requestAnimationStep();
  engine.stepSimulation(params, obj, 2002);
  assert.equal(bumpCount, 1);
  assert.equal(engine.anim_step, false);

  engine.stepSimulation(params, obj, 3003);
  assert.equal(bumpCount, 1);

  engine.setAnimationPause(false);
  engine.stepSimulation(params, obj, 4004);
  assert.equal(bumpCount, 2);
});

test("Execution graph loading and stepping", () => {
  const engine = new SimulationEngine();
  let listenerCalled = 0;
  let lastState = { currentNode: null };

  engine.addStateListener((state) => {
    listenerCalled++;
    lastState = state;
  });

  engine.loadExecutionGraph(["layer1", "layer2", "layer3"]);
  assert.equal(engine.current_step_index, 0);
  assert.equal(listenerCalled, 1);
  assert.equal(lastState?.currentNode, "layer1");

  const params = { anim: { alg: "orbit", speed: 10 } };
  const obj = { bump() {} };

  engine.stepSimulation(params, obj, 200); // 1000/10 = 100
  assert.equal(engine.current_step_index, 1);
  assert.equal(lastState?.currentNode, "layer2");

  engine.stepSimulation(params, obj, 400);
  assert.equal(engine.current_step_index, 2);
  assert.equal(lastState?.currentNode, "layer3");

  // Loops back
  engine.stepSimulation(params, obj, 600);
  assert.equal(engine.current_step_index, 0);
  assert.equal(lastState?.currentNode, "layer1");
});

test("Activation cache testing", () => {
  const engine = new SimulationEngine();
  engine.cacheActivation("n1", { val: 42 });
  assert.deepEqual(engine.getActivation("n1"), { val: 42 });

  engine.clearCache();
  assert.equal(engine.getActivation("n1"), undefined);
});

test("Rewinding execution graph", () => {
  const engine = new SimulationEngine();
  engine.loadExecutionGraph(["op1", "op2", "op3"]);
  engine.rewindTo(2);
  assert.equal(engine.current_step_index, 2);

  let notified = false;
  engine.addStateListener((state) => {
    if (state.currentStep === 1) notified = true;
  });
  engine.rewindTo(1);
  assert.ok(notified);
});
