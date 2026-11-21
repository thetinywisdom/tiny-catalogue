import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { lightingPresets, style } from './styles/index.js';
import { Cell } from './viewer/Cell.js';
import { createPs1Renderer } from './render/ps1.js';
import { ASSETS, CATALOG, createAsset } from './catalog/index.js';
import { TAGS, createBrowser, loadFavs, loadRecent, parseHash, rememberRecent, saveFavs, serializeHash, toggleTag } from './catalog/browse.js';
import { createBlockMaker } from './catalog/blockMaker.js';
import { buildUserBlock } from './catalog/blocks.js';
import { BLOCK_SIZE, createAreaBlock } from './catalog/areas.js';
import { FLAT_VIEW, cancelThumbs, isFlatSize, thumbInto } from './catalog/thumbs.js';
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
  ['blocks', 'Blocks'],
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

const VIEW_KEY = 'tinycity.view';
const GUIDE_KEY = 'tinycity.guides';
const DEFAULT_VIEW = [0.62, 0.32, 1];
let viewMode = 'grid';
try { if (localStorage.getItem(VIEW_KEY) === 'list') viewMode = 'list'; } catch { /* private mode */ }
let guides = { grid: true, figure: false };
try {
  const saved = JSON.parse(localStorage.getItem(GUIDE_KEY) || '');
  if (saved && typeof saved === 'object') guides = { grid: saved.grid !== false, figure: !!saved.figure };
} catch { /* keep the defaults */ }
const stageTools = document.querySelector('#stageTools');
const viewGridBtn = document.querySelector('#viewGrid');
const viewListBtn = document.querySelector('#viewList');
const titleEl = document.querySelector('#catTitle');
const countEl = document.querySelector('#catCount');
const scopeEl = document.querySelector('#catScope');
let itemError = null;
let openToken = 0;
let thumbIO = null;
let listKey = '';

const PARAM_LABELS = {
  variant: 'Variant', color: 'Colour', seed: 'Seed', shopType: 'Shop',
  w: 'Width', d: 'Depth', pattern: 'Pattern', tailType: 'Tail', earType: 'Ears', coat: 'Coat',
  a: 'Start', b: 'End', sag: 'Sag',
};

function paintGuideButtons() {
  stageTools.querySelector('[data-cam="grid"]').setAttribute('aria-pressed', String(!!guides.grid));
  stageTools.querySelector('[data-cam="figure"]').setAttribute('aria-pressed', String(!!guides.figure));
}
function saveGuides() {
  try { localStorage.setItem(GUIDE_KEY, JSON.stringify(guides)); } catch { /* private mode */ }
  paintGuideButtons();
}

