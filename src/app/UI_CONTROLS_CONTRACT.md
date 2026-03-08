# UI Controls Contract (Phase 2)

This document defines the contract for `src/app/ui-controls.js` and its wiring to `gui.initGui` in `gui.js`.

## Purpose

`initUiControls` is the app-layer adapter that binds app state and app callbacks to the GUI implementation. It does not implement control logic; it delegates to `gui.initGui`.

## Public API

### `initUiControls(input)`

- **Module:** `src/app/ui-controls.js`
- **Signature:**

```js
initUiControls({
  params,
  initObj,
  getObj,
  saveUrl,
  updateTitle,
  animPause,
  animStep,
  url_info,
  render_info,
}) => GUI
```

- **Return value:** Returns the `lil-gui` instance returned by `gui.initGui`.

## Input Contract

`input` is a single object with required properties:

- `params` (object, mutable): canonical visualization/app parameters. GUI edits this object directly.
- `initObj` (function): re-initializes visualization objects after parameter changes.
- `getObj` (function): returns the active visualization object used by GUI callbacks.
- `saveUrl` (function): persists current `params` to browser history and updates sharable URL state.
- `updateTitle` (function): refreshes the expression/title display.
- `animPause` (function): toggles paused animation state.
- `animStep` (function): advances one animation step while paused.
- `url_info` (object, mutable): diagnostics model shown in GUI (`json`, `url`, `compressed`, etc.).
- `render_info` (object, mutable): render diagnostics model shown in GUI (for example `geometries`).

No defaults are provided in `ui-controls.js`; missing properties are programmer errors and will fail downstream in `gui.js`.

## Callback Contract

Callbacks passed to `gui.initGui` must satisfy:

- **`initObj`**: safe to call frequently and repeatedly; expected to reflect latest `params`.
- **`getObj`**: returns a live object with methods expected by `gui.js` handlers (for example `setName`, `hideInputs`, `setLegends`, `setRowGuides`, `setFlowGuide`, `updateLabels`).
- **`saveUrl`**: idempotent enough for frequent `onFinishChange` calls; must not throw in normal operation.
- **`updateTitle`**: updates visible title/expr when names change.
- **`animPause`/`animStep`**: handle GUI animation controls without mutating GUI internals.

## Expected Side Effects

Calling `initUiControls` (via `gui.initGui`) is expected to:

- Create a new GUI instance and destroy any previously active GUI instance managed in `gui.js`.
- Register GUI listeners that mutate `params` and invoke provided callbacks.
- Trigger URL persistence through `saveUrl` on folder open/close and control finish-change events.
- Read and display diagnostics from `url_info` and `render_info`.

## Ownership Boundaries

- **`ui-controls.js` owns:** app-to-GUI argument mapping only (`callbacks` and `info` packaging).
- **`gui.js` owns:** control tree construction, recursive mat/matmul editors, dynamic visibility rules, and event wiring.
- **`main.js` owns:** lifecycle of app state (`params`), visualization object creation, URL/history behavior, and browser-side effects.

`ui-controls.js` should stay thin and avoid embedding GUI behavior that belongs in `gui.js`.

## Behavior Parity Notes

- Phase-2 parity requires `initUiControls` to preserve the return value of `gui.initGui`.
- The adapter must pass through all callback and diagnostics objects without renaming semantics.

## Non-Goals

- Defining schema validation for `params`.
- Re-specifying individual GUI control ranges/options; those remain implementation details in `gui.js`.
- Owning URL compression/history strategy.
- Owning render loop, animation timing, or Three.js scene lifecycle.
