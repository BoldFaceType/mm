// Browser verification gates.
//
// Drives the real page in headless Chromium with software WebGL, exercising
// each fix through the UI and capturing a screenshot of the result. Every gate
// records an observation; assertions run unless --observe-only is passed, so
// the same script can be pointed at the pre-fix tree to capture the "before"
// side of each pair.
//
//   node tests/browser/run-browser-gates.mjs [--observe-only] [--label NAME]
//
// Screenshots land in verification/screenshots/<label>/, observations in
// verification/gates/browser-<label>.json.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRequire } from "node:module";

import { serve } from "./server.mjs";

// Resolve Playwright through CJS so a globally installed copy (whose bundled
// browser build matches the machine) is used when the project has none.
// PLAYWRIGHT_EXECUTABLE overrides the browser binary if the two disagree.
const { chromium } = createRequire(import.meta.url)("playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const FIXTURES = path.join(ROOT, "tests", "fixtures");

const args = process.argv.slice(2);
const OBSERVE_ONLY = args.includes("--observe-only");
const LABEL = (() => {
  const i = args.indexOf("--label");
  return i >= 0 ? args[i + 1] : OBSERVE_ONLY ? "before" : "after";
})();

const SHOTS = path.join(ROOT, "verification", "screenshots", LABEL);
fs.mkdirSync(SHOTS, { recursive: true });

const observations = [];
let failures = 0;

function record(id, title, data) {
  observations.push({ id, title, ...data });
  const state = data.ok === false ? "FAIL" : data.ok === true ? "ok" : "--";
  console.log(`  [${state}] ${id} ${title}`);
  if (data.detail) console.log(`         ${data.detail}`);
}

function check(id, title, fn) {
  if (OBSERVE_ONLY) {
    try {
      fn();
      record(id, title, { ok: null, detail: "observed (no assertion)" });
    } catch (e) {
      record(id, title, { ok: null, detail: `observed: ${e.message}` });
    }
    return;
  }
  try {
    fn();
    record(id, title, { ok: true });
  } catch (e) {
    failures++;
    record(id, title, { ok: false, detail: e.message });
  }
}

const b64 = (name) => fs.readFileSync(path.join(FIXTURES, name)).toString("base64");

const expected = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, "expected.json"), "utf8"),
);

async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(ROOT, file);
}

// Drop a real File onto document.body, the way a user would.
async function dropFile(page, fileName, base64) {
  await page.evaluate(
    ([name, data]) => {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], name, { type: "application/octet-stream" });
      const dt = new DataTransfer();
      dt.items.add(file);
      document.body.dispatchEvent(
        new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    },
    [fileName, base64],
  );
}

