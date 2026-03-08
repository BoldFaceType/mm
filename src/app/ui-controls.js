"use strict";

import * as gui from "../../gui.js";

export function initUiControls({
  params,
  initObj,
  getObj,
  saveUrl,
  updateTitle,
  animPause,
  animStep,
  url_info,
  render_info,
}) {
  const callbacks = {
    initObj,
    getObj,
    saveUrl,
    updateTitle,
    animPause,
    animStep,
  };
  const info = { url_info, render_info };
  gui.initGui(params, callbacks, info);
}
