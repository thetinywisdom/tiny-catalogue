// Ground slabs marked userData.ground must not occupy the same volume.
// A shared face (edges touching) is fine. An overlap thicker than 4 mm is not.
//
//   node scripts/check-ground.mjs
import * as THREE from 'three';
import { createServer } from 'vite';

// Shop signs and manholes paint on a canvas. The overlap check only needs
// the meshes, so a stub context is enough.
function fakeContext(canvas) {
  const ctx = new Proxy({ canvas }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'getImageData') {
        return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      }
      if (key === 'measureText') return () => ({ width: 8 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      return () => {};
    },
    set() { return true; },
  });
  return ctx;
}
globalThis.document = {
  createElement() {
    const canvas = { width: 64, height: 64 };
    canvas.getContext = () => fakeContext(canvas);
    return canvas;
  },
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { style } = await server.ssrLoadModule('/src/styles/index.js');
const { createAsset } = await server.ssrLoadModule('/src/catalog/index.js');
const { createAreaBlock } = await server.ssrLoadModule('/src/catalog/areas.js');

const EPS = 0.004;

function groundBoxes(root) {
  root.updateMatrixWorld(true);
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.ground) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    out.push(b);
  });
  return out;
}

function separated(a, b) {
  return a.max.x <= b.min.x + EPS || b.max.x <= a.min.x + EPS
    || a.max.y <= b.min.y + EPS || b.max.y <= a.min.y + EPS
    || a.max.z <= b.min.z + EPS || b.max.z <= a.min.z + EPS;
}

function check(name, root) {
  const boxes = groundBoxes(root);
  const hits = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (!separated(boxes[i], boxes[j])) hits.push([i, j]);
    }
  }
  if (hits.length) {
    const sample = hits.slice(0, 4).map(([i, j]) => {
      const a = boxes[i];
      const b = boxes[j];
      return `  #${i} [${a.min.toArray().map((n) => n.toFixed(3))}] [${a.max.toArray().map((n) => n.toFixed(3))}]`
        + ` vs #${j} [${b.min.toArray().map((n) => n.toFixed(3))}] [${b.max.toArray().map((n) => n.toFixed(3))}]`;
    }).join('\n');
    console.error(`${name}: ${hits.length} overlapping ground slabs\n${sample}`);
    return false;
  }
  console.log(`${name}: ${boxes.length} ground slabs, no overlap`);
  return true;
}

const ids = ['area.shotengai', 'area.lane', 'area.station', 'area.shrine', 'area.square', 'area.alley', 'area.park'];
let ok = true;
for (const id of ids) {
  const root = id === 'area.park'
    ? createAsset(id, { seed: 1 }, style)
    : createAreaBlock(id, { seed: 1, Density: 'Normal', People: 'Off', Cats: 'Off' }, style);
  ok = check(id, root) && ok;
}
for (const id of ['building.shrine', 'building.school', 'building.gasStation', 'building.laundromat']) {
  ok = check(id, createAsset(id, { seed: 1 }, style)) && ok;
}
await server.close();
if (!ok) process.exit(1);
