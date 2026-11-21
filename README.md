# Tiny Catalogue

A catalogue of the low-poly PS1 town pieces from Tiny City Builder: buildings
(including the European houses), street props, vehicles, foliage, animals,
people, and six small areas (a shopping street, a lane, a station plaza, a
shrine corner, an old-town square, a back alley). Open an item, turn it
around, change its settings, and copy the `createAsset(...)` line.

People are faceless, the same as the cats. There is no town to walk and no
separate character creator. The app opens on the catalogue.

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
// each frame: ps1.render({ scene, style }, camera, 0, 0, w, h);
```

Ids are on the cards. 🎲 New look changes the seed. The same seed rebuilds
the same thing. For a person, settings you change after that stay until the
next New look, and the copied line includes every setting and the seed. An
area works the same way: the seed is the layout, and Density, People and
Cats stay put until you change them.

## Docs

- `SKILLS.md`: how the catalogue is built and how to extend it.
- `PLAN.md`: what this repo is, what was removed, what is next.
- `STYLE_GUIDE.md`: the PS1 look.
