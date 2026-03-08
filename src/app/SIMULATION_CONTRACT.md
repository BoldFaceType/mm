## Simulation Runtime Contract (Phase 2)

This document defines the runtime behavior expected from `src/app/simulation-runtime.js` and how `src/app/main.js` integrates it.

### State model

`createSimulationRuntime(initial)` returns a mutable runtime object with these fields:

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

### Step semantics

`stepSimulation(runtime, params, obj, now)` must call `obj.bump()` exactly once when all conditions are true:

1. `params.anim.alg != "none"`
2. `runtime.anim_step || !runtime.anim_pause`
3. `now - runtime.last_render > 1000 / params.anim.speed`

On a successful bump:

- `runtime.last_render` is updated to `now`.
- `runtime.anim_step` is cleared to `false`.

If any condition fails, no bump occurs and state is unchanged.

### Pause/step contract

- `setAnimationPause(runtime, pause)` only sets `runtime.anim_pause = pause`.
- `requestAnimationStep(runtime)` only sets `runtime.anim_step = true` when currently paused.
- Step requests are one-shot and consumed by the next successful `stepSimulation` bump.
- While unpaused, step requests are ignored by `requestAnimationStep`.
- Integration in `main.js` maps:
  - `animPause(p)` -> `setAnimationPause(sim, p)`
  - `animStep()` -> `requestAnimationStep(sim)`
  - `animate()` frame loop -> `stepSimulation(sim, params, obj, performance.now())`

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
