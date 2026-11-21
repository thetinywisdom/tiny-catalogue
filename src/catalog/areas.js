import * as THREE from 'three';
import { createGait, poseGait, setGaitEngine, stepGait, tuneOf, WALK_SPEED } from '../anim/gait.js';
import { createCatGait, poseCat, stepCatGait } from '../anim/catGait.js';
import { buildPlayground } from '../city/playground.js';
import { mulberry32 } from '../lib/rng.js';
import { box, tiledBox } from '../props/util.js';
import { VEHICLE_COLORS } from '../props/vehicles.js';
import { paletteHex } from '../styles/palette.js';
import { CAT_EARS, CAT_FUR, CAT_PATTERNS, CAT_TAILS } from '../subjects/cat.js';
import { createAsset } from './index.js';

// Seeded dioramas for the Areas tab. Each one is a normal catalogue item:
// the same seed rebuilds the same layout, and 🎲 New look only changes the seed.
//
// Everything placed is an existing catalogue asset (createAsset) or an existing
// builder (the park playground). The only new geometry is ground: paving slabs,
// a road, kerbs, and the shotengai's arcade frame (posts and a split roof).
// Those use palette colours already on a role. No new swatches, no new props.
//
// People stay faceless (the human builder draws none). Cats are built with
// face: 'None' by createAsset. Nobori and birds move because tickProps already
// walks the item. People and cats set userData.tick, which tickProps calls.
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

function slab(g, style, w, h, d, role, color, x, y, z) {
  g.add(tiledBox(w, h, d, color == null ? style.material(role) : style.material(role, color), [x, y, z], 4));
}

function kerb(g, style, x, z, len, alongX) {
  const m = style.material('concrete', paletteHex('Light gray'));
  g.add(alongX ? box(len, 0.1, 0.16, m, [x, 0.06, z]) : box(0.16, 0.1, len, m, [x, 0.06, z]));
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

function addPerson(g, cols, style, rng, x, z, rot, walking, pool) {
  const person = createAsset(pick(rng, pool), { seed: 1 + Math.floor(rng() * 9000) }, style);
  const phase = rng() * Math.PI * 2;
  const gait = createGait(phase);
  gait.t = phase;
  // Keep the idle glance and the walk cycle on the seed. poseIK would otherwise
  // draw Math.random for the first step and the look-around.
  gait.cyc = phase;
  gait.nextLook = 1e9;
  gait.lookTo = 0;
  const speed = walking ? WALK_SPEED * (0.82 + rng() * 0.28) : 0;
  follow(person, (dt) => {
    setGaitEngine('New');
    stepGait(gait, dt, speed, TUNE);
    poseGait(person, gait, 'natural', TUNE);
  });
  put(g, cols, person, x, z, rot);
}

function addCat(g, cols, style, rng, x, z, rot) {
  const cat = createAsset('animal.cat', {
    variant: pick(rng, ['Housecat', 'Housecat', 'Kitten', 'Chonk']),
    color: pick(rng, FUR),
    pattern: pick(rng, CAT_PATTERNS),
    tailType: pick(rng, CAT_TAILS),
    earType: pick(rng, CAT_EARS),
    coat: rng() < 0.82 ? 'Short' : 'Long',
  }, style);
  const body = cat.getObjectByName('cat') ?? cat;
  const gait = createCatGait(rng() * 6);
  gait.t = rng() * 8;
  gait.pose = pick(rng, ['sit', 'loaf', 'loaf', 'sleep', 'sit']);
  gait.poseW = 1;
  poseCat(body, gait);
  follow(cat, (dt) => {
    stepCatGait(gait, dt, 0);
    poseCat(body, gait);
  });
  put(g, cols, cat, x, z, rot);
}

function addTree(g, cols, style, rng, variant, x, z, seed) {
  const t = createAsset('nature.tree', { variant, seed: (seed >>> 0) || 1 }, style);
  const s = 0.72 + rng() * 0.28;
  t.scale.setScalar(s);
  put(g, cols, t, x, z, rng() * Math.PI * 2);
}

// Posts and short roof bays over a shopping street. The bays run across the
// street with gaps between them, so the cover reads from the end of the
// arcade and the flags and people still show.
function arcade(g, style, length, halfW, y) {
  const post = style.material('metal', paletteHex('Slate'));
  const beam = style.material('metal', paletteHex('Light gray'));
  const roof = style.material('paint', paletteHex('Paper'));
  const n = Math.max(3, Math.round(length / 3.6));
  const bay = length / n;
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + bay * (i + 0.5);
    for (const s of [-1, 1]) g.add(box(0.1, y, 0.1, post, [x, y / 2, s * halfW]));
    g.add(box(0.1, 0.08, halfW * 2, beam, [x, y, 0]));
    g.add(box(bay * 0.7, 0.06, halfW * 1.7, roof, [x, y + 0.07, 0]));
  }
  for (const s of [-1, 1]) g.add(box(length, 0.08, 0.1, beam, [0, y, s * halfW]));
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
  const W = 30;
  const D = 22;
  slab(g, style, W, 0.04, D, 'sidewalk', paletteHex('Sand'), 0, 0.02, 0);
  slab(g, style, W - 1.2, 0.02, 3.4, 'concrete', paletteHex('Stone'), 0, 0.045, 0);

  const perSide = band(p.Density, 2, 3, 4);
  const span = W - 4.5;
  const lotW = Math.min(7.6, span / perSide - 0.7);
  const lotD = 7.2;
  // Shop fronts sit about 1.9 m inside the +z edge of the lot (shops.js body).
  // Keep the facades far enough apart that awnings clear the arcade.
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
  arcade(g, style, span - 1, 1.55, 3.85);

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

  if (p.People !== 'Off') {
    const n = band(p.Density, 3, 5, 7);
    spread(n, span - 4).forEach((x, i) => {
      const along = people() < 0.62;
      const rot = along ? (i % 2 ? Math.PI / 2 : -Math.PI / 2) : (people() < 0.5 ? 0 : Math.PI);
      addPerson(g, cols, style, people, x + (people() - 0.5) * 0.3, (people() - 0.5) * 0.9, rot, along, CROWD);
    });
  }
  if (p.Cats !== 'Off') {
    const n = band(p.Density, 1, 1, 2);
    spread(n, 6).forEach((x, i) => addCat(g, cols, style, cats, x, i % 2 ? 1.95 : -1.95, cats() * 6));
  }
  return finish();
}

