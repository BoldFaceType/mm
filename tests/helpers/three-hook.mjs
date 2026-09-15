// Node module-resolution hook that maps the bare specifier "three" (and the
// "three/addons/" prefix the browser importmap serves) onto local stubs, so
// viz.js and util.js can be imported in Node without a DOM or WebGL context.
//
// Registered via tests/helpers/register-hooks.mjs, which package.json loads
// with --import. Production source is not modified.

import { pathToFileURL } from "node:url";

const STUB = pathToFileURL(
  new URL("./three-stub.mjs", import.meta.url).pathname,
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "three" || specifier.startsWith("three/")) {
    return { url: STUB, shortCircuit: true, format: "module" };
  }
  return nextResolve(specifier, context);
}
