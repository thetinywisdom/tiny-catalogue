import * as THREE from 'three';
import { box, cyl } from '../props/util.js';
import { capsuleBetween } from '../lib/shapes.js';

// The park playground (公園の遊具): swings, a slide and a climbing frame
// (ジャングルジム).
//
// Coordinates are playground-local (the playground sits at PLAY_AT in the
// park, see park.js), +z towards the park's edge. Swing seats hang from
// their own pivot groups.

export const PLAY_AT = (w, d) => [w / 4 + 1, d / 4 + 1];
export const SWING = { x: 3, z: -2, bar: 2.4, chain: 1.86, seats: [-0.7, 0.7] }; // seat top 0.54 m
export const SLIDE = { x: -3, top: 1.5, platZ: -2.4, chute0: -1.9, chute1: 1.0, end: 0.3, ladder0: -3.75, ladder1: -2.9, width: 0.56 };
export const FRAME = { x0: 1.8, z0: 1.6, cell: 0.6, n: 3 };

const smooth = (t) => t * t * (3 - 2 * t);
/** The slide's chute: height and position at u (0 top .. 1 bottom). */
export function chuteAt(u) {
  const S = SLIDE;
  return { z: S.chute0 + (S.chute1 - S.chute0) * u, y: S.end + (S.top - S.end) * (1 - smooth(u)) };
}

/** A box from a to b (points [x, y, z]), w wide across x, h thick. */
function slab(a, b, w, h, mat) {
  const dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dy, dz);
  const m = box(w, h, len + 0.01, mat, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  m.rotation.x = -Math.atan2(dy, dz);
  return m;
}

/** The playground's fixed parts, added to `play` (a group at PLAY_AT). Returns playground-local colliders. */
export function buildPlayground(play, style) {
  const red = style.material('signage', 0xd8443c);
  const blue = style.material('signage', 0x3f7fd6);
  const yellow = style.material('signage', 0xf2c230);
  const green = style.material('signage', 0x4aa564);
  const metal = style.material('metal');
  const wood = style.material('wood');

  // --- swings: an A-frame, a top bar, two seats hanging on chains ------------
  const W = SWING;
  for (const sx of [-1, 1]) {
    play.add(capsuleBetween([W.x + sx * 1.6, 0, W.z - 0.6], [W.x + sx * 1.6, W.bar, W.z], 0.06, red, 6));
    play.add(capsuleBetween([W.x + sx * 1.6, 0, W.z + 0.6], [W.x + sx * 1.6, W.bar, W.z], 0.06, red, 6));
  }
  play.add(capsuleBetween([W.x - 1.6, W.bar, W.z], [W.x + 1.6, W.bar, W.z], 0.06, red, 6));
  for (const sx of W.seats) {
    // the seat and its chains turn round the bar (rotation.x); YXZ so the park's turn comes first
    const swing = new THREE.Group();
    swing.position.set(W.x + sx, W.bar, W.z);
    swing.rotation.order = 'YXZ';
    for (const cx of [-0.21, 0.21]) swing.add(capsuleBetween([cx, 0, 0], [cx, -W.chain, 0], 0.013, metal, 4));
    swing.add(box(0.5, 0.05, 0.24, wood, [0, -W.chain - 0.01, 0]));
    swing.userData.swing = { chain: W.chain };
    play.add(swing);
  }

  // --- slide: ladder up the back, a platform with rails and a little roof,
  // a chute with raised sides that curves down and runs out flat --------------
  const S = SLIDE, hw = 0.5;
  play.add(box(1.0, 0.08, 1.0, blue, [S.x, S.top - 0.04, S.platZ]));
  for (const px of [-hw, hw]) for (const pz of [-hw, hw]) play.add(cyl(0.045, 0.045, S.top + 1.0, blue, [S.x + px, (S.top + 1.0) / 2, S.platZ + pz], { segments: 6 }));
  for (const px of [-hw, hw]) {
    for (const ry of [0.5, 0.9]) play.add(box(0.05, 0.05, 1.0, yellow, [S.x + px, S.top + ry, S.platZ])); // side rails
  }
  play.add(cyl(0, 0.85, 0.45, red, [S.x, S.top + 1.22, S.platZ], { segments: 4, rot: [0, Math.PI / 4, 0] })); // roof
  // ladder: two rails and rungs
  for (const px of [-0.26, 0.26]) play.add(slab([S.x + px, 0, S.ladder0], [S.x + px, S.top, S.ladder1], 0.05, 0.05, blue));
  for (let i = 1; i <= 5; i++) {
    const t = i / 6, y = S.top * t, z = S.ladder0 + (S.ladder1 - S.ladder0) * t;
    play.add(cyl(0.025, 0.025, 0.52, yellow, [S.x, y, z], { segments: 5, rot: [0, 0, Math.PI / 2] }));
  }
  // chute
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = chuteAt(i / N), b = chuteAt((i + 1) / N);
    play.add(slab([S.x, a.y, a.z], [S.x, b.y, b.z], S.width, 0.04, yellow));
    for (const sx of [-1, 1]) play.add(slab([S.x + sx * (S.width / 2), a.y + 0.08, a.z], [S.x + sx * (S.width / 2), b.y + 0.08, b.z], 0.04, 0.16, yellow));
  }
  // legs under the chute
  for (const u of [0.55, 0.97]) {
    const c = chuteAt(u);
    for (const sx of [-1, 1]) play.add(cyl(0.035, 0.035, c.y, blue, [S.x + sx * 0.22, c.y / 2, c.z], { segments: 5 }));
  }

  // --- climbing frame: a cube of bars, every bar meeting at a joint ----------
  const F = FRAME, top = F.cell * F.n, side = F.cell * F.n;
  const rBar = 0.024;
  for (let i = 0; i <= F.n; i++) {
    for (let k = 0; k <= F.n; k++) {
      const x = F.x0 + i * F.cell, z = F.z0 + k * F.cell;
      play.add(cyl(rBar, rBar, top, green, [x, top / 2, z], { segments: 5 })); // posts
      for (let l = 1; l <= F.n; l++) play.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), green).translateX(x).translateY(l * F.cell).translateZ(z)); // joints
    }
  }
  for (let l = 1; l <= F.n; l++) {
    const y = l * F.cell;
    for (let i = 0; i <= F.n; i++) {
      play.add(cyl(rBar, rBar, side, green, [F.x0 + i * F.cell, y, F.z0 + side / 2], { segments: 5, rot: [Math.PI / 2, 0, 0] })); // bars along z
      play.add(cyl(rBar, rBar, side, green, [F.x0 + side / 2, y, F.z0 + i * F.cell], { segments: 5, rot: [0, 0, Math.PI / 2] })); // bars along x
    }
  }

  return [
    { x: S.x, z: (S.ladder0 + S.chute1) / 2, hw: 0.45, hd: (S.chute1 - S.ladder0) / 2 },
    { x: W.x, z: W.z, hw: 1.8, hd: 0.7 },
    { x: F.x0 + side / 2, z: F.z0 + side / 2, hw: side / 2 + 0.05, hd: side / 2 + 0.05 },
  ];
}
