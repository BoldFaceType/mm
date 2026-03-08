import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = process.cwd();
const VALIDATOR = path.join(REPO_ROOT, "scripts", "validate-board.mjs");

function writeBoard(tempDir, lines) {
  fs.writeFileSync(
    path.join(tempDir, "AGENT_BOARD.jsonl"),
    `${lines.join("\n")}\n`,
    "utf8",
  );
}

test("validate-board passes for valid claim/start/heartbeat flow", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-board-test-"));
  try {
    writeBoard(tempDir, [
      JSON.stringify({
        ts: "2026-03-08T19:00:00Z",
        agent: "agent-1",
        branch: "slice/url-state",
        slice: "url-state",
        event: "claim",
        task: "phase2_url_state_contracts",
        status: "in_progress",
        lease_until: "2026-03-08T19:15:00Z",
      }),
      JSON.stringify({
        ts: "2026-03-08T19:00:10Z",
        agent: "agent-1",
        branch: "slice/url-state",
        slice: "url-state",
        event: "start",
        task: "phase2_url_state_contracts",
        status: "in_progress",
      }),
      JSON.stringify({
        ts: "2026-03-08T19:04:00Z",
        agent: "agent-1",
        branch: "slice/url-state",
        slice: "url-state",
        event: "heartbeat",
        task: "phase2_url_state_contracts",
        status: "in_progress",
      }),
    ]);

    const result = spawnSync(process.execPath, [VALIDATOR], {
      cwd: tempDir,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("validate-board fails when heartbeat occurs without active lease", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-board-test-"));
  try {
    writeBoard(tempDir, [
      JSON.stringify({
        ts: "2026-03-08T19:00:00Z",
        agent: "agent-1",
        branch: "slice/url-state",
        slice: "url-state",
        event: "heartbeat",
        task: "phase2_url_state_contracts",
        status: "in_progress",
      }),
    ]);

    const result = spawnSync(process.execPath, [VALIDATOR], {
      cwd: tempDir,
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /without active lease/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
