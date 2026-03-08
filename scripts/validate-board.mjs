import fs from "node:fs";
import path from "node:path";

const BOARD_PATH = path.resolve("AGENT_BOARD.jsonl");

const ALLOWED_EVENTS = new Set([
  "init",
  "claim",
  "start",
  "heartbeat",
  "block",
  "handoff",
  "merge",
  "release",
  "takeover",
]);

const ALLOWED_STATUS = new Set([
  "ready",
  "pending",
  "in_progress",
  "blocked",
  "review",
  "merged",
  "released",
]);

const REQUIRED_FIELDS = [
  "ts",
  "agent",
  "branch",
  "slice",
  "event",
  "task",
  "status",
];
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function fail(errors) {
  for (const err of errors) {
    console.error(`board validation error: ${err}`);
  }
  process.exit(1);
}

function parseLines(raw) {
  const rows = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const events = [];
  const errors = [];

  rows.forEach((line, idx) => {
    try {
      events.push({ row: idx + 1, data: JSON.parse(line) });
    } catch (err) {
      errors.push(`line ${idx + 1}: invalid JSON (${err.message})`);
    }
  });

  return { events, errors };
}

function validateShape(events) {
  const errors = [];
  for (const { row, data } of events) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in data)) {
        errors.push(`line ${row}: missing required field '${field}'`);
      }
    }

    if (typeof data.ts !== "string" || !ISO_UTC_RE.test(data.ts)) {
      errors.push(
        `line ${row}: ts must be ISO-8601 UTC like YYYY-MM-DDTHH:MM:SSZ`,
      );
    }
    if (!ALLOWED_EVENTS.has(data.event)) {
      errors.push(`line ${row}: invalid event '${data.event}'`);
    }
    if (!ALLOWED_STATUS.has(data.status)) {
      errors.push(`line ${row}: invalid status '${data.status}'`);
    }

    if (
      (data.event === "claim" || data.event === "takeover") &&
      !data.lease_until
    ) {
      errors.push(`line ${row}: '${data.event}' requires lease_until`);
    }

    if (
      data.lease_until &&
      (typeof data.lease_until !== "string" ||
        !ISO_UTC_RE.test(data.lease_until))
    ) {
      errors.push(`line ${row}: lease_until must be ISO-8601 UTC`);
    }
  }
  return errors;
}

function validateSliceFlow(events) {
  const errors = [];
  const bySlice = new Map();

  for (const entry of events) {
    const key = entry.data.slice;
    if (!bySlice.has(key)) {
      bySlice.set(key, []);
    }
    bySlice.get(key).push(entry);
  }

  for (const [slice, entries] of bySlice.entries()) {
    let activeLease = null;
    let lastHeartbeat = null;

    for (const { row, data } of entries) {
      const ts = Date.parse(data.ts);
      if (Number.isNaN(ts)) {
        continue;
      }

      const isClaim = data.event === "claim" || data.event === "takeover";
      if (isClaim) {
        const leaseUntilMs = Date.parse(data.lease_until);
        const leaseActive = activeLease && activeLease.leaseUntilMs > ts;
        const stale = lastHeartbeat
          ? ts - lastHeartbeat > 10 * 60 * 1000
          : false;

        if (leaseActive && !stale && data.event !== "takeover") {
          errors.push(
            `line ${row}: slice '${slice}' already has active lease by '${activeLease.agent}' until ${new Date(activeLease.leaseUntilMs).toISOString()}`,
          );
        }

        if (data.event === "takeover" && !activeLease) {
          errors.push(
            `line ${row}: takeover on slice '${slice}' requires existing prior lease`,
          );
        }

        activeLease = {
          agent: data.agent,
          leaseUntilMs,
        };
        lastHeartbeat = ts;
        continue;
      }

      if (data.event === "heartbeat") {
        if (!activeLease) {
          errors.push(
            `line ${row}: heartbeat on slice '${slice}' without active lease`,
          );
          continue;
        }
        if (activeLease.agent !== data.agent) {
          errors.push(
            `line ${row}: heartbeat agent '${data.agent}' does not match active lease owner '${activeLease.agent}' on slice '${slice}'`,
          );
        }
        if (ts > activeLease.leaseUntilMs) {
          errors.push(
            `line ${row}: heartbeat after lease expiration on slice '${slice}'`,
          );
        }
        lastHeartbeat = ts;
      }

      if (data.event === "release") {
        activeLease = null;
        lastHeartbeat = null;
      }
    }
  }

  return errors;
}

if (!fs.existsSync(BOARD_PATH)) {
  fail([`missing ${BOARD_PATH}`]);
}

const raw = fs.readFileSync(BOARD_PATH, "utf8");
const parsed = parseLines(raw);
const shapeErrors = validateShape(parsed.events);
const flowErrors =
  parsed.errors.length === 0 ? validateSliceFlow(parsed.events) : [];

const allErrors = [...parsed.errors, ...shapeErrors, ...flowErrors];
if (allErrors.length > 0) {
  fail(allErrors);
}

console.log(`board validation passed: ${parsed.events.length} events`);
