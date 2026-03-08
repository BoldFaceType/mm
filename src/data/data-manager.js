import { tryURLInit } from "./url-data-loader.js";
import { GGUFLoader } from "./gguf-loader.js";

const GGUF_CACHE = {};

export class DataManager {
  /**
   * Loads data synchronously based on type.
   * @param {string} url - The URL or identifier of the data.
   * @param {string} type - 'url' or 'gguf'.
   * @returns {any} The loaded resource or null.
   */
  static load(url, type) {
    if (type === "url") {
      return tryURLInit(url);
    } else if (type === "gguf") {
      try {
        const cache_key = new URL(url).href;
        if (GGUF_CACHE[cache_key]) {
          return GGUF_CACHE[cache_key];
        }
        console.log(`loading GGUF from ${url}...`);

        // Synchronous XHR for binary data
        const req = new XMLHttpRequest();
        req.open("GET", url, false);
        req.overrideMimeType("text/plain; charset=x-user-defined");
        req.send(null);

        // Convert the "binary string" to ArrayBuffer
        const text = req.responseText;
        const buffer = new ArrayBuffer(text.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < text.length; i++) {
          view[i] = text.charCodeAt(i) & 0xff;
        }

        const loader = new GGUFLoader();
        if (loader.parse(buffer)) {
          GGUF_CACHE[cache_key] = loader;
          console.log(`done loading GGUF from ${url}`);
          return loader;
        }
      } catch (e) {
        console.error(`Error loading GGUF from ${url}: ${e.message}`);
      }
      return null;
    }

    console.error(`DataManager: Unsupported type '${type}'`);
    return null;
  }
}
