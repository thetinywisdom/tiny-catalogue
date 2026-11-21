import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { lightingPresets, style } from './styles/index.js';
import { Cell } from './viewer/Cell.js';
import { createPs1Renderer } from './render/ps1.js';
import { ASSETS, CATALOG, createAsset } from './catalog/index.js';
import { TAGS, createBrowser, loadFavs, loadRecent, parseHash, rememberRecent, saveFavs, serializeHash, toggleTag } from './catalog/browse.js';
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
  ['office', 'Office'],
  ['diner', 'Diner'],
  ['clinic', 'Clinic'],
  ['police', 'Police'],
  ['minimarket', 'Minimarket'],
  ['meeting', 'Meeting'],
  ['bedroom', 'Bedroom'],
  ['studio', 'Studio'],
  ['cafe', 'Cafe'],
  ['classroom', 'Classroom'],
  ['openoffice', 'Open office'],
  ['ramen', 'Ramen'],
  ['kitchen', 'Kitchen'],
  ['library', 'Library'],
  ['dojo', 'Dojo'],
  ['station', 'Station'],
  ['areas', 'Areas'],
];
const catalogEl = document.querySelector('#catalog');
const itemEl = document.querySelector('#item');
const searchInput = document.querySelector('#catSearch');
const searchClear = document.querySelector('#catSearchClear');
const items = ASSETS.filter((a) => a.group);
// Leaf tabs stay in TABS. Grouping, tags and the hash live in catalog/browse.js.
// A tab id or label containing "block" is listed under Areas & Blocks.
const browser = createBrowser(items, TABS);
let favIds = loadFavs();
let recentIds = loadRecent();
let nav = browser.normalize(parseHash(location.hash));
let selected = null; // { id, params }
let itemCell = null;
const favSet = () => new Set(favIds);

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
// Furnished rooms keep a number, so seed 0 (the hand-made layout) stays reachable.
// Other seeded props keep 🎲 New look. Randomize skips 0.
function usesRoomSeed(a) {
  return !!(a.seedInput || a.seedControl || (a.id.endsWith('.room') && 'seed' in (a.params ?? {})));
}

function chip(label, count, extra = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = extra;
  b.append(document.createTextNode(label));
  if (count != null) {
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = String(count);
    b.append(n);
  }
  return b;
}

function commit(next, how = 'push') {
  const norm = browser.normalize(next);
  const hash = serializeHash(norm);
  const same = hash === serializeHash(nav);
  nav = norm;
  if (!same) {
    const url = `${location.pathname}${location.search}#${hash}`;
    if (how === 'push') history.pushState(norm, '', url);
    else history.replaceState(norm, '', url);
  }
  if (state.view === 'catalog') renderCatalog();
  else syncSearch();
}

function syncSearch() {
  if (document.activeElement !== searchInput && searchInput.value !== nav.q) searchInput.value = nav.q;
  searchClear.hidden = !nav.q;
}

function countIn(groupId) {
  const probe = { ...nav, wide: true, sub: '', type: '', group: groupId };
  return browser.pool(probe, favSet(), recentIds).filter((m) => m.groupId === groupId).length;
}

