import * as THREE from 'three';
import { createGait, poseGait, setGaitEngine, stepGait, tuneOf, WALK_SPEED } from '../anim/gait.js';
import { createCatGait, poseCat, stepCatGait } from '../anim/catGait.js';
import { buildPlayground } from '../city/playground.js';
import { GAP, LAYER_H, SLAB_H, addSandbox, markGround, toppedBox } from '../lib/ground.js';
import { mulberry32 } from '../lib/rng.js';
import { box } from '../props/util.js';
import { VEHICLE_COLORS } from '../props/vehicles.js';
import { paletteHex } from '../styles/palette.js';
import { CAT_EARS, CAT_FUR, CAT_PATTERNS, CAT_TAILS } from '../subjects/cat.js';
import { createAsset } from './index.js';

// Seeded dioramas for the Areas tab. Each one is a normal catalogue item:
// the same seed rebuilds the same layout, and 🎲 New look only changes the seed.
//
// Everything placed is an existing catalogue asset (createAsset) or an existing
// builder (the park playground). The only new geometry is ground: a 32 m block
// shell, paving, a road and kerbs. Those use palette colours already on a role.
// No new swatches, no new props. The shotengai has no roof over the street.
//
// People stay faceless (the human builder draws none). Cats are built with
// face: 'None' by createAsset. Nobori and birds move because tickProps already
// walks the item. People and cats set userData.tick on a carrier group, which
// tickProps calls. The walk pose rewrites the rig's own position, so the
// carrier is what stays on the ground.
//
// Substitutions, where the brief named something the catalogue does not have:
// - Station building: there is no station exterior (station.room is not in
//   this app). The post office is the stand-in: a modest public building
//   with a glass front, on the back of the plaza.
// - Crates: there is no crate prop. The delivery scooter's strapped boxes,
//   the round bins, and the bin dressBacks leaves by a back door stand in.
// - AC units: not a standalone prop. Back dressing (and the buildings' own
//   roof units) already attach them to Japanese backs.
// - Torii: not its own card. It is part of building.shrine.

// One grid for every area. +z is north. A street edge is a 3 m strip and a
// sidewalk edge is 1.5 m, both flush with the 32 m footprint, so two blocks
// with the same edge type meet at the same height and make a full road (6 m)
// or a full sidewalk (3 m).
export const BLOCK_SIZE = 32;
const HALF = BLOCK_SIZE / 2;
const EDGE_W = { street: 3, sidewalk: 1.5 };
const EDGE_TOP = { street: 0.04, sidewalk: 0.06 };

const ADULTS = ['human.man', 'human.woman', 'human.salaryman', 'human.grandpa', 'human.grandma'];
const KIDS = ['human.boy', 'human.girl', 'human.schoolboy', 'human.schoolgirl'];
const CROWD = [...ADULTS, ...KIDS];
const FUR = Object.keys(CAT_FUR);
const TUNE = tuneOf({});

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const band = (density, sparse, normal, busy) => (density === 'Sparse' ? sparse : density === 'Busy' ? busy : normal);

function salt(seed, n) {
  return (Math.imul((seed ?? 1) >>> 0, 0x45d9f3b) + Math.imul(n, 0x27d4eb2d) + 1) >>> 0 || 1;
}

function stream(seed, n) {
  return mulberry32(salt(seed, n));
}

function spread(n, span) {
  const step = span / Math.max(1, n);
  return Array.from({ length: n }, (_, i) => -span / 2 + step * (i + 0.5));
}

function stage(id) {
  const g = new THREE.Group();
  g.name = id;
  const cols = [];
  return {
    g,
    cols,
    finish() {
      g.userData.colliders = cols;
      return g;
    },
  };
}

function put(g, cols, obj, x, z, rotY = 0) {
  obj.position.set(x, obj.position.y, z);
  obj.rotation.y = rotY;
  g.add(obj);
  const boxes = obj.userData.colliders;
  if (!boxes) return obj;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const swap = Math.abs(s) > Math.abs(c);
  for (const b of boxes) {
    const bx = b.x ?? 0;
    const bz = b.z ?? 0;
    cols.push({
      x: x + bx * c + bz * s,
      z: z - bx * s + bz * c,
      hw: swap ? b.hd : b.hw,
      hd: swap ? b.hw : b.hd,
    });
  }
  return obj;
}

// Interior top matches a street edge, so the shell and the road meet flush
// where they abut. A sidewalk edge stays 2 cm higher: that is the curb.
export const INTERIOR_TOP = EDGE_TOP.street;

function addTop(g, w, d, material, x, top, z, h = SLAB_H) {
  if (w < 0.02 || d < 0.02) return top;
  g.add(toppedBox(w, d, material, x, top, z, h));
  return top;
}

function fillRect(g, material, x0, x1, z0, z1, top) {
  addTop(g, x1 - x0, z1 - z0, material, (x0 + x1) / 2, top, (z0 + z1) / 2);
}

// Draw [x0,x1] × [z0,z1] except `hole`, so a building pad can sit in the
// opening instead of on a second copy of the same plane.
function fillExcept(g, material, x0, x1, z0, z1, hole, top) {
  if (!hole) { fillRect(g, material, x0, x1, z0, z1, top); return; }
  const hx0 = Math.max(hole.x0, x0);
  const hx1 = Math.min(hole.x1, x1);
  const hz0 = Math.max(hole.z0, z0);
  const hz1 = Math.min(hole.z1, z1);
  if (hx1 - hx0 < 0.05 || hz1 - hz0 < 0.05) { fillRect(g, material, x0, x1, z0, z1, top); return; }
  fillRect(g, material, x0, x1, z0, hz0, top);
  fillRect(g, material, x0, x1, hz1, z1, top);
  fillRect(g, material, x0, hx0, hz0, hz1, top);
  fillRect(g, material, hx1, x1, hz0, hz1, top);
}

