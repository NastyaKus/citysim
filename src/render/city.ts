// Сборка статического города: дороги, участки, здания, окна, снег, неон, вода.
import * as THREE from 'three';
import { GB, lowpolyMaterial, shadeColor } from './lowpoly';
import { BuildCtx, WinSpec, TreeSpec, LampSpec, DynSpec } from './buildCtx';
import { STYLES } from './styles';
import { P } from './palette';
import { World, PITCH, ROAD_HALF, LOT_EDGE, STOP_OFF, BLOCKS, HALF_CITY } from '../sim/world';
import type { Transport } from '../sim/transport';
import { RNG } from '../sim/rng';

export interface CityMeshes {
  group: THREE.Group;
  roadMat: THREE.MeshStandardMaterial;
  grassMat: THREE.MeshStandardMaterial;
  groundMat: THREE.MeshStandardMaterial;
  neonMat: THREE.MeshBasicMaterial;
  snowMat: THREE.MeshLambertMaterial;
  waterMat: THREE.MeshStandardMaterial;
  windows: THREE.InstancedMesh;
  winSpecs: WinSpec[];
  winRand: Float32Array;
  trees: TreeSpec[];
  lamps: LampSpec[];
  dyn: DynSpec[];
  pick: THREE.Mesh[];
  lightHeads: { node: number; axis: 'x' | 'z'; pos: THREE.Vector3 }[];
  stops: { x: number; z: number; ry: number; color: number }[];
}

const WIN_GEO = new THREE.BoxGeometry(1, 1.3, 0.14);

