# Data Loading Contract (Phase 2)

This document defines the current URL data-loading contract used by MM initializers.
The goal is behavior parity with existing runtime behavior.

## Scope

- Module: `src/data/url-data-loader.js`
- Integration point: `viz.js` via `tryURLInit(url)` inside `getInitFunc(...)` when `init === "url"`

## Loader Interfaces

- `tryURLInit(url: string): ((i: number, j: number, h: number, w: number) => number) | undefined`
  - Loads and parses URL-backed CSV-like data.
  - Returns an initializer function on success.
  - Returns `undefined` on failure.

- Internal `tryLoadData(data_url: string): number[][] | undefined`
  - Performs sync fetch and parse.
  - Returns parsed 2D numeric array or `undefined`.

## Sync Behavior

- Loading is synchronous (`XMLHttpRequest` with `async = false`).
- Caller is blocked until request completes or throws.
- In viz integration (`getInitFunc`), this means `init === "url"` resolves synchronously during matrix initialization.

## Parse and Access Semantics

- Response parsing:
  - Split by line breaks (`/\r?\n|\r/`).
  - Split each line by comma.
  - Coerce each cell with unary `+`.
- Returned initializer behavior:
  - Uses modulo addressing for both dimensions.
  - `row = data[i % data.length]`
  - `value = row[j % row.length]`
- Consequences of coercion are preserved:
  - Numeric strings become numbers.
  - Empty strings become `0`.
  - Non-numeric tokens become `NaN`.

## Cache Semantics

- Cache is module-local, in-memory, process lifetime (`DATA_CACHE`).
- Cache key is canonical URL string (`new URL(data_url).href`).
- Cached value is the parsed 2D array, returned by reference (no clone/copy).
- Repeated loads for the same canonical URL reuse cached parsed data.
- No eviction, TTL, or invalidation is implemented.

## Error Behavior

- Errors are caught inside loader and are non-throwing to callers.
- On error:
  - A diagnostic message is logged to console.
  - Loader returns `undefined`.
- In viz integration:
  - Missing initializer falls back to zero initializer with existing `getInitFunc(...)` logging.

## Non-Goals (Phase 2)

- No async fetch migration (`fetch`, promises, workers).
- No schema validation or strict CSV parser.
- No HTTP status/content-type validation guarantees.
- No retry policy, timeout policy, auth headers, or CORS policy handling.
- No persistent cache or cache invalidation controls.