// The shell is the interior only. Each edge strip stops at the corners, and
// the corner is its own piece (a street wins, so a road runs unbroken).
// Nothing shares a plan rectangle with anything else at the same depth.
// `hole` is a building pad the interior should not cover.
export function layBlock(g, style, edges, role, color, hole = null) {
  const width = (key) => EDGE_W[edges[key]] ?? 0;
  const wW = width('w');
  const wE = width('e');
  const wS = width('s');
  const wN = width('n');
  const iw = BLOCK_SIZE - wW - wE;
  const id = BLOCK_SIZE - wS - wN;
  const ix = (wW - wE) / 2;
  const iz = (wS - wN) / 2;
  const baseMat = color == null ? style.material(role) : style.material(role, color);
  fillExcept(g, baseMat, ix - iw / 2, ix + iw / 2, iz - id / 2, iz + id / 2, hole, INTERIOR_TOP);

  const matOf = (kind) => (kind === 'street'
    ? style.material('road')
    : style.material('sidewalk', paletteHex('Sand')));
  const span = (kind, axis, sign, length, along) => {
    const w = EDGE_W[kind];
    const across = sign * (HALF - w / 2);
    if (axis === 'z') addTop(g, length, w, matOf(kind), along, EDGE_TOP[kind], across);
    else addTop(g, w, length, matOf(kind), across, EDGE_TOP[kind], along);
  };
  if (edges.s) span(edges.s, 'z', -1, iw, ix);
  if (edges.n) span(edges.n, 'z', 1, iw, ix);
  if (edges.w) span(edges.w, 'x', -1, id, iz);
  if (edges.e) span(edges.e, 'x', 1, id, iz);

  const corner = (zKey, xKey, sz, sx) => {
    const kz = edges[zKey];
    const kx = edges[xKey];
    if (!kz || !kx) return;
    const kind = kz === 'street' || kx === 'street' ? 'street' : 'sidewalk';
    const wz = EDGE_W[kz];
    const wx = EDGE_W[kx];
    addTop(g, wx, wz, matOf(kind), sx * (HALF - wx / 2), EDGE_TOP[kind], sz * (HALF - wz / 2));
  };
  corner('s', 'w', -1, -1);
  corner('s', 'e', -1, 1);
  corner('n', 'w', 1, -1);
  corner('n', 'e', 1, 1);
}

/** A thin surface on the interior. Level 1 is the first layer above the shell. */
function overlay(g, style, w, d, role, color, x, z, level = 1) {
  const top = INTERIOR_TOP + level * (GAP + LAYER_H);
  const mat = color == null ? style.material(role) : style.material(role, color);
  addTop(g, w, d, mat, x, top, z, LAYER_H);
  return top;
}

function kerb(g, style, x, z, len, alongX, bottom) {
  const h = 0.08;
  const m = style.material('concrete', paletteHex('Light gray'));
  const y = bottom + h / 2;
  g.add(markGround(alongX ? box(len, h, 0.14, m, [x, y, z]) : box(0.14, h, len, m, [x, y, z])));
}

function addBuilding(g, cols, style, id, seed, w, d, x, z, rot, extra = {}) {
  return put(g, cols, createAsset(id, { ...extra, seed: (seed >>> 0) || 1, w, d }, style), x, z, rot);
}

function follow(obj, step) {
  let last = null;
  obj.userData.tick = (time) => {
    const dt = last == null ? 0 : Math.min(0.05, Math.max(0, time - last));
    last = time;
    if (dt > 0) step(dt);
  };
}

