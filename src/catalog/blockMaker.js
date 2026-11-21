import * as THREE from 'three';
import { Cell } from '../viewer/Cell.js';
import { ASSETS, CATALOG } from './index.js';
import { BLOCK_SIZE, INTERIOR_TOP } from './areas.js';
import {
  BLOCK_GROUNDS,
  BLOCK_PRESETS,
  buildUserBlock,
  blockFromPreset,
  emptyBlock,
  normalizeBlock,
  snapBlock,
} from './blocks.js';

// The block maker is one catalogue tab. It edits a 32 m block in the same
// item panel and the same PS1 view as everything else. Saved blocks live in
// localStorage and round-trip through the JSON buildUserBlock reads.

const STORE = 'tinycity.blocks';
const PLACEABLE_GROUPS = [
  ['buildings', 'Buildings'],
  ['street', 'Street'],
  ['traffic', 'Traffic'],
  ['extras', 'Extras'],
  ['nature', 'Nature'],
  ['vehicles', 'Vehicles'],
];

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -INTERIOR_TOP);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; }
}
function writeStore(list) {
  localStorage.setItem(STORE, JSON.stringify(list));
}

function placeable() {
  return ASSETS.filter((a) => PLACEABLE_GROUPS.some(([id]) => a.group === id));
}

