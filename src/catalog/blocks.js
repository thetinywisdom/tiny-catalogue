import * as THREE from 'three';
import { paletteHex } from '../styles/palette.js';
import { AREA_DIORAMAS, BLOCK_SIZE, INTERIOR_TOP, layBlock, placeAreaCrowd } from './areas.js';
import { CATALOG, createAsset } from './index.js';

// A saved block is the same kind of thing as a built-in area: a 32 m group
// centred on the origin, with userData.block describing the footprint and
// edges. The JSON is the editable form. buildUserBlock is the loader.

export const BLOCK_GROUNDS = [
  ['asphalt', 'Asphalt'],
  ['paving', 'Paving'],
  ['grass', 'Grass'],
  ['gravel', 'Gravel'],
];

const GROUND_MAT = {
  asphalt: ['road', null],
  paving: ['sidewalk', () => paletteHex('Sand')],
  grass: ['grass', null],
  gravel: ['concrete', () => paletteHex('Gray')],
};

const PRESET_GROUND = {
  'area.shotengai': 'paving',
  'area.lane': 'grass',
  'area.station': 'paving',
  'area.shrine': 'grass',
  'area.square': 'paving',
  'area.alley': 'gravel',
};

export const BLOCK_PRESETS = AREA_DIORAMAS.map((a) => ({ id: a.id, label: a.label }));

const SNAP = 0.5;
const HALF = BLOCK_SIZE / 2;

export function snapBlock(n) {
  const s = Math.round(n / SNAP) * SNAP;
  return Math.max(-HALF, Math.min(HALF, s));
}

function edgeOf(v) {
  return v === 'street' ? 'street' : 'sidewalk';
}

function groundOf(v) {
  return GROUND_MAT[v] ? v : 'paving';
}

/** A plain object the maker can edit and JSON can store. */
export function normalizeBlock(data = {}) {
  const edges = data.edges ?? {};
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    version: 1,
    name: String(data.name || 'Block').slice(0, 40),
    seed: Math.trunc(Number(data.seed) || 1),
    ground: groundOf(data.ground),
    edges: {
      n: edgeOf(edges.n),
      e: edgeOf(edges.e),
      s: edgeOf(edges.s),
      w: edgeOf(edges.w),
    },
    people: Math.max(0, Math.min(16, Math.trunc(Number(data.people) || 0))),
    cats: Math.max(0, Math.min(8, Math.trunc(Number(data.cats) || 0))),
    items: items.flatMap((item) => {
      if (!item || !CATALOG[item.id]) return [];
      const asset = CATALOG[item.id];
      if (!['building', 'prop', 'vehicle', 'nature'].includes(asset.category)) return [];
      return [{
        id: item.id,
        x: snapBlock(Number(item.x) || 0),
        z: snapBlock(Number(item.z) || 0),
        rot: Number(item.rot) || 0,
        params: item.params && typeof item.params === 'object' ? { ...item.params } : {},
      }];
    }),
  };
}

export function emptyBlock() {
  return normalizeBlock({
    name: 'New block',
    seed: 1,
    ground: 'paving',
    edges: { n: 'sidewalk', e: 'street', s: 'sidewalk', w: 'street' },
    people: 0,
    cats: 0,
    items: [],
  });
}

function interiorRect(edges) {
  const w = (key) => (edges[key] === 'street' ? 3 : 1.5);
  return {
    x0: -HALF + w('w'),
    x1: HALF - w('e'),
    z0: -HALF + w('s'),
    z1: HALF - w('n'),
  };
}

function put(g, cols, obj, x, z, rotY, index) {
  obj.position.set(x, obj.position.y, z);
  obj.rotation.y = rotY;
  obj.userData.blockItem = index;
  g.add(obj);
  const boxes = obj.userData.colliders;
  if (!boxes) return;
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
}

/**
 * Build a saved block. Same contract as createAreaBlock: a group on the
 * origin, standing on y = 0, with userData.block.
 */
export function buildUserBlock(data, style) {
  const block = normalizeBlock(data);
  const g = new THREE.Group();
  g.name = 'block.custom';
  const cols = [];
  const [role, colorOf] = GROUND_MAT[block.ground];
  layBlock(g, style, block.edges, role, colorOf ? colorOf() : null);
  block.items.forEach((item, i) => {
    const obj = createAsset(item.id, item.params, style);
    put(g, cols, obj, item.x, item.z, item.rot, i);
  });
  if (block.people || block.cats) {
    placeAreaCrowd(g, cols, style, block.seed, {
      rects: [interiorRect(block.edges)],
      people: block.people,
      cats: block.cats,
      axis: 'x',
    });
  }
  g.userData.colliders = cols;
  g.userData.block = {
    id: block.name,
    footprint: [BLOCK_SIZE, BLOCK_SIZE],
    edges: { ...block.edges },
    ground: block.ground,
    custom: true,
  };
  return g;
}

/** Fill items, edges and ground from one of the six area generators. */
export function blockFromPreset(areaId, seed, style) {
  const group = createAsset(areaId, {
    seed,
    Density: 'Normal',
    People: 'On',
    Cats: 'On',
  }, style);
  let people = 0;
  let cats = 0;
  const items = [];
  const pos = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const id = o.userData?.asset;
    if (!id) return;
    if (id.startsWith('human.')) { people += 1; return; }
    if (id === 'animal.cat') { cats += 1; return; }
    const asset = CATALOG[id];
    if (!asset || !['building', 'prop', 'vehicle', 'nature'].includes(asset.category)) return;
    o.getWorldPosition(pos);
    group.worldToLocal(pos);
    items.push({
      id,
      x: snapBlock(pos.x),
      z: snapBlock(pos.z),
      rot: o.rotation.y,
      params: { ...(o.userData.params ?? {}) },
    });
  });
  const preset = AREA_DIORAMAS.find((a) => a.id === areaId);
  return normalizeBlock({
    name: preset?.label ?? 'Block',
    seed,
    ground: PRESET_GROUND[areaId] ?? 'paving',
    edges: group.userData.block?.edges ?? preset?.edges,
    people: Math.min(16, people),
    cats: Math.min(8, cats),
    items,
  });
}