// poseIK writes body.position to about (0, y, 0) every frame, and poseCat
// writes the cat rig's x back to 0. Posing the object that was placed in the
// area snaps every figure onto one point. The carrier keeps the ground
// position; the rig only moves inside it.
function addPersonAt(g, cols, style, rng, x, z, path, pool) {
  const person = createAsset(pick(rng, pool), { seed: 1 + Math.floor(rng() * 9000) }, style);
  const phase = rng() * Math.PI * 2;
  const gait = createGait(phase);
  gait.t = phase;
  gait.cyc = phase;
  gait.nextLook = 1e9;
  gait.lookTo = 0;
  const walking = !!(path && path.hi - path.lo >= 2.4);
  const speed = walking ? WALK_SPEED * (0.72 + rng() * 0.2) : 0;
  if (path) path.dir = rng() < 0.5 ? -1 : 1;
  const carrier = new THREE.Group();
  carrier.add(person);
  follow(carrier, (dt) => {
    setGaitEngine('New');
    stepGait(gait, dt, speed, TUNE);
    poseGait(person, gait, 'natural', TUNE);
    if (!walking) return;
    path.pos += path.dir * speed * dt;
    if (path.pos > path.hi) { path.pos = path.hi; path.dir = -1; }
    if (path.pos < path.lo) { path.pos = path.lo; path.dir = 1; }
    if (path.axis === 'x') {
      carrier.position.x = path.pos;
      carrier.rotation.y = path.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      carrier.position.z = path.pos;
      carrier.rotation.y = path.dir > 0 ? 0 : Math.PI;
    }
  });
  const rot = walking
    ? (path.axis === 'x' ? (path.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (path.dir > 0 ? 0 : Math.PI))
    : rng() * Math.PI * 2;
  put(g, cols, carrier, x, z, rot);
}

function addCatAt(g, cols, style, rng, x, z) {
  const cat = createAsset('animal.cat', {
    variant: pick(rng, ['Housecat', 'Housecat', 'Kitten', 'Chonk']),
    color: pick(rng, FUR),
    pattern: pick(rng, CAT_PATTERNS),
    tailType: pick(rng, CAT_TAILS),
    earType: pick(rng, CAT_EARS),
    coat: rng() < 0.82 ? 'Short' : 'Long',
  }, style);
  const rig = cat.getObjectByName('cat') ?? cat;
  const gait = createCatGait(rng() * 6);
  gait.t = rng() * 8;
  gait.pose = pick(rng, ['sit', 'loaf', 'loaf', 'sleep', 'sit']);
  gait.poseW = 1;
  poseCat(rig, gait);
  const carrier = new THREE.Group();
  carrier.add(cat);
  follow(carrier, (dt) => {
    stepCatGait(gait, dt, 0);
    poseCat(rig, gait);
  });
  put(g, cols, carrier, x, z, rng() * Math.PI * 2);
}

function inRects(rects, x, z, margin) {
  return rects.some((r) => x >= r.x0 + margin && x <= r.x1 - margin && z >= r.z0 + margin && z <= r.z1 - margin);
}

function hits(cols, x, z, pad) {
  return cols.some((c) => Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad);
}

function spots(rng, rects, cols, n, sep, pad, taken) {
  const out = [];
  const held = taken.map((t) => t.slice());
  const step = Math.max(0.7, sep * 0.85);
  const cands = [];
  for (const r of rects) {
    for (let x = r.x0 + pad; x <= r.x1 - pad + 0.01; x += step) {
      for (let z = r.z0 + pad; z <= r.z1 - pad + 0.01; z += step) {
        cands.push([x + (rng() - 0.5) * step * 0.5, z + (rng() - 0.5) * step * 0.5]);
      }
    }
  }
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = cands[i];
    cands[i] = cands[j];
    cands[j] = swap;
  }
  for (const [x, z] of cands) {
    if (out.length >= n) break;
    if (!inRects(rects, x, z, 0.15)) continue;
    if (hits(cols, x, z, pad)) continue;
    if (held.some(([px, pz, s]) => (x - px) ** 2 + (z - pz) ** 2 < s * s)) continue;
    out.push([x, z]);
    held.push([x, z, sep]);
  }
  return out;
}

function clearRun(cols, rects, x, z, axis, pad) {
  const step = 0.3;
  let lo = axis === 'x' ? x : z;
  let hi = lo;
  const fixed = axis === 'x' ? z : x;
  const ok = (v) => {
    const px = axis === 'x' ? v : fixed;
    const pz = axis === 'x' ? fixed : v;
    return inRects(rects, px, pz, 0.12) && !hits(cols, px, pz, pad);
  };
  let guard = 0;
  while (ok(lo - step) && hi - (lo - step) < 18 && guard++ < 80) lo -= step;
  guard = 0;
  while (ok(hi + step) && (hi + step) - lo < 18 && guard++ < 80) hi += step;
  return { lo, hi };
}

// One placement for every area. Figures land on `rects`, clear of `cols`,
// at least `sep` apart. A walker ping-pongs on a private segment of that
// rect and stops short of anyone else, so paths never meet at one point.
export function placeAreaCrowd(g, cols, style, seed, spec) {
  crowd(g, cols, style, stream(seed, 902), stream(seed, 903), spec);
}

function crowd(g, cols, style, rngP, rngC, { rects, people = 0, cats = 0, axis = 'x', pool = CROWD }) {
  const catSpots = cats > 0 ? spots(rngC, rects, cols, cats, 0.6, 0.32, []) : [];
  for (const [x, z] of catSpots) addCatAt(g, cols, style, rngC, x, z);
  const catTaken = catSpots.map(([x, z]) => [x, z, 0.85]);
  const peopleSpots = people > 0 ? spots(rngP, rects, cols, people, 1, 0.45, catTaken) : [];
  // A walker stays on one lane. The segment is cut back so it never comes
  // within 1 m of another person or 0.8 m of a cat, including while moving.
  const keepClear = (run, spot, others, gap) => {
    let { lo, hi } = run;
    const fixed = axis === 'x' ? spot[1] : spot[0];
    const start = axis === 'x' ? spot[0] : spot[1];
    for (const o of others) {
      const of = axis === 'x' ? o[1] : o[0];
      const om = axis === 'x' ? o[0] : o[1];
      const side = Math.abs(of - fixed);
      if (side >= gap) continue;
      const along = Math.sqrt(Math.max(0, gap * gap - side * side));
      if (start <= om) hi = Math.min(hi, om - along);
      else lo = Math.max(lo, om + along);
    }
    return { lo, hi };
  };
  peopleSpots.forEach((spot) => {
    const wantWalk = rngP() < 0.62;
    const others = peopleSpots.filter((s) => s !== spot);
    const blocked = others.map(([x, z]) => ({ x, z, hw: 0.5, hd: 0.5 }))
      .concat(catSpots.map(([x, z]) => ({ x, z, hw: 0.35, hd: 0.35 })));
    const run = keepClear(
      clearRun(cols.concat(blocked), rects, spot[0], spot[1], axis, 0.28),
      spot,
      others.concat(catSpots),
      1,
    );
    const path = wantWalk && run.hi - run.lo >= 2.4 && run.lo <= (axis === 'x' ? spot[0] : spot[1]) && (axis === 'x' ? spot[0] : spot[1]) <= run.hi
      ? { axis, lo: run.lo, hi: run.hi, pos: axis === 'x' ? spot[0] : spot[1], dir: 1 }
      : null;
    addPersonAt(g, cols, style, rngP, spot[0], spot[1], path, pool);
  });
}