function lane(p, style) {
  const { g, cols, finish } = stage('area.lane');
  const rng = stream(p.seed, 11);
  const people = stream(p.seed, 12);
  const cats = stream(p.seed, 13);
  const W = 30;
  const D = 28;
  slab(g, style, W, 0.04, D, 'grass', null, 0, 0.015, 0);
  slab(g, style, W, 0.03, 4.4, 'road', null, 0, 0.03, 0);
  for (const s of [-1, 1]) slab(g, style, W, 0.025, 1.7, 'sidewalk', paletteHex('Sand'), 0, 0.04, s * 3.15);
  for (const s of [-1, 1]) kerb(g, style, 0, s * 2.22, W - 0.8, true);

  const perSide = band(p.Density, 2, 3, 3);
  const span = W - 3;
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
  spread(rails, W - 8).forEach((x, i) => {
    put(g, cols, createAsset('prop.bollard', { variant: 'Guard rail' }, style), x, i % 2 ? 2.05 : -2.05, 0);
  });

  if (p.People !== 'Off') {
    const n = band(p.Density, 1, 2, 4);
    spread(n, span * 0.7).forEach((x, i) => {
      const south = i % 2 === 0;
      addPerson(g, cols, style, people, x, south ? -2.7 : 2.7, people() < 0.5 ? Math.PI / 2 : -Math.PI / 2, people() < 0.45, [...ADULTS, 'human.boy', 'human.girl']);
    });
  }
  if (p.Cats !== 'Off') {
    const n = band(p.Density, 1, 1, 2);
    spread(n, 8).forEach((x, i) => addCat(g, cols, style, cats, x, i % 2 ? 2.85 : -2.85, cats() * 6));
  }
  return finish();
}

