import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { lightingPresets, style } from './styles/index.js';
import { Cell } from './viewer/Cell.js';
import { createPs1Renderer } from './render/ps1.js';
import { ASSETS, CATALOG, createAsset } from './catalog/index.js';
import { BLOCK_SIZE, createAreaBlock } from './catalog/areas.js';
import { cancelThumbs, thumbInto } from './catalog/thumbs.js';
import { SHOP_TYPES } from './city/buildings.js';
import { human } from './subjects/human.js';
import { RUN_SPEED, WALK_SPEED, createGait, poseGait, setGaitEngine, stepGait, tuneOf } from './anim/gait.js';
import { CAT_RUN_SPEED, CAT_WALK_SPEED, createCatGait, poseCat, stepCatGait } from './anim/catGait.js';
import { tickProps } from './anim/props.js';
import { CLOTH_COLORS, HAIR_COLORS, PALETTE, PALETTES, SKIN_TONES, activePalette, choosePalette, swatchOf } from './styles/palette.js';
import './style.css';

// Tiny Catalogue: every placeable thing, and the people, in one list.
// Open an item, turn it, change its settings, copy the createAsset(...) line.

const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const ps1 = createPs1Renderer(renderer);
const PAGE_BG = new THREE.Color('#1d1f23');

const state = { view: 'catalog', itemAnim: 'Walk', lighting: 'Day' };

