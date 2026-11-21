# SKILLS.md: Tiny Catalogue

For agents working in this repo. Read this, then `STYLE_GUIDE.md` (how things
must look) and `PLAN.md` (decisions). Keep all three current when you change
the app (see the end).

## What this is

A catalogue of low-poly PS1 pieces: buildings, street props, vehicles,
foliage, animals, people, and furnished rooms (office, diner, clinic, and
the rest). The app (`npm run dev`) opens on that list. There is no town to
walk, no character-creator screen, and no separate interiors app.

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
index.html, src/main.js     the catalogue UI: groups, search, item panel, palette, render loop
src/catalog/browse.js       groups, tags, search text, favourites, the URL hash
src/catalog/index.js        ASSETS, CATALOG, createAsset
src/catalog/humans.js       People tiles and resolveHuman (seed + explicit edits)
src/catalog/areas.js        six 32 m blocks (Areas tab), layBlock, placeAreaCrowd
src/catalog/blocks.js       saved-block JSON and buildUserBlock
src/catalog/blockMaker.js   Blocks tab: edit one block in the catalogue panel
src/catalog/thumbs.js       card pictures, cached in the browser
src/office, src/diner, src/clinic, src/police, src/minimarket,
src/meeting, src/bedroom, src/studio, src/cafe, src/classroom,
src/openoffice, src/ramen, src/kitchen, src/library, src/dojo, src/station
                            furnished-room builders (catalogue tabs)
public/<kit>-kit/           manifest.json and layout.json each room reads
src/lib/ground.js           stacked floors: GAP, topped slabs, decals, no self-shadow
src/lib/roomLayout.js, roomPlan.js, roomSeed.js
                            shared seeded-layout checks
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

## Areas

Six dioramas live in `src/catalog/areas.js` and show on the Areas tab with
the park (`area.shotengai`, `area.lane`, `area.station`, `area.shrine`,
`area.square`, `area.alley`). Each one is a normal catalogue item. `seed`
rebuilds the same layout. 🎲 New look changes only the seed. Chips for
Density (Sparse / Normal / Busy), People and Cats turn those parts on or
off without reshuffling the buildings.

They are assembled with `createAsset` from items already in the catalogue.
The park playground is the existing `buildPlayground` builder. The only new
geometry is ground: the 32 m block shell, paving, a road and kerbs. The
shotengai street is open to the sky. Colours are existing roles and palette
swatches. People stay faceless. Cats are built with `face: 'None'`.

Every area is one 32 × 32 m block centred on the origin. `userData.block`
is `{ id, footprint, edges }` with `edges.n/e/s/w` of `street` (3 m) or
`sidewalk` (1.5 m). +z is north. `createAreaBlock(id, params, style)` builds
one. See README for laying them on a grid.

The shell, the edge strips and anything laid on them do not share a volume.
Street tops stay at 4 cm and sidewalk tops at 6 cm, so neighbouring blocks
still meet. A road, path or paving on the interior sits 1.2 cm above the
shell (`GAP` in `src/lib/ground.js`). Flat ground does not cast a shadow.
`node scripts/check-ground.mjs` builds the areas and fails if two ground
slabs overlap.

## Blocks

The Blocks tab (`src/catalog/blockMaker.js`) edits one 32 × 32 m block in
the same panel and the same PS1 view. Edges are street or sidewalk. Ground
is asphalt, paving, grass or gravel. A dropdown drops buildings, props,
foliage and vehicles; a click on the block places them on a 0.5 m grid.
Move, Rotate 90° and a free-rotate slider edit the selection. People and
Cats are counts. They are placed with `placeAreaCrowd` (the same spacing
the areas use) and stay faceless.

🎲 fills the block from one of the six area generators (`blockFromPreset`),
then the pieces can be edited. Save writes `localStorage` (`tinycity.blocks`).
Export and Import are the JSON `buildUserBlock` reads. See README.

Nobori and birds move because `tickProps` already walks the item. People
and cats set `userData.tick` on a carrier group, which `tickProps` calls.
The walk pose rewrites the rig position, so the carrier is what stands on
the ground. Walkers each ping-pong on their own segment of the open ground.

The preview poses the rig with `poseGait` (`animation` is `New` or `Classic`,
`walkStyle` / `runStyle` pick the tune). Idle is Still: the person stands
and looks around.

Faces: the human builder has no eyes, mouth, nose or brows. Do not add them.
Beards, glasses and masks are accessories and stay. Cats in the catalogue are
built with `face: 'None'`. Do not add a face control.

## Furnished rooms

Sixteen catalogue tabs, ported from Tiny City Builder. Each tab is one
furnished room (`office.room`, `diner.room`, `clinic.room`, `police.room`,
`minimarket.room`, `meeting.room`, `bedroom.room`, `studio.room`,
`cafe.room`, `classroom.room`, `openoffice.room`, `ramen.room`,
`kitchen.room`, `library.room`, `dojo.room`, `station.room`) and then every
piece in that room (`office.desk`, and the rest). There is no interiors
app: the same catalogue panel edits them.