function fmtM(n) {
  if (!Number.isFinite(n)) return '—';
  return `${Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2)} m`;
}
function formatParam(key, value) {
  if (value == null || value === '') return (key === 'shopType' || key === 'variant') ? 'Any' : '—';
  if (typeof value === 'number') {
    if (key === 'color') return `#${value.toString(16).padStart(6, '0')}`;
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 1000) / 1000);
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function paramEntries(asset, params) {
  const shown = asset.resolve ? asset.resolve(params) : { ...params };
  if (asset.kind === 'human') {
    const hidden = human.hiddenControls(shown);
    const rows = [];
    if ('seed' in shown) rows.push({ key: 'seed', label: 'Seed', value: formatParam('seed', shown.seed) });
    let last = '';
    for (const [key, def] of Object.entries(human.schema)) {
      if (hidden.keys.has(key) || hidden.groups.has(def.group)) continue;
      if (def.group !== last) {
        rows.push({ group: def.group });
        last = def.group;
      }
      rows.push({ key, label: human.labelFor(key, shown) ?? def.label, value: formatParam(key, shown[key]) });
    }
    return rows;
  }
  return Object.entries(shown).map(([key, value]) => ({
    key, label: PARAM_LABELS[key] ?? key, value: formatParam(key, value),
  }));
}
function paramsHtml(asset, params) {
  const rows = paramEntries(asset, params);
  if (!rows.length) return '<h3>Parameters</h3><p class="it-note">This piece has no parameters. It is always built the same way.</p>';
  const body = rows.map((row) => row.group
    ? `<dt class="grp">${esc(row.group)}</dt><dd class="grp"></dd>`
    : `<dt>${esc(row.label)}</dt><dd data-pk="${esc(row.key)}">${esc(row.value)}</dd>`).join('');
  return `<h3>Parameters</h3><dl class="it-params">${body}</dl>`;
}
function urlFor(state) {
  return `${location.pathname}${location.search}#${serializeHash(state)}`;
}
function applyNav(next, how) {
  const norm = browser.normalize(next);
  const hash = serializeHash(norm);
  const same = hash === serializeHash(nav);
  nav = norm;
  if (!same) {
    if (how === 'push') history.pushState(norm, '', urlFor(norm));
    else history.replaceState(norm, '', urlFor(norm));
  } else if (how === 'replace') history.replaceState(norm, '', urlFor(norm));
  return nav;
}
function readMeasure() {
  if (!itemCell || itemError) return { w: NaN, h: NaN, d: NaN };
  try { return itemCell.measuredSize(); } catch { return { w: NaN, h: NaN, d: NaN }; }
}
function syncViewDir() {
  if (!itemCell || !selected) return;
  const asset = CATALOG[selected.id];
  if (asset?.viewDir) {
    itemCell.viewDir.set(...asset.viewDir).normalize();
    return;
  }
  const size = itemCell.subjectBox().getSize(new THREE.Vector3());
  itemCell.viewDir.set(...(isFlatSize(size.x, size.y, size.z) ? FLAT_VIEW : DEFAULT_VIEW)).normalize();
}
function rebuildItem() {
  itemError = null;
  if (!itemCell) return;
  try {
    itemCell.rebuild({});
    itemCell.applyLighting(lightingPresets[state.lighting]);
    syncViewDir();
    itemCell.setGuides(guides);
  } catch (e) {
    console.warn('item', selected?.id, e);
    itemError = e;
  }
}
function syncReadout() {
  if (itemError) { renderItemPanel(); return; }
  const pre = itemEl.querySelector('pre');
  if (pre && selected) pre.textContent = assetCode();
  const m = readMeasure();
  for (const axis of ['w', 'h', 'd']) {
    const el = itemEl.querySelector(`[data-axis="${axis}"]`);
    if (el) el.textContent = fmtM(m[axis]);
  }
  if (!selected) return;
  for (const row of paramEntries(CATALOG[selected.id], selected.params)) {
    if (!row.key) continue;
    const el = itemEl.querySelector(`[data-pk="${CSS.escape(row.key)}"]`);
    if (el) el.textContent = row.value;
  }
}
function filteredAssets() {
  return browser.order(browser.pool(nav, favSet(), recentIds), nav, recentIds).map((m) => m.asset);
}
function neighborState() {
  const list = filteredAssets();
  const index = list.findIndex((a) => a.id === selected?.id);
  if (index < 0) return { list, index, prev: list.at(-1) ?? null, next: list[0] ?? null, outside: true };
  return {
    list, index,
    prev: index > 0 ? list[index - 1] : null,
    next: index < list.length - 1 ? list[index + 1] : null,
    outside: false,
  };
}
function stepItem(dir) {
  const nb = neighborState();
  const asset = dir > 0 ? nb.next : nb.prev;
  if (!asset || asset.id === selected?.id) return;
  openItem(asset.id, undefined, { how: 'replace', defer: true });
}

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
  applyNav(next, how);
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

