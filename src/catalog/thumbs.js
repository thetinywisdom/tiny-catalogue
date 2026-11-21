import * as THREE from 'three';
import { activePalette } from '../styles/palette.js';
import { CATALOG, createAsset } from './index.js';
import { setDetail } from '../lib/shapes.js';

// Little pictures of catalogue assets, in the app's own look. Drawn when a
// card scrolls near the screen (one per frame), then kept in the browser.
// Bump VERSION when the framing or the lighting changes and old pictures
// should be redrawn.

const VERSION = 25; // 25: tight box, flat pieces from above, ground-coloured card
const PS1_SIZE = 64; // drawn small, shown scaled up with crisp pixels
const CLEAN_SIZE = 160; // the smooth look is drawn larger so the cards stay sharp
const mem = new Map();
const queue = [];
let busy = false;
let stage = null;
let token = 0;

// A rug, mat or manhole is a thin slab. The old shared 3/4 angle showed the edge.
export const FLAT_VIEW = [0.38, 1, 0.5];

export function isFlatSize(x, y, z) {
  const span = Math.max(x, z, 0.001);
  return y < 0.45 && y < span * 0.34;
}

const lookOf = (style) => (style.ps1 === false ? 'clean' : 'ps1');
const sizeOf = (style) => (style.ps1 === false ? CLEAN_SIZE : PS1_SIZE);
const keyOf = (style, id, params) => `tcb.thumb.v${VERSION}:${lookOf(style)}:${activePalette()}:${id}:${JSON.stringify(params ?? {})}`;

/** Drop queued pictures. Call this when the look changes, then ask again. */
export function cancelThumbs() {
  token++;
  queue.length = 0;
  busy = false;
}

function mark(img, state) {
  const pic = img.closest?.('.cat-pic') || img;
  pic.classList.remove('is-loading', 'is-error');
  if (state) pic.classList.add(state);
  const fallback = pic.querySelector?.('.cat-fallback');
  if (fallback) fallback.hidden = state !== 'is-error';
}

function getStage() {
  if (stage) return stage;
  const scene = new THREE.Scene();
  // The same soft rig for every card: a sky fill, a key from the front-left,
  // and a cooler fill so the shadow side still reads. No cast shadows, so a
  // flat piece and a building get the same light.
  const hemi = new THREE.HemisphereLight(0xe7eef4, 0x8a8172, 1.35);
  const key = new THREE.DirectionalLight(0xfff3e2, 1.45);
  key.position.set(4.2, 6.8, 3.4);
  const fill = new THREE.DirectionalLight(0xd5e2f0, 0.9);
  fill.position.set(-4.6, 3.4, -2.4);
  const bounce = new THREE.DirectionalLight(0xf3ead8, 0.38);
  bounce.position.set(0.2, 1.4, -4.2);
  scene.add(hemi, key, fill, bounce);
  const rt = new THREE.WebGLRenderTarget(PS1_SIZE, PS1_SIZE, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PS1_SIZE;
  stage = { scene, rt, camera: new THREE.PerspectiveCamera(30, 1, 0.05, 2000), canvas, pixels: new Uint8Array(PS1_SIZE * PS1_SIZE * 4), size: PS1_SIZE };
  return stage;
}

/** Fit the camera to the box corners, from `dir`, with a little margin. */
function frameBox(camera, box, dir, margin) {
  const safe = box.isEmpty()
    ? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5))
    : box;
  const fov = 30;
  const tv = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  let right = new THREE.Vector3(0, 1, 0).cross(dir);
  if (right.lengthSq() < 1e-8) right = new THREE.Vector3(1, 0, 0);
  right.normalize();
  const up = dir.clone().cross(right).normalize();
  const center = safe.getCenter(new THREE.Vector3());
  const { min, max } = safe;
  const p = new THREE.Vector3();
  let dist = 0.4;
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(center);
    const z = p.dot(dir);
    dist = Math.max(dist, (Math.abs(p.dot(right)) * margin) / tv + z, (Math.abs(p.dot(up)) * margin) / tv + z);
  }
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = Math.max(0.01, dist / 80);
  camera.far = dist * 4 + dist;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

