# Orchestrator (Git-backed Board)

This repo uses a Git-backed coordination model for parallel agents.

## Files

- `AGENT_BOARD.jsonl`: append-only event stream (machine-friendly)
- `manifest_slices.md`: human-readable current status
- `SLICE_OWNERSHIP.md`: branch/worktree boundaries and merge order
- `board/event.schema.json`: event schema
- `scripts/validate-board.mjs`: board validator
- `scripts/board-event.mjs`: helper for appending events

## Policy Defaults

- Lease duration: 15 minutes
- Heartbeat interval: 5 minutes
- Stale timeout: 10 minutes

## Event Schema

Allowed `event` values:

- `init`
- `claim`
- `start`
- `heartbeat`
- `block`
- `handoff`
- `merge`
- `release`
- `takeover`

Allowed `status` values:

- `ready`
- `pending`
- `in_progress`
- `blocked`
- `review`
- `merged`
- `released`

Required fields in every event:

- `ts` (ISO-8601 UTC)
- `agent`
- `branch`
- `slice`
- `event`
- `task`
- `status`

Optional fields:

- `lease_until` (ISO-8601 UTC; required for `claim` and `takeover`)
- `heartbeat_interval_sec`
- `stale_after_sec`
- `depends_on` (array of task ids)
- `details`
- `commit`
- `pr`

## Workflow

1. Read latest events for the target `slice`.
2. Append `claim` with `lease_until`.
3. Append `start` when coding begins.
4. Append `heartbeat` every 5 minutes while active.
5. Append `block` immediately if blocked.
6. Append `handoff` with `commit` (and `pr` when available).
7. Integrator appends `merge` after PR lands in `feat/vertical-slice-base`.
8. Append `release` when the slice is no longer owned.

## Concurrency and Conflict Rules

- Exactly one active owner per slice.
- Earliest active lease wins.
- Work without an active lease is invalid.
- A lease is stale after 10 minutes without a heartbeat.
- Stale or expired lease may be replaced only with `takeover`.
- Losing claimant must append `release` with conflict details.

## Integration Rules

- Target branch for all slice PRs: `feat/vertical-slice-base`.
- Preferred merge order (see `SLICE_OWNERSHIP.md`):
  1. `slice/url-state`
  2. `slice/runtime-shell`
  3. `slice/ui-controls`
  4. `slice/visualization`
  5. `slice/data-loading`
  6. `slice/simulation`
- CI tripwires must pass before merge:
  - board validation
  - JS syntax checks
  - formatting checks

## Local Commands

```bash
node scripts/validate-board.mjs
node scripts/board-event.mjs --event heartbeat --agent agent-1 --branch slice/url-state --slice url-state --task extract_url_state_module --status in_progress --details "wiring done"
```

## JSONL Example

```json
{"ts":"2026-03-08T17:10:00Z","agent":"agent-url-1","branch":"slice/url-state","slice":"url-state","event":"claim","task":"extract_url_state_module","status":"in_progress","lease_until":"2026-03-08T17:25:00Z","heartbeat_interval_sec":300,"stale_after_sec":600}
{"ts":"2026-03-08T17:15:00Z","agent":"agent-url-1","branch":"slice/url-state","slice":"url-state","event":"heartbeat","task":"extract_url_state_module","status":"in_progress","details":"module extraction complete","commit":"4da2c8b"}
{"ts":"2026-03-08T17:19:00Z","agent":"agent-url-1","branch":"slice/url-state","slice":"url-state","event":"handoff","task":"extract_url_state_module","status":"review","commit":"4da2c8b"}
{"ts":"2026-03-08T17:35:00Z","agent":"integrator","branch":"feat/vertical-slice-base","slice":"url-state","event":"merge","task":"extract_url_state_module","status":"merged","pr":"https://github.com/BoldFaceType/mm/pull/<id>","commit":"<merge_sha>"}
```
