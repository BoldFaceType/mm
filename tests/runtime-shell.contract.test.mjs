import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const contractPath = path.resolve("src/app/RUNTIME_SHELL_CONTRACT.md");

test("runtime shell contract artifact exists and documents entrypoints", async () => {
  await access(contractPath);

  const contract = await readFile(contractPath, "utf8");

  if (!contract.includes("bootRuntimeShell")) {
    throw new Error(
      "Expected runtime shell contract to include bootRuntimeShell entrypoint.",
    );
  }

  if (!contract.includes("RUNTIME_SHELL_RESPONDERS")) {
    throw new Error(
      "Expected runtime shell contract to include RUNTIME_SHELL_RESPONDERS entrypoint.",
    );
  }
});
