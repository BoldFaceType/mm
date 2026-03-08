# Runtime Shell Contract

## Scope

`src/app/main.js` is the runtime shell for the MM browser app. It owns app bootstrapping, browser/DOM wiring, renderer lifecycle, camera/input wiring, URL synchronization, iframe message bridging, and animation loop orchestration.

Rendering/math model behavior remains owned by `viz.js`; generic data/URL utilities remain owned by `util.js`; control-panel construction remains owned by `gui.js`.

## Owned Responsibilities

- Build and hold long-lived runtime state (`params`, camera, scene, renderer, orbit controls, raycaster, pointer, current `MatMul` instance).
- Convert URL search params into runtime state at startup/history navigation, and push updated state back into browser history.
- Create/dispose/recreate the active `viz.MatMul` scene object via `initObj()` when params or environment changes require rebuild.
- Wire browser events (`resize`, pointer, keyboard, `message`, `popstate`, DPR media query) into runtime actions.
- Provide GUI callbacks and diagnostics channels (`url_info`, `renderer.info.memory`) consumed by `gui.initGui`.
- Run the animation/render loop and optional magnifier viewport path.

## Stable Entrypoints

Module-level entrypoints that are stable for Phase-2 integration:

- `bootRuntimeShell()` - boots runtime from current URL state and starts animation loop.
- `RUNTIME_SHELL_RESPONDERS` - message responder table for iframe/host integrations.
  - `getUrlInfo`
  - `getParams`
  - `setParams`

Runtime side-effect entrypoint:

- Module evaluation calls `bootRuntimeShell()` once for browser usage through `index.html`.

## External Dependencies

- Rendering stack: `three` and `OrbitControls`.
- Domain/model layer: `viz.js` (`MatMul`, defaults, layout/expr helpers, material uniforms).
- Utility layer: `util.js` (search param sync, deep updates/copy, geometry helpers).
- UI layer: `gui.js` (`initGui`).
- Required DOM ids: `container`, `info`, `instructions`, `instructions-content`, `minimized`, `minimize`, `maximize`.
- Browser APIs: `window.history`, `postMessage`, `matchMedia`, pointer/keyboard events, `requestAnimationFrame`.

## Lifecycle Ordering

Expected ordering constraints:

1. Create renderer/camera/scene/orbit primitives.
2. Run `syncVizToRenderer()` before first object build so viz element sizing is correct.
3. Run `initFromSearchParams()` to hydrate `params` and call `initFromParams(false)`.
4. During `initFromParams(...)`:
   - camera target/position update
   - axes sync
   - object build (`initObj`)
   - GUI init with callbacks/info
5. Start `animate()` loop (single continuous loop).

Event-driven re-entry:

- `resize`/DPR changes call `syncVizToRenderer(true)` and rebuild object as needed.
- URL/history (`popstate`) rehydrates params via `initFromSearchParams()`.
- iframe message `setParams` merges updates, regenerates expr/layout, then re-inits from params.

## Invariants

- `params` remains the single mutable source of truth for view/model configuration.
- `params.expr` is regenerated from structured params after merges unless `sync_expr` flow explicitly drives reverse sync.
- `params.cam` tracks latest orbit camera state and is URL-serializable.
- Only one active `obj` (`viz.MatMul`) is attached to scene at a time; previous object is removed/disposed before replacement.
- GUI callback contract stays stable: `{ initObj, getObj, saveUrl, updateTitle, animPause, animStep }` plus `{ url_info, render_info }` info object.
- Runtime shell does not duplicate matrix construction logic; it delegates to `viz.MatMul`.

## Non-Goals

- Defining matrix math kernels, shading algorithms, or layout math internals (owned by `viz.js`).
- Defining GUI control taxonomy/content (owned by `gui.js`), beyond providing callback/info plumbing.
- Providing backend/network persistence; URL/history and postMessage are the only state exchange mechanisms in scope.
- Solving host-page trust/security policy for cross-window messaging (integration concern outside this module).