`variant` is `Cutaway` or `Full`. `seed` 0 is the hand-made layout. Any
other integer rebuilds the same arrangement. The item panel shows that
number plus Randomize (it skips 0). Other seeded props keep 🎲 New look.
`station.room` sets `fillFrame` so the long platform fills the card and
the item view. Colours go through `style.material`, so the PS1 toggle
(snap on or off, low-res or full resolution) applies the same way it does
to a bench. Piece geometry keeps the kit's own segment counts.

`node scripts/check-room-seeds.mjs` and `node scripts/check-diner-layout.mjs`
check the seeded layouts.

## Finding an item

The old flat tab row is grouped in `src/catalog/browse.js`. The leaf tab ids
still live in `TABS` in `src/main.js`. A new tab is picked up from that list.
A tab whose id or label contains "block" is listed under Areas & Blocks.
Anything else new becomes its own group. Do not change the Areas builders or
a Block maker panel to add a tab: add the leaf to `TABS` and let the browser
file it.

Groups: Buildings, Street & props (Street, Traffic, Extras), Nature,
Vehicles, Characters (People, Cats, Birds), Rooms (16 kits, then Whole room,
Furniture, Fixtures, Small items, Decor), Areas & Blocks. Areas is the
diorama cards. Blocks, next to it, opens the block maker (`openBlocks`).
That panel is not a card grid. Palette stays a swatch grid.

Search (press `/`) matches the friendly name, the id and the tags, across
every group. Chips narrow that: Indoor or Outdoor, Small / Medium / Large
(longest side of the footprint: up to 1 m, up to 4 m, larger), Japanese or
European, and Has variations (the piece has a `seed`). Japanese is the town
houses and shops, plus a name or id that is clearly Japanese (shrine, ramen,
dojo, noren, lantern, and the same kind of word). European is the six
European houses. People and cats are not tagged indoor or outdoor.

A star on the card is a favourite (`localStorage` `tinycity.favs`). Opening
an item records it (`tinycity.recent`, 24 ids). The hash keeps the group,
the kit or sub-filter, the room type, the search and the chips, so a link
and the browser back button return to that list. Changing palette still
reloads and reopens the item from `sessionStorage`.

Room types come from the id. Doors, windows and lights are fixtures. Plants,
posters, rugs and signs are decor. Mugs, books and other tabletop pieces are
small items. The rest of a kit is furniture. The whole room is its own type.

## Add something

**A building.** Write `myBuilding(style, rng, w, d)` in `shops.js`, `civic.js`
or `europe.js`. Return `{ group, footprint, colliders }`. Add it to
`SHOP_BUILDINGS`, `CIVIC_BUILDINGS` or `EUROPE_BUILDINGS` with a label and a
lot size. European houses are not dressed with Japanese backs (`SKIP_BACKS`
in `catalog/index.js`). Bump `VERSION` in `catalog/thumbs.js` if an existing
picture should be redrawn.

**A prop.** Add `{ id, label, variants, colors?, build }` under `src/props/`
and list it in `PROP_GROUPS`. Add a collider in `PROP_COLLIDERS` if it is solid.

**An area.** Add a builder in `src/catalog/areas.js` and a row in
`AREA_DIORAMAS`. Place existing items with `createAsset`. Keep it about
20–40 m across. Give it `seed` plus any chips that belong in `options`
(the item panel already draws those). Do not give the area
`animated: 'human'` or `'cat'`: that would pose every person or cat with
one shared cycle. Hang motion on `userData.tick` instead.

**A person setting.** Add it to `human.schema`, build it in the matching
`human/*.js` file, and add a rule in `rules.js` if it should not combine with
something else. The item panel reads the schema, so the control shows up on
its own. Add it to `randomize` if New look should roll it.

## Testing

No unit test suite. Before committing:

- `npm run build` passes.
- Open the built page in headless Chromium
  (`--use-gl=angle --use-angle=swiftshader`). The catalogue loads with no
  console errors. Every group opens, and Rooms reaches each kit. Search finds
  an item from another group. A person opens in `#item`. Changing a
  setting and pressing New look both change the mesh. The same seed resolves
  to the same parameters twice. An area opens too: New look changes the
  layout, and the same seed puts things back in the same places. A furnished
  room opens: seed 0 is the hand-made layout, another seed rearranges it,
  and the PS1 button still draws that room. Phone width 390×844 still
  scrolls the panel and the group row.
- `window.__cc`: `state`, `setView('catalog'|'item')`, `openItem(id, params)`,
  `CATALOG`, `ASSETS`, `resolve(id, params)`, `createAsset`, `orbit(az)`,
  `pose()`, `look(position, target)` (place the preview camera),
  `human`, `itemCell`, `setPs1(on)` (PS1 look, no reload), `openBlocks`,
  `buildUserBlock`, `blockDraft`.

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
