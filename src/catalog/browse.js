// Catalogue browser: groups, tags, search text and the URL hash.
// The Areas builders and the Block maker are not involved. Leaf tabs stay
// in main.js (TABS). A tab whose id or label mentions "block" is listed
// under Areas & Blocks. Any other new tab becomes its own group.

export const TAGS = [
  { id: 'indoor', label: 'Indoor', family: 'place' },
  { id: 'outdoor', label: 'Outdoor', family: 'place' },
  { id: 'small', label: 'Small', family: 'size' },
  { id: 'medium', label: 'Medium', family: 'size' },
  { id: 'large', label: 'Large', family: 'size' },
  { id: 'japanese', label: 'Japanese', family: 'style' },
  { id: 'european', label: 'European', family: 'style' },
  { id: 'seed', label: 'Has variations', family: 'seed' },
];

export const ROOM_TYPES = [
  { id: 'room', label: 'Whole room' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'small', label: 'Small items' },
  { id: 'decor', label: 'Decor' },
];

const ROOM_KITS = [
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
];

const EUROPE_IDS = new Set([
  'building.tudorCottage',
  'building.mediterraneanVilla',
  'building.dutchCanalHouse',
  'building.frenchCountryHouse',
  'building.scandinavianHouse',
  'building.stoneChapel',
]);

// Japanese town houses and shops, as opposed to the European set and the
// generic civic buildings (school, bank, office tower).
const JAPANESE_IDS = new Set([
  'building.house',
  'building.apartment',
  'building.mixedUse',
  'building.shop',
  'building.shrine',
]);

const JP_WORD = /shrine|torii|noren|nobori|lantern|tatami|kamidana|chouchin|udon|soba|takoyaki|koban|karaoke|kissaten|sushi|ramen|dojo|shoji|bokken/;

const FIXTURE_WORDS = new Set(['door', 'window', 'lamp', 'light', 'lantern', 'pendant', 'beacon', 'neon', 'gate', 'sink', 'bath', 'tactile', 'pillar']);
const LIGHT_WORDS = new Set(['lamp', 'light', 'lantern', 'pendant', 'beacon', 'neon']);
const FURNITURE_OVERRIDE = new Set(['counter', 'desk', 'table', 'shelf', 'chair', 'stool', 'bed', 'sofa', 'bench', 'cabinet', 'booth']);
const DECOR_WORDS = new Set(['plant', 'planter', 'poster', 'picture', 'scroll', 'pinboard', 'noren', 'kamidana', 'rug', 'mat', 'mirror', 'blackboard', 'menu', 'notice', 'sign', 'cross', 'whiteboard', 'clock']);
const SMALL_WORDS = new Set(['mug', 'cup', 'teacup', 'book', 'books', 'notebook', 'bottle', 'ketchup', 'mustard', 'salt', 'pepper', 'straw', 'napkin', 'bell', 'caddy', 'cake', 'condiment', 'kettle', 'pencil', 'radio', 'globe', 'pot', 'grinder', 'rice', 'chopstick', 'jar', 'carafe', 'notepad']);
const NOT_SMALL = new Set(['bin', 'basket', 'bucket', 'chair', 'stool', 'can']);

const TAG_IDS = new Set(TAGS.map((t) => t.id));
const TYPE_IDS = new Set(ROOM_TYPES.map((t) => t.id));
const KIT_IDS = new Set(ROOM_KITS.map(([id]) => id));

const FAV_KEY = 'tinycity.favs';
const RECENT_KEY = 'tinycity.recent';
const RECENT_MAX = 24;

const readList = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};
const writeList = (key, ids) => {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* private mode */ }
};

export const loadFavs = () => readList(FAV_KEY);
export const loadRecent = () => readList(RECENT_KEY);
export function saveFavs(ids) { writeList(FAV_KEY, ids); }
export function rememberRecent(ids, id) {
  const next = [id, ...ids.filter((x) => x !== id)].slice(0, RECENT_MAX);
  writeList(RECENT_KEY, next);
  return next;
}

function hasToken(tokens, set) {
  return tokens.some((t) => set.has(t));
}

