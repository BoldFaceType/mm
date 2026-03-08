"use strict";

import { DataManager } from "../data/data-manager.js";

function enrichParamsWithGGUFMetadata(p) {
  if (!p) return;
  if (p.init === "gguf" && p.url && p.tensor) {
    const loader = DataManager.load(p.url, "gguf");
    if (loader) {
      const tensorInfo = loader.tensorInfos.find((t) => t.name === p.tensor);
      if (tensorInfo) {
        p.originalQuantType = tensorInfo.typeName;
      }
    }
  }
  if (p.left) enrichParamsWithGGUFMetadata(p.left);
  if (p.right) enrichParamsWithGGUFMetadata(p.right);
}

export function rebuildVisualizationObject({
  obj,
  params,
  viz,
  util,
  getContext,
  scene,
  camera,
  orbit,
  requestCameraPositionSave,
  updateTitle,
}) {
  let oldmag;
  if (obj) {
    const oldsz = util.bbhwd(obj.getBoundingBox());
    oldmag = oldsz.h + oldsz.w + oldsz.d;
    scene.remove(obj.group);
    obj.disposeAll();
  }

  enrichParamsWithGGUFMetadata(params);

  const nextObj = new viz.MatMul(params, getContext());
  nextObj.group.rotation.x = Math.PI;
  nextObj.center();

  if (oldmag) {
    const newsz = util.bbhwd(nextObj.getBoundingBox());
    const newmag = newsz.h + newsz.w + newsz.d;
    const ratio = newmag / oldmag;
    if (ratio != 1) {
      console.log(`HEY ratio ${ratio}`);
      camera.position.set(
        camera.position.x * ratio,
        camera.position.y * ratio,
        camera.position.z * ratio,
      );
      orbit.update();
      requestCameraPositionSave();
    }
  }

  nextObj.setLegends();
  nextObj.initAnimation();
  scene.add(nextObj.group);

  updateTitle();
  return nextObj;
}
