import * as THREE from 'three';
import { bench, streetLamp, trashBin } from '../props/furniture.js';
import { vendingMachine } from '../props/extras.js';
import { tree } from '../subjects/tree.js';
import { defaultsFor } from '../viewer/params.js';
import { GAP, LAYER_H, addSandbox, toppedBox } from '../lib/ground.js';
import { box } from '../props/util.js';
import { PLAY_AT, buildPlayground } from './playground.js';

// A Japanese neighbourhood park (公園): grass, a cross of paths, trees round
// the edge, benches, a playground (slide, swings, sandbox, climbing frame),
// a small toilet hut, lamps and a low fence. Fills a w × d lot centred on the
// origin. Returns the group and box colliders for the solid parts.

export function park(style, rng, w, d) {
  const g = new THREE.Group();
  const colliders = [];
  const solid = (obj, cw, cd) => {
    colliders.push({ x: obj.position.x, z: obj.position.z, hw: cw / 2, hd: cd / 2 });
  };
  const grassTop = 0.05;
  g.add(toppedBox(w, d, style.material('grass'), 0, grassTop, 0, 0.05, 6));
  const path = style.material('sidewalk', 0xd8cdb4);
  const pathTop = grassTop + GAP + LAYER_H;
  // The cross is three pieces that meet at edges. The middle belongs to the east-west path.
  g.add(toppedBox(w, 2.4, path, 0, pathTop, 0, LAYER_H, 6));
  const arm = d / 2 - 1.2;
  const armZ = (d / 2 + 1.2) / 2;
  g.add(toppedBox(2.4, arm, path, 0, pathTop, armZ, LAYER_H, 6));
  g.add(toppedBox(2.4, arm, path, 0, pathTop, -armZ, LAYER_H, 6));

  // trees round the edge (a mix of the tree presets)
  const presets = Object.keys(tree.presets);
  const base = defaultsFor(tree);
  const spots = [];
  for (let x = -w / 2 + 3; x <= w / 2 - 3; x += 7) spots.push([x, -d / 2 + 2.5], [x, d / 2 - 2.5]);
  for (let z = -d / 2 + 9; z <= d / 2 - 9; z += 7) spots.push([-w / 2 + 2.5, z], [w / 2 - 2.5, z]);
  for (const [x, z] of spots) {
    if (Math.abs(x) < 3 || Math.abs(z) < 3) continue; // keep the path entrances open
    const name = presets[Math.floor(rng() * presets.length)];
    const t = tree.build({ ...base, ...tree.presets[name], seed: 1 + Math.floor(rng() * 50) }, style);
    t.scale.setScalar(0.8 + rng() * 0.3);
    t.position.set(x, 0, z);
    g.add(t);
    colliders.push({ x, z, hw: 0.4, hd: 0.4 });
  }

  // benches facing the paths
  for (const [x, z, ry] of [[-6, 2, Math.PI], [6, 2, Math.PI], [-6, -2, 0], [6, -2, 0]]) {
    const b = bench.build({ variant: 'Park bench' }, style);
    b.position.set(x, 0, z + Math.sign(z) * 0.6);
    b.rotation.y = ry;
    g.add(b);
  }

  // playground in one quarter
  const [px, pz] = PLAY_AT(w, d);
  const play = new THREE.Group();
  play.position.set(px, 0, pz);
  // swings, slide and climbing frame (playground.js), and a sandbox
  for (const c of buildPlayground(play, style)) colliders.push({ x: px + c.x, z: pz + c.z, hw: c.hw, hd: c.hd });
  addSandbox(play, -2.6, 3.2, 3, 3, style.material('wood'), style.material('sidewalk', 0xe6d2a0), grassTop);
  g.add(play);

  // toilet hut and a vending machine in the opposite quarter
  const hut = new THREE.Group();
  hut.position.set(-w / 4 - 1, 0, -d / 4 - 1);
  hut.add(box(4, 2.8, 3, style.material('building', 0xd8d0c0), [0, 1.4, 0]));
  hut.add(box(4.6, 0.25, 3.6, style.material('roof'), [0, 2.9, 0]));
  hut.add(box(0.9, 2, 0.1, style.material('window'), [-0.8, 1, 1.51]));
  hut.add(box(0.9, 2, 0.1, style.material('window'), [0.8, 1, 1.51]));
  g.add(hut);
  solid(hut, 4, 3);
  const vm = vendingMachine.build({ variant: 'Blue' }, style);
  vm.position.set(-w / 4 + 2.2, 0, -d / 4 - 1.5);
  g.add(vm);
  solid(vm, 1, 0.8);
  const bin = trashBin.build({ variant: 'Recycling station' }, style);
  bin.position.set(-w / 4 + 4.2, 0, -d / 4 - 1.5);
  bin.userData.knock = true;
  g.add(bin);

  // lamps by the paths
  for (const [x, z] of [[-w / 4, 1.6], [w / 4, -1.6]]) {
    const l = streetLamp.build({ variant: 'Single' }, style);
    l.scale.setScalar(0.7);
    l.position.set(x, 0, z);
    g.add(l);
  }

  // low fence round the edge, with openings at the paths
  const fence = style.material('metal', 0x4f7a54);
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const len = w / 2 - 2;
      g.add(box(len, 0.6, 0.05, fence, [sx * (len / 2 + 1.6), 0.3, sz * (d / 2 - 0.3)]));
    }
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const len = d / 2 - 2;
      g.add(box(0.05, 0.6, len, fence, [sx * (w / 2 - 0.3), 0.3, sz * (len / 2 + 1.6)]));
    }
  }
  return { group: g, colliders };
}
