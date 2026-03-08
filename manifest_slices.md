# Slice Manifest

Last updated: 2026-03-08

## Board Status

- Coordination model: Git-backed file board
- Event stream: `AGENT_BOARD.jsonl`
- Orchestrator protocol: `ORCHESTRATOR.md`
- Lease/heartbeat policy: 15m lease, 5m heartbeat, 10m stale timeout

## Slice Snapshot

| Slice         | Branch                | Worktree                        | Owner        | Status      | Latest Commit |
| ------------- | --------------------- | ------------------------------- | ------------ | ----------- | ------------- |
| runtime-shell | `slice/runtime-shell` | `worktrees/slice-runtime-shell` | unassigned   | merged      | `8daa221`     |
| url-state     | `slice/url-state`     | `worktrees/slice-url-state`     | unassigned   | merged      | `8daa221`     |
| ui-controls   | `slice/ui-controls`   | `worktrees/slice-ui-controls`   | unassigned   | merged      | `8daa221`     |
| visualization | `slice/visualization` | `worktrees/slice-visualization` | unassigned   | merged      | `8daa221`     |
| data-loading  | `slice/data-loading`  | `worktrees/slice-data-loading`  | agent-data-2 | in_progress | `8daa221`     |
| simulation    | `slice/simulation`    | `worktrees/slice-simulation`    | agent-sim-2  | in_progress | `8daa221`     |

## Assignment Rule

- When an agent starts work, append a `claim` event in `AGENT_BOARD.jsonl` and update `Owner` in this table.
- When blocked, append a `block` event and set `Status` to `blocked`.
- When PR is ready, append `handoff` and set `Status` to `review`.
- After merge into `feat/vertical-slice-base`, append `merge` and set `Status` to `merged`.