function paintHeading(count) {
  let title = nav.group === 'palette'
    ? 'Colours'
    : (nav.wide && nav.q ? 'Search' : nav.wide ? 'All groups' : (browser.groups.find((g) => g.id === nav.group)?.label ?? 'Catalogue'));
  const bits = [];
  if (!nav.wide && nav.sub) {
    const sub = browser.subsFor(nav.group, [...browser.byId.values()]).find((s) => s.id === nav.sub);
    if (sub?.label && !sub.tool) {
      bits.push(title);
      title = sub.label;
    }
  }
  if (!nav.wide && nav.type) {
    const type = browser.typesFor([]).find((t) => t.id === nav.type);
    if (type) {
      bits.push(title);
      title = type.label;
    }
  }
  if (nav.q) bits.push(`“${nav.q.trim()}”`);
  if (nav.fav) bits.push('Favourites');
  if (nav.recent) bits.push('Recent');
  for (const id of nav.tags) {
    const tag = TAGS.find((t) => t.id === id);
    if (tag) bits.push(tag.label);
  }
  titleEl.textContent = title;
  countEl.hidden = false;
  countEl.textContent = String(count);
  if (bits.length) {
    scopeEl.hidden = false;
    scopeEl.textContent = bits.join(' · ');
  } else {
    scopeEl.hidden = true;
    scopeEl.textContent = '';
  }
  viewGridBtn.setAttribute('aria-pressed', String(viewMode !== 'list'));
  viewListBtn.setAttribute('aria-pressed', String(viewMode === 'list'));
  catalogEl.classList.toggle('is-list', viewMode === 'list' && nav.group !== 'palette');
  if (state.view === 'catalog') document.title = `${title} · Tiny Catalogue`;
}

function renderCatalog() {
  const key = [nav.group, nav.sub, nav.type, nav.q, (nav.tags || []).join(','), nav.fav, nav.recent, nav.wide].join('|');
  const keep = key === listKey;
  const y = keep ? catalogEl.scrollTop : 0;
  listKey = key;
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
    const swatches = Object.entries(PALETTE);
    paintHeading(swatches.length);
    grid.replaceChildren(...swatches.map(([name, hex]) => {
      const card = document.createElement('div');
      card.className = 'cat-card pal-card';
      const h = `#${hex.toString(16).padStart(6, '0')}`;
      card.append(Object.assign(document.createElement('i'), { style: `background:${h}` }), Object.assign(document.createElement('b'), { textContent: name }), Object.assign(document.createElement('code'), { textContent: h }));
      return card;
    }));
    catalogEl.scrollTop = y;
    return;
  }

  const scoped = browser.pool({ ...nav, sub: '', type: '' }, favs, recentIds);
  const subs = browser.subsFor(nav.group, scoped).filter((s) => s.tool || s.count || s.id === nav.sub);
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
      if (s.tool) b.dataset.tool = '1';
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
  paintHeading(list.length);
  meta.replaceChildren();
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
  grid.setAttribute('aria-label', `${list.length} items`);
  const sections = browser.sections(list, nav);
  if (!sections.length) {
    const empty = document.createElement('p');
    empty.className = 'cat-empty';
    const strong = document.createElement('strong');
    strong.textContent = nav.q.trim() ? `No matches for “${nav.q.trim()}”` : 'Nothing in this view';
    const span = document.createElement('span');
    span.textContent = 'Try another group, or clear the search and filters.';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.dataset.act = 'clear';
    clear.textContent = 'Clear search and filters';
    empty.append(strong, span, clear);
    grid.append(empty);
    catalogEl.scrollTop = y;
    return;
  }
  for (const section of sections) {
    if (section.title && sections.length > 1) {
      const h = document.createElement('h2');
      h.className = 'cat-section';
      h.textContent = `${section.title} · ${section.items.length}`;
      grid.append(h);
    }
    for (const a of section.items) {
      try { grid.append(itemCard(a, favs.has(a.id))); }
      catch (e) {
        console.warn('card', a?.id, e);
        const failed = document.createElement('article');
        failed.className = 'cat-card';
        const p = document.createElement('p');
        p.className = 'cat-empty';
        p.textContent = `${a?.label ?? 'Item'} could not be listed.`;
        failed.append(p);
        grid.append(failed);
      }
    }
  }
  const first = grid.querySelector('.cat-open');
  if (first) first.tabIndex = 0;
  catalogEl.scrollTop = y;
}