export function buildCity(world: World, transport: Transport): CityMeshes {
  const rng = new RNG(555);
  const group = new THREE.Group();
  const main = new GB();
  const road = new GB();
  const grass = new GB();
  const neon = new GB();
  const snow = new GB();
  const water = new GB();
  const winSpecs: WinSpec[] = [];
  const trees: TreeSpec[] = [];
  const lamps: LampSpec[] = [];
  const dyn: DynSpec[] = [];
  const pick: THREE.Mesh[] = [];

  // ——— дороги
  for (const e of world.edges) {
    const A = world.nodes[e.a], B = world.nodes[e.b];
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    const len = e.len - ROAD_HALF * 2;
    if (e.axis === 'x') road.quad(len, ROAD_HALF * 2, P.asphalt, mx, 0.02, mz);
    else road.quad(ROAD_HALF * 2, len, P.asphalt, mx, 0.02, mz);
    // пунктир по центру
    const n = Math.floor((e.len - STOP_OFF * 2) / 4);
    for (let i = 0; i < n; i++) {
      const t = STOP_OFF + 1 + i * 4;
      const px = A.x + e.ux * t, pz = A.z + e.uz * t;
      if (e.axis === 'x') road.quad(2, 0.18, P.marking, px, 0.06, pz);
      else road.quad(0.18, 2, P.marking, px, 0.06, pz);
    }
  }
  for (const n of world.nodes) {
    road.quad(ROAD_HALF * 2, ROAD_HALF * 2, P.asphaltLight, n.x, 0.02, n.z);
    // зебры на подходах
    for (const eid of n.edges) {
      const e = world.edges[eid];
      const dir = e.a === n.id ? 1 : -1;
      const cx = n.x + e.ux * dir * (ROAD_HALF + 1.1), cz = n.z + e.uz * dir * (ROAD_HALF + 1.1);
      for (let k = -4; k <= 4; k += 1.6) {
        if (e.axis === 'x') road.quad(1.6, 0.7, P.marking, cx, 0.06, cz + k);
        else road.quad(0.7, 1.6, P.marking, cx + k, 0.06, cz);
      }
      // стоп-линия на правой полосе входящих
      const sx = n.x + e.ux * dir * (STOP_OFF + 0.6) - e.nx * dir * 2.5, sz = n.z + e.uz * dir * (STOP_OFF + 0.6) - e.nz * dir * 2.5;
      if (e.axis === 'x') road.quad(0.35, 4.6, P.marking, sx, 0.06, sz);
      else road.quad(4.6, 0.35, P.marking, sx, 0.06, sz);
    }
  }

  // ——— тротуары вокруг кварталов (кольцо)
  for (let bj = 0; bj < BLOCKS; bj++)
    for (let bi = 0; bi < BLOCKS; bi++) {
      const cx = World.coord(bi) + PITCH / 2, cz = World.coord(bj) + PITCH / 2;
      const outer = PITCH - ROAD_HALF * 2; // 38
      const w = LOT_EDGE - ROAD_HALF; // 3
      const h = 0.16;
      main.box(outer, h, w, P.sidewalk, cx, 0, cz - outer / 2 + w / 2);
      main.box(outer, h, w, P.sidewalk, cx, 0, cz + outer / 2 - w / 2);
      main.box(w, h, outer - w * 2, P.sidewalk, cx - outer / 2 + w / 2, 0, cz);
      main.box(w, h, outer - w * 2, P.sidewalk, cx + outer / 2 - w / 2, 0, cz);
      // бордюр
      main.box(outer + 0.2, 0.18, 0.25, P.curb, cx, 0, cz - outer / 2);
      main.box(outer + 0.2, 0.18, 0.25, P.curb, cx, 0, cz + outer / 2);
      main.box(0.25, 0.18, outer, P.curb, cx - outer / 2, 0, cz);
      main.box(0.25, 0.18, outer, P.curb, cx + outer / 2, 0, cz);
      // земля под участком
      main.quad(outer - w * 2, outer - w * 2, 0x7d6b55, cx, 0.0, cz);
    }

  // ——— фонари вдоль улиц
  for (const e of world.edges) {
    const side = e.id % 2 ? 1 : -1;
    for (const t of [e.len * 0.32, e.len * 0.68]) {
      const p = world.pointOn(e.id, t, side * 7.6);
      lamps.push({ x: p.x, z: p.z, district: (p.x >= 0 ? 1 : 0) + (p.z >= 0 ? 2 : 0), h: 5 });
      // кронштейн к дороге
      main.cyl(0.12, 0.16, 5, 5, P.darkMetal, p.x, 0, p.z);
      const ax = -e.nx * side, az = -e.nz * side;
      main.box(Math.abs(ax) > 0.5 ? 1.6 : 0.12, 0.12, Math.abs(az) > 0.5 ? 1.6 : 0.12, P.darkMetal, p.x + ax * 0.8, 4.9, p.z + az * 0.8);
      lamps[lamps.length - 1].x = p.x + ax * 1.5;
      lamps[lamps.length - 1].z = p.z + az * 1.5;
      side === 1 ? 0 : 0;
    }
    // уличные деревья
    if (rng.chance(0.6)) {
      const p = world.pointOn(e.id, e.len / 2, -(e.id % 2 ? 1 : -1) * 7.5);
      trees.push({ x: p.x, z: p.z, kind: rng.pick(['round', 'poplar', 'round']), s: 0.7 });
    }
  }

  // ——— светофоры
  const lightHeads: CityMeshes['lightHeads'] = [];
  for (const n of world.nodes) {
    if (!n.hasLight) continue;
    for (const eid of n.edges) {
      const e = world.edges[eid];
      const dir = e.a === n.id ? 1 : -1;
      // столб справа от въезжающих машин
      const px = n.x + e.ux * dir * (ROAD_HALF + 2.6) - e.nx * dir * (ROAD_HALF + 1.2);
      const pz = n.z + e.uz * dir * (ROAD_HALF + 2.6) - e.nz * dir * (ROAD_HALF + 1.2);
      main.cyl(0.1, 0.12, 3.6, 5, P.darkMetal, px, 0, pz);
      main.box(0.5, 1.4, 0.5, 0x2b2d42, px, 3.3, pz);
      lightHeads.push({ node: n.id, axis: e.axis, pos: new THREE.Vector3(px - e.ux * dir * 0.3, 4.1, pz - e.uz * dir * 0.3) });
    }
  }

  // ——— остановки
  const stops: CityMeshes['stops'] = [];
  for (const r of transport.routes) {
    for (const st of r.stops) {
      const e = world.edges[st.place.edge];
      const p = world.pointOn(e.id, st.place.t, st.place.side * 7.4);
      const ry = e.axis === 'x' ? 0 : Math.PI / 2;
      const g = new GB();
      g.box(4, 0.15, 1.6, 0x5e6e82, 0, 2.6, 0);
      g.box(4, 2.5, 0.1, 0x9ec9e2, 0, 0.1, -0.7 * st.place.side * (e.axis === 'x' ? 1 : -1));
      g.box(0.12, 2.6, 0.12, 0x5e6e82, -1.9, 0, 0.6);
      g.box(0.12, 2.6, 0.12, 0x5e6e82, 1.9, 0, 0.6);
      g.box(3, 0.12, 0.5, P.wood, 0, 0.5, -0.3 * st.place.side * (e.axis === 'x' ? 1 : -1));
      main.merge(g, p.x, 0.16, p.z, ry);
      const sp = world.pointOn(e.id, st.place.t + 2.6, st.place.side * 6.2);
      main.cyl(0.07, 0.07, 3, 4, 0x888888, sp.x, 0.16, sp.z);
      neon.box(0.9, 0.6, 0.1, r.color, sp.x, 2.8, sp.z, { ry });
      stops.push({ x: p.x, z: p.z, ry, color: r.color });
    }
  }

  // ——— здания
  for (const b of world.buildings) {
    const style = STYLES[b.type];
    if (!style) continue;
    const ctx = new BuildCtx(b, new RNG(b.seed));
    style(ctx);
    const ry = Math.atan2(b.faceX, b.faceZ);
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const tx = (x: number, z: number) => ({ x: b.x + x * cos + z * sin, z: b.z - x * sin + z * cos });
    main.merge(ctx.gb, b.x, 0, b.z, ry);
    grass.merge(ctx.grass, b.x, 0, b.z, ry);
    neon.merge(ctx.neon, b.x, 0, b.z, ry);
    snow.merge(ctx.snow, b.x, 0, b.z, ry);
    water.merge(ctx.water, b.x, 0, b.z, ry);
    for (const w of ctx.wins) { const p = tx(w.x, w.z); winSpecs.push({ ...w, x: p.x, z: p.z, ry: w.ry + ry }); }
    for (const t of ctx.trees) { const p = tx(t.x, t.z); trees.push({ ...t, x: p.x, z: p.z }); }
    for (const l of ctx.lamps) { const p = tx(l.x, l.z); main.cyl(0.1, 0.14, l.h, 5, P.darkMetal, p.x, 0, p.z); lamps.push({ ...l, x: p.x, z: p.z }); }
    for (const d of ctx.dyn) { const p = tx(d.x, d.z); dyn.push({ ...d, x: p.x, z: p.z, ry: d.ry + ry }); }
    // невидимый объём для клика
    const h = Math.max(2, b.height + 2, b.def.outdoor ? 1 : 3);
    const pm = new THREE.Mesh(new THREE.BoxGeometry(b.w - 1, h, b.d - 1), PICK_MAT);
    pm.position.set(b.x, h / 2, b.z);
    pm.userData.building = b.id;
    pick.push(pm);
    group.add(pm);
  }

  // ——— за городом: лес и холмы
  for (let i = 0; i < 420; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(HALF_CITY + 22, HALF_CITY + 190);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.max(Math.abs(x), Math.abs(z)) < HALF_CITY + 16) continue;
    trees.push({ x, z, kind: rng.pick(['pine', 'pine', 'round', 'birch', 'pine']), s: rng.range(1.1, 2) });
  }
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const r = rng.range(HALF_CITY + 230, HALF_CITY + 320);
    grass.ico(rng.range(40, 80), 0xc8e6b0, Math.cos(a) * r, -18, Math.sin(a) * r, { jitter: 12, seed: i });
  }

  // ——— материалы и меши
  const mat = lowpolyMaterial();
  const mainMesh = new THREE.Mesh(main.build(), mat);
  mainMesh.castShadow = true;
  mainMesh.receiveShadow = true;
  group.add(mainMesh);

  const roadMat = lowpolyMaterial({ roughness: 0.85, metalness: 0.05 });
  const roadMesh = new THREE.Mesh(road.build(), roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const grassMat = lowpolyMaterial({ color: P.grass });
  const grassMesh = new THREE.Mesh(grass.build(), grassMat);
  grassMesh.receiveShadow = true;
  group.add(grassMesh);

  const neonMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  group.add(new THREE.Mesh(neon.build(), neonMat));

  const snowMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0, flatShading: true, depthWrite: false });
  const snowMesh = new THREE.Mesh(snow.build(), snowMat);
  snowMesh.renderOrder = 2;
  group.add(snowMesh);

  const waterMat = new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.88, flatShading: true });
  group.add(new THREE.Mesh(water.build(), waterMat));

  // земля вокруг
  const groundMat = new THREE.MeshStandardMaterial({ color: P.grass, roughness: 1, flatShading: true });
  const gg = new THREE.PlaneGeometry(1400, 1400, 30, 30);
  gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    if (Math.max(Math.abs(x), Math.abs(z)) > HALF_CITY + 40) gp.setY(i, rng.range(-1.5, 2.5) - 0.05);
    else gp.setY(i, -0.05);
  }
  gg.computeVertexNormals();
  const ground = new THREE.Mesh(gg, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // окна
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const windows = new THREE.InstancedMesh(WIN_GEO, winMat, Math.max(1, winSpecs.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const winRand = new Float32Array(winSpecs.length);
  winSpecs.forEach((w, i) => {
    q.setFromAxisAngle(up, w.ry);
    p.set(w.x, w.y, w.z);
    s.set(w.sx, w.sy, 1);
    m.compose(p, q, s);
    windows.setMatrixAt(i, m);
    windows.setColorAt(i, new THREE.Color(0x334455));
    winRand[i] = rng.next();
  });
  windows.instanceMatrix.needsUpdate = true;
  group.add(windows);

  void shadeColor;
  return { group, roadMat, grassMat, groundMat, neonMat, snowMat, waterMat, windows, winSpecs, winRand, trees, lamps, dyn, pick, lightHeads, stops };
}

const PICK_MAT = new THREE.MeshBasicMaterial({ visible: false });