function addTree(g, cols, style, rng, variant, x, z, seed) {
  const t = createAsset('nature.tree', { variant, seed: (seed >>> 0) || 1 }, style);
  const s = 0.72 + rng() * 0.28;
  t.scale.setScalar(s);
  put(g, cols, t, x, z, rng() * Math.PI * 2);
}

const SHOP_ROW = [
  { id: 'building.kissaten' },
  { id: 'building.sushi' },
  { id: 'building.pharmacy' },
  { id: 'building.florist' },
  { id: 'building.fishmonger' },
  { id: 'building.laundromat' },
  { id: 'building.udonSoba' },
  { id: 'building.takoyaki', w: 6.2, d: 6.6 },
  { id: 'building.shop', shopType: 'Konbini' },
  { id: 'building.shop', shopType: 'Ramen' },
  { id: 'building.shop', shopType: 'Bakery' },
  { id: 'building.shop', shopType: 'Bookshop' },
  { id: 'building.shop', shopType: 'Cafe' },
  { id: 'building.shop', shopType: 'Izakaya' },
];

function shotengai(p, style) {
  const { g, cols, finish } = stage('area.shotengai');
  const rng = stream(p.seed, 1);
  const people = stream(p.seed, 2);
  const cats = stream(p.seed, 3);
  const edges = { n: 'sidewalk', e: 'street', s: 'sidewalk', w: 'street' };
  layBlock(g, style, edges, 'sidewalk', paletteHex('Sand'));
  overlay(g, style, 24, 3.4, 'concrete', paletteHex('Stone'), 0, 0);

  const perSide = band(p.Density, 2, 3, 4);
  const span = 22;
  const lotW = Math.min(7.6, span / perSide - 0.7);
  const lotD = 7.2;
  // Shop fronts sit about 1.9 m inside the +z edge of the lot (shops.js body).
  const face = lotD / 2 - 1.9;
  const zRow = 3.5 + face;
  const xs = spread(perSide, span);
  xs.forEach((x, i) => {
    for (const [z, rot, k] of [[-zRow, 0, 0], [zRow, Math.PI, 1]]) {
      const shop = pick(rng, SHOP_ROW);
      const extra = {};
      if (shop.shopType) extra.shopType = shop.shopType;
      addBuilding(g, cols, style, shop.id, salt(p.seed, 10 + k * 20 + i), shop.w ?? lotW, shop.d ?? lotD, x, z, rot, extra);
    }
  });
  const flags = band(p.Density, 2, 4, 6);
  spread(flags, span - 1).forEach((x, i) => {
    const south = i % 2 === 0;
    put(g, cols, createAsset('prop.nobori', {
      variant: pick(rng, ['Stripes', 'Blocks']),
      seed: salt(p.seed, 80 + i),
    }, style), x, south ? -0.85 : 0.85, south ? 0 : Math.PI);
  });

  const bikes = band(p.Density, 2, 4, 6);
  spread(bikes, span - 3).forEach((x, i) => {
    put(g, cols, createAsset('vehicle.bicycle', { color: pick(rng, VEHICLE_COLORS) }, style), x, i % 2 ? 1.35 : -1.35, Math.PI / 2);
  });

  const boards = band(p.Density, 1, 2, 3);
  spread(boards, span * 0.5).forEach((x, i) => {
    put(g, cols, createAsset('prop.sandwichBoard', { variant: pick(rng, ['Menu', 'Open']) }, style), x, i % 2 ? 0.15 : -0.15, Math.PI / 2);
  });
  put(g, cols, createAsset('prop.vendingMachine', { variant: pick(rng, ['White', 'Red', 'Blue']) }, style), span * 0.28, -1.45, 0);
  if (p.Density !== 'Sparse') {
    put(g, cols, createAsset('prop.bikeRack', { variant: p.Density === 'Busy' ? '3 bikes' : 'Empty' }, style), -span * 0.32, 1.45, Math.PI / 2);
  }
  put(g, cols, createAsset('prop.trashBin', { variant: 'Round bin' }, style), span * 0.42, 1.4, 0);

  crowd(g, cols, style, people, cats, {
    rects: [{ x0: -10, x1: 10, z0: -1.05, z1: 1.05 }],
    people: p.People === 'Off' ? 0 : band(p.Density, 3, 5, 7),
    cats: p.Cats === 'Off' ? 0 : band(p.Density, 1, 2, 3),
    axis: 'x',
  });
  return finish();
}

