# SKILLS.md: Tiny Catalogue

For agents working in this repo. Read this, then `STYLE_GUIDE.md` (how things
must look) and `PLAN.md` (decisions). Keep all three current when you change
the app (see the end).

## What this is

A catalogue of low-poly PS1 pieces: buildings, street props, vehicles,
foliage, animals and people. The app (`npm run dev`) opens on that list.
There is no town to walk, no character-creator screen, and no interior rooms.

A game copies the modules it needs. `createAsset(id, params, style)` builds
any item. The id is on the card. The item panel's copied line is a working
call, including the seed.

## Run and publish

```bash
npm install
npm run dev
npm run build    # must pass before committing
```

GitHub Pages: `.github/workflows/pages.yml` builds with Vite and deploys on
push to `main`. The Vite `base` is `./`. The repository's Pages source must
be GitHub Actions.

`scripts/single-file.py` still inlines a built page into one HTML file if
you need that. It is not the publish path.

## Code map

```
index.html, src/main.js     the catalogue UI: tabs, item panel, palette, render loop
src/catalog/index.js        ASSETS, CATALOG, createAsset
src/catalog/humans.js       People tiles and resolveHuman (seed + explicit edits)
src/catalog/thumbs.js       card pictures, cached in the browser
src/render/ps1.js           low-res render, dither, outlines
src/styles/                 ps1.js materials, palette.js, lighting presets
src/city/                   building builders the catalogue uses (not a town):
                            buildings, shops, civic, europe, facades, interiors
                            (painted windows), backs, variety, park, playground
src/props/                  street props, vehicles, clutter, birds, nobori
src/subjects/human.js       the person (plus human/*). No face.
src/subjects/cat.js         the cat. Catalogue forces face: 'None'.
src/subjects/tree.js        trees
src/anim/gait.js, gaitIK.js, skirt.js    walk and run
src/anim/catGait.js         cat poses
src/anim/props.js           tickProps: nobori sway, pigeon peck, sparrow head
src/lib/rng.js              mulberry32
src/viewer/Cell.js          the turntable stage for one item
```

Outlines: character materials keep a strong dark edge; everything else gets a
softer shade (`render/ps1.js` reads the alpha the materials write). Pixel
size follows the screen (`style.pixelScale`, short side / 300, at most 2;
phones use 1).

**PS1 toggle** (header, next to Colours). Default on, saved in
`localStorage` as `tinycity.ps1` (`'0'` is off). `style.setPs1(on)`:

- On: today's look. `detail` 0.3, vertex snap, low-res target, 15-bit dither,
  pixel outlines.
- Off: `detail` 1, `pixelScale` 0 (the renderer draws straight to the screen
  at full resolution, with the canvas antialiasing and device pixel ratio),
  snap uniform 0, no dither, no outlines. Palette colours stay. Painted
  signs, facades, interiors, manholes and nobori stay nearest-filtered so
  the painted pixels do not smear. Wheels stay 8-sided (that is the model,
  not the detail multiplier).

Toggling rebuilds the open item and redraws thumbnails. No page reload.
`window.__cc.setPs1(on)`.

Palette: `src/styles/palette.js`. The 🎨 button picks one of seven. The page
reloads. Buildings still snap to greys, brick and wood. Skin is not snapped.
Golden hour is the default (`localStorage` key `tinycity.palette`).

## People

Tiles live in `src/catalog/humans.js`. Each one is a normal catalogue asset
(`human.man`, `human.woman`, `human.boy`, `human.girl`, `human.grandpa`,
`human.grandma`, `human.schoolboy`, `human.schoolgirl`, `human.salaryman`).

`resolveHuman(preset, params)`:

- `seed` 0 (or omitted) is the starter look on that tile.
- Any other integer rolls with `human.randomize(mulberry32(...))`, mixed
  with the tile id. The tile's body type stays (a kid stays a kid, a
  salaryman stays a man). Hair, clothes, colours, build and a little of the
  size change. The same id and the same seed always rebuild the same person.
- Any other key in `params` is an edit and wins over the seed. The character
  rules still apply (no skirt on a man, no beard on a woman, and the rest
  in `human/rules.js`).
- 🎲 New look replaces params with a new seed only, so the whole person
  changes. Edits made after that stay until the next New look.
- The copied line is the resolved person: every schema field plus `seed`.

The item panel is `#item`. It is the only editor: chips for choices, swatches
for skin, hair and cloth, sliders for the numbers, Still / Walk / Run, and
New look. Do not bring back the old creator screen.

The preview poses the rig with `poseGait` (`animation` is `New` or `Classic`,
`walkStyle` / `runStyle` pick the tune). Idle is Still: the person stands
and looks around.

Faces: the human builder has no eyes, mouth, nose or brows. Do not add them.
Beards, glasses and masks are accessories and stay. Cats in the catalogue are
built with `face: 'None'`. Do not add a face control.

## Add something

**A building.** Write `myBuilding(style, rng, w, d)` in `shops.js`, `civic.js`
or `europe.js`. Return `{ group, footprint, colliders }`. Add it to
`SHOP_BUILDINGS`, `CIVIC_BUILDINGS` or `EUROPE_BUILDINGS` with a label and a
lot size. European houses are not dressed with Japanese backs (`SKIP_BACKS`
in `catalog/index.js`). Bump `VERSION` in `catalog/thumbs.js` if an existing
picture should be redrawn.

**A prop.** Add `{ id, label, variants, colors?, build }` under `src/props/`
and list it in `PROP_GROUPS`. Add a collider in `PROP_COLLIDERS` if it is solid.

**A person setting.** Add it to `human.schema`, build it in the matching
`human/*.js` file, and add a rule in `rules.js` if it should not combine with
something else. The item panel reads the schema, so the control shows up on
its own. Add it to `randomize` if New look should roll it.

## Testing

No unit test suite. Before committing:

- `npm run build` passes.
- Open the built page in headless Chromium
  (`--use-gl=angle --use-angle=swiftshader`). The catalogue loads with no
  console errors. Every tab opens. A person opens in `#item`. Changing a
  setting and pressing New look both change the mesh. The same seed resolves
  to the same parameters twice. Phone width 390×844 still scrolls the panel.
- `window.__cc`: `state`, `setView('catalog'|'item')`, `openItem(id, params)`,
  `CATALOG`, `ASSETS`, `resolve(id, params)`, `createAsset`, `orbit(az)`,
  `human`, `itemCell`, `setPs1(on)` (PS1 look, no reload).

Check desktop (1280×720) and phone (390×844).

## Conventions

Plain ES modules, three.js, no framework. Two-space indent. Metres. People
and buildings face +z and stand on y = 0. Colours go through `style.material`
and the palette. Keep the PS1 look (`STYLE_GUIDE.md`).

Commit messages: a short title, then what changed and why.

## Keeping the docs up to date

Every change that adds, removes or renames a feature, file, asset, setting,
rule or workflow updates, in the same commit: this file, `PLAN.md`, and
`STYLE_GUIDE.md` if the look changed, and `README.md` if what the app does
for a person changed.