const hint = document.querySelector('#hint');
const toastEl = document.querySelector('#toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
let reframe = true;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
const TABS = [
  ['palette', '🎨 Palette'],
  ['all', 'All'],
  ['buildings', 'Buildings'],
  ['street', 'Street'],
  ['traffic', 'Traffic'],
  ['extras', 'Extras'],
  ['nature', 'Nature'],
  ['animals', 'Animals'],
  ['people', 'People'],
  ['vehicles', 'Vehicles'],
  ['areas', 'Areas'],
];
const catalogEl = document.querySelector('#catalog');
const itemEl = document.querySelector('#item');
const items = ASSETS.filter((a) => a.group);
let catTab = 'all';
let selected = null; // { id, params }
let itemCell = null;

const HUMAN_ANIMS = ['Still', 'Walk', 'Run'];
const CAT_ANIMS = ['Still', 'Walk', 'Run', 'Sit', 'Loaf', 'Sleep'];
const SWATCH = {
  skin: SKIN_TONES,
  hairColor: HAIR_COLORS,
  headwearColor: CLOTH_COLORS,
  accessoryColor: CLOTH_COLORS,
  maskColor: CLOTH_COLORS,
  backColor: CLOTH_COLORS,
  bodyAccessoryColor: CLOTH_COLORS,
  handItemColor: CLOTH_COLORS,
  topColor: CLOTH_COLORS,
  legwearColor: CLOTH_COLORS,
  outerwearColor: CLOTH_COLORS,
  shoeColor: CLOTH_COLORS,
};
const OPTION_LABELS = { pattern: 'Pattern', tailType: 'Tail', earType: 'Ears', coat: 'Coat' };

function renderCatalog() {
  const tabs = catalogEl.querySelector('.cat-tabs');
  tabs.replaceChildren(...TABS.map(([k, l]) => {
    const count = k === 'palette' ? '' : ` ${k === 'all' ? items.length : items.filter((a) => a.group === k).length}`;
    const b = Object.assign(document.createElement('button'), { textContent: k === 'palette' ? l : `${l}${count}` });
    b.classList.toggle('on', k === catTab);
    b.onclick = () => { catTab = k; renderCatalog(); };
    return b;
  }));
  const grid = catalogEl.querySelector('.cat-grid');
  if (catTab === 'palette') {
    grid.replaceChildren(...Object.entries(PALETTE).map(([name, hex]) => {
      const card = document.createElement('div');
      card.className = 'cat-card pal-card';
      const h = `#${hex.toString(16).padStart(6, '0')}`;
      card.append(Object.assign(document.createElement('i'), { style: `background:${h}` }), Object.assign(document.createElement('b'), { textContent: name }), Object.assign(document.createElement('code'), { textContent: h }));
      return card;
    }));
    return;
  }
  grid.replaceChildren(...items.filter((a) => catTab === 'all' || a.group === catTab).map((a) => {
    const card = document.createElement('button');
    card.className = 'cat-card';
    const img = document.createElement('img');
    img.alt = '';
    card.append(img, Object.assign(document.createElement('b'), { textContent: a.label }), Object.assign(document.createElement('code'), { textContent: a.id }));
    card.onclick = () => openItem(a.id);
    thumbInto(img, renderer, style, a.id, {});
    return card;
  }));
}

function openItem(id, p) {
  const a = CATALOG[id];
  selected = { id, params: { ...a.params, ...p } };
  if (a.animated === 'human' && !HUMAN_ANIMS.includes(state.itemAnim)) state.itemAnim = 'Walk';
  const subject = { id: 'item', label: a.label, schema: {}, isProp: true, build: (_q, st) => createAsset(id, selected.params, st) };
  itemCell = new Cell({ entries: [{ subject, tight: !!a.fillFrame }], style, renderer, viewDir: a.viewDir });
  itemCell.rebuild({});
  itemCell.applyLighting(lightingPresets[state.lighting]);
  reframe = true;
  renderItemPanel();
  setView('item');
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function assetCode() {
  const a = CATALOG[selected.id];
  const shown = a.resolve ? a.resolve(selected.params) : selected.params;
  return `createAsset('${a.id}', ${JSON.stringify(shown)}, style)`;
}

function chips(label, key, values, swatch = false, current, swatches) {
  if (!values || values.length < 2) return '';
  return `<h3>${esc(label)}</h3><div class="chips">${values.map((v) => {
    const on = (current ?? '') === (v ?? '');
    const hex = swatch ? (swatches?.[v] ?? CLOTH_COLORS[v] ?? 0x888888) : 0;
    const styleAttr = swatch ? ` title="${esc(v)}" style="background:#${hex.toString(16).padStart(6, '0')}"` : '';
    return `<button type="button" data-k="${esc(key)}" data-v="${esc(v ?? '')}" class="${on ? 'on' : ''}${swatch ? ' sw' : ''}"${styleAttr}>${swatch ? '' : esc(v ?? 'Any')}</button>`;
  }).join('')}</div>`;
}

function sliderRow(label, key, def, value) {
  const step = def.step ?? 0.01;
  const places = Math.max(0, (String(step).split('.')[1] || '').length);
  return `<div class="slider"><span>${esc(label)}</span><input data-act="slider" data-k="${esc(key)}" type="range" min="${def.min}" max="${def.max}" step="${step}" value="${value}" aria-label="${esc(label)}"><output>${Number(value).toFixed(places)}</output></div>`;
}

function humanControlsHtml(look) {
  const hidden = human.hiddenControls(look);
  const parts = [];
  let group = '';
  for (const [key, def] of Object.entries(human.schema)) {
    if (hidden.keys.has(key) || hidden.groups.has(def.group)) continue;
    if (def.group !== group) {
      group = def.group;
      parts.push(`<h3>${esc(group)}</h3>`);
    }
    const label = human.labelFor(key, look) ?? def.label;
    if (def.options) {
      const values = human.allowedOptions(key, look);
      const map = SWATCH[key];
      const buttons = values.map((v) => {
        const on = look[key] === v;
        if (map) {
          const hex = (map[v] ?? 0x888888).toString(16).padStart(6, '0');
          return `<button type="button" data-k="${esc(key)}" data-v="${esc(v)}" class="sw${on ? ' on' : ''}" title="${esc(v)}" style="background:#${hex}"></button>`;
        }
        return `<button type="button" data-k="${esc(key)}" data-v="${esc(v)}" class="${on ? 'on' : ''}">${esc(v)}</button>`;
      }).join('');
      parts.push(`<p class="it-note">${esc(label)}</p><div class="chips">${buttons}</div>`);
    } else {
      parts.push(sliderRow(label, key, def, look[key]));
    }
  }
  return parts.join('');
}

function renderItemPanel() {
  const a = CATALOG[selected.id];
  const p = selected.params;
  const look = a.kind === 'human' ? a.resolve(p) : null;
  const code = assetCode();
  const shopTypes = 'shopType' in (a.params ?? {}) ? [null, ...SHOP_TYPES] : null;
  const anims = a.animated === 'human' ? HUMAN_ANIMS : a.animated === 'cat' ? CAT_ANIMS : null;
  const animNow = a.animated === 'human' && !HUMAN_ANIMS.includes(state.itemAnim) ? 'Walk' : state.itemAnim;
  itemEl.innerHTML = `
    <div class="it-head"><button type="button" data-act="back">← Catalogue</button><b>${esc(a.label)}</b></div>
    <div class="it-body">
      <p class="it-id"><code>${esc(a.id)}</code> · ${esc(a.category)} · about ${a.size[0]} × ${a.size[1]} m</p>
      ${a.kind === 'human' ? humanControlsHtml(look) : `
        ${chips('Type', 'variant', a.variants, false, p.variant)}
        ${chips('Colour', 'color', a.colors, true, p.color, a.swatches)}
        ${chips('Shop', 'shopType', shopTypes, false, p.shopType)}
        ${Object.entries(a.options ?? {}).map(([k, vals]) => chips(OPTION_LABELS[k] ?? k, k, vals, false, p[k])).join('')}
      `}
      ${anims ? `<h3>Animation</h3><div class="chips">${anims.map((m) => `<button type="button" data-anim="${m}" class="${animNow === m ? 'on' : ''}">${m}</button>`).join('')}</div>` : ''}
      ${a.kind === 'human'
        ? `<h3>Look</h3><div class="chips"><button type="button" data-act="seed">🎲 New look</button></div><p class="it-note">Seed ${look.seed}. This tile's body type stays. The same seed rebuilds the same person. A setting you change stays until the next New look.</p>`
        : ('seed' in (a.params ?? {}) ? '<h3>Look</h3><div class="chips"><button type="button" data-act="seed">🎲 New look</button></div>' : '')}
      <h3>Use it in a game</h3>
      <pre></pre>
      <button type="button" data-act="copy">Copy</button>
    </div>`;
  itemEl.querySelector('pre').textContent = code;
  itemEl.oninput = (e) => {
    const r = e.target;
    if (r.dataset.act !== 'slider') return;
    const key = r.dataset.k;
    const value = Number(r.value);
    selected.params = { ...selected.params, [key]: value };
    const places = Math.max(0, (String(r.step).split('.')[1] || '').length);
    r.parentElement.querySelector('output').textContent = value.toFixed(places);
    itemEl.querySelector('pre').textContent = assetCode();
    itemCell.rebuild({});
  };
  itemEl.onchange = (e) => {
    if (e.target.dataset.act === 'slider') reframe = true;
  };
  itemEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'back') return setView('catalog');
    if (b.dataset.anim) { state.itemAnim = b.dataset.anim; return renderItemPanel(); }
    if (b.dataset.act === 'copy') {
      const text = itemEl.querySelector('pre').textContent;
      return navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast(text));
    }
    if (b.dataset.act === 'seed') {
      const next = 1 + Math.floor(Math.random() * 1e9);
      if (a.kind === 'human') selected.params = { seed: next };
      else selected.params.seed = next;
      return openItem(selected.id, selected.params);
    }
    if (b.dataset.k) {
      const key = b.dataset.k;
      const value = b.dataset.v === '' ? null : b.dataset.v;
      if (a.kind === 'human' && key === 'bodyType') {
        const next = a.resolve(selected.params);
        const prev = next.bodyType;
        next.bodyType = value;
        human.adjust(next, 'bodyType', prev);
        human.applyRules(next);
        selected.params = { ...next };
      } else {
        selected.params = { ...selected.params, [key]: value };
      }
      openItem(selected.id, selected.params);
    }
  };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function setView(view) {
  state.view = view;
  catalogEl.hidden = view !== 'catalog';
  itemEl.hidden = view !== 'item';
  controls.enabled = view === 'item';
  if (view === 'catalog') { hint.textContent = 'Tap an item to turn it around and see its settings'; renderCatalog(); }
  if (view === 'item') { hint.textContent = 'Drag to turn · scroll or pinch to zoom'; reframe = true; }
}
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.view === 'item') setView('catalog'); });

// PS1 look (default on). Off draws full resolution, detail 1, no dither,
// outlines or vertex snap. Remembered in this browser. Palette colours stay.
const PS1_KEY = 'tinycity.ps1';
function savedPs1() {
  try { return localStorage.getItem(PS1_KEY) !== '0'; } catch { return true; }
}
const ps1Btn = document.querySelector('#ps1Btn');
function paintPs1(on) {
  ps1Btn.classList.toggle('on', on);
  ps1Btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  ps1Btn.title = on ? 'PS1 look is on. Click for a smooth render.' : 'Smooth render. Click for the PS1 look.';
  document.body.dataset.look = on ? 'ps1' : 'clean';
}
function applyPs1(on, { rebuild = true } = {}) {
  style.setPs1(on);
  try { localStorage.setItem(PS1_KEY, on ? '1' : '0'); } catch { /* private mode */ }
  paintPs1(on);
  if (!rebuild) return;
  if (itemCell && selected) {
    itemCell.rebuild({});
    reframe = true;
  }
  cancelThumbs();
  if (state.view === 'catalog' || catalogEl.querySelector('.cat-card')) renderCatalog();
}
ps1Btn.onclick = () => applyPs1(!style.ps1);
applyPs1(savedPs1(), { rebuild: false });

const paletteBtn = document.querySelector('#paletteBtn'), palettePanel = document.querySelector('#palettePanel');
const STRIP = ['Sky', 'Sage', 'Moss', 'Butter', 'Apricot', 'Dusty rose', 'Powder blue', 'Lilac', 'Brick', 'Tan', 'Paper', 'Charcoal'];
paletteBtn.innerHTML = `🎨<span> ${activePalette()}</span>`;
palettePanel.innerHTML = `<h3>Colour palette</h3>${Object.entries(PALETTES).map(([name, p]) => `
  <button type="button" data-palette="${name}" class="${name === activePalette() ? 'on' : ''}">
    <b>${name}</b><small>${p.label}</small>
    <span class="strip">${STRIP.map((n) => `<i style="background:#${swatchOf(name, n).toString(16).padStart(6, '0')}"></i>`).join('')}</span>
  </button>`).join('')}`;
paletteBtn.onclick = () => { palettePanel.hidden = !palettePanel.hidden; };
palettePanel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-palette]');
  if (!b) return;
  if (b.dataset.palette === activePalette()) { palettePanel.hidden = true; return; }
  choosePalette(b.dataset.palette);
  try {
    sessionStorage.setItem('tinycity.back', JSON.stringify({
      catTab,
      item: selected && state.view === 'item' ? { id: selected.id, params: selected.params } : null,
    }));
  } catch { /* fine */ }
  location.reload();
});

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const timer = new THREE.Timer();
const gait = createGait();
const catGait = createCatGait();
let propTime = 0;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
  if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) renderer.setSize(w, h, false);
}
function preview(cell, r, H) {
  camera.aspect = r.w / r.h;
  if (reframe) {
    cell.setAngle(0);
    cell.frame(r.w / r.h, camera, { minHeight: 0 });
    controls.target.copy(cell.viewCenter);
    reframe = false;
  }
  camera.updateProjectionMatrix();
  controls.update();
  ps1.render(cell, camera, r.x, H - r.y - r.h, r.w, r.h);
}
function panelRect(panel, W, H) {
  const r = panel.getBoundingClientRect();
  if (panel.hidden || !r.width) return { x: 0, y: 0, w: W, h: H };
  return r.left > W * 0.3 ? { x: 0, y: 0, w: r.left, h: H } : { x: 0, y: 0, w: W, h: Math.max(80, r.top) };
}
function loop(time) {
  timer.update(time);
  resize();
  const dt = Math.min(timer.getDelta(), 0.1);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  renderer.setScissorTest(false);
  renderer.setClearColor(PAGE_BG);
  renderer.clear();
  if (state.view === 'item' && itemCell) {
    propTime += dt;
    tickProps(itemCell.scene, propTime);
    const asset = CATALOG[selected.id];
    if (asset.animated === 'cat') {
      catGait.pose = { Sit: 'sit', Loaf: 'loaf', Sleep: 'sleep' }[state.itemAnim] ?? null;
      stepCatGait(catGait, dt, { Walk: CAT_WALK_SPEED, Run: CAT_RUN_SPEED }[state.itemAnim] ?? 0);
      itemCell.scene.traverse((o) => { if (o.name === 'cat') poseCat(o, catGait); });
    }
    if (asset.animated === 'human') {
      const look = asset.resolve(selected.params);
      setGaitEngine(look.animation);
      const tune = tuneOf(look);
      const mode = HUMAN_ANIMS.includes(state.itemAnim) ? state.itemAnim : 'Walk';
      stepGait(gait, dt, mode === 'Run' ? RUN_SPEED : mode === 'Walk' ? WALK_SPEED : 0, tune);
      itemCell.scene.traverse((o) => { if (o.name === 'human') poseGait(o, gait, 'natural', tune); });
    }
    preview(itemCell, panelRect(itemEl, W, H), H);
  }
  requestAnimationFrame(loop);
}

let back = null;
try { back = JSON.parse(sessionStorage.getItem('tinycity.back') ?? 'null'); sessionStorage.removeItem('tinycity.back'); } catch { /* fine */ }
if (back?.catTab) catTab = back.catTab;
setView('catalog');
if (back?.item?.id && CATALOG[back.item.id]) openItem(back.item.id, back.item.params);
requestAnimationFrame(loop);

Object.assign(window, {
  __cc: {
    state, setView, openItem, CATALOG, ASSETS, human, createAsset, gait, tuneOf, style,
    /** Turn the PS1 look on or off without reloading. */
    setPs1: (on) => applyPs1(on),
    get ps1() { return style.ps1; },
    resolve: (id, params) => CATALOG[id]?.resolve?.(params ?? {}),
    /** Orbit the preview camera by `az` radians. */
    orbit: (az) => { const t = controls.target; camera.position.sub(t).applyAxisAngle(new THREE.Vector3(0, 1, 0), az).add(t); controls.update(); },
    get itemCell() { return itemCell; },
    BLOCK_SIZE, createAreaBlock,
    /**
     * Lay area blocks on the grid and frame them. `layout` is
     * [{ id, x, z, params }]. Used to check that blocks tile.
     */
    previewBlocks(layout) {
      openItem(layout[0].id, layout[0].params);
      const holder = new THREE.Group();
      for (const spec of layout) {
        const block = createAreaBlock(spec.id, spec.params, style);
        block.position.set(spec.x, 0, spec.z);
        holder.add(block);
      }
      itemCell.content.clear();
      itemCell.content.add(holder);
      const box = new THREE.Box3().setFromObject(holder);
      itemCell.bounds.copy(box);
      itemCell.center.copy(box.getCenter(new THREE.Vector3()));
      itemCell.radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      itemCell.fitLight();
      itemEl.hidden = true;
      reframe = true;
    },
  },
});