function lane(p, style) {
  const { g, cols, finish } = stage('area.lane');
  const rng = stream(p.seed, 11);
  const people = stream(p.seed, 12);
  const cats = stream(p.seed, 13);
  const edges = { n: 'sidewalk', e: 'street', s: 'sidewalk', w: 'street' };
  layBlock(g, style, edges, 'grass', null);
  // Road and pavements sit on the grass and do not cover each other.
  // The road is 4.2 m (z ±2.1); each pavement is 1.5 m starting at |z| 2.45.
  overlay(g, style, 26, 4.2, 'road', null, 0, 0);
  for (const s of [-1, 1]) overlay(g, style, 24, 1.5, 'sidewalk', paletteHex('Sand'), 0, s * 3.2);
  for (const s of [-1, 1]) kerb(g, style, 0, s * 2.28, 24, true, INTERIOR_TOP + GAP);

  const perSide = band(p.Density, 2, 3, 3);
  const span = 22;
  const lotW = Math.min(9, span / perSide - 0.55);
  const lotD = 10;
  // The house wall sits on the street edge of the lot (buildings.js house).
  const zRow = 3.95 + lotD / 2;
  spread(perSide, span).forEach((x, i) => {
    addBuilding(g, cols, style, 'building.house', salt(p.seed, 20 + i), lotW, lotD, x, -zRow, 0);
    addBuilding(g, cols, style, 'building.house', salt(p.seed, 40 + i), lotW, lotD, x, zRow, Math.PI);
  });

  const poles = band(p.Density, 2, 3, 4);
  const px = spread(poles, span - 2);
  px.forEach((x, i) => {
    put(g, cols, createAsset('prop.utilityPole', { variant: i === 0 ? 'With transformer' : 'Plain' }, style), x, 3.05, 0);
    if (i) {
      const wire = createAsset('line.wire', { a: [px[i - 1], 8.45, 3.05], b: [x, 8.45, 3.05], sag: 0.65 }, style);
      g.add(wire);
    }
  });

  put(g, cols, createAsset('prop.vendingMachine', { variant: pick(rng, ['Blue', 'White', 'Red']) }, style), spread(perSide, span)[0], -3.45, Math.PI);
  put(g, cols, createAsset('prop.postBox', { variant: 'Standard' }, style), 4.2, -3.2, 0);
  put(g, cols, createAsset('prop.hydrant', { variant: 'Standard' }, style), -5.4, 3.25, 0);
  put(g, cols, createAsset('prop.streetLamp', { variant: 'Single' }, style), 0, -3.15, 0);
  put(g, cols, createAsset('vehicle.bicycle', { color: pick(rng, VEHICLE_COLORS) }, style), 6.5, 3.35, Math.PI / 2);

  const plants = band(p.Density, 2, 4, 6);
  const pots = ['Fern', 'Leafy', 'Snake plant', 'Cactus'];
  const bushes = ['Small', 'Boxwood', 'Azalea', 'Hydrangea', 'Fern clump'];
  spread(plants, span - 2).forEach((x, i) => {
    const south = i % 2 === 0;
    const z = south ? -3.55 : 3.55;
    if (i % 3 === 0) {
      put(g, cols, createAsset('nature.pot', { variant: pick(rng, pots), seed: salt(p.seed, 90 + i) }, style), x, z, 0);
    } else if (i % 3 === 1) {
      put(g, cols, createAsset('nature.bush', { variant: pick(rng, bushes), seed: salt(p.seed, 110 + i) }, style), x, south ? -4.3 : 4.3, 0);
    } else {
      put(g, cols, createAsset('prop.planter', { variant: pick(rng, ['Planter box', 'Potted plant']) }, style), x, z, Math.PI / 2);
    }
  });

  const rails = band(p.Density, 1, 2, 3);
  spread(rails, 20).forEach((x, i) => {
    put(g, cols, createAsset('prop.bollard', { variant: 'Guard rail' }, style), x, i % 2 ? 2.05 : -2.05, 0);
  });

  crowd(g, cols, style, people, cats, {
    rects: [
      { x0: -10, x1: 10, z0: 2.45, z1: 3.35 },
      { x0: -10, x1: 10, z0: -3.35, z1: -2.45 },
    ],
    people: p.People === 'Off' ? 0 : band(p.Density, 2, 4, 6),
    cats: p.Cats === 'Off' ? 0 : band(p.Density, 1, 2, 3),
    axis: 'x',
    pool: [...ADULTS, 'human.boy', 'human.girl'],
  });
  return finish();
}

function station(p, style) {
  const { g, cols, finish } = stage('area.station');
  const rng = stream(p.seed, 21);
  const people = stream(p.seed, 22);
  const cats = stream(p.seed, 23);
  const edges = { n: 'sidewalk', e: 'street', s: 'sidewalk', w: 'street' };
  layBlock(g, style, edges, 'sidewalk', paletteHex('Stone'));
  // Road is 5.2 m deep at z = 10.2, so z runs 7.6..12.8. Kerbs sit in the gap.
  const roadTop = overlay(g, style, 26, 5.2, 'road', null, 0, 10.2);
  kerb(g, style, 0, 7.46, 24, true, INTERIOR_TOP + GAP);
  kerb(g, style, 0, 12.94, 24, true, INTERIOR_TOP + GAP);

  // Post office stands in for a station building. See the file header.
  addBuilding(g, cols, style, 'building.postOffice', salt(p.seed, 1), 16, 11, 0, -6.6, 0);

  const cross = createAsset('prop.crosswalk', { variant: 'Zebra', length: 4.8 }, style);
  cross.position.y = roadTop;
  put(g, cols, cross, 8.5, 10.2, 0);

  put(g, cols, createAsset('prop.busStop', { variant: 'Shelter' }, style), -12.2, 5.4, 0);
  put(g, cols, createAsset('prop.vendingMachine', { variant: pick(rng, ['Blue', 'White']) }, style), -12.4, 3.2, Math.PI);
  put(g, cols, createAsset('prop.trafficLight', { variant: 'Car signal' }, style), 9.5, 7.15, Math.PI);
  put(g, cols, createAsset('prop.streetLamp', { variant: 'Double' }, style), -8, 6.6, 0);
  put(g, cols, createAsset('prop.streetLamp', { variant: 'Single' }, style), 12.5, 6.4, 0);

  const taxis = band(p.Density, 1, 2, 3);
  spread(taxis, 5 + taxis * 2.4).forEach((x) => {
    put(g, cols, createAsset('vehicle.car', { variant: 'Taxi', color: 'Navy' }, style), 5.2 + x, 8.7, Math.PI / 2);
  });
  put(g, cols, createAsset('vehicle.bus', { variant: 'City bus' }, style), -4.2, 11.5, Math.PI / 2);
  if (p.Density === 'Busy') {
    put(g, cols, createAsset('vehicle.car', { variant: 'Kei car', color: pick(rng, ['White', 'Gray', 'Blue']) }, style), 10.5, 11.4, -Math.PI / 2);
  }

  const benches = band(p.Density, 2, 3, 4);
  spread(benches, 16).forEach((x, i) => {
    put(g, cols, createAsset('prop.bench', { variant: i % 2 ? 'Backless' : 'Park bench' }, style), x, 1.6 + (i % 2) * 2.2, 0);
  });

  crowd(g, cols, style, people, cats, {
    rects: [{ x0: -8.5, x1: 8.5, z0: 0.4, z1: 6.2 }],
    people: p.People === 'Off' ? 0 : band(p.Density, 3, 5, 8),
    cats: p.Cats === 'Off' ? 0 : band(p.Density, 1, 2, 3),
    axis: 'x',
    pool: ['human.salaryman', 'human.woman', 'human.man', 'human.grandma', 'human.schoolgirl', 'human.grandpa'],
  });
  return finish();
}

