"use strict";

export function createUrlState({
  params,
  defaultParams,
  util,
  viz,
  initFromParams,
}) {
  const url_info = {
    json: "",
    url: urlPrefix(),
    compressed: "",
    search_params: "",
  };

  function urlPrefix() {
    return window.location.origin + window.location.pathname;
  }

  function resetParams() {
    Object.entries(util.copyTree(defaultParams)).forEach(
      ([k, v]) => (params[k] = v),
    );
    params.cam = viz.defaultCam();
  }

  function saveUrlInfo() {
    url_info.json = JSON.stringify(params);
    const prefix = urlPrefix();
    let search_params = util.makeSearchParams(params);
    if (!params.compress && search_params.toString().length > 2048) {
      params.compress = true;
      search_params = util.makeSearchParams(params);
    }
    url_info.url = prefix + "?" + search_params;
    url_info.compressed =
      prefix + "?" + util.makeSearchParams({ ...params, compress: true });
    url_info.search_params = "" + search_params;
  }

  function saveUrl() {
    saveUrlInfo();
    window.history.pushState({}, "", url_info.url);
    if (window.parent != window) {
      window.parent.postMessage(
        { search_params: url_info.search_params },
        parent.origin,
      );
    }
  }

  function initFromSearchParams() {
    const searchParams = new URL(/** @type {any} */ (window.location)).searchParams;
    if (searchParams.size > 0) {
      util.updateObjectFromSearchParams(params, searchParams);
    } else {
      resetParams();
    }
    if (params.sync_expr !== undefined) {
      delete params.sync_expr;
    }
    params.expr = viz.genExpr(params);
    initFromParams(false);
  }

  function handleMessage(event) {
    const responders = {
      getUrlInfo: () => {
        event.source.postMessage({ url_info }, event.origin);
      },
      getParams: () => {
        event.source.postMessage({ params }, event.origin);
      },
      setParams: (/** @type {any} */ { props = {}, reset = false }) => {
        if (reset) {
          resetParams();
        }

        if (props.sync_expr) {
          params.expr = props.expr;
          viz.syncExpr(params);
          delete props.sync_expr;
        }
        util.updatePropsRec(params, props);
        params.expr = viz.genExpr(params);
        if (props.layout?.scheme) {
          viz.setLayoutScheme(params);
        }
        initFromParams();
      },
    };

    Object.entries(event.data).forEach(([k, v]) => {
      const responder = responders[k];
      if (responder) {
        responder(v);
      }
    });
  }

  return {
    url_info,
    saveUrlInfo,
    saveUrl,
    initFromSearchParams,
    handleMessage,
  };
}
