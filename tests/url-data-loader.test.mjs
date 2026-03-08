import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(
  resolve(process.cwd(), "src/data/url-data-loader.js"),
  "utf8",
);
const { tryURLInit } = await import(
  `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`
);

test("tryURLInit returns function and caches by canonical URL key", () => {
  const originalXHR = globalThis.XMLHttpRequest;
  const originalURL = globalThis.URL;

  const canonicalHref = "https://example.com/data.csv?canonical=1";
  const openedUrls = [];
  let openCount = 0;
  let sendCount = 0;

  globalThis.URL = class MockURL {
    constructor() {
      this.href = canonicalHref;
    }
  };

  globalThis.XMLHttpRequest = class MockXMLHttpRequest {
    open(method, url, isAsync) {
      assert.equal(method, "GET");
      assert.equal(isAsync, false);
      openedUrls.push(url);
      openCount += 1;
    }

    send() {
      this.responseText = "1,2\n3,4";
      sendCount += 1;
    }
  };

  try {
    const first = tryURLInit("https://example.com/data.csv?a=1");
    assert.equal(typeof first, "function");
    assert.equal(first(0, 1, 9, 9), 2);
    assert.equal(first(3, 2, 9, 9), 3);

    const second = tryURLInit("https://example.com/data.csv?a=2");
    assert.equal(typeof second, "function");
    assert.equal(second(1, 1, 9, 9), 4);

    assert.equal(openCount, 1);
    assert.equal(sendCount, 1);
    assert.deepEqual(openedUrls, [canonicalHref]);
  } finally {
    globalThis.XMLHttpRequest = originalXHR;
    globalThis.URL = originalURL;
  }
});