function shrineCorner(p, style) {
  const { g, cols, finish } = stage('area.shrine');
  const rng = stream(p.seed, 31);
  const people = stream(p.seed, 32);
  const cats = stream(p.seed, 33);
  const edges = { n: 'sidewalk', e: 'sidewalk', s: 'sidewalk', w: 'sidewalk' };
  // The shrine's gravel is its own ground. Leave that rectangle out of the grass.
  layBlock(g, style, edges, 'grass', null, { x0: -13.2, x1: 0.8, z0: -10.2, z1: 3.8 });
  // A stone path out of the shrine precinct into the park. The cross is two
  // pieces that meet at an edge, so they do not stack.
  // Stops at the shrine gravel (z = 3.8) so it does not sit on the stepping stones.
  overlay(g, style, 2.2, 8.35, 'concrete', paletteHex('Stone'), -7.2, 8.025);
  overlay(g, style, 13.55, 2.2, 'concrete', paletteHex('Stone'), 0.725, 8.6);

  addBuilding(g, cols, style, 'building.shrine', salt(p.seed, 1), 14, 14, -6.2, -3.2, 0);

  const play = new THREE.Group();
  buildPlayground(play, style);
  play.position.set(7.4, 0, 1.4);
  g.add(play);
  cols.push({ x: 7.4, z: 1.4, hw: 4.6, hd: 4.2 });
  // The same sandbox the park puts beside the slide, in playground-local space.
  addSandbox(play, -2.4, 2.8, 2.6, 2.4, style.material('wood'), style.material('sidewalk', paletteHex('Sand')), INTERIOR_TOP);

  const grove = band(p.Density, 4, 6, 8);
  const kinds = ['Zelkova', 'Pine', 'Black pine', 'Cherry blossom', 'Japanese maple', 'Old giant', 'Ginkgo'];
  const spots = [[11.5, -9], [3.2, -10], [13, -3.5], [-13, 7.5], [13, 8], [-1.5, -11], [5.5, 10.5], [-12.5, -9.5]];
  spots.slice(0, grove).forEach((spot, i) => {
    addTree(g, cols, style, rng, kinds[i % kinds.length], spot[0], spot[1], salt(p.seed, 60 + i));
  });

  const benches = band(p.Density, 1, 2, 3);
  [[-2.2, 5.4], [3.4, 6.8], [11, 6.2]].slice(0, benches).forEach(([x, z], i) => {
    put(g, cols, createAsset('prop.bench', { variant: 'Park bench' }, style), x, z, i === 2 ? Math.PI : Math.PI / 2);
  });
  const lanterns = band(p.Density, 1, 2, 3);
  [[-4.6, 4.2], [-9.6, 5.2], [2.2, 10.2]].slice(0, lanterns).forEach(([x, z]) => {
    put(g, cols, createAsset('prop.stoneLantern', { variant: 'Standard' }, style), x, z, 0);
  });
  if (p.Density !== 'Sparse') {
    put(g, cols, createAsset('prop.paperLantern', { variant: pick(rng, ['Red', 'White']) }, style), -5.2, 3.4, 0);
  }
  put(g, cols, createAsset('nature.flowerBed', { variant: 'Mixed', seed: salt(p.seed, 8) }, style), 5.5, -6.2, 0);
  put(g, cols, createAsset('nature.bush', { variant: 'Azalea', seed: salt(p.seed, 9) }, style), 13.2, 3.6, 0);
  put(g, cols, createAsset('prop.trashBin', { variant: 'Round bin' }, style), 11.4, -1.5, 0);

  const birds = band(p.Density, 2, 4, 6);
  const birdSpots = [[1.2, 4.4], [6.4, 8.2], [-2.8, 9.4], [10.2, 9.6], [3.2, -6.8], [14.8, 2]];
  birdSpots.slice(0, birds).forEach(([x, z], i) => {
    const sparrow = i % 3 === 2;
    put(g, cols, createAsset('animal.bird', {
      variant: sparrow ? 'Sparrow' : 'Pigeon',
      seed: salt(p.seed, 140 + i),
    }, style), x, z, rng() * 6);
  });

  crowd(g, cols, style, people, cats, {
    rects: [
      { x0: -1, x1: 6, z0: 6.4, z1: 12.5 },
      { x0: 11.2, x1: 14, z0: -7, z1: 8 },
    ],
    people: p.People === 'Off' ? 0 : band(p.Density, 2, 4, 6),
    cats: p.Cats === 'Off' ? 0 : band(p.Density, 1, 2, 3),
    axis: 'x',
    pool: [...KIDS, ...ADULTS],
  });
  return finish();
}

