"use strict";

export function createSimulationRuntime(initial = false) {
  return {
    anim_pause: false,
    anim_step: false,
    last_render: 0,
    last_anim: 0,
    last_anim_alg: initial?.alg ?? "none",
    last_anim_spin: initial?.spin ?? 0,
  };
}

export function setAnimationPause(runtime, pause) {
  runtime.anim_pause = pause;
}

export function requestAnimationStep(runtime) {
  if (runtime.anim_pause) {
    runtime.anim_step = true;
  }
}

export function stepSimulation(runtime, params, obj, now) {
  if (
    params.anim.alg != "none" &&
    (runtime.anim_step || !runtime.anim_pause) &&
    now - runtime.last_render > 1000 / params.anim.speed
  ) {
    obj.bump();
    runtime.last_render = now;
    runtime.anim_step = false;
  }
}
