import fs from "node:fs";
import path from "node:path";

const BOARD_PATH = path.resolve("AGENT_BOARD.jsonl");
const DEFAULT_LEASE_MIN = 15;
const DEFAULT_HEARTBEAT_SEC = 300;
const DEFAULT_STALE_SEC = 600;

function getArg(name, fallback = null) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx === -1) {
    return fallback;
  }
  return process.argv[idx + 1] ?? fallback;
}

function requireArg(name) {
  const value = getArg(name);
  if (!value) {
    console.error(`missing required argument --${name}`);
    process.exit(1);
  }
  return value;
}

function toUtcString(ms = Date.now()) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const event = requireArg("event");
const payload = {
  ts: toUtcString(),
  agent: requireArg("agent"),
  branch: requireArg("branch"),
  slice: requireArg("slice"),
  event,
  task: requireArg("task"),
  status: requireArg("status"),
};

const details = getArg("details");
const commit = getArg("commit");
const pr = getArg("pr");
if (details) payload.details = details;
if (commit) payload.commit = commit;
if (pr) payload.pr = pr;

if (event === "claim" || event === "takeover") {
  const leaseMin = Number(getArg("lease-min", String(DEFAULT_LEASE_MIN)));
  if (!Number.isFinite(leaseMin) || leaseMin <= 0) {
    console.error("--lease-min must be a positive number");
    process.exit(1);
  }
  payload.lease_until = toUtcString(Date.now() + leaseMin * 60 * 1000);
  payload.heartbeat_interval_sec = DEFAULT_HEARTBEAT_SEC;
  payload.stale_after_sec = DEFAULT_STALE_SEC;
}

fs.appendFileSync(BOARD_PATH, `${JSON.stringify(payload)}\n`, "utf8");
console.log(`appended board event: ${event}`);