function itemCard(a, loved) {
  const card = document.createElement('article');
  card.className = 'cat-card';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'cat-open';
  open.dataset.id = a.id;
  open.tabIndex = -1;
  const pic = document.createElement('span');
  pic.className = 'cat-pic is-loading';
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  const fallback = document.createElement('span');
  fallback.className = 'cat-fallback';
  fallback.hidden = true;
  fallback.textContent = 'No preview';
  pic.append(img, fallback);
  const [w, d] = a.size ?? [];
  const size = document.createElement('span');
  size.className = 'cat-size';
  if (Number.isFinite(w) && Number.isFinite(d)) {
    size.textContent = `${w} × ${d} m`;
    size.title = 'Footprint, width × depth';
  }
  open.append(pic, Object.assign(document.createElement('b'), { textContent: a.label }), Object.assign(document.createElement('code'), { textContent: a.id }), size);
  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'cat-star';
  star.dataset.fav = a.id;
  star.textContent = loved ? '★' : '☆';
  star.setAttribute('aria-pressed', loved ? 'true' : 'false');
  star.setAttribute('aria-label', loved ? `Remove ${a.label} from favourites` : `Favourite ${a.label}`);
  card.append(open, star);
  observeThumb(img, a.id);
  return card;
}

function observeThumb(img, id) {
  img.dataset.id = id;
  if (typeof IntersectionObserver !== 'function') {
    thumbInto(img, renderer, style, id, {});
    return;
  }
  if (!thumbIO) {
    thumbIO = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        thumbIO.unobserve(el);
        thumbInto(el, renderer, style, el.dataset.id, {});
      }
    }, { root: catalogEl, rootMargin: '360px' });
  }
  thumbIO.observe(img);
}

function openItem(id, p, options = {}) {
  const how = options.how ?? 'push';
  const asset = CATALOG[id];
  if (!asset) {
    toast(`No item “${id}”`);
    applyNav({ ...nav, item: '' }, 'replace');
    if (state.view !== 'catalog') setView('catalog');
    else renderCatalog();
    return;
  }
  const switching = selected?.id !== id;
  if (switching) recentIds = rememberRecent(recentIds, id);
  selected = { id, params: { ...asset.params, ...(p ?? {}) } };
  if (asset.animated === 'human' && !HUMAN_ANIMS.includes(state.itemAnim)) state.itemAnim = 'Walk';
  if (how !== 'none') applyNav({ ...nav, item: id }, how === 'replace' ? 'replace' : 'push');
  const token = ++openToken;
  if (switching && options.defer) {
    paintItemShell(asset);
    setView('item');
    requestAnimationFrame(() => {
      if (token !== openToken) return;
      finishOpen(asset, true);
    });
    return;
  }
  finishOpen(asset, switching);
}

function paintItemShell(asset) {
  itemEl.innerHTML = `
    <div class="it-head"><div class="it-nav"><button type="button" data-act="back">Back</button><span class="it-pos">Opening</span></div><h2>${esc(asset.label)}</h2></div>
    <div class="it-body"><p class="it-loading">Drawing preview…</p></div>`;
  bindItemPanel();
}

