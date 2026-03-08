import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const JS_FILES = [];
const SKIP_DIRS = new Set([
  ".git",
  "assets",
  "lib",
  "intro",
  "board",
  ".github",
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!rel.endsWith(".js") && !rel.endsWith(".mjs")) continue;
    if (rel.startsWith("examples/")) continue;
    JS_FILES.push(rel);
  }
}

walk(ROOT);

if (JS_FILES.length === 0) {
  console.log("no JS files found for syntax check");
  process.exit(0);
}

const failed = [];
for (const file of JS_FILES) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    failed.push(file);
  }
}

if (failed.length > 0) {
  console.error(`syntax check failed for ${failed.length} files`);
  process.exit(1);
}

console.log(`syntax check passed for ${JS_FILES.length} files`);
