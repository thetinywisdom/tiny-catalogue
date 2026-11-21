import { box, tiledBox } from '../props/util.js';

// Stacked ground. Two faces that share a depth flicker (the street strip
// sitting on the block shell, a rug on a floor, a path crossing another).
// A layer sits GAP metres above the surface under it, and a flat slab does
// not cast: a plane that shadows itself draws triangle-shaped acne.

export const GAP = 0.012;
export const SLAB_H = 0.04;
export const LAYER_H = 0.012;

/** A flat surface receives shadows and does not cast them. */
export function markGround(mesh) {
  mesh.userData.ground = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A tiled slab whose top is `top`. The thickness hangs below that, so the
 * slab cannot poke up through the next layer.
 */
export function toppedBox(w, d, material, x, top, z, h = SLAB_H, tile = 4) {
  return markGround(tiledBox(w, h, d, material, [x, top - h / 2, z], tile));
}

/**
 * A copy of a cached material, pulled toward the camera so a decal that is
 * only GAP above a slab still wins at a grazing angle. Never mutate the
 * style cache: those materials are shared.
 */
export function decalMaterial(material) {
  const m = material.clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  return m;
}

/**
 * A sandbox: a wood rim and a sand fill that do not occupy the same volume.
 * `surfaceTop` is the ground the box stands on. The rim and the sand meet
 * in plan only.
 */
export function addSandbox(group, x, z, w, d, wood, sand, surfaceTop = 0) {
  const y0 = surfaceTop + GAP;
  const t = 0.1;
  const rimH = 0.12;
  const rimY = y0 + rimH / 2;
  const add = (mesh) => group.add(markGround(mesh));
  add(box(w, rimH, t, wood, [x, rimY, z - d / 2 + t / 2]));
  add(box(w, rimH, t, wood, [x, rimY, z + d / 2 - t / 2]));
  add(box(t, rimH, d - t * 2, wood, [x - w / 2 + t / 2, rimY, z]));
  add(box(t, rimH, d - t * 2, wood, [x + w / 2 - t / 2, rimY, z]));
  const sandH = 0.06;
  const inset = t + 0.02;
  add(box(w - inset * 2, sandH, d - inset * 2, sand, [x, y0 + sandH / 2, z]));
}
