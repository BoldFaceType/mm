// Minimal stand-in for three.js, sufficient for importing viz.js and util.js
// under Node. Only module-load-time construction matters here; none of this is
// exercised by the numeric or loader code under test.
//
// The exported name list is every `THREE.<Name>` referenced by the repo:
//   grep -ohE "THREE\.[A-Za-z_][A-Za-z0-9_]*" viz.js util.js gui.js index.html \
//     | sed 's/THREE\.//' | sort -u
// Re-run that if a new three symbol is introduced and a test fails to import.

class Stub {
  constructor(...args) {
    this.args = args;
  }
  load() {
    return new Stub();
  }
  set() {
    return this;
  }
  setHSL() {
    return this;
  }
  setRGB() {
    return this;
  }
  setScalar() {
    return this;
  }
  copy() {
    return this;
  }
  clone() {
    return new Stub();
  }
  add() {
    return this;
  }
  getHex() {
    return 0;
  }
  setFromPoints() {
    return this;
  }
  parse() {
    return new Stub();
  }
  generateShapes() {
    return [];
  }
  computeBoundingBox() {
    return this;
  }
}

export class Box3 extends Stub {}
export class BufferAttribute extends Stub {}
export class BufferGeometry extends Stub {}
export class Color extends Stub {}
export class Float32BufferAttribute extends Stub {}
export class Group extends Stub {}
export class Line extends Stub {}
export class LineBasicMaterial extends Stub {}
export class Mesh extends Stub {}
export class MeshBasicMaterial extends Stub {}
export class PerspectiveCamera extends Stub {}
export class Points extends Stub {}
export class Quaternion extends Stub {}
export class RawShaderMaterial extends Stub {}
export class Raycaster extends Stub {}
export class Scene extends Stub {}
export class ShaderMaterial extends Stub {}
export class ShapeGeometry extends Stub {}
export class TextureLoader extends Stub {}
export class Uint8BufferAttribute extends Stub {}
export class Vector2 extends Stub {}
export class Vector3 extends Stub {}
export class WebGLRenderer extends Stub {}

export const DoubleSide = 2;

// three/addons surface used by util.js
export class FontLoader extends Stub {}
export class TextGeometry extends Stub {}