function oldSquare(p, style) {
  const { g, cols, finish } = stage('area.square');
  const rng = stream(p.seed, 41);
  const people = stream(p.seed, 42);
  const cats = stream(p.seed, 43);
  const edges = { n: 'sidewalk', e: 'sidewalk', s: 'sidewalk', w: 'sidewalk' };
  layBlock(g, style, edges, 'concrete', paletteHex('Stone'));
  const pave = createAsset('ground.paving', { w: 9, d: 9, color: paletteHex('Light gray') }, style);
  pave.position.y = INTERIOR_TOP + GAP;
  g.add(pave);
  const curb = INTERIOR_TOP + GAP;
  kerb(g, style, 0, 4.66, 9, true, curb);
  kerb(g, style, 0, -4.66, 9, true, curb);
  kerb(g, style, 4.66, 0, 9, false, curb);
  kerb(g, style, -4.66, 0, 9, false, curb);

  const lotD = 7.2;
  const zRow = 4.6 + lotD / 2;
  const pair = 4.6;
  addBuilding(g, cols, style, 'building.tudorCottage', salt(p.seed, 1), 7.2, lotD, -pair, -zRow, 0);
  addBuilding(g, cols, style, 'building.frenchCountryHouse', salt(p.seed, 2), 7.2, lotD, pair, -zRow, 0);
  addBuilding(g, cols, style, 'building.scandinavianHouse', salt(p.seed, 3), 7.2, lotD, -pair, zRow, Math.PI);
  addBuilding(g, cols, style, 'building.mediterraneanVilla', salt(p.seed, 4), 7.6, lotD, pair, zRow, Math.PI);
  addBuilding(g, cols, style, 'building.dutchCanalHouse', salt(p.seed, 5), 6.4, 7.2, 9.4, 0, -Math.PI / 2);
  addBuilding(g, cols, style, 'building.stoneChapel', salt(p.seed, 6), 7, 7.6, -9.6, 0, Math.PI / 2);

  const trees = band(p.Density, 2, 4, 6);
  [[-2.2, -2.2, 'Oak'], [2.2, 2.2, 'Lollipop'], [-2.2, 2.2, 'Camphor'], [2.2, -2.2, 'Oak'], [0, -2.4, 'Lollipop'], [0, 2.4, 'Camphor']]
    .slice(0, trees)
    .forEach(([x, z, variant], i) => addTree(g, cols, style, rng, variant, x, z, salt(p.seed, 70 + i)));

  const benches = band(p.Density, 2, 4, 4);
  [[-2.8, 0, Math.PI / 2], [2.8, 0, -Math.PI / 2], [0, -2.8, 0], [0, 2.8, Math.PI]].slice(0, benches).forEach(([x, z, rot]) => {
    put(g, cols, createAsset('prop.bench', { variant: 'Park bench' }, style), x, z, rot);
  });
  put(g, cols, createAsset('nature.flowerBed', { variant: 'Mixed', seed: salt(p.seed, 12) }, style), -3.6, -3.6, 0);
  if (p.Density !== 'Sparse') {
    put(g, cols, createAsset('prop.planter', { variant: 'Planter box' }, style), 3.6, 3.6, 0);
    put(g, cols, createAsset('prop.streetLamp', { variant: 'Single' }, style), -3.8, 3.8, 0);
  }

  const pigeons = band(p.Density, 3, 5, 7);
  spread(pigeons, 6).forEach((x, i) => {
    put(g, cols, createAsset('animal.bird', { variant: 'Pigeon', seed: salt(p.seed, 150 + i) }, style), x, (i % 2 ? 0.8 : -0.8) * (1 + (i % 2)), rng() * 6);
  });

  crowd(g, cols, style, people, cats, {
    rects: [{ x0: -2.4, x1: 2.4, z0: -2.4, z1: 2.4 }],
    people: p.People === 'Off' ? 0 : band(p.Density, 2, 4, 5),
    cats: p.Cats === 'Off' ? 0 : band(p.Density, 1, 2, 2),
    axis: 'x',
    pool: ADULTS,
  });
  return finish();
}

const ALLEY_BUILDINGS = [
  { id: 'building.house', w: 8, d: 8 },
  { id: 'building.woodApartment', w: 8.4, d: 8 },
  { id: 'building.mixedUse', w: 8, d: 8 },
  { id: 'building.kissaten', w: 7.4, d: 7.6 },
  { id: 'building.pharmacy', w: 7.6, d: 7.6 },
  { id: 'building.shop', w: 7.2, d: 7.4, shopType: 'Konbini' },
];

