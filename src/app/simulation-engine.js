"use strict";

export class SimulationEngine {
  constructor(initial = {}) {
    this.anim_pause = false;
    this.anim_step = false;
    this.last_render = 0;
    this.last_anim = 0;
    this.last_anim_alg = initial?.alg ?? "none";
    this.last_anim_spin = initial?.spin ?? 0;

    // Execution graph
    this.execution_graph = [];
    this.current_step_index = 0;

    // Activation cache
    this.activation_cache = new Map();

    // Hooks
    this.on_step_callbacks = new Set();
  }

  setAnimationPause(pause) {
    this.anim_pause = pause;
  }

  requestAnimationStep() {
    if (this.anim_pause) {
      this.anim_step = true;
    }
  }

  stepSimulation(params, obj, now) {
    if (
      params.anim.alg != "none" &&
      (this.anim_step || !this.anim_pause) &&
      now - this.last_render > 1000 / params.anim.speed
    ) {
      obj.bump();
      this.last_render = now;
      this.anim_step = false;

      // Advance execution graph if present
      if (this.execution_graph.length > 0) {
        this.current_step_index++;
        if (this.current_step_index >= this.execution_graph.length) {
          this.current_step_index = 0;
        }
      }

      this._notifyStateListeners();
    }
  }

  // Phase 3 specifics
  loadExecutionGraph(graph) {
    this.execution_graph = graph;
    this.current_step_index = 0;
    this.activation_cache.clear();
    this._notifyStateListeners();
  }

  cacheActivation(id, data) {
    this.activation_cache.set(id, data);
  }

  getActivation(id) {
    return this.activation_cache.get(id);
  }

  clearCache() {
    this.activation_cache.clear();
  }

  rewindTo(stepIndex) {
    if (stepIndex >= 0 && stepIndex < this.execution_graph.length) {
      this.current_step_index = stepIndex;
      this._notifyStateListeners();
    } else if (stepIndex === 0 && this.execution_graph.length === 0) {
      this.current_step_index = 0;
      this._notifyStateListeners();
    }
  }

  addStateListener(callback) {
    this.on_step_callbacks.add(callback);
  }

  removeStateListener(callback) {
    this.on_step_callbacks.delete(callback);
  }

  _notifyStateListeners() {
    if (this.on_step_callbacks.size === 0) return;

    const state = {
      currentStep: this.current_step_index,
      graphSize: this.execution_graph.length,
      currentNode: this.execution_graph[this.current_step_index] ?? null,
    };
    for (const cb of this.on_step_callbacks) {
      cb(state);
    }
  }
}