/** Furniture, fixture, small item, decor, or the whole room. From the id. */
export function roomTypeOf(asset) {
  if (String(asset.id).endsWith('.room')) return 'room';
  const tokens = String(asset.id).split('.').slice(1).join('_').toLowerCase().split('_').filter(Boolean);
  const light = hasToken(tokens, LIGHT_WORDS);
  if (hasToken(tokens, FIXTURE_WORDS) && (light || !hasToken(tokens, FURNITURE_OVERRIDE))) return 'fixtures';
  const [w, d] = asset.size ?? [1, 1];
  const longest = Math.max(Number(w) || 0, Number(d) || 0);
  const area = (Number(w) || 0) * (Number(d) || 0);
  if (tokens.includes('clock') && longest <= 0.2) return 'small';
  if (tokens.includes('whiteboard') && tokens.includes('mobile')) return 'furniture';
  if (hasToken(tokens, DECOR_WORDS)) return 'decor';
  if (hasToken(tokens, SMALL_WORDS)) return 'small';
  if (longest <= 0.22 && area <= 0.06 && !hasToken(tokens, NOT_SMALL)) return 'small';
  return 'furniture';
}

function placeOf(groupId, leaf) {
  if (groupId === 'rooms') return leaf === 'station' ? 'outdoor' : 'indoor';
  if (groupId === 'characters') return '';
  if (groupId === 'buildings' || groupId === 'street' || groupId === 'nature' || groupId === 'vehicles' || groupId === 'places') return 'outdoor';
  return '';
}

function sizeOf(asset) {
  const [w, d] = asset.size ?? [1, 1];
  const longest = Math.max(Number(w) || 0, Number(d) || 0);
  if (longest <= 1) return 'small';
  if (longest <= 4) return 'medium';
  return 'large';
}

function styleOf(asset) {
  if (EUROPE_IDS.has(asset.id)) return 'european';
  const blob = `${asset.id} ${asset.label ?? ''}`.toLowerCase();
  if (JAPANESE_IDS.has(asset.id) || JP_WORD.test(blob)) return 'japanese';
  return '';
}

function hasSeed(asset) {
  return !!(asset.seedInput || asset.seedControl || Object.prototype.hasOwnProperty.call(asset.params ?? {}, 'seed'));
}

function characterSub(asset) {
  if (asset.group === 'people' || asset.kind === 'human') return 'people';
  if (asset.id === 'animal.cat' || String(asset.id).startsWith('animal.cat')) return 'cats';
  if (asset.id === 'animal.bird' || String(asset.id).startsWith('animal.bird')) return 'birds';
  return 'animals';
}

function isBlockTab(id, label) {
  return /block/i.test(id) || /block/i.test(label || '');
}

/**
 * @param {Array} assets catalogue rows that have a group
 * @param {Array<[string, string]>} tabList the leaf tabs from the page
 */
