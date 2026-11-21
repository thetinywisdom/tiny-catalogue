# PLAN.md: Tiny Catalogue

Where this repo is going. Update it with every change (see SKILLS.md).

## Goal

A **catalogue app** for the Tiny City Builder pieces: buildings, street props,
vehicles, foliage, animals, and people, in the PS1 look. It opens straight
into the catalogue. There is no walkable town, no character-creator screen,
no cat lab, no walk lab, and no separate interiors app. Furnished rooms
are catalogue tabs.

The pieces stay reusable modules. A game imports `createAsset` and the PS1
renderer. People stay faceless. Cats stay faceless.

## Decisions

| Area | Decision |
|---|---|
| App | Catalogue only. No mode nav. 🎨 Colours stays. |
| Look | PS1 by default, one palette at a time (Golden hour). The header PS1 button turns the treatment off: full resolution, detail 1, no dither, outlines or vertex snap. Colours stay on the palette. The choice is saved (`tinycity.ps1`). Building colours stay natural greys, brick and wood, except where a catalogue piece already uses `paint` (European houses, signs). |
| People | Catalogue tiles, edited in the item panel (chips, sliders, colour swatches, 🎲 New look). Seed 0 is that tile's starter. Any other seed rerolls hair, clothes, colours, build and a little of the size with `mulberry32`, and keeps the tile's body type. Explicit edits sit on top of the seed until the next New look. |
| Faces | No eyes, mouth, nose or brows on people. No faces on cats. Glasses, masks and beards stay: they are accessories, not faces. |
| Buildings | Japanese buildings and the European houses stay. Painted shop windows stay, because they are part of the building. Furnished rooms (office, diner, clinic, police, minimarket, meeting, bedroom, studio, cafe, classroom, open office, ramen, kitchen, library, dojo, station) are catalogue tabs: the room, then each piece. Seed 0 is the hand-made layout. There is no interiors app. |
| Animation | A person in the item view can stand, walk or run (New or Classic). Cats keep Still / Walk / Run / Sit / Loaf / Sleep. Nobori and birds still move (`tickProps`). Area crowds idle or walk in place, and cats hold a sit, loaf or sleep, through `userData.tick` on that same pass. |

## Done

1. **Catalogue only.** Removed the walkable city, the character creator
   screen, the cat lab, the walk lab, the city HUD (New town, Day, Weather,
   Buttons, Iso view, Walk lab), the joystick, pie menu and speech overlay,
   and the code, labs and scripts that only those used. Building builders
   stay in `src/city/` (houses, shops, civic,
   European houses, painted windows, park). Props, vehicles, foliage, animals
   and `tickProps` stay.
2. **People tab.** Nine tiles: Man, Woman, Kid (boy), Kid (girl), Elderly man,
   Elderly woman, Schoolkid (boy), Schoolkid (girl), Salaryman. Edited in the
   existing item panel. The copied `createAsset(...)` line includes every
   parameter and the seed.
3. **Tiny Catalogue.** Title, README and `package.json` name. GitHub Actions
   workflow deploys the Vite build to Pages on push to `main`.
4. **PS1 on/off.** Header button next to Colours. On is the existing look.
   Off is a smooth full-resolution render at geometry detail 1. The open
   item rebuilds and the thumbnails redraw, without reloading the page.
5. **Areas.** Six seeded 32 × 32 m blocks on the Areas tab: Shotengai,
   Residential lane, Station plaza, Shrine corner, Old-town square, Back
   alley. Built from existing catalogue items. `seed` plus Density, People
   and Cats. Each block records `userData.block` (`footprint`, and `street`
   or `sidewalk` on N/E/S/W) so blocks can sit on a grid. The shotengai
   street is open. People and cats stand on a carrier, because the walk pose
   rewrites the rig position; walkers each keep their own path. There is no
   station exterior, so the plaza uses the post office. There is no crate
   prop and no standalone AC unit. The torii is the one inside `building.shrine`.
6. **Furnished rooms restored.** The split had dropped the 310 catalogue
   pieces from Tiny City Builder (16 rooms and their furniture). They are
   back on their own tabs, with the same builders, manifests, layouts and
   seeds. The City, the character creator, the cat lab, the walk lab and
   the standalone interiors previews (GLBs, the office blend) stay out.
7. **Floors do not fight.** Area street edges were the same plane as the
   block shell, so with PS1 off the roads drew as flickering triangles and
   streaks. The shell stops at the edges (street top still 4 cm, sidewalk
   top still 6 cm). Paths, paving, rugs, mats, tactile bands and manholes
   sit 1.2 cm above the surface under them. Flat ground does not cast.
8. **Block maker.** A Blocks tab edits one 32 m block: edges, ground, dropped
   catalogue pieces, people and cat counts. 🎲 starts from one of the six
   area generators. Blocks save in this browser and export as JSON.
   `buildUserBlock` loads that JSON the way `createAreaBlock` loads an area.

The asset library was copied from Tiny City Builder (`thetinywisdom/character-creator`).
That history (town generation, crowd, weather, interactions) is not in this
repo anymore.

## Next

Only when the owner asks.

- More people tiles, if a look should be its own card rather than a setting.
- More buildings or props, in the same catalogue pattern.

## Known issues

- The item panel on a phone is a bottom sheet, so a person is previewed in
  the top half. The sheet scrolls.
- Changing the palette reloads the page (the whole scene is rebuilt). It
  comes back to the same tab, and to the open item if there was one.

## Open questions

None.