export function createBlockMaker({ canvas, camera, style, renderer, lighting, itemEl, toast, onFrame, onClose }) {
  let draft = emptyBlock();
  let selected = -1;
  let tool = 'select';
  let dropId = placeable()[0]?.id ?? 'prop.bench';
  let presetId = BLOCK_PRESETS[0].id;
  let cell = null;
  let open = false;
  let pointer = null;

  const subject = {
    id: 'block',
    build(_p, st) { return buildUserBlock(draft, st); },
  };

  function ensureCell() {
    if (cell) return cell;
    cell = new Cell({
      entries: [{ subject, tight: true }],
      style,
      renderer,
      viewDir: [0.85, 0.92, 0.55],
    });
    return cell;
  }

  function rebuild({ frame = false, panel = true } = {}) {
    const view = ensureCell();
    view.rebuild({});
    view.applyLighting(lighting);
    if (selected >= draft.items.length) selected = -1;
    if (selected >= 0) markSelection(view);
    if (frame) onFrame?.(view);
    if (panel) paint();
  }

  function markSelection(view) {
    view.content.traverse((o) => {
      if (o.userData.blockItem !== selected) return;
      const helper = new THREE.BoxHelper(o, 0xf2b64a);
      helper.userData.outline = true;
      o.parent.add(helper);
    });
  }

  function paint() {
    const saved = readStore();
    const item = draft.items[selected];
    const asset = item ? CATALOG[item.id] : null;
    const degrees = item ? Math.round(THREE.MathUtils.radToDeg(item.rot)) : 0;
    itemEl.innerHTML = `
      <div class="it-head"><button type="button" data-act="back">← Catalogue</button><b>Block maker</b></div>
      <div class="it-body">
        <h3>Name</h3>
        <input type="text" data-field="name" value="${esc(draft.name)}" maxlength="40" aria-label="Block name">
        <h3>Ground</h3>
        <div class="chips">${BLOCK_GROUNDS.map(([id, label]) => chip('ground', id, label, draft.ground === id)).join('')}</div>
        <h3>Edges</h3>
        ${['n', 'e', 's', 'w'].map((side) => `
          <p class="it-note">${side.toUpperCase()}</p>
          <div class="chips">
            ${chip(`edge-${side}`, 'street', 'Street', draft.edges[side] === 'street')}
            ${chip(`edge-${side}`, 'sidewalk', 'Sidewalk', draft.edges[side] === 'sidewalk')}
          </div>`).join('')}
        <h3>Fill from an area</h3>
        <div class="seed-row">
          <select data-field="preset" aria-label="Area style">${BLOCK_PRESETS.map((p) => `<option value="${p.id}"${p.id === presetId ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
          <input data-field="seed" type="number" value="${draft.seed}" aria-label="Seed">
          <button type="button" data-act="dice">🎲</button>
        </div>
        <p class="it-note">🎲 rebuilds the block from that area and this seed. Then edit it.</p>
        <h3>People and cats</h3>
        ${slider('People', 'people', draft.people, 0, 16, 1)}
        ${slider('Cats', 'cats', draft.cats, 0, 8, 1)}
        <h3>Drop</h3>
        <select data-field="drop" aria-label="Thing to drop">${PLACEABLE_GROUPS.map(([id, label]) => {
          const list = placeable().filter((a) => a.group === id);
          if (!list.length) return '';
          return `<optgroup label="${label}">${list.map((a) => `<option value="${a.id}"${a.id === dropId ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</optgroup>`;
        }).join('')}</select>
        <div class="chips"><button type="button" data-act="arm" class="${tool === 'place' ? 'on' : ''}">Drop on click</button></div>
        <h3>Selected</h3>
        <p class="it-note">${asset ? `${esc(asset.label)} · ${item.x.toFixed(1)}, ${item.z.toFixed(1)}` : 'Click a thing on the block.'}</p>
        <div class="chips">
          <button type="button" data-act="move" class="${tool === 'move' ? 'on' : ''}" ${item ? '' : 'disabled'}>Move</button>
          <button type="button" data-act="rot" ${item ? '' : 'disabled'}>Rotate 90°</button>
          <button type="button" data-act="del" ${item ? '' : 'disabled'}>Delete</button>
        </div>
        ${item ? `<div class="slider"><span>Free rotate</span><input data-field="rot" type="range" min="0" max="360" step="1" value="${degrees}" aria-label="Free rotate"><output>${degrees}</output></div>` : ''}
        <h3>Saved on this browser</h3>
        <div class="chips">${saved.length ? saved.map((b, i) => `<button type="button" data-act="load" data-i="${i}">${esc(b.name || 'Block')}</button>`).join('') : '<p class="it-note">None yet.</p>'}</div>
        <div class="chips">
          <button type="button" data-act="save">Save</button>
          <button type="button" data-act="export">Export JSON</button>
          <button type="button" data-act="import">Import JSON</button>
        </div>
        <input data-field="file" type="file" accept="application/json,.json" hidden>
        <p class="it-note">${BLOCK_SIZE} × ${BLOCK_SIZE} m. Clicks snap to 0.5 m. People and cats use the area crowd.</p>
      </div>`;
    itemEl.onclick = onClick;
    itemEl.oninput = onInput;
    itemEl.onchange = onChange;
  }

  function onInput(e) {
    const t = e.target;
    if (t.dataset.field === 'name') { draft.name = t.value.slice(0, 40); return; }
    if (t.dataset.field === 'rot') {
      const item = draft.items[selected];
      if (!item) return;
      item.rot = THREE.MathUtils.degToRad(Number(t.value));
      t.parentElement.querySelector('output').textContent = String(Math.round(Number(t.value)));
      rebuild({ panel: false });
    }
    if (t.dataset.act === 'slider') {
      const key = t.dataset.k;
      draft[key] = Number(t.value);
      t.parentElement.querySelector('output').textContent = t.value;
      rebuild({ panel: false });
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.field === 'seed') {
      draft.seed = Math.trunc(Number(t.value) || 1);
      return;
    }
    if (t.dataset.field === 'preset') { presetId = t.value; return; }
    if (t.dataset.field === 'drop') { dropId = t.value; return; }
    if (t.dataset.field === 'file' && t.files?.[0]) importFile(t.files[0]);
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'back') { open = false; onClose?.(); return; }
    if (act === 'ground') { draft.ground = b.dataset.v; return rebuild(); }
    if (act?.startsWith('edge-')) {
      draft.edges[act.slice(5)] = b.dataset.v;
      return rebuild();
    }
    if (act === 'dice') {
      const seedEl = itemEl.querySelector('[data-field="seed"]');
      if (seedEl) draft.seed = Math.trunc(Number(seedEl.value) || 1);
      draft = blockFromPreset(presetId, draft.seed, style);
      selected = -1;
      tool = 'select';
      toast(`Filled from ${CATALOG[presetId]?.label ?? 'area'}`);
      return rebuild({ frame: true });
    }
    if (act === 'arm') { tool = tool === 'place' ? 'select' : 'place'; return paint(); }
    if (act === 'move') { tool = 'move'; return paint(); }
    if (act === 'rot') return rotate90();
    if (act === 'del') return removeSelected();
    if (act === 'save') return save();
    if (act === 'export') return exportJson();
    if (act === 'import') { itemEl.querySelector('[data-field="file"]').click(); return; }
    if (act === 'load') {
      const list = readStore();
      const next = list[Number(b.dataset.i)];
      if (!next) return;
      draft = normalizeBlock(next);
      selected = -1;
      tool = 'select';
      return rebuild({ frame: true });
    }
  }

  function rotate90() {
    const item = draft.items[selected];
    if (!item) return;
    item.rot += Math.PI / 2;
    rebuild();
  }

  function removeSelected() {
    if (selected < 0) return;
    draft.items.splice(selected, 1);
    selected = -1;
    tool = 'select';
    rebuild();
  }

  function save() {
    const list = readStore();
    const copy = normalizeBlock(draft);
    const i = list.findIndex((b) => b.name === copy.name);
    if (i >= 0) list[i] = copy;
    else list.push(copy);
    writeStore(list);
    toast(`Saved “${copy.name}”`);
    paint();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(normalizeBlock(draft), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${draft.name.replace(/[^\w.-]+/g, '_') || 'block'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        draft = normalizeBlock(JSON.parse(String(reader.result)));
        selected = -1;
        tool = 'select';
        toast(`Imported “${draft.name}”`);
        rebuild({ frame: true });
      } catch (err) {
        toast('That file is not a block');
        console.warn(err);
      }
    };
    reader.readAsText(file);
  }

  function show() {
    open = true;
    tool = 'select';
    rebuild({ frame: true });
  }

  function pointerDown(ev) {
    if (!open || ev.button !== 0) return;
    pointer = { x: ev.clientX, y: ev.clientY };
  }

  function pointerUp(ev) {
    if (!open || !pointer) return;
    const moved = Math.hypot(ev.clientX - pointer.x, ev.clientY - pointer.y);
    pointer = null;
    if (moved > 6) return;
    if (ev.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    if (tool === 'place' || tool === 'move') {
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      if (Math.abs(hit.x) > BLOCK_SIZE / 2 || Math.abs(hit.z) > BLOCK_SIZE / 2) return;
      const x = snapBlock(hit.x);
      const z = snapBlock(hit.z);
      if (tool === 'place') {
        const asset = CATALOG[dropId];
        if (!asset) return;
        const params = 'seed' in (asset.params ?? {}) ? { seed: (draft.seed + draft.items.length * 17) >>> 0 || 1 } : {};
        draft.items.push({ id: dropId, x, z, rot: 0, params });
        selected = draft.items.length - 1;
        tool = 'select';
      } else if (selected >= 0) {
        draft.items[selected].x = x;
        draft.items[selected].z = z;
        tool = 'select';
      }
      rebuild();
      return;
    }
    const roots = [];
    cell.content.traverse((o) => { if (o.userData.blockItem != null) roots.push(o); });
    const hits = raycaster.intersectObjects(roots, true);
    if (!hits.length) { selected = -1; rebuild(); return; }
    let node = hits[0].object;
    while (node && node.userData.blockItem == null) node = node.parent;
    selected = node ? node.userData.blockItem : -1;
    rebuild();
  }

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointerup', pointerUp);

  return {
    show,
    close() { open = false; },
    get open() { return open; },
    get cell() { return cell; },
    rebuild: () => { if (open) rebuild(); },
    rotate90,
    removeSelected,
    draft: () => draft,
  };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function chip(key, value, label, on) {
  return `<button type="button" data-act="${key}" data-v="${value}" class="${on ? 'on' : ''}">${label}</button>`;
}
function slider(label, key, value, min, max, step) {
  return `<div class="slider"><span>${label}</span><input data-act="slider" data-k="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"><output>${value}</output></div>`;
}
