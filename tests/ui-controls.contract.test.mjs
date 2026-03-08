import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("UI controls contract document exists and matches initUiControls return contract", async () => {
  const contractPath = new URL(
    "../src/app/UI_CONTROLS_CONTRACT.md",
    import.meta.url,
  );
  const modulePath = new URL("../src/app/ui-controls.js", import.meta.url);

  const [contractText, moduleText] = await Promise.all([
    readFile(contractPath, "utf8"),
    readFile(modulePath, "utf8"),
  ]);

  assert.ok(
    contractText.length > 0,
    "Expected contract document to be non-empty",
  );
  assert.match(contractText, /## Public API/);
  assert.match(contractText, /initUiControls\(input\)/);
  assert.match(contractText, /## Behavior Parity Notes/);
  assert.match(contractText, /preserve the return value of `gui\.initGui`/);

  assert.ok(
    moduleText.includes("return gui.initGui"),
    "Expected initUiControls to return gui.initGui(...)",
  );
});
