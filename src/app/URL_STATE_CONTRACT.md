# URL State Contract (Phase 2)

This document defines the interface boundary for `src/app/url-state.js`.
The goal is behavior parity with the current app while making ownership explicit.

## Owned Responsibilities

- Own browser URL serialization/deserialization for app `params`.
- Own cached URL metadata in `url_info` (`json`, full URL, compressed URL, search string).
- Own message-driven URL/param bridge for iframe embedding (`getUrlInfo`, `getParams`, `setParams`).
- Own reset-to-default behavior for URL/message flows using injected defaults.
- Delegate all domain behavior (expression generation, layout syncing, parsing/merging) to injected collaborators.

## Public API

Factory:

```js
createUrlState({ params, defaultParams, util, viz, initFromParams }) => {
  url_info,
  saveUrlInfo,
  saveUrl,
  initFromSearchParams,
  handleMessage,
}
```

Function signatures:

```js
saveUrlInfo() => void
saveUrl() => void
initFromSearchParams() => void
handleMessage(event: MessageEvent) => void
```

`url_info` shape:

```js
{
  json: string,
  url: string,
  compressed: string,
  search_params: string,
}
```

Inbound message protocol (`event.data` keys):

```js
getUrlInfo: {}
getParams: {}
setParams: { props?: object, reset?: boolean }
```

## Invariants

- `url_info` is mutable shared state and is refreshed by `saveUrlInfo`/`saveUrl`.
- `saveUrlInfo` serializes from current `params` and computes:
  - `url_info.url` using current compression mode (auto-enables `params.compress` when uncompressed query exceeds 2048 chars).
  - `url_info.compressed` with `compress: true` regardless of current mode.
- `saveUrl` always calls `saveUrlInfo` first, then pushes history state, then posts `{ search_params }` to parent window when embedded.
- `initFromSearchParams` parses `window.location.search` into `params`; when empty, it resets from `defaultParams` and `viz.defaultCam()`.
- `initFromSearchParams` removes `params.sync_expr` if present, regenerates `params.expr` via `viz.genExpr(params)`, then calls `initFromParams(false)`.
- `setParams` handling preserves current behavior order:
  1. Optional reset.
  2. Optional `sync_expr` path (`viz.syncExpr`, then remove `sync_expr` from incoming props).
  3. Recursive props merge (`util.updatePropsRec`).
  4. Regenerate expression (`viz.genExpr`).
  5. Apply layout scheme side effect when `props.layout?.scheme` is provided.
  6. Reinitialize via `initFromParams()`.

## Dependency Boundary

`url-state` depends only on injected collaborators:

- `util.copyTree`, `util.makeSearchParams`, `util.updateObjectFromSearchParams`, `util.updatePropsRec`
- `viz.defaultCam`, `viz.genExpr`, `viz.syncExpr`, `viz.setLayoutScheme`
- `initFromParams(save?: boolean)` callback owned by app bootstrap

It does not import scene/gui/runtime modules directly.

## Non-goals

- No validation/schema enforcement for incoming message payloads beyond current tolerant merge behavior.
- No ownership of rendering, camera math, GUI construction, or animation loop.
- No URL shortening/storage backend; only query-string generation and browser history updates.
- No cross-origin policy management beyond current `postMessage` usage.
