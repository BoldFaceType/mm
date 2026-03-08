# Slice Manifest

Last updated: 2026-03-08

## Board Status

- Coordination model: Git-backed file board
- Event stream: `AGENT_BOARD.jsonl`
- Orchestrator protocol: `ORCHESTRATOR.md`
- Lease/heartbeat policy: 15m lease, 5m heartbeat, 10m stale timeout

## Slice Snapshot

| Slice         | Branch                | Worktree                        | Owner           | Status | Latest Commit |
| ------------- | --------------------- | ------------------------------- | --------------- | ------ | ------------- |
| runtime-shell | `slice/runtime-shell` | `worktrees/slice-runtime-shell` | agent-runtime-1 | review | `66a9560`     |
| url-state     | `slice/url-state`     | `worktrees/slice-url-state`     | agent-url-1     | review | `4da2c8b`     |
| ui-controls   | `slice/ui-controls`   | `worktrees/slice-ui-controls`   | agent-ui-1      | review | `7b7e3eb`     |
| visualization | `slice/visualization` | `worktrees/slice-visualization` | agent-viz-1     | review | `c6f2363`     |
| data-loading  | `slice/data-loading`  | `worktrees/slice-data-loading`  | agent-data-1    | review | `68e475d`     |
| simulation    | `slice/simulation`    | `worktrees/slice-simulation`    | agent-sim-1     | review | `6b86aa9`     |

## Assignment Rule

- When an agent starts work, append a `claim` event in `AGENT_BOARD.jsonl` and update `Owner` in this table.
- When blocked, append a `block` event and set `Status` to `blocked`.
- When PR is ready, append `handoff` and set `Status` to `review`.
- After merge into `feat/vertical-slice-base`, append `merge` and set `Status` to `merged`.