function renderCatalog() {
  syncSearch();
  const favs = favSet();
  const groups = catalogEl.querySelector('.cat-groups');
  const subRow = catalogEl.querySelector('.cat-sub');
  const tagRow = catalogEl.querySelector('.cat-tags');
  const meta = catalogEl.querySelector('.cat-meta');
  const grid = catalogEl.querySelector('.cat-grid');

  groups.replaceChildren(...browser.groups.map((g) => {
    const count = countIn(g.id);
    const b = chip(g.label, count, !nav.wide && nav.group === g.id ? 'on' : '');
    if (!count) b.classList.add('is-empty');
    b.dataset.group = g.id;
    b.setAttribute('aria-pressed', String(!nav.wide && nav.group === g.id));
    return b;
  }), (() => {
    const b = chip('Palette', null, nav.group === 'palette' ? 'on' : '');
    b.dataset.group = 'palette';
    b.setAttribute('aria-pressed', String(nav.group === 'palette'));
    return b;
  })());

  if (nav.group === 'palette') {
    subRow.replaceChildren();
    tagRow.replaceChildren();
    meta.replaceChildren();
    grid.replaceChildren(...Object.entries(PALETTE).map(([name, hex]) => {
      const card = document.createElement('div');
      card.className = 'cat-card pal-card';
      const h = `#${hex.toString(16).padStart(6, '0')}`;
      card.append(Object.assign(document.createElement('i'), { style: `background:${h}` }), Object.assign(document.createElement('b'), { textContent: name }), Object.assign(document.createElement('code'), { textContent: h }));
      return card;
    }));
    return;
  }

  const scoped = browser.pool({ ...nav, sub: '', type: '' }, favs, recentIds);
  const subs = browser.subsFor(nav.group, scoped).filter((s) => s.count || s.id === nav.sub);
  subRow.replaceChildren();
  if (!nav.wide && subs.length > 1) {
    const all = chip('All', scoped.length, !nav.sub ? 'on' : '');
    all.dataset.sub = '';
    all.setAttribute('aria-pressed', String(!nav.sub));
    subRow.append(all);
  }
  if (!nav.wide) {
    for (const s of subs) {
      const on = nav.sub === s.id || (!nav.sub && subs.length === 1);
      const b = chip(s.label, s.count, on ? 'on' : '');
      b.dataset.sub = s.id;
      b.setAttribute('aria-pressed', String(on));
      subRow.append(b);
    }
  }
  tagRow.replaceChildren();
  if (!nav.wide && nav.group === 'rooms') {
    const types = browser.typesFor(browser.pool({ ...nav, type: '' }, favs, recentIds));
    for (const type of types) {
      if (!type.count && type.id !== nav.type) continue;
      const b = chip(type.label, type.count, nav.type === type.id ? 'on' : '');
      b.dataset.type = type.id;
      b.setAttribute('aria-pressed', String(nav.type === type.id));
      tagRow.append(b);
    }
  }

  if (nav.q || nav.fav || nav.recent) {
    const all = chip('All groups', null, nav.wide ? 'on' : '');
    all.dataset.act = 'wide';
    all.setAttribute('aria-pressed', String(nav.wide));
    tagRow.append(all);
  }
  const savedFavs = favIds.filter((id) => browser.byId.has(id)).length;
  const savedRecent = recentIds.filter((id) => browser.byId.has(id)).length;
  const favBtn = chip('Favourites', savedFavs, nav.fav ? 'on' : '');
  favBtn.dataset.flag = 'fav';
  favBtn.setAttribute('aria-pressed', String(nav.fav));
  const recentBtn = chip('Recent', savedRecent, nav.recent ? 'on' : '');
  recentBtn.dataset.flag = 'recent';
  recentBtn.setAttribute('aria-pressed', String(nav.recent));
  tagRow.append(favBtn, recentBtn);
  // A chip's count is what you would see if you chose it. Size, place and
  // style replace each other, so those counts ignore the current choice.
  for (const tag of TAGS) {
    const others = nav.tags.filter((id) => TAGS.find((item) => item.id === id)?.family !== tag.family);
    const count = browser.pool({ ...nav, tags: [...others, tag.id] }, favs, recentIds).length;
    if (!count && !nav.tags.includes(tag.id)) continue;
    const b = chip(tag.label, count, nav.tags.includes(tag.id) ? 'on' : '');
    b.dataset.tag = tag.id;
    b.setAttribute('aria-pressed', String(nav.tags.includes(tag.id)));
    tagRow.append(b);
  }

  const list = browser.order(browser.pool(nav, favs, recentIds), nav, recentIds);
  const everywhere = browser.pool({ ...nav, wide: true }, favs, recentIds).length;
  const groupLabel = browser.groups.find((g) => g.id === nav.group)?.label ?? '';
  meta.replaceChildren();
  const summary = document.createElement('span');
  if (nav.q) summary.textContent = nav.wide ? `${list.length} matches in all groups` : `${list.length} matches in ${groupLabel}`;
  else summary.textContent = nav.wide ? `${list.length} in all groups` : `${list.length} in ${groupLabel}`;
  meta.append(summary);
  if (!nav.wide && everywhere > list.length && (nav.q || nav.tags.length || nav.fav || nav.recent)) {
    const more = document.createElement('button');
    more.type = 'button';
    more.dataset.act = 'wide';
    more.textContent = `Show all ${everywhere}`;
    meta.append(more);
  }
  if (nav.q || nav.tags.length || nav.fav || nav.recent) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.dataset.act = 'clear';
    clear.textContent = 'Clear';
    meta.append(clear);
  }

  grid.replaceChildren();
  const sections = browser.sections(list, nav);
  if (!sections.length) {
    const empty = document.createElement('p');
    empty.className = 'cat-empty';
    empty.append('Nothing matches. ');
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.dataset.act = 'clear';
    clear.textContent = 'Clear search and filters';
    empty.append(clear);
    grid.append(empty);
    return;
  }
  for (const section of sections) {
    if (section.title && sections.length > 1) {
      const h = document.createElement('h2');
      h.className = 'cat-section';
      h.textContent = `${section.title} · ${section.items.length}`;
      grid.append(h);
    }
    for (const a of section.items) grid.append(itemCard(a, favs.has(a.id)));
  }
}