async function main() {
  const { origin, close } = await serve(ROOT);
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE || undefined,
    args: [
      "--use-gl=swiftshader",
      "--enable-unsafe-swiftshader",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    console.log(`\nbrowser gates — label "${LABEL}"${OBSERVE_ONLY ? " (observe only)" : ""}\n`);

    await gateB0(browser, origin);
    await gateB1toB6(browser, origin);
  } finally {
    await browser.close();
    await close();
  }

  const out = path.join(ROOT, "verification", "gates", `browser-${LABEL}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ label: LABEL, observeOnly: OBSERVE_ONLY, observations }, null, 1),
  );

  console.log(`\n${observations.length} gates, ${failures} failing`);
  console.log(`screenshots: ${path.relative(ROOT, SHOTS)}`);
  console.log(`observations: ${path.relative(ROOT, out)}\n`);

  if (failures > 0) process.exitCode = 1;
}

// --- B0: the fixes hold in a real browser, not only in Node ---

async function gateB0(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${origin}/tests/browser/harness.html`);
  await page.waitForFunction(() => window.__mm && window.__mm.ready, null, {
    timeout: 20000,
  });

  const result = await page.evaluate(
    async ([q4Ref, ggufB64]) => {
      const { viz, loader } = window.__mm;
      const out = {};

      // softmax on an all-negative row
      try {
        const a = viz.Array2D.fromInit(1, 2, (_i, j) => [-1000, -1001][j], "softmax");
        out.softmax = Array.from(a.data);
      } catch (e) {
        out.softmaxError = e.message;
      }

      // Array2D.map
      try {
        const m = viz.Array2D.fromInit(2, 2, () => 1).map((x) => x * 2);
        out.map = Array.from(m.data);
      } catch (e) {
        out.mapError = e.message;
      }

      // Q4_0 block ordering, decoded in-browser against the reference vector
      try {
        const bin = atob(ggufB64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const tensors = await loader.loadGGUF(bytes.buffer);
        const t = tensors.get("test.q4_0");
        out.q4_0Head = Array.from(t.data.slice(0, 4));
        out.q4_0At16 = Array.from(t.data.slice(16, 20));
        let worst = 0;
        for (let i = 0; i < q4Ref.length; i++) {
          worst = Math.max(
            worst,
            Math.abs(t.data[i] - q4Ref[i]) / Math.max(1, Math.abs(q4Ref[i])),
          );
        }
        out.q4_0WorstRelError = worst;
      } catch (e) {
        out.q4_0Error = e.message;
      }

      return out;
    },
    [expected.tensors["test.q4_0"].values, b64("fixtures.gguf")],
  );

  const file = await shot(page, "B0-harness");

  record("B0.0", "harness page loads with no uncaught errors", {
    ok: OBSERVE_ONLY ? null : errors.length === 0,
    detail: errors.length ? errors.join(" | ") : "no page errors",
    screenshot: file,
    result,
  });
  if (!OBSERVE_ONLY && errors.length) failures++;

  check("B0.1", "softmax([-1000,-1001]) is a distribution in-browser", () => {
    assert.ok(result.softmax, `threw: ${result.softmaxError}`);
    assert.ok(
      Math.abs(result.softmax[0] - 0.7310585786) < 1e-5,
      `got [${result.softmax}]`,
    );
  });

  check("B0.2", "Array2D.map works in-browser", () => {
    assert.ok(result.map, `threw: ${result.mapError}`);
    assert.deepEqual(result.map, [2, 2, 2, 2]);
  });

  check("B0.3", "Q4_0 decodes to the reference values in-browser", () => {
    assert.ok(result.q4_0WorstRelError !== undefined, `threw: ${result.q4_0Error}`);
    assert.ok(
      result.q4_0WorstRelError < 1e-5,
      `worst relative error ${result.q4_0WorstRelError}`,
    );
  });

  await page.close();
}

// --- B1..B6: the application itself ---

async function gateB1toB6(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  const logs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));

  await page.goto(origin);
  await page.waitForFunction(
    () => document.querySelector("#container canvas") !== null,
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(1500);

  record("B1.0", "default scene renders", {
    ok: OBSERVE_ONLY ? null : errors.length === 0,
    detail: errors.length ? errors.join(" | ") : "canvas present, no page errors",
    screenshot: await shot(page, "B1-default-scene"),
  });

  // --- B2: drop a file, expect a tensor picker ---
  await dropFile(page, "fixtures.gguf", b64("fixtures.gguf"));
  await page.waitForTimeout(1200);

  const picker = await page.evaluate(() => {
    const el = document.getElementById("gguf-picker");
    if (!el) return { present: false };
    const rows = [...el.querySelectorAll("tbody tr")].map((tr) => ({
      cells: [...tr.querySelectorAll("td")].map((td) => td.textContent),
      blocked: tr.className.includes("blocked"),
    }));
    return {
      present: true,
      open: el.classList.contains("open"),
      rows,
      sub: document.getElementById("gguf-picker-sub")?.textContent ?? "",
    };
  });

  record("B2.0", "dropping a .gguf opens a tensor picker", {
    ok: OBSERVE_ONLY ? null : picker.present && picker.open,
    detail: picker.present
      ? `open=${picker.open}, ${picker.rows?.length ?? 0} rows — ${picker.sub}`
      : "no #gguf-picker element in the page",
    screenshot: await shot(page, "B2-tensor-picker"),
    picker,
  });
  if (!OBSERVE_ONLY && !(picker.present && picker.open)) failures++;

  check("B2.1", "the picker lists every fixture tensor with its quant type", () => {
    const names = picker.rows.map((r) => r.cells[0]);
    for (const n of Object.keys(expected.tensors)) {
      assert.ok(names.includes(n), `'${n}' missing from the picker`);
    }
  });

  check("B2.2", "the picker shows real dims, not a placeholder", () => {
    const row = picker.rows.find((r) => r.cells[0] === "test.q4_0");
    assert.ok(row, "test.q4_0 row missing");
    assert.match(row.cells[1], /\[4 x 256\]/, `dims cell was '${row.cells[1]}'`);
    assert.equal(row.cells[2], "Q4_0");
  });

  // --- B3: choose a tensor, expect it in the scene ---
  if (picker.present && picker.open) {
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#gguf-picker-list tbody tr")];
      const row = rows.find((r) => r.querySelector("td").textContent === "test.q4_0");
      row.click();
    });
    await page.waitForTimeout(2500);
  }

  const afterPick = await page.evaluate(() => ({
    status: document.getElementById("gguf-status")?.textContent ?? "",
    statusClass: document.getElementById("gguf-status")?.className ?? "",
    pickerOpen:
      document.getElementById("gguf-picker")?.classList.contains("open") ?? false,
    url: window.location.search,
  }));

  record("B3.0", "selecting a tensor loads it into an operand", {
    ok: OBSERVE_ONLY ? null : /test\.q4_0/.test(afterPick.status),
    detail: `status: "${afterPick.status}" | url: ${afterPick.url.slice(0, 120)}`,
    screenshot: await shot(page, "B3-tensor-loaded"),
    afterPick,
  });
  if (!OBSERVE_ONLY && !/test\.q4_0/.test(afterPick.status)) failures++;

  check("B3.1", "the picker closes and the URL records the selection", () => {
    assert.equal(afterPick.pickerOpen, false, "picker stayed open");
    assert.match(
      decodeURIComponent(afterPick.url),
      /test\.q4_0/,
      "gguf_tensor is not in the URL state",
    );
  });

  // --- B4: an undecodable tensor is shown as such, and cannot be chosen ---
  await dropFile(page, "mixed.gguf", b64("mixed.gguf"));
  await page.waitForTimeout(1200);

  const mixed = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#gguf-picker-list tbody tr")];
    return rows.map((tr) => ({
      name: tr.querySelector("td")?.textContent,
      blocked: tr.className.includes("blocked"),
      why: [...tr.querySelectorAll("td")].pop()?.textContent ?? "",
    }));
  });

  record("B4.0", "an undecodable tensor is listed and blocked with a reason", {
    ok: OBSERVE_ONLY
      ? null
      : mixed.some((r) => r.name === "bad.q4_k" && r.blocked && /Q4_K/.test(r.why)),
    detail: JSON.stringify(mixed),
    screenshot: await shot(page, "B4-unsupported-blocked"),
    mixed,
  });
  if (
    !OBSERVE_ONLY &&
    !mixed.some((r) => r.name === "bad.q4_k" && r.blocked && /Q4_K/.test(r.why))
  ) {
    failures++;
  }

  // --- B5: a failing source surfaces an error in the page ---
  await page.evaluate(() => {
    const el = document.getElementById("gguf-picker");
    if (el) el.classList.remove("open");
  });

  const failState = await page.evaluate(async () => {
    const viz = window.__mmviz;
    if (!viz || !viz.requestGGUFTensor) return { unavailable: true };
    const r = await viz.requestGGUFTensor("local:not-registered.gguf", "whatever");
    return { status: r.status, error: r.error };
  });

  record("B5.0", "a failing load reports an error state", {
    ok: OBSERVE_ONLY ? null : failState.unavailable ? false : failState.status === "error",
    detail: failState.unavailable
      ? "viz not exposed on window (pre-fix tree, or export missing)"
      : `${failState.status}: ${failState.error}`,
    screenshot: await shot(page, "B5-error-state"),
    failState,
  });
  if (!OBSERVE_ONLY && !(failState.status === "error")) failures++;

  // --- B6: softmax epilog on an all-negative matrix ---
  const softmaxUrl =
    `${origin}/?left.init=expr&left.expr=${encodeURIComponent("-1000 - j")}` +
    `&left.h=4&left.w=4&right.init=expr&right.expr=1&epilog=softmax`;
  const page2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page2.goto(softmaxUrl);
  await page2.waitForFunction(
    () => document.querySelector("#container canvas") !== null,
    null,
    { timeout: 30000 },
  );
  await page2.waitForTimeout(2000);

  const softmaxCheck = await page2.evaluate(() => {
    const viz = window.__mmviz;
    if (!viz) return { unavailable: true };
    const a = viz.Array2D.fromInit(1, 4, (_i, j) => -1000 - j, "softmax");
    return { values: Array.from(a.data), sum: Array.from(a.data).reduce((x, y) => x + y, 0) };
  });

  record("B6.0", "softmax over all-negative logits renders a distribution", {
    ok: OBSERVE_ONLY
      ? null
      : !softmaxCheck.unavailable && Math.abs(softmaxCheck.sum - 1) < 1e-4,
    detail: softmaxCheck.unavailable
      ? "viz not exposed on window"
      : `values ${JSON.stringify(softmaxCheck.values)} sum ${softmaxCheck.sum}`,
    screenshot: await shot(page2, "B6-softmax-epilog"),
    softmaxCheck,
  });
  if (!OBSERVE_ONLY && !(!softmaxCheck.unavailable && Math.abs(softmaxCheck.sum - 1) < 1e-4)) {
    failures++;
  }

  await page2.close();

  record("B7.0", "no uncaught page errors across the whole run", {
    ok: OBSERVE_ONLY ? null : errors.length === 0,
    detail: errors.length ? errors.join(" | ") : "clean",
    errors,
    consoleTail: logs.slice(-25),
  });
  if (!OBSERVE_ONLY && errors.length) failures++;

  await page.close();
}

await main();