function thumbDir(asset, box) {
  if (asset?.viewDir) return new THREE.Vector3(...asset.viewDir).normalize();
  const size = box.getSize(new THREE.Vector3());
  if (isFlatSize(size.x, size.y, size.z)) return new THREE.Vector3(...FLAT_VIEW).normalize();
  return new THREE.Vector3(0.75, 0.6, 1).normalize();
}

/** Draw one asset now and return a PNG data URL (transparent background). */
function draw(renderer, style, id, params) {
  const s = getStage();
  const size = sizeOf(style);
  if (s.size !== size) {
    s.size = size;
    s.rt.setSize(size, size);
    s.canvas.width = s.canvas.height = size;
    s.pixels = new Uint8Array(size * size * 4);
  }
  const filter = style.ps1 === false ? THREE.LinearFilter : THREE.NearestFilter;
  s.rt.texture.magFilter = filter;
  s.rt.texture.minFilter = filter;
  s.rt.texture.generateMipmaps = false;
  s.rt.texture.needsUpdate = true;
  setDetail(style.detail ?? 1);
  const obj = createAsset(id, params, style);
  setDetail(1);
  style.decorate?.(obj);
  s.scene.add(obj);
  // precise: a rotated piece's box corners would otherwise frame empty space
  const box = new THREE.Box3().setFromObject(obj, true);
  const asset = CATALOG[id];
  const size3 = box.getSize(new THREE.Vector3());
  const flat = !asset?.viewDir && isFlatSize(size3.x, size3.y, size3.z);
  const margin = asset?.fillFrame ? 1.06 : flat ? 1.08 : 1.1;
  frameBox(s.camera, box, thumbDir(asset, box), margin);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevScissor = renderer.getScissorTest();
  renderer.setScissorTest(false);
  // The same ground colour as the item view, so a dark flat piece (a manhole, a rug)
  // does not disappear into the card.
  renderer.setClearColor(style.material('ground').color, 1);
  if (style.ps1 !== false) style.prepareRender?.(size, size);
  renderer.setRenderTarget(s.rt);
  renderer.clear();
  renderer.render(s.scene, s.camera);
  renderer.readRenderTargetPixels(s.rt, 0, 0, size, size, s.pixels);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.setScissorTest(prevScissor);

  s.scene.remove(obj);
  obj.traverse((o) => o.geometry?.dispose());
  const ctx = s.canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(s.pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(img, 0, 0);
  return s.canvas.toDataURL('image/png');
}

/**
 * Fill `img` with the picture of asset `id`. Cached pictures appear at once.
 * `hooks.fail` runs when the picture cannot be drawn.
 */
export function thumbInto(img, renderer, style, id, params, hooks) {
  const key = keyOf(style, id, params);
  const show = (url) => {
    if (!url) {
      mark(img, 'is-error');
      img.alt = 'Preview unavailable';
      hooks?.fail?.();
      return;
    }
    mark(img, '');
    img.alt = '';
    img.src = url;
    hooks?.done?.();
  };
  let url = mem.get(key);
  if (!url) { try { url = localStorage.getItem(key); } catch { /* storage blocked */ } }
  if (url) { mem.set(key, url); show(url); return; }
  mark(img, 'is-loading');
  queue.push({ img, id, params, key, hooks });
  if (!busy) pump(renderer, style);
}

function pump(renderer, style) {
  while (queue.length && !queue[0].img.isConnected) queue.shift();
  const job = queue.shift();
  if (!job) { busy = false; return; }
  busy = true;
  const ticket = token;
  requestAnimationFrame(() => {
    if (ticket !== token) return;
    let url = mem.get(job.key);
    if (!url) {
      try { url = draw(renderer, style, job.id, job.params); }
      catch (e) { console.warn('thumbnail', job.id, e); }
      if (ticket !== token) return;
      if (url) { mem.set(job.key, url); try { localStorage.setItem(job.key, url); } catch { /* full or blocked: keep in memory */ } }
    }
    if (ticket !== token) return;
    if (job.img.isConnected) {
      if (url) showConnected(job, url);
      else {
        mark(job.img, 'is-error');
        job.img.alt = 'Preview unavailable';
        job.hooks?.fail?.();
      }
    }
    pump(renderer, style);
  });
}

function showConnected(job, url) {
  mark(job.img, '');
  job.img.alt = '';
  job.img.src = url;
  job.hooks?.done?.();
}
