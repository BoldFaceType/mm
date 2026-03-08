# Vertical Slice Ownership

Baseline commit: `01eb2e1884d91f30c6b5548b9dcef422b18fe9e0`

## Branches and folders

- `feat/vertical-slice-base` (integration trunk)
- `slice/runtime-shell` -> `C:\Dev\projects\mm_reference_copy\worktrees\slice-runtime-shell`
- `slice/url-state` -> `C:\Dev\projects\mm_reference_copy\worktrees\slice-url-state`
- `slice/ui-controls` -> `C:\Dev\projects\mm_reference_copy\worktrees\slice-ui-controls`
- `slice/visualization` -> `C:\Dev\projects\mm_reference_copy\worktrees\slice-visualization`
- `slice/data-loading` -> `C:\Dev\projects\mm_reference_copy\worktrees\slice-data-loading`
- `slice/simulation` -> `C:\Dev\projects\mm_reference_copy\worktrees\slice-simulation`

## Ownership boundaries

- `slice/runtime-shell`

  - Owns app bootstrap and frame loop wiring.
  - Target areas: `index.html` module script extraction, renderer/camera/orbit setup, pointer/keyboard event shell.
  - Avoid changing matrix math and GUI schema logic.

- `slice/url-state`

  - Owns URL parsing/serialization and iframe message API.
  - Target areas: search param encode/decode, history push/pop, `getUrlInfo/getParams/setParams` responder wiring.
  - Avoid changing rendering loop and GUI control definitions.

- `slice/ui-controls`

  - Owns control composition and callback binding.
  - Target areas: `gui.js` organization, control factories, folder structure and listen/show rules.
  - Avoid changing matrix operations and URL codec internals.

- `slice/visualization`

  - Owns `Mat`, `MatMul`, display state, legends, spotlight visuals.
  - Target areas: `viz.js` rendering classes and non-data-loader visualization behavior.
  - Avoid introducing URL-state or GUI framework behavior.

- `slice/data-loading`

  - Owns loading/parsing external tensor data.
  - Target areas: CSV/JSON/url/file loading modules and adapters; no simulation stepping logic.
  - Avoid modifying animation or visual classes except adapter interfaces.

- `slice/simulation`
  - Owns step execution flow and activation caching.
  - Target areas: simulation stepper, ordering, cache lifecycle, integration hooks into visualization.
  - Avoid changing URL codec and GUI schema except minimal wiring.

## Merge order

1. `slice/url-state`
2. `slice/runtime-shell`
3. `slice/ui-controls`
4. `slice/visualization`
5. `slice/data-loading`
6. `slice/simulation`

All slice branches merge into `feat/vertical-slice-base` first, then trunk merges to `master`.

## Working agreement

- Keep behavior parity until each slice lands.
- Small PRs: one architectural move per PR where possible.
- No cross-slice refactors in the same PR.
- Rebase/merge from `feat/vertical-slice-base` before opening PR.
- Add a short "What moved" section in each PR body.

## Quick start per agent

1. Open assigned worktree folder.
2. Confirm branch with `git branch --show-current`.
3. Pull latest trunk and rebase if needed.
4. Make focused changes only inside owned boundary.
5. Run lightweight smoke check (page loads, controls render).
6. Open PR into `feat/vertical-slice-base`.

## PR template (copy/paste)

Use this in every slice PR description:

```md
## What moved

-

## Why

-

## Scope boundary check

- [ ] Changes stay within assigned slice ownership
- [ ] No cross-slice refactor included

## Risk

-

## Validation

- [ ] App loads without console errors
- [ ] Existing controls render and respond
- [ ] URL load/save behavior unchanged (if touched)
- [ ] Animation/visual parity maintained (if touched)

## Follow-ups (optional)

-
```