function alley(p, style) {
  const { g, cols, finish } = stage('area.alley');
  const rng = stream(p.seed, 51);
  const people = stream(p.seed, 52);
  const cats = stream(p.seed, 53);
  const edges = { n: 'sidewalk', e: 'street', s: 'sidewalk', w: 'street' };
  layBlock(g, style, edges, 'concrete', paletteHex('Gray'));
  const roadTop = overlay(g, style, 26, 2.2, 'road', null, 0, 0);

  const perSide = band(p.Density, 2, 3, 3);
  const span = 22;
  const xs = spread(perSide, span);
  // Back faces land just off the alley. Japanese backs sit near the -z lot edge.
  const lotFallback = 8;
  xs.forEach((x, i) => {
    for (const [sign, rot, k] of [[-1, Math.PI, 0], [1, 0, 1]]) {
      const b = pick(rng, ALLEY_BUILDINGS);
      const d = b.d ?? lotFallback;
      const extra = {};
      if (b.shopType) extra.shopType = b.shopType;
      addBuilding(g, cols, style, b.id, salt(p.seed, 20 + k * 10 + i), b.w, d, x, sign * (2.35 + d / 2 - 0.45), rot, extra);
    }
  });

  const clutter = band(p.Density, 3, 5, 7);
  const kinds = ['Propane tanks', 'Gas meter', 'Drainpipe', 'Cluster', 'Propane tanks', 'Gas meter'];
  spread(clutter, span - 1).forEach((x, i) => {
    const south = i % 2 === 0;
    put(g, cols, createAsset('prop.backClutter', {
      variant: kinds[i % kinds.length],
      seed: salt(p.seed, 90 + i),
    }, style), x, south ? -1.35 : 1.35, south ? 0 : Math.PI);
  });

  const covers = band(p.Density, 1, 2, 3);
  spread(covers, 8).forEach((x, i) => {
    const cover = createAsset('prop.manhole', {
      variant: ['Flower', 'Wave', 'Grid'][i % 3],
      seed: salt(p.seed, 120 + i),
    }, style);
    cover.position.y = roadTop;
    put(g, cols, cover, x, i % 2 ? 0.35 : -0.25, 0);
  });

  put(g, cols, createAsset('prop.trashBin', { variant: 'Round bin' }, style), -span / 2 + 0.2, -1.15, 0);
  put(g, cols, createAsset('prop.trashBin', { variant: 'Recycling station' }, style), span / 2 - 0.4, 1.2, Math.PI);
  // Cardboard boxes on the delivery scooter stand in for crates.
  put(g, cols, createAsset('vehicle.scooter', { variant: 'Delivery' }, style), 1.6, -0.15, Math.PI / 2);
  if (p.Density !== 'Sparse') {
    put(g, cols, createAsset('vehicle.bicycle', { color: 'Gray' }, style), -3.2, 1.45, Math.PI / 2);
    put(g, cols, createAsset('prop.utilityPole', { variant: 'Plain' }, style), 12.2, 0.2, 0);
  }

  crowd(g, cols, style, people, cats, {
    rects: [{ x0: -9.5, x1: 9.5, z0: -0.7, z1: 0.7 }],
    people: p.People === 'Off' ? 0 : band(p.Density, 1, 2, 3),
    cats: p.Cats === 'Off' ? 0 : band(p.Density, 2, 3, 5),
    axis: 'x',
    pool: ADULTS,
  });
  return finish();
}

const OPTIONS = {
  Density: ['Sparse', 'Normal', 'Busy'],
  People: ['On', 'Off'],
  Cats: ['On', 'Off'],
};

function area({ id, label, viewDir, people, cats, edges, build }) {
  return {
    id,
    label,
    category: 'area',
    group: 'areas',
    fillFrame: true,
    viewDir,
    edges,
    options: OPTIONS,
    params: { seed: 1, Density: 'Normal', People: people, Cats: cats },
    size: [BLOCK_SIZE, BLOCK_SIZE],
    build(p, style) {
      const g = build(p, style);
      g.userData.block = {
        id,
        footprint: [BLOCK_SIZE, BLOCK_SIZE],
        edges: { n: edges.n, e: edges.e, s: edges.s, w: edges.w },
      };
      return g;
    },
  };
}

/** One area block, centred on the origin, ready to set on a grid. */
export function createAreaBlock(id, params, style) {
  const area = AREA_DIORAMAS.find((a) => a.id === id);
  if (!area) throw new Error(`Unknown area "${id}"`);
  return area.build({ ...area.params, ...params }, style);
}

export const AREA_DIORAMAS = [
  area({
    id: 'area.shotengai',
    label: 'Shotengai',
    viewDir: [1, 0.7, 0.34],
    people: 'On',
    cats: 'Off',
    edges: { n: 'sidewalk', e: 'street', s: 'sidewalk', w: 'street' },
    build: shotengai,
  }),
  area({
    id: 'area.lane',
    label: 'Residential lane',
    viewDir: [1, 0.58, 0.22],
    people: 'On',
    cats: 'On',
    edges: { n: 'sidewalk', e: 'street', s: 'sidewalk', w: 'street' },
    build: lane,
  }),
  area({
    id: 'area.station',
    label: 'Station plaza',
    viewDir: [0.7, 0.48, 1],
    people: 'On',
    cats: 'Off',
    edges: { n: 'sidewalk', e: 'street', s: 'sidewalk', w: 'street' },
    build: station,
  }),
  area({
    id: 'area.shrine',
    label: 'Shrine corner',
    viewDir: [0.82, 0.7, 1],
    people: 'On',
    cats: 'Off',
    edges: { n: 'sidewalk', e: 'sidewalk', s: 'sidewalk', w: 'sidewalk' },
    build: shrineCorner,
  }),
  area({
    id: 'area.square',
    label: 'Old-town square',
    viewDir: [0.62, 1.55, 0.62],
    people: 'On',
    cats: 'Off',
    edges: { n: 'sidewalk', e: 'sidewalk', s: 'sidewalk', w: 'sidewalk' },
    build: oldSquare,
  }),
  area({
    id: 'area.alley',
    label: 'Back alley',
    viewDir: [1, 0.72, 0.08],
    people: 'Off',
    cats: 'On',
    edges: { n: 'sidewalk', e: 'street', s: 'sidewalk', w: 'street' },
    build: alley,
  }),
];
