# Tiny Catalogue

A catalogue of the low-poly PS1 town pieces from Tiny City Builder: buildings
(including the European houses), street props, vehicles, foliage, animals,
people, furnished rooms (an office, a diner, a clinic, and the rest of the
room tabs), and six small areas (a shopping street, a lane, a station plaza, a
shrine corner, an old-town square, a back alley). Open an item, turn it
around, change its settings, and copy the `createAsset(...)` line.

People are faceless, the same as the cats. There is no town to walk and no
separate character creator. The app opens on the catalogue.

The list is grouped: Buildings, Street & props, Nature, Vehicles, Characters
(people and cats), Rooms (the 16 kits), and Areas & Blocks. Press `/` to
search every group by name or id. Chips narrow by indoor or outdoor, size,
Japanese or European style, and whether the piece has variations. A star
saves a favourite in this browser. The address keeps the group and the
search, so a link opens the same list.

**PS1**, next to Colours, turns the chunky look off: a smooth full-resolution
picture, more geometry, no dither or outlines. Colours stay the same. The
choice is remembered in this browser. On is the PS1 look.

## Run

```bash
npm install
npm run dev
```

`npm run build` writes `dist/`. The Vite base is `./`, so the build works from
any folder.

## GitHub Pages

`.github/workflows/pages.yml` builds and deploys on every push to `main`.
In the repository settings, set Pages to **GitHub Actions** (the workflow
uses `actions/deploy-pages`).

## Using a piece

```js
import * as THREE from 'three';
import { style } from './src/styles/index.js';
import { createPs1Renderer } from './src/render/ps1.js';
import { createAsset } from './src/catalog/index.js';

const renderer = new THREE.WebGLRenderer({ canvas });
const ps1 = createPs1Renderer(renderer);
const scene = new THREE.Scene();
scene.add(createAsset('building.koban', { seed: 1 }, style));
scene.add(createAsset('human.salaryman', { seed: 4 }, style));
scene.add(createAsset('diner.room', { variant: 'Cutaway', seed: 0 }, style));
// each frame: ps1.render({ scene, style }, camera, 0, 0, w, h);
```

Ids are on the cards. 🎲 New look changes the seed. The same seed rebuilds
the same thing. For a person, settings you change after that stay until the
next New look, and the copied line includes every setting and the seed. An
area works the same way: the seed is the layout, and Density, People and
Cats stay put until you change them.

## Placing area blocks

Each area is a 32 × 32 m block centred on its own origin. +z is north. The
group's `userData.block` is `{ id, footprint: [32, 32], edges }`, and
`edges.n`, `edges.e`, `edges.s`, `edges.w` are `street` or `sidewalk`. A
street edge is a 3 m strip whose top is at 4 cm. A sidewalk edge is 1.5 m
with its top at 6 cm. Both are flush with the footprint.

Put the next block one footprint away. Two street edges then make one 6 m
road, and two sidewalk edges make one 3 m pavement, with no step at the join.

```js
import { BLOCK_SIZE, createAreaBlock } from './src/catalog/areas.js';
import { style } from './src/styles/index.js';

// 2 columns × 3 rows. Touching edges in this order are the same type.
const rows = [
  ['area.shrine', 'area.square'],
  ['area.lane', 'area.shotengai'],
  ['area.alley', 'area.station'],
];
rows.forEach((row, r) => {
  row.forEach((id, c) => {
    const block = createAreaBlock(id, { seed: 1 }, style);
    block.position.set(c * BLOCK_SIZE, 0, (1 - r) * BLOCK_SIZE);
    scene.add(block);
  });
});
```
`style.setPs1(false)` is the smooth render; the catalogue's PS1 button calls it.

## Docs

- `SKILLS.md`: how the catalogue is built and how to extend it.
- `PLAN.md`: what this repo is, what was removed, what is next.
- `STYLE_GUIDE.md`: the PS1 look.