function station(p, style) {
  const { g, cols, finish } = stage('area.station');
  const rng = stream(p.seed, 21);
  const people = stream(p.seed, 22);
  const cats = stream(p.seed, 23);
  const W = 32;
  const D = 28;
  slab(g, style, W, 0.04, D, 'sidewalk', paletteHex('Stone'), 0, 0.015, 0);
  slab(g, style, W, 0.03, 5.6, 'road', null, 0, 0.03, 10.4);
  kerb(g, style, 0, 7.55, W - 1, true);
  kerb(g, style, 0, 13.25, W - 1, true);

  // Post office stands in for a station building. See the file header.
  addBuilding(g, cols, style, 'building.postOffice', salt(p.seed, 1), 16, 11, 0, -6.6, 0);

  const cross = createAsset('prop.crosswalk', { variant: 'Zebra', length: 5.6 }, style);
  put(g, cols, cross, 8.5, 10.4, 0);

  put(g, cols, createAsset('prop.busStop', { variant: 'Shelter' }, style), -12.2, 5.4, 0);
  put(g, cols, createAsset('prop.vendingMachine', { variant: pick(rng, ['Blue', 'White']) }, style), -12.4, 3.2, Math.PI);
  put(g, cols, createAsset('prop.trafficLight', { variant: 'Car signal' }, style), 9.5, 7.15, Math.PI);
  put(g, cols, createAsset('prop.streetLamp', { variant: 'Double' }, style), -8, 6.6, 0);
  put(g, cols, createAsset('prop.streetLamp', { variant: 'Single' }, style), 12.5, 6.4, 0);

  const taxis = band(p.Density, 1, 2, 3);
  spread(taxis, 5 + taxis * 2.4).forEach((x) => {
    put(g, cols, createAsset('vehicle.car', { variant: 'Taxi', color: 'Navy' }, style), 5.2 + x, 8.7, Math.PI / 2);
  });
  put(g, cols, createAsset('vehicle.bus', { variant: 'City bus' }, style), -5.4, 12.05, Math.PI / 2);
  if (p.Density === 'Busy') {
    put(g, cols, createAsset('vehicle.car', { variant: 'Kei car', color: pick(rng, ['White', 'Gray', 'Blue']) }, style), 12.2, 11.6, -Math.PI / 2);
  }

  const benches = band(p.Density, 2, 3, 4);
  spread(benches, 16).forEach((x, i) => {
    put(g, cols, createAsset('prop.bench', { variant: i % 2 ? 'Backless' : 'Park bench' }, style), x, 1.6 + (i % 2) * 2.2, 0);
  });

  if (p.People !== 'Off') {
    const n = band(p.Density, 3, 5, 8);
    spread(n, 18).forEach((x, i) => {
      const waiting = people() < 0.55;
      addPerson(
        g, cols, style, people,
        x + (people() - 0.5) * 0.4,
        0.2 + people() * 4.2,
        waiting ? 0 : (people() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        !waiting,
        ['human.salaryman', 'human.woman', 'human.man', 'human.grandma', 'human.schoolgirl', 'human.grandpa'],
      );
    });
  }
  if (p.Cats !== 'Off') addCat(g, cols, style, cats, -10.5, 4.6, cats() * 6);
  return finish();
}

function shrineCorner(p, style) {
  const { g, cols, finish } = stage('area.shrine');
  const rng = stream(p.seed, 31);
  const people = stream(p.seed, 32);
  const cats = stream(p.seed, 33);
  const W = 34;
  const D = 28;
  slab(g, style, W, 0.04, D, 'grass', null, 0, 0.015, 0);
  // A stone path out of the shrine precinct into the park.
  slab(g, style, 2.2, 0.03, 12, 'concrete', paletteHex('Stone'), -7.2, 0.04, 6.2);
  slab(g, style, 14, 0.03, 2.2, 'concrete', paletteHex('Stone'), 0.5, 0.045, 8.6);

  addBuilding(g, cols, style, 'building.shrine', salt(p.seed, 1), 15, 16, -7.4, -4.2, 0);

  const play = new THREE.Group();
  buildPlayground(play, style);
  play.position.set(8.2, 0, 1.2);
  g.add(play);
  // The same sandbox the park puts beside the slide, in playground-local space.
  play.add(box(2.6, 0.22, 2.4, style.material('wood'), [-2.4, 0.11, 2.8]));
  play.add(box(2.3, 0.16, 2.1, style.material('sidewalk', paletteHex('Sand')), [-2.4, 0.2, 2.8]));

  const grove = band(p.Density, 4, 6, 8);
  const kinds = ['Zelkova', 'Pine', 'Black pine', 'Cherry blossom', 'Japanese maple', 'Old giant', 'Ginkgo'];
  const spots = [[12.5, -10], [4, -10.5], [14.2, -4], [-14.5, 8], [14.5, 8.5], [-1, -11], [6, 10.5], [-14, -10]];
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

  if (p.People !== 'Off') {
    const n = band(p.Density, 1, 3, 5);
    [[-1.5, 7.2], [6.8, 5.2], [2.4, 9.8], [12.4, 4.8], [-4.2, 9.2]].slice(0, n).forEach(([x, z], i) => {
      const walking = people() < 0.4;
      addPerson(g, cols, style, people, x, z, walking ? Math.PI / 2 : people() * 6, walking, i === 0 ? KIDS : CROWD);
    });
  }
  if (p.Cats !== 'Off') {
    const n = band(p.Density, 1, 1, 2);
    [[13.6, -8.2], [0.4, 11]].slice(0, n).forEach(([x, z]) => addCat(g, cols, style, cats, x, z, cats() * 6));
  }
  return finish();
}

function oldSquare(p, style) {
  const { g, cols, finish } = stage('area.square');
  const rng = stream(p.seed, 41);
  const people = stream(p.seed, 42);
  const cats = stream(p.seed, 43);
  const W = 38;
  const D = 38;
  slab(g, style, W, 0.04, D, 'concrete', paletteHex('Stone'), 0, 0.015, 0);
  const pave = createAsset('ground.paving', { w: 12, d: 12, color: paletteHex('Light gray') }, style);
  pave.position.y = 0.02;
  g.add(pave);
  kerb(g, style, 0, 6.15, 12.4, true);
  kerb(g, style, 0, -6.15, 12.4, true);
  kerb(g, style, 6.15, 0, 12.4, false);
  kerb(g, style, -6.15, 0, 12.4, false);

  const lotD = 9;
  const zRow = 6.4 + lotD / 2;
  const pair = 6.6;
  addBuilding(g, cols, style, 'building.tudorCottage', salt(p.seed, 1), 8.6, lotD, -pair, -zRow, 0);
  addBuilding(g, cols, style, 'building.frenchCountryHouse', salt(p.seed, 2), 8.6, lotD, pair, -zRow, 0);
  addBuilding(g, cols, style, 'building.scandinavianHouse', salt(p.seed, 3), 8.6, lotD, -pair, zRow, Math.PI);
  addBuilding(g, cols, style, 'building.mediterraneanVilla', salt(p.seed, 4), 9.2, lotD, pair, zRow, Math.PI);
  addBuilding(g, cols, style, 'building.dutchCanalHouse', salt(p.seed, 5), 7, 8.5, 8 + 4.25, 0, -Math.PI / 2);
  addBuilding(g, cols, style, 'building.stoneChapel', salt(p.seed, 6), 8.2, 11, -(8 + 5.5), 0, Math.PI / 2);

  const trees = band(p.Density, 2, 4, 6);
  [[-3.6, -3.6, 'Oak'], [3.6, 3.6, 'Lollipop'], [-3.6, 3.6, 'Camphor'], [3.6, -3.6, 'Oak'], [0, -3.8, 'Lollipop'], [0, 3.8, 'Camphor']]
    .slice(0, trees)
    .forEach(([x, z, variant], i) => addTree(g, cols, style, rng, variant, x, z, salt(p.seed, 70 + i)));

  const benches = band(p.Density, 2, 4, 4);
  [[-4.2, 0, Math.PI / 2], [4.2, 0, -Math.PI / 2], [0, -4.2, 0], [0, 4.2, Math.PI]].slice(0, benches).forEach(([x, z, rot]) => {
    put(g, cols, createAsset('prop.bench', { variant: 'Park bench' }, style), x, z, rot);
  });
  put(g, cols, createAsset('nature.flowerBed', { variant: 'Mixed', seed: salt(p.seed, 12) }, style), -5.2, -5.2, 0);
  if (p.Density !== 'Sparse') {
    put(g, cols, createAsset('prop.planter', { variant: 'Planter box' }, style), 5.2, 5.2, 0);
    put(g, cols, createAsset('prop.streetLamp', { variant: 'Single' }, style), -5.4, 5.4, 0);
  }

  const pigeons = band(p.Density, 3, 5, 7);
  spread(pigeons, 8).forEach((x, i) => {
    put(g, cols, createAsset('animal.bird', { variant: 'Pigeon', seed: salt(p.seed, 150 + i) }, style), x, (i % 2 ? 1 : -1) * (1.2 + (i % 3)), rng() * 6);
  });

  if (p.People !== 'Off') {
    const n = band(p.Density, 2, 4, 6);
    spread(n, 8).forEach((x, i) => {
      const walking = people() < 0.5;
      addPerson(g, cols, style, people, x, (i % 2 ? 2.2 : -2.2), walking ? (i % 2 ? 0 : Math.PI) : people() * 6, walking, ADULTS);
    });
  }
  if (p.Cats !== 'Off') addCat(g, cols, style, cats, 4.6, -1.4, cats() * 6);
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
  const W = 26;
  const D = 20;
  slab(g, style, W, 0.04, D, 'concrete', paletteHex('Gray'), 0, 0.015, 0);
  slab(g, style, W - 1, 0.02, 2.4, 'road', null, 0, 0.04, 0);

  const perSide = band(p.Density, 2, 3, 3);
  const span = W - 2.4;
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
    put(g, cols, createAsset('prop.manhole', {
      variant: ['Flower', 'Wave', 'Grid'][i % 3],
      seed: salt(p.seed, 120 + i),
    }, style), x, i % 2 ? 0.35 : -0.25, 0);
  });

  put(g, cols, createAsset('prop.trashBin', { variant: 'Round bin' }, style), -span / 2 + 0.2, -1.15, 0);
  put(g, cols, createAsset('prop.trashBin', { variant: 'Recycling station' }, style), span / 2 - 0.4, 1.2, Math.PI);
  // Cardboard boxes on the delivery scooter stand in for crates.
  put(g, cols, createAsset('vehicle.scooter', { variant: 'Delivery' }, style), 1.6, -0.15, Math.PI / 2);
  if (p.Density !== 'Sparse') {
    put(g, cols, createAsset('vehicle.bicycle', { color: 'Gray' }, style), -3.2, 1.45, Math.PI / 2);
    put(g, cols, createAsset('prop.utilityPole', { variant: 'Plain' }, style), W / 2 - 0.8, 0.2, 0);
  }

  if (p.People !== 'Off') {
    const n = band(p.Density, 1, 2, 3);
    spread(n, span * 0.6).forEach((x, i) => {
      addPerson(g, cols, style, people, x, i % 2 ? 0.55 : -0.45, i % 2 ? Math.PI / 2 : -Math.PI / 2, people() < 0.5, ADULTS);
    });
  }
  if (p.Cats !== 'Off') {
    const n = band(p.Density, 2, 3, 5);
    const spots = [[-6, 1.05], [-2.2, -1.15], [2.4, 1.2], [5.5, -1.05], [0.2, 1.35], [-8, -0.9]];
    spots.slice(0, n).forEach(([x, z]) => addCat(g, cols, style, cats, x, z, cats() * 6));
  }
  return finish();
}