export function createBrowser(assets, tabList) {
  const tabLabel = Object.fromEntries(tabList);
  const known = new Set([
    'palette', 'all', 'buildings', 'street', 'traffic', 'extras', 'nature', 'animals', 'people', 'vehicles', 'areas',
    ...KIT_IDS,
  ]);
  const extra = tabList.filter(([id]) => !known.has(id));
  const blockTabs = extra.filter(([id, label]) => isBlockTab(id, label));
  const otherTabs = extra.filter(([id]) => !blockTabs.some(([bid]) => bid === id));

  const leafGroup = {
    buildings: 'buildings',
    street: 'street',
    traffic: 'street',
    extras: 'street',
    nature: 'nature',
    vehicles: 'vehicles',
    people: 'characters',
    animals: 'characters',
    areas: 'places',
  };
  for (const id of KIT_IDS) leafGroup[id] = 'rooms';
  for (const [id] of blockTabs) leafGroup[id] = 'places';
  for (const [id] of otherTabs) leafGroup[id] = id;

  const groups = [
    { id: 'buildings', label: 'Buildings' },
    { id: 'street', label: 'Street & props' },
    { id: 'nature', label: 'Nature' },
    { id: 'vehicles', label: 'Vehicles' },
    { id: 'characters', label: 'Characters' },
    { id: 'rooms', label: 'Rooms' },
    { id: 'places', label: 'Areas & Blocks' },
    ...otherTabs.map(([id, label]) => ({ id, label })),
  ];
  const groupIds = new Set(groups.map((g) => g.id));

  const streetSubs = [
    { id: 'street', label: tabLabel.street || 'Street' },
    { id: 'traffic', label: tabLabel.traffic || 'Traffic' },
    { id: 'extras', label: tabLabel.extras || 'Extras' },
  ];
  const roomSubs = ROOM_KITS.map(([id, fallback]) => ({ id, label: tabLabel[id] || fallback }));
  const placeSubs = [
    { id: 'areas', label: tabLabel.areas || 'Areas' },
    ...blockTabs.map(([id, label]) => ({ id, label })),
  ];

  const byId = new Map();
  assets.forEach((asset, index) => {
    const leaf = asset.group;
    const groupId = leafGroup[leaf] || 'places';
    let sub = '';
    if (groupId === 'street') sub = leaf;
    else if (groupId === 'characters') sub = characterSub(asset);
    else if (groupId === 'rooms' || groupId === 'places') sub = leaf;
    else if (!['buildings', 'nature', 'vehicles'].includes(groupId)) sub = '';
    const roomType = groupId === 'rooms' ? roomTypeOf(asset) : '';
    const tags = [placeOf(groupId, leaf), sizeOf(asset), styleOf(asset), hasSeed(asset) ? 'seed' : ''].filter(Boolean);
    const kitLabel = groupId === 'rooms' ? (tabLabel[leaf] || leaf) : '';
    const typeLabel = ROOM_TYPES.find((t) => t.id === roomType)?.label ?? '';
    const groupLabel = groups.find((g) => g.id === groupId)?.label ?? groupId;
    const optionText = Object.values(asset.options ?? {}).flat().join(' ');
    const variantText = (asset.variants ?? []).join(' ');
    const tagText = tags.map((id) => TAGS.find((t) => t.id === id)?.label ?? id).join(' ');
    const search = [asset.label, asset.id, groupLabel, kitLabel, typeLabel, tagText, variantText, optionText]
      .join(' ')
      .toLowerCase();
    byId.set(asset.id, { asset, index, groupId, sub, roomType, tags, search, leaf });
  });

  function subsFor(groupId, pool) {
    if (groupId === 'street') return withCounts(streetSubs, pool, (m) => m.sub);
    if (groupId === 'rooms') return withCounts(roomSubs, pool, (m) => m.sub);
    if (groupId === 'places') {
      return placeSubs.map((sub) => {
        const tool = blockTabs.some(([id]) => id === sub.id);
        const count = pool.filter((m) => m.sub === sub.id).length;
        // The Block maker is a panel, not a list of cards, so it has no count.
        return { ...sub, count: tool ? null : count, tool };
      });
    }
    if (groupId === 'characters') {
      const kinds = [
        { id: 'people', label: 'People' },
        { id: 'cats', label: 'Cats' },
        { id: 'birds', label: 'Birds' },
      ];
      if (pool.some((m) => m.sub === 'animals')) kinds.push({ id: 'animals', label: 'Animals' });
      return withCounts(kinds, pool, (m) => m.sub);
    }
    return [];
  }

  function typesFor(pool) {
    return withCounts(ROOM_TYPES, pool, (m) => m.roomType);
  }

  function normalize(state) {
    const s = { ...state };
    if (s.group === 'palette') {
      return { group: 'palette', sub: '', type: '', q: '', tags: [], fav: false, recent: false, wide: false };
    }
    if (!groupIds.has(s.group)) {
      if (leafGroup[s.group]) {
        const leaf = s.group;
        s.group = leafGroup[leaf];
        if (!s.sub && leaf !== 'animals' && leaf !== 'buildings' && leaf !== 'nature' && leaf !== 'vehicles') s.sub = leaf;
      } else s.group = 'buildings';
    }
    const subs = subsFor(s.group, [...byId.values()]);
    if (s.sub && !subs.some((sub) => sub.id === s.sub)) s.sub = '';
    if (s.group !== 'rooms' || (s.type && !TYPE_IDS.has(s.type))) s.type = s.group === 'rooms' ? (TYPE_IDS.has(s.type) ? s.type : '') : '';
    s.tags = [...new Set((s.tags ?? []).filter((id) => TAG_IDS.has(id)))];
    s.q = String(s.q ?? '');
    s.fav = !!s.fav;
    s.recent = !!s.recent;
    s.wide = !!(s.wide && (s.q || s.fav || s.recent));
    return s;
  }

  function matches(meta, state, favs, recent) {
    if (!state.wide && meta.groupId !== state.group) return false;
    if (!state.wide && state.sub && meta.sub !== state.sub) return false;
    if (!state.wide && state.type && meta.roomType !== state.type) return false;
    if (state.fav && !favs.has(meta.asset.id)) return false;
    if (state.recent && !recent.includes(meta.asset.id)) return false;
    if (state.tags.length && !state.tags.every((tag) => meta.tags.includes(tag))) return false;
    const q = state.q.trim().toLowerCase();
    if (q) {
      const words = meta.search.split(/[^a-z0-9]+/);
      if (!q.split(/\s+/).every((part) => words.includes(part))) return false;
    }
    return true;
  }

  function pool(state, favs, recent, { ignoreGroup = false, ignoreSub = false, ignoreType = false, ignoreTags = false } = {}) {
    const probe = {
      ...state,
      wide: ignoreGroup ? true : state.wide,
      sub: ignoreSub ? '' : state.sub,
      type: ignoreType ? '' : state.type,
      tags: ignoreTags ? [] : state.tags,
    };
    const out = [];
    for (const meta of byId.values()) if (matches(meta, probe, favs, recent)) out.push(meta);
    return out;
  }

  function order(list, state, recent) {
    const copy = [...list];
    if (state.recent) {
      copy.sort((a, b) => recent.indexOf(a.asset.id) - recent.indexOf(b.asset.id));
      return copy;
    }
    copy.sort((a, b) => {
      if (a.groupId === 'rooms' && b.groupId === 'rooms' && a.sub === b.sub) {
        const ta = ROOM_TYPES.findIndex((t) => t.id === a.roomType);
        const tb = ROOM_TYPES.findIndex((t) => t.id === b.roomType);
        if (ta !== tb) return ta - tb;
      }
      return a.index - b.index;
    });
    return copy;
  }

  function sections(list, state) {
    if (!list.length) return [];
    const titled = (title, rows) => ({ title, items: rows.map((m) => m.asset) });
    if (state.wide || state.group === 'all') {
      return groups
        .map((g) => titled(`${g.label}`, list.filter((m) => m.groupId === g.id)))
        .filter((s) => s.items.length);
    }
    if (state.group === 'rooms' && !state.sub) {
      return roomSubs
        .map((kit) => titled(kit.label, list.filter((m) => m.sub === kit.id)))
        .filter((s) => s.items.length);
    }
    if (state.group === 'rooms' && state.sub && !state.type) {
      return ROOM_TYPES
        .map((type) => titled(type.label, list.filter((m) => m.roomType === type.id)))
        .filter((s) => s.items.length);
    }
    if (state.group === 'street' && !state.sub) {
      return streetSubs
        .map((sub) => titled(sub.label, list.filter((m) => m.sub === sub.id)))
        .filter((s) => s.items.length);
    }
    if (state.group === 'characters' && !state.sub) {
      const kinds = subsFor('characters', list);
      return kinds
        .map((sub) => titled(sub.label, list.filter((m) => m.sub === sub.id)))
        .filter((s) => s.items.length);
    }
    if (state.group === 'places' && !state.sub && placeSubs.length > 1) {
      return placeSubs
        .map((sub) => titled(sub.label, list.filter((m) => m.sub === sub.id)))
        .filter((s) => s.items.length);
    }
    return [{ title: '', items: list.map((m) => m.asset) }];
  }

  return { groups, byId, subsFor, typesFor, normalize, pool, order, sections, placeSubs, blockTabIds: new Set(blockTabs.map(([id]) => id)) };
}

