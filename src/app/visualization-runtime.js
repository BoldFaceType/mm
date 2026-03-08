"use strict";

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
