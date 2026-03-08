## Simulation Engine Contract (Phase 3)

This document defines the runtime behavior expected from `src/app/simulation-engine.js` and how `src/app/main.js` integrates it.

### State model

The `SimulationEngine` class maintains mutable runtime state with these core animation fields:

- `anim_pause: boolean` - global pause gate for algorithm animation.
- `anim_step: boolean` - one-shot step request flag used only while paused.
- `last_render: number` - timestamp (`performance.now()` domain) of the last successful algorithm bump.
- `last_anim: number` - timestamp (`performance.now()` domain) of the previous animation frame.
- `last_anim_alg: string` - most recent non-`"none"` algorithm name remembered for toggling.
- `last_anim_spin: number` - most recent non-zero spin value remembered for toggling.

Initialization defaults:

- `anim_pause = false`
- `anim_step = false`
- `last_render = 0`
- `last_anim = 0`
- `last_anim_alg = initial?.alg ?? "none"`
- `last_anim_spin = initial?.spin ?? 0`

### Execution Graph and Activation Cache

The `SimulationEngine` now acts as a central coordinator for execution states:

- **Execution Graph:** Managed via `loadExecutionGraph(graph)` to provide a step-by-step sequence of operations.
- **Activation Cache:** A key-value store mapping node IDs/steps to activation data (`cacheActivation(id, data)`, `getActivation(id)`). This allows rewinding and inspecting state without re-running operations.
- **Rewinding:** `rewindTo(stepIndex)` allows navigating the execution graph history.
- **Hooks:** Visualization layer registers via `addStateListener(callback)` to read state changes whenever a step or rewind occurs.

### Step semantics

`stepSimulation(params, obj, now)` must call `obj.bump()` exactly once when all conditions are true:

1. `params.anim.alg != "none"`
2. `this.anim_step || !this.anim_pause`
3. `now - this.last_render > 1000 / params.anim.speed`

On a successful bump:

- `this.last_render` is updated to `now`.
- `this.anim_step` is cleared to `false`.
- `this.current_step_index` advances.
- Listeners are notified with the current state.

If any condition fails, no bump occurs and state is unchanged.

### Pause/step contract

- `setAnimationPause(pause)` only sets `this.anim_pause = pause`.
- `requestAnimationStep()` only sets `this.anim_step = true` when currently paused.
- Step requests are one-shot and consumed by the next successful `stepSimulation` bump.
- While unpaused, step requests are ignored by `requestAnimationStep`.
- Integration in `main.js` maps:
  - `animPause(p)` -> `engine.setAnimationPause(p)`
  - `animStep()` -> `engine.requestAnimationStep()`
  - `animate()` frame loop -> `engine.stepSimulation(params, obj, performance.now())`

### Timing assumptions

- `now` values come from `performance.now()` and are monotonic in normal browser execution.
- The step gate uses a strict `>` threshold, not `>=`.
- Effective bump cadence is frame-limited and cannot exceed the browser's animation frame rate.
- If `params.anim.speed` is very high, bumps still occur at most once per frame.
- If `params.anim.speed <= 0`, the computed threshold is non-positive or infinite; behavior follows raw JavaScript arithmetic with no runtime validation in this module.

### Non-goals

- No validation or normalization of `params` shape or value ranges.
- No ownership of algorithm selection (`params.anim.alg`) or spin toggling (`params.anim.spin`).
- No camera/render orchestration; this module only gates `obj.bump()`.
- No persistence/history concerns (URL state, GUI wiring, or message-passing APIs).