function withCounts(subs, pool, pick) {
  return subs.map((sub) => ({ ...sub, count: pool.filter((m) => pick(m) === sub.id).length }));
}

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const cut = raw.indexOf('?');
  const path = decodeURIComponent(cut === -1 ? raw : raw.slice(0, cut));
  let qs;
  try { qs = new URLSearchParams(cut === -1 ? '' : raw.slice(cut + 1)); } catch { qs = new URLSearchParams(); }
  const parts = path.split('/').filter(Boolean);
  const sub = parts[1] && parts[1] !== 'all' ? parts[1] : '';
  return {
    group: parts[0] || 'buildings',
    sub,
    type: parts[2] || '',
    q: qs.get('q') || '',
    tags: (qs.get('tag') || '').split(',').map((s) => s.trim()).filter(Boolean),
    fav: qs.get('fav') === '1',
    recent: qs.get('recent') === '1',
    wide: qs.get('wide') === '1',
  };
}

export function serializeHash(state) {
  const parts = [state.group || 'buildings'];
  if (state.sub) parts.push(state.sub);
  else if (state.type) parts.push('all');
  if (state.type) parts.push(state.type);
  const qs = new URLSearchParams();
  if (state.q) qs.set('q', state.q);
  if (state.tags?.length) qs.set('tag', state.tags.join(','));
  if (state.fav) qs.set('fav', '1');
  if (state.recent) qs.set('recent', '1');
  if (state.wide && (state.q || state.fav || state.recent)) qs.set('wide', '1');
  const q = qs.toString();
  return parts.join('/') + (q ? `?${q}` : '');
}

/** One tag on, and the others in its family off. Size, place and style work as a choice. */
export function toggleTag(tags, id) {
  const family = TAGS.find((tag) => tag.id === id)?.family;
  const on = tags.includes(id);
  const next = tags.filter((tag) => TAGS.find((item) => item.id === tag)?.family !== family);
  if (!on) next.push(id);
  return TAGS.map((tag) => tag.id).filter((tag) => next.includes(tag));
}