function itemCard(a, loved) {
  const card = document.createElement('article');
  card.className = 'cat-card';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'cat-open';
  open.dataset.id = a.id;
  const img = document.createElement('img');
  img.alt = '';
  open.append(img, Object.assign(document.createElement('b'), { textContent: a.label }), Object.assign(document.createElement('code'), { textContent: a.id }));
  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'cat-star';
  star.dataset.fav = a.id;
  star.textContent = loved ? '★' : '☆';
  star.setAttribute('aria-pressed', loved ? 'true' : 'false');
  star.setAttribute('aria-label', loved ? `Remove ${a.label} from favourites` : `Favourite ${a.label}`);
  card.append(open, star);
  thumbInto(img, renderer, style, a.id, {});
  return card;
}

function openItem(id, p) {
  const a = CATALOG[id];
  if (selected?.id !== id) recentIds = rememberRecent(recentIds, id);
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
    <div class="it-head"><button type="button" data-act="back">← Catalogue</button><b>${esc(a.label)}</b><button type="button" class="it-fav" data-act="fav" aria-pressed="${favIds.includes(a.id) ? 'true' : 'false'}" aria-label="${favIds.includes(a.id) ? `Remove ${esc(a.label)} from favourites` : `Favourite ${esc(a.label)}`}">${favIds.includes(a.id) ? '★' : '☆'}</button></div>
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
        : usesRoomSeed(a)
          ? `<h3>Layout seed</h3><div class="seed-row"><input data-act="seed-num" type="number" step="1" value="${Number.isFinite(Number(p.seed)) ? Math.trunc(Number(p.seed)) : 0}" aria-label="Layout seed"><button type="button" data-act="seed-random">Randomize</button></div><p class="it-note">0 is the hand-made layout. The same number rebuilds the same room.</p>`
          : ('seed' in (a.params ?? {}) ? '<h3>Look</h3><div class="chips"><button type="button" data-act="seed">🎲 New look</button></div>' : '')}
      <h3>Use it in a game</h3>
      <pre></pre>
      <button type="button" data-act="copy">Copy</button>
    </div>`;
  itemEl.querySelector('pre').textContent = code;
  itemEl.onmousedown = (e) => {
    // Keep a seed number from blurring (and rebuilding) before Randomize runs.
    if (e.target.closest('[data-act="seed-random"]')) e.preventDefault();
  };
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
    if (e.target.dataset.act !== 'seed-num') return;
    const n = Math.trunc(Number(e.target.value));
    selected.params.seed = Number.isFinite(n) ? n : 0;
    openItem(selected.id, selected.params);
  };
  itemEl.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'back') return setView('catalog');
    if (b.dataset.act === 'fav') {
      favIds = favIds.includes(a.id) ? favIds.filter((id) => id !== a.id) : [...favIds, a.id];
      saveFavs(favIds);
      b.setAttribute('aria-pressed', favIds.includes(a.id) ? 'true' : 'false');
      b.textContent = favIds.includes(a.id) ? '★' : '☆';
      b.setAttribute('aria-label', favIds.includes(a.id) ? `Remove ${a.label} from favourites` : `Favourite ${a.label}`);
      return;
    }
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
    if (b.dataset.act === 'seed-random') {
      selected.params.seed = 1 + Math.floor(Math.random() * 1e9);
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
  if (view === 'catalog') { hint.textContent = 'Press / to search. Tap a card to open it'; renderCatalog(); }
  if (view === 'item') { hint.textContent = 'Drag to turn · scroll or pinch to zoom'; reframe = true; }
}
window.addEventListener('keydown', (e) => {
  const typing = e.target.matches?.('input, textarea') || e.target.isContentEditable;
  if (e.key === 'Escape') {
    if (state.view === 'item') return setView('catalog');
    if (e.target === searchInput) {
      if (nav.q) { searchInput.value = ''; commit({ ...nav, q: '', wide: nav.fav || nav.recent }, 'push'); }
      else searchInput.blur();
    }
    return;
  }
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    if (state.view !== 'catalog') setView('catalog');
    searchInput.focus();
    searchInput.select();
  }
});

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
history.replaceState(nav, '', `${location.pathname}${location.search}#${serializeHash(nav)}`);
window.addEventListener('popstate', () => {
  nav = browser.normalize(parseHash(location.hash));
  searchInput.value = nav.q;
  if (state.view === 'item') setView('catalog');
  else renderCatalog();
});
catalogEl.addEventListener('submit', (e) => e.preventDefault());
searchInput.addEventListener('input', () => {
  const q = searchInput.value;
  const starting = !nav.q && !!q.trim();
  commit({ ...nav, q, wide: q.trim() ? true : (nav.fav || nav.recent) }, starting ? 'push' : 'replace');
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  commit({ ...nav, q: '', wide: nav.fav || nav.recent }, 'push');
  searchInput.focus();
});
catalogEl.addEventListener('click', (e) => {
  const from = e.target instanceof Element ? e.target : e.target?.parentElement;
  if (!from) return;
  const fav = from.closest('[data-fav]');
  if (fav) {
    const id = fav.dataset.fav;
    favIds = favIds.includes(id) ? favIds.filter((x) => x !== id) : [...favIds, id];
    saveFavs(favIds);
    if (state.view === 'catalog') renderCatalog();
    return;
  }
  const open = from.closest('.cat-open');
  if (open?.dataset.id) return openItem(open.dataset.id);
  const group = from.closest('[data-group]');
  if (group) {
    const id = group.dataset.group;
    if (id === 'palette') return commit({ ...nav, group: 'palette', sub: '', type: '', q: '', tags: [], fav: false, recent: false, wide: false });
    const sub = id === 'places' ? (browser.placeSubs[0]?.id || 'areas') : '';
    // A chip such as European or Indoor belongs to the list you were on.
    // Carrying it into another group often matches nothing.
    return commit({ ...nav, group: id, sub, type: '', tags: [], wide: false });
  }
  const sub = from.closest('[data-sub]');
  if (sub) return commit({ ...nav, sub: nav.sub === sub.dataset.sub ? '' : sub.dataset.sub, type: '', wide: false });
  const type = from.closest('[data-type]');
  if (type) return commit({ ...nav, type: nav.type === type.dataset.type ? '' : type.dataset.type, wide: false });
  const tag = from.closest('[data-tag]');
  if (tag) return commit({ ...nav, tags: toggleTag(nav.tags, tag.dataset.tag) });
  const flag = from.closest('[data-flag]');
  if (flag) {
    const key = flag.dataset.flag;
    const on = !nav[key];
    const other = key === 'fav' ? nav.recent : nav.fav;
    return commit({ ...nav, [key]: on, wide: on ? true : nav.wide && !!(nav.q || other) });
  }
  const act = from.closest('[data-act]');
  if (!act) return;
  if (act.dataset.act === 'wide') return commit({ ...nav, wide: true });
  if (act.dataset.act === 'clear') {
    searchInput.value = '';
    return commit({ ...nav, q: '', tags: [], fav: false, recent: false, wide: false });
  }
});
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
