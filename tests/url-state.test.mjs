import assert from "node:assert/strict";
import test from "node:test";

import { createUrlState } from "../src/app/url-state.js";

test("createUrlState basics and sync_expr setParams flow", () => {
  const previousWindow = globalThis.window;

  const pushStateCalls = [];
  const parentPostMessageCalls = [];

  globalThis.window = {
    location: {
      origin: "https://example.test",
      pathname: "/viz",
    },
    history: {
      pushState: (...args) => {
        pushStateCalls.push(args);
      },
    },
    parent: {
      postMessage: (...args) => {
        parentPostMessageCalls.push(args);
      },
    },
  };
  globalThis.window.parent = globalThis.window;

  try {
    class SearchParamsStub {
      constructor(values = {}) {
        this.values = { ...values };
      }

      toString() {
        return Object.entries(this.values)
          .map(([key, value]) => `${key}=${value}`)
          .join("&");
      }
    }

    const params = { expr: "initial" };
    const defaultParams = { expr: "default" };

    const syncExprCalls = [];
    const genExprCalls = [];
    const initFromParamsCalls = [];

    const util = {
      copyTree: (value) => structuredClone(value),
      makeSearchParams: (obj) => new SearchParamsStub(obj),
      updateObjectFromSearchParams: () => {},
      updatePropsRec: (target, props) => {
        Object.assign(target, props);
      },
    };

    const viz = {
      defaultCam: () => ({ x: 0, y: 0, z: 0 }),
      syncExpr: (currentParams) => {
        syncExprCalls.push(currentParams.expr);
        currentParams.expr = `synced:${currentParams.expr}`;
      },
      genExpr: (currentParams) => {
        genExprCalls.push(currentParams.expr);
        return `generated:${currentParams.expr}`;
      },
      setLayoutScheme: () => {},
    };

    const api = createUrlState({
      params,
      defaultParams,
      util,
      viz,
      initFromParams: (...args) => {
        initFromParamsCalls.push(args);
      },
    });

    assert.deepEqual(Object.keys(api).sort(), [
      "handleMessage",
      "initFromSearchParams",
      "saveUrl",
      "saveUrlInfo",
      "url_info",
    ]);

    api.handleMessage({
      data: {
        setParams: {
          props: {
            expr: "incoming",
            sync_expr: true,
          },
        },
      },
    });

    assert.deepEqual(syncExprCalls, ["incoming"]);
    assert.deepEqual(genExprCalls, ["incoming"]);
    assert.equal(params.expr, "generated:incoming");
    assert.equal(params.sync_expr, undefined);
    assert.deepEqual(initFromParamsCalls, [[]]);
    assert.deepEqual(pushStateCalls, []);
    assert.deepEqual(parentPostMessageCalls, []);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});
