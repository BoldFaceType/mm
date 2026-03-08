# Visualization Runtime Contract (Phase 2)

This document defines the runtime contract between `src/app/main.js` (owner of app state, scene wiring, and browser events) and `src/app/visualization-runtime.js` (owner of visualization object replacement).

## Public API

### `rebuildVisualizationObject(deps) -> MatMul instance`

`visualization-runtime.js` exports one function:

- `rebuildVisualizationObject({ obj, params, viz, util, getContext, scene, camera, orbit, requestCameraPositionSave, updateTitle })`

Required behavior:

1. If `obj` exists, remove `obj.group` from `scene` and call `obj.disposeAll()` before creating a replacement.
2. Construct `nextObj = new viz.MatMul(params, getContext())`.
3. Apply canonical orientation (`nextObj.group.rotation.x = Math.PI`) and recenter (`nextObj.center()`).
4. If replacing an existing object, preserve visual framing by scaling camera position using bounding-box magnitude ratio (`h + w + d`) between new and old objects.
5. If camera scaling occurs, call `orbit.update()` and `requestCameraPositionSave()`.
6. Finalize replacement object via `nextObj.setLegends()` and `nextObj.initAnimation()`.
7. Add `nextObj.group` to `scene`, call `updateTitle()`, and return `nextObj`.

Inputs are passed by dependency injection; the runtime module does not import global app singletons directly.

## Object Lifecycle

Main wiring in `src/app/main.js` establishes the following lifecycle:

1. `initFromSearchParams()` computes params and calls `initFromParams()`.
2. `initFromParams()` configures camera/controls/axes and calls `initObj()`.
3. `initObj()` calls `rebuildVisualizationObject(...)` and stores the returned object in module-local `obj`.
4. Animation and interaction paths (`animate`, pointer handlers, keyboard handlers, message responders, resize) mutate params and may call `initObj()` when a full rebuild is needed.
5. During rebuild, prior object resources are disposed before replacement is attached.

Ownership boundaries:

- `main.js` owns event handling, URL sync, GUI wiring, animation loop scheduling, and app-level state.
- `visualization-runtime.js` owns only object replacement mechanics and camera scaling continuity across replacements.

## Performance-Sensitive Invariants

The following invariants preserve current runtime behavior and responsiveness:

- Rebuilds are explicit (`initObj()`), not implicit in high-frequency handlers.
- Label updates are throttled in `main.js` (single pending timer, 10 ms delay).
- Camera URL persistence is debounced in `main.js` (250 ms settle window) to avoid excessive history updates.
- Rebuild path disposes previous GPU/scene resources (`disposeAll`) before attaching replacement, preventing accumulation.
- Runtime rebuild performs bounded work: one object construction, one optional camera rescale, and one scene attach.

## Non-Goals

This contract intentionally does not define:

- Internal rendering semantics of `viz.MatMul` (geometry, shaders, label content, animation algorithm details).
- GUI schema, control panel layout, or URL parameter encoding format.
- Network/loading concerns, persistence beyond URL history, or cross-window protocol evolution.
- Error-recovery policy for invalid params; current behavior is best-effort and delegated to existing `viz`/`util` logic.

## Behavior Parity Notes

Phase-2 contractization is documentation-first. The current wiring already satisfies this interface boundary; no behavioral changes are required to adopt this contract.
