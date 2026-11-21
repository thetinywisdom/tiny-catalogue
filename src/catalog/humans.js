import { mulberry32 } from '../lib/rng.js';
import { human } from '../subjects/human.js';
import { BODY_DEFAULTS, OUTFITS } from '../subjects/human/rules.js';

// People in the catalogue. Each tile is a starter look from the human builder.
// Seed 0 is that look. Any other seed is a whole person from mulberry32,
// mixed with the tile id, so one tile and one seed always rebuild the same
// person. Keys the caller sets (a slider, a chip) are applied on top of the
// seed, then the character rules.
// The builder draws no eyes, mouth, nose or brows. This does not add any.

const schemaDefaults = () => Object.fromEntries(Object.entries(human.schema).map(([k, d]) => [k, d.value]));

// Mix the tile id into the seed so human.man seed 7 and human.boy seed 7
// are different people, while one id + one seed never changes.
function mixSeed(seed, salt) {
  let h = seed >>> 0;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 0x9e3779b1);
  return h >>> 0;
}

/**
 * The person a catalogue item builds.
 * `preset` is the seed-0 look. `params.seed` rolls a new one (salted with
 * the tile id). Any other key in `params` is an explicit edit and wins.
 */
export function resolveHuman(preset, params = {}, salt = '') {
  const seed = Number.isFinite(Number(params.seed)) ? Math.trunc(Number(params.seed)) : 0;
  let rolled = preset;
  if (seed !== 0) {
    // The tile's body type stays (a kid stays a kid). Hair, clothes, colours
    // and build come from the builder's randomizer; size jitters around that
    // body type. Rules then drop anything that body type cannot wear.
    const rng = mulberry32(mixSeed(seed, salt));
    rolled = { ...human.randomize(rng), bodyType: preset.bodyType };
    for (const [k, v] of Object.entries(BODY_DEFAULTS[preset.bodyType])) {
      if (typeof v !== 'number') continue;
      const spread = k === 'height' ? 0.1 : 0.05;
      rolled[k] = Math.round(v * (1 + (rng() - 0.5) * 2 * spread) * 1000) / 1000;
    }
  }
  const look = { ...schemaDefaults(), ...rolled };
  for (const k of Object.keys(human.schema)) {
    if (Object.prototype.hasOwnProperty.call(params, k) && params[k] !== undefined) look[k] = params[k];
  }
  human.applyRules(look);
  const out = { seed };
  for (const k of Object.keys(human.schema)) if (look[k] !== undefined) out[k] = look[k];
  return out;
}

const look = (bodyType, extra = {}) => ({ bodyType, ...BODY_DEFAULTS[bodyType], ...extra });

// Starter tiles. Body types the builder ships, plus a school uniform and a
// salaryman (the office-worker outfit on a man).
const PRESETS = [
  ['human.man', 'Man', look('Man')],
  ['human.woman', 'Woman', look('Woman')],
  ['human.boy', 'Kid (boy)', look('Boy')],
  ['human.girl', 'Kid (girl)', look('Girl')],
  ['human.grandpa', 'Elderly man', look('Grandpa')],
  ['human.grandma', 'Elderly woman', look('Grandma')],
  ['human.schoolboy', 'Schoolkid (boy)', look('Boy', { top: 'Gakuran', topColor: 'Navy', legwear: 'Trousers', legwearColor: 'Navy', shoeColor: 'Black' })],
  ['human.schoolgirl', 'Schoolkid (girl)', look('Girl', { top: 'Sailor uniform', topColor: 'White', legwear: 'Skirt', legwearColor: 'Navy' })],
  ['human.salaryman', 'Salaryman', look('Man', OUTFITS['Office worker'])],
];

export function humanAssets() {
  return PRESETS.map(([id, label, preset]) => ({
    id,
    label,
    category: 'character',
    group: 'people',
    kind: 'human',
    animated: 'human',
    preset,
    params: { seed: 0 },
    size: [0.6, 0.4],
    resolve: (p) => resolveHuman(preset, p, id),
    build(p, style) {
      const person = human.build(resolveHuman(preset, p, id), style);
      person.userData.colliders = [{ x: 0, z: 0, hw: 0.25, hd: 0.18 }];
      return person;
    },
  }));
}