function finishOpen(asset, focusName) {
  const subject = { id: 'item', label: asset.label, schema: {}, isProp: true, build: (_q, st) => createAsset(asset.id, selected.params, st) };
  try {
    itemCell = new Cell({ entries: [{ subject, tight: !!asset.fillFrame }], style, renderer, viewDir: asset.viewDir });
    rebuildItem();
  } catch (e) {
    console.warn('item', asset.id, e);
    itemError = e;
    itemCell = null;
  }
  reframe = true;
  renderItemPanel();
  setView('item');
  if (!focusName) return;
  const name = itemEl.querySelector('.it-head h2');
  if (!name) return;
  name.tabIndex = -1;
  name.focus({ preventScroll: true });
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

function sizeHtml(asset) {
  const m = readMeasure();
  const [fw, fd] = asset.size ?? [];
  const foot = Number.isFinite(fw) && Number.isFinite(fd) ? `<p class="it-note">Catalogue footprint ${fw} × ${fd} m</p>` : '';
  return `<dl class="it-size">
      <div><dt>Width</dt><dd data-axis="w">${fmtM(m.w)}</dd></div>
      <div><dt>Height</dt><dd data-axis="h">${fmtM(m.h)}</dd></div>
      <div><dt>Depth</dt><dd data-axis="d">${fmtM(m.d)}</dd></div>
    </dl>${foot}`;
}

function renderItemPanel() {
  const a = CATALOG[selected.id];
  document.title = `${a.label} · Tiny Catalogue`;
  if (itemError || !itemCell) {
    itemEl.innerHTML = `
      <div class="it-head"><div class="it-nav"><button type="button" data-act="back">Back</button></div><h2>${esc(a.label)}</h2></div>
      <div class="it-body">
        <p class="it-error">This item could not be drawn.</p>
        <p class="it-id"><code>${esc(a.id)}</code><button type="button" class="it-link" data-act="copy-link">Copy link</button></p>
        <p class="it-note">The entry is still in the catalogue. Go back to the list, or try the next item.</p>
      </div>`;
    bindItemPanel();
    return;
  }
  const p = selected.params;
  const look = a.kind === 'human' ? a.resolve(p) : null;
  const code = assetCode();
  const shopTypes = 'shopType' in (a.params ?? {}) ? [null, ...SHOP_TYPES] : null;
  const anims = a.animated === 'human' ? HUMAN_ANIMS : a.animated === 'cat' ? CAT_ANIMS : null;
  const animNow = a.animated === 'human' && !HUMAN_ANIMS.includes(state.itemAnim) ? 'Walk' : state.itemAnim;
  const nb = neighborState();
  const pos = nb.outside || !nb.list.length ? 'Outside this filter' : `${nb.index + 1} of ${nb.list.length}`;
  const loved = favIds.includes(a.id);
  itemEl.innerHTML = `
    <div class="it-head">
      <div class="it-nav">
        <button type="button" data-act="back">Back</button>
        <button type="button" data-act="prev" ${nb.prev ? '' : 'disabled'}>Prev</button>
        <span class="it-pos">${esc(pos)}</span>
        <button type="button" data-act="next" ${nb.next ? '' : 'disabled'}>Next</button>
        <button type="button" class="it-fav" data-act="fav" aria-pressed="${loved ? 'true' : 'false'}" aria-label="${loved ? `Remove ${esc(a.label)} from favourites` : `Favourite ${esc(a.label)}`}">${loved ? '★' : '☆'}</button>
      </div>
      <h2>${esc(a.label)}</h2>
    </div>
    <div class="it-body">
      <p class="it-id"><code>${esc(a.id)}</code> · ${esc(a.category)}
        <button type="button" class="it-link" data-act="copy-link">Copy link</button>
        <button type="button" class="it-link" data-act="copy-id">Copy id</button>
      </p>
      ${sizeHtml(a)}
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
      ${paramsHtml(a, p)}
      <h3>Use it in a game</h3>
      <pre></pre>
      <button type="button" data-act="copy">Copy</button>
    </div>`;
  itemEl.querySelector('pre').textContent = code;
  bindItemPanel();
}

function bindItemPanel() {
  itemEl.onmousedown = (e) => {
    if (e.target.closest('[data-act="seed-random"]')) e.preventDefault();
  };
  itemEl.oninput = onItemInput;
  itemEl.onchange = onItemChange;
  itemEl.onclick = onItemClick;
}
function onItemInput(e) {
  if (state.view !== 'item') return;
  const r = e.target;
  if (r.dataset.act !== 'slider' || !selected) return;
  const key = r.dataset.k;
  const value = Number(r.value);
  selected.params = { ...selected.params, [key]: value };
  const places = Math.max(0, (String(r.step).split('.')[1] || '').length);
  r.parentElement.querySelector('output').textContent = value.toFixed(places);
  if (itemCell) rebuildItem();
  syncReadout();
}
function onItemChange(e) {
  if (state.view !== 'item') return;
  if (e.target.dataset.act === 'slider') reframe = true;
  if (e.target.dataset.act !== 'seed-num' || !selected) return;
  const n = Math.trunc(Number(e.target.value));
  selected.params.seed = Number.isFinite(n) ? n : 0;
  openItem(selected.id, selected.params);
}
function onItemClick(e) {
  if (state.view !== 'item') return;
  const b = e.target.closest('button');
  if (!b || !selected) return;
  const a = CATALOG[selected.id];
  if (!a) return;
  if (b.disabled) return;
  if (b.dataset.act === 'back') {
    if (nav.item) history.back();
    else setView('catalog');
    return;
  }
  if (b.dataset.act === 'prev') return stepItem(-1);
  if (b.dataset.act === 'next') return stepItem(1);
  if (b.dataset.act === 'fav') {
    favIds = favIds.includes(a.id) ? favIds.filter((id) => id !== a.id) : [...favIds, a.id];
    saveFavs(favIds);
    const on = favIds.includes(a.id);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.textContent = on ? '★' : '☆';
    b.setAttribute('aria-label', on ? `Remove ${a.label} from favourites` : `Favourite ${a.label}`);
    return;
  }
  if (b.dataset.anim) { state.itemAnim = b.dataset.anim; return renderItemPanel(); }
  if (b.dataset.act === 'copy') {
    const text = itemEl.querySelector('pre')?.textContent ?? '';
    return navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast(text));
  }
  if (b.dataset.act === 'copy-link') {
    const link = `${location.origin}${urlFor({ ...nav, item: a.id })}`;
    return navigator.clipboard?.writeText(link).then(() => toast('Link copied'), () => toast(link));
  }
  if (b.dataset.act === 'copy-id') {
    return navigator.clipboard?.writeText(a.id).then(() => toast('Id copied'), () => toast(a.id));
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
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function setView(view) {
  state.view = view;
  catalogEl.hidden = view !== 'catalog';
  itemEl.hidden = view !== 'item' && view !== 'block';
  stageTools.hidden = view !== 'item';
  controls.enabled = view === 'item' || view === 'block';
  if (view === 'catalog') {
    if (nav.item) applyNav({ ...nav, item: '' }, 'replace');
    hint.textContent = 'Press / to search. Arrow keys move. Enter opens a card';
    renderCatalog();
  }
  if (view === 'item') { hint.textContent = 'Drag to turn · scroll or pinch to zoom · arrows for previous and next · Esc back'; reframe = true; }
  if (view === 'block') hint.textContent = 'Drag to turn · click to select, drop or move';
}
function moveCardFocus(key) {
  const buttons = [...catalogEl.querySelectorAll('.cat-open')];
  if (!buttons.length) return;
  const current = document.activeElement?.closest?.('.cat-open');
  if (!buttons.includes(current)) {
    buttons[0].focus();
    return;
  }
  if (key === 'Home') { buttons[0].focus(); return; }
  if (key === 'End') { buttons.at(-1).focus(); return; }
  const r = current.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const b of buttons) {
    if (b === current) continue;
    const q = b.getBoundingClientRect();
    const x = q.left + q.width / 2 - cx;
    const y = q.top + q.height / 2 - cy;
    const dirOk = key === 'ArrowRight' ? x > 8 && Math.abs(y) < r.height * 0.65
      : key === 'ArrowLeft' ? x < -8 && Math.abs(y) < r.height * 0.65
        : key === 'ArrowDown' ? y > 8
          : key === 'ArrowUp' ? y < -8 : false;
    if (!dirOk) continue;
    const score = (key === 'ArrowLeft' || key === 'ArrowRight') ? Math.abs(x) + Math.abs(y) * 4 : Math.abs(y) + Math.abs(x) * 3;
    if (score < bestScore) { bestScore = score; best = b; }
  }
  if (best) best.focus();
}
window.addEventListener('keydown', (e) => {
  const typing = e.target.matches?.('input, select, textarea') || e.target.isContentEditable;
  if (e.key === 'Escape') {
    if (!palettePanel.hidden) { palettePanel.hidden = true; return; }
    if (state.view === 'block') return leaveBlocks();
    if (state.view === 'item') {
      if (nav.item) history.back();
      else setView('catalog');
      return;
    }
    if (e.target === searchInput) {
      if (nav.q) { searchInput.value = ''; commit({ ...nav, q: '', wide: nav.fav || nav.recent }, 'push'); }
      else searchInput.blur();
    }
    return;
  }
  if (!typing && !e.altKey && !e.metaKey && !e.ctrlKey && state.view === 'item' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    stepItem(e.key === 'ArrowRight' ? 1 : -1);
    return;
  }
  if (!typing && !e.altKey && !e.metaKey && !e.ctrlKey && state.view === 'catalog') {
    const onCard = e.target.closest?.('.cat-open');
    const idle = e.target === document.body || e.target === document.documentElement || e.target === catalogEl;
    if ((onCard || idle) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      moveCardFocus(e.key);
      return;
    }
  }
  if (state.view === 'block' && !typing) {
    if (e.key === 'r' || e.key === 'R') blockMaker.rotate90();
    if (e.key === 'Delete' || e.key === 'Backspace') blockMaker.removeSelected();
  }
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    if (state.view === 'block') leaveBlocks();
    else if (state.view !== 'catalog') setView('catalog');
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
  if (itemCell && selected && state.view === 'item') {
    rebuildItem();
    reframe = true;
    if (itemError) renderItemPanel();
    else syncReadout();
  }
  if (blockMaker.open) {
    blockMaker.rebuild();
    reframe = true;
  }
  cancelThumbs();
  if (state.view === 'catalog') renderCatalog();
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
    const dist = camera.position.distanceTo(controls.target);
    controls.minDistance = Math.max(0.12, dist * 0.18);
    controls.maxDistance = Math.max(dist * 6, 8);
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
  if (state.view === 'item' && itemCell && !itemError) {
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
  if (state.view === 'block' && blockMaker.cell) {
    propTime += dt;
    tickProps(blockMaker.cell.scene, propTime);
    preview(blockMaker.cell, panelRect(itemEl, W, H), H);
  }
  requestAnimationFrame(loop);
}

const blockMaker = createBlockMaker({
  canvas,
  camera,
  style,
  renderer,
  lighting: lightingPresets.Day,
  itemEl,
  toast,
  onFrame() { reframe = true; },
  onClose() { leaveBlocks(); },
});
function openBlocks() {
  setView('block');
  blockMaker.show();
}
function leaveBlocks() {
  blockMaker.close();
  if (browser.blockTabIds.has(nav.sub)) {
    nav = browser.normalize({ ...nav, sub: 'areas' });
    history.replaceState(nav, '', `${location.pathname}${location.search}#${serializeHash(nav)}`);
  }
  if (state.view !== 'catalog') setView('catalog');
  else renderCatalog();
}
function openBlockTab(id) {
  const next = browser.normalize({ ...nav, group: 'places', sub: id, type: '', tags: [], wide: false, item: '' });
  const hash = serializeHash(next);
  if (hash !== serializeHash(nav)) history.pushState(next, '', `${location.pathname}${location.search}#${hash}`);
  nav = next;
  openBlocks();
}

function bootHistory(initial) {
  const state = browser.normalize(initial);
  if (state.item && !CATALOG[state.item]) {
    toast(`No item “${state.item}”`);
    state.item = '';
  }
  if (state.group === 'places' && browser.blockTabIds.has(state.sub)) state.item = '';
  if (state.item) {
    const list = { ...state, item: '' };
    history.replaceState(list, '', urlFor(list));
    history.pushState(state, '', urlFor(state));
  } else history.replaceState(state, '', urlFor(state));
  nav = state;
}
let back = null;
try { back = JSON.parse(sessionStorage.getItem('tinycity.back') ?? 'null'); sessionStorage.removeItem('tinycity.back'); } catch { /* fine */ }
bootHistory(nav);
window.addEventListener('popstate', () => {
  nav = browser.normalize(parseHash(location.hash));
  searchInput.value = nav.q;
  if (nav.group === 'places' && browser.blockTabIds.has(nav.sub)) {
    if (state.view !== 'block') openBlocks();
    return;
  }
  if (state.view === 'block') blockMaker.close();
  if (nav.item && CATALOG[nav.item]) {
    const params = selected?.id === nav.item ? selected.params : undefined;
    openItem(nav.item, params, { how: 'none' });
    return;
  }
  if (nav.item) {
    toast(`No item “${nav.item}”`);
    applyNav({ ...nav, item: '' }, 'replace');
  }
  if (state.view !== 'catalog') setView('catalog');
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
  if (open?.dataset.id) return openItem(open.dataset.id, undefined, { defer: true });
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
  if (sub) {
    if (sub.dataset.tool) return openBlockTab(sub.dataset.sub);
    return commit({ ...nav, sub: nav.sub === sub.dataset.sub ? '' : sub.dataset.sub, type: '', wide: false });
  }
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
paintGuideButtons();
viewGridBtn.addEventListener('click', () => setViewMode('grid'));
viewListBtn.addEventListener('click', () => setViewMode('list'));
function setViewMode(mode) {
  viewMode = mode === 'list' ? 'list' : 'grid';
  try { localStorage.setItem(VIEW_KEY, viewMode); } catch { /* private mode */ }
  if (state.view !== 'catalog') return;
  listKey = '';
  renderCatalog();
  // A click focuses the toggle, and the browser then scrolls that button
  // to the top of the scroller, which hides the first row under the bar.
  requestAnimationFrame(() => { catalogEl.scrollTop = 0; });
}
function orbitBy(az) {
  const t = controls.target;
  camera.position.sub(t).applyAxisAngle(new THREE.Vector3(0, 1, 0), az).add(t);
  camera.lookAt(t);
  controls.update();
}
function dollyBy(factor) {
  const offset = camera.position.clone().sub(controls.target);
  const dist = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance || 0.2, controls.maxDistance || 800);
  offset.setLength(Math.max(dist, 0.05));
  camera.position.copy(controls.target).add(offset);
  controls.update();
}
stageTools.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cam]');
  if (!b || !itemCell || itemError) return;
  const act = b.dataset.cam;
  if (act === 'turn-left') orbitBy(-0.45);
  if (act === 'turn-right') orbitBy(0.45);
  if (act === 'zoom-in') dollyBy(0.8);
  if (act === 'zoom-out') dollyBy(1.25);
  if (act === 'reset') { itemCell.setAngle(0); reframe = true; }
  if (act === 'grid' || act === 'figure') {
    const key = act === 'grid' ? 'grid' : 'figure';
    guides = { ...guides, [key]: !guides[key] };
    saveGuides();
    itemCell.setGuides(guides);
    reframe = true;
  }
});
catalogEl.addEventListener('focusin', (e) => {
  const btn = e.target.closest?.('.cat-open');
  if (!btn) return;
  catalogEl.querySelectorAll('.cat-open').forEach((el) => { el.tabIndex = el === btn ? 0 : -1; });
});
const reopen = back?.item;
if (nav.group === 'places' && browser.blockTabIds.has(nav.sub)) openBlocks();
else if (nav.item && CATALOG[nav.item]) openItem(nav.item, reopen?.id === nav.item ? reopen.params : undefined, { how: 'none' });
else if (reopen?.id && CATALOG[reopen.id] && state.view !== 'block') openItem(reopen.id, reopen.params);
else setView('catalog');
requestAnimationFrame(loop);

Object.assign(window, {
  __cc: {
    state, setView, openItem, CATALOG, ASSETS, human, createAsset, gait, tuneOf, style,
    /** Turn the PS1 look on or off without reloading. */
    setPs1: (on) => applyPs1(on),
    get ps1() { return style.ps1; },
    resolve: (id, params) => CATALOG[id]?.resolve?.(params ?? {}),
    /** Orbit the preview camera by `az` radians. */
    orbit: (az) => orbitBy(az),
    /** Current preview camera, for a repeatable render. */
    pose: () => ({ position: camera.position.toArray(), target: controls.target.toArray() }),
    /** Place the preview camera and stop the one-shot auto frame. */
    look(position, target) {
      reframe = false;
      camera.position.set(position[0], position[1], position[2]);
      controls.target.set(target[0], target[1], target[2]);
      camera.lookAt(target[0], target[1], target[2]);
      controls.update();
    },
    get itemCell() { return state.view === 'block' ? blockMaker.cell : itemCell; },
    openBlocks,
    buildUserBlock,
    blockDraft: () => blockMaker.draft(),
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
