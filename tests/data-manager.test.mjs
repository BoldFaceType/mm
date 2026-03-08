import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

test("DataManager handle URL and GGUF", async () => {
  // Import dynamically since it depends on url-data-loader
  const { DataManager } = await import("../src/data/data-manager.js");

  const result = DataManager.load("http://example.com", "unknown");
  assert.equal(result, null);

  const originalXHR = globalThis.XMLHttpRequest;
  const originalURL = globalThis.URL;

  let xhrOpened = false;
  let mimeTypeOverridden = false;

  globalThis.URL = /** @type {any} */ (
    class MockURL {
      constructor(url) {
        this.href = url;
      }
    }
  );

  globalThis.XMLHttpRequest = /** @type {any} */ (
    class MockXMLHttpRequest {
      open(method, url, async) {
        xhrOpened = true;
        assert.equal(method, "GET");
        assert.equal(async, false);
      }
      overrideMimeType(mime) {
        mimeTypeOverridden = true;
        assert.equal(mime, "text/plain; charset=x-user-defined");
      }
      send() {
        this.status = 200;
        // Magic GGUF, Version 3, TensorCount 0, MetadataCount 0
        const buffer = new ArrayBuffer(24);
        const view = new DataView(buffer);
        view.setUint32(0, 0x46554747, true); // Magic
        view.setUint32(4, 3, true); // Version
        view.setBigUint64(8, 0n, true); // Tensors
        view.setBigUint64(16, 0n, true); // Metadata

        // Convert to string
        let str = "";
        const uint8 = new Uint8Array(buffer);
        for (let i = 0; i < uint8.length; i++)
          str += String.fromCharCode(uint8[i]);
        this.responseText = str;
      }
    }
  );

  try {
    const loader = DataManager.load("http://example.com/test.gguf", "gguf");
    assert.ok(xhrOpened);
    assert.ok(mimeTypeOverridden);
    assert.ok(loader);
    assert.equal(loader.version, 3);
    assert.equal(loader.tensorCount, 0);
    assert.equal(loader.metadataKvCount, 0);
  } finally {
    globalThis.XMLHttpRequest = originalXHR;
    globalThis.URL = originalURL;
  }
});
