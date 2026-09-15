import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./three-hook.mjs", pathToFileURL(import.meta.filename));