const OPTIONS = {
  Density: ['Sparse', 'Normal', 'Busy'],
  People: ['On', 'Off'],
  Cats: ['On', 'Off'],
};

function area({ id, label, size, viewDir, people, cats, build }) {
  return {
    id,
    label,
    category: 'area',
    group: 'areas',
    fillFrame: true,
    viewDir,
    options: OPTIONS,
    params: { seed: 1, Density: 'Normal', People: people, Cats: cats },
    size,
    build,
  };
}

export const AREA_DIORAMAS = [
  area({
    id: 'area.shotengai',
    label: 'Shotengai',
    size: [30, 22],
    viewDir: [1, 0.7, 0.34],
    people: 'On',
    cats: 'Off',
    build: shotengai,
  }),
  area({
    id: 'area.lane',
    label: 'Residential lane',
    size: [30, 28],
    viewDir: [1, 0.58, 0.22],
    people: 'On',
    cats: 'On',
    build: lane,
  }),
  area({
    id: 'area.station',
    label: 'Station plaza',
    size: [32, 28],
    viewDir: [0.7, 0.48, 1],
    people: 'On',
    cats: 'Off',
    build: station,
  }),
  area({
    id: 'area.shrine',
    label: 'Shrine corner',
    size: [34, 28],
    viewDir: [0.82, 0.7, 1],
    people: 'On',
    cats: 'Off',
    build: shrineCorner,
  }),
  area({
    id: 'area.square',
    label: 'Old-town square',
    size: [38, 38],
    viewDir: [0.62, 1.55, 0.62],
    people: 'On',
    cats: 'Off',
    build: oldSquare,
  }),
  area({
    id: 'area.alley',
    label: 'Back alley',
    size: [26, 20],
    viewDir: [1, 0.72, 0.08],
    people: 'Off',
    cats: 'On',
    build: alley,
  }),
];
