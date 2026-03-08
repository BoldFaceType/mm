import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = process.cwd();
const EVENT_SCRIPT = path.join(REPO_ROOT, "scripts", "board-event.mjs");

test("board-event appends claim with lease metadata", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-board-event-"));
  try {
    fs.writeFileSync(path.join(tempDir, "AGENT_BOARD.jsonl"), "", "utf8");

    const result = spawnSync(
      process.execPath,
      [
        EVENT_SCRIPT,
        "--event",
        "claim",
        "--agent",
        "agent-test",
        "--branch",
        "slice/simulation",
        "--slice",
        "simulation",
        "--task",
        "phase2_simulation_contracts",
        "--status",
        "in_progress",
      ],
      {
        cwd: tempDir,
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const line = fs
      .readFileSync(path.join(tempDir, "AGENT_BOARD.jsonl"), "utf8")
      .trim();
    const event = JSON.parse(line);

    assert.equal(event.event, "claim");
    assert.equal(event.agent, "agent-test");
    assert.equal(event.slice, "simulation");
    assert.ok(event.lease_until);
    assert.equal(event.heartbeat_interval_sec, 300);
    assert.equal(event.stale_after_sec, 600);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
