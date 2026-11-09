// Объекты редактора: лавочки, деревья, клумбы, фонари, пешеходные улицы, новые остановки.
import * as THREE from 'three';
import { GB, lowpolyMaterial } from './lowpoly';
import type { Sim } from '../sim/sim';
import type { CityMeshes } from './city';
import { ROAD_HALF } from '../sim/world';

function geo(kind: string): THREE.BufferGeometry {
  const g = new GB();
  switch (kind) {
    case 'bench':
      g.box(1.8, 0.12, 0.5, 0x9c6b3f, 0, 0.45, 0);
      g.box(1.8, 0.5, 0.1, 0x9c6b3f, 0, 0.55, -0.22);
      g.box(0.1, 0.45, 0.45, 0x333333, -0.8, 0, 0);
      g.box(0.1, 0.45, 0.45, 0x333333, 0.8, 0, 0);
      g.cyl(0.25, 0.22, 0.7, 6, 0x3d5a40, 1.4, 0, 0);
      break;
    case 'tree':
      g.cyl(0.18, 0.28, 2.4, 5, 0x7a5232, 0, 0, 0);
      g.ico(1.7, 0x6ab04c, 0, 3.4, 0, { jitter: 0.5, seed: 9 });
      g.ico(1.1, 0x78c25a, 0.9, 2.8, 0.4, { jitter: 0.3, seed: 10 });
      break;
    case 'flowers': {
      g.box(2, 0.35, 1.2, 0x7a5232, 0, 0, 0);
      g.box(1.9, 0.05, 1.1, 0x5a9e45, 0, 0.35, 0);
      const cols = [0xff5d8f, 0xffd166, 0xf8f9fa, 0xc77dff, 0xff7b54];
      for (let i = 0; i < 14; i++) g.ico(0.18, cols[i % cols.length], -0.8 + (i % 7) * 0.27, 0.45, i < 7 ? -0.25 : 0.25);
      break;
    }
    case 'lamp':
      g.cyl(0.1, 0.14, 4.5, 5, 0x4b525c, 0, 0, 0);
      g.box(0.8, 0.12, 0.12, 0x4b525c, 0.35, 4.4, 0);
      break;
    case 'stop':
      g.box(4, 0.15, 1.6, 0x5e6e82, 0, 2.6, 0);
      g.box(4, 2.5, 0.1, 0x9ec9e2, 0, 0.1, -0.7);
      g.box(0.12, 2.6, 0.12, 0x5e6e82, -1.9, 0, 0.6);
      g.box(0.12, 2.6, 0.12, 0x5e6e82, 1.9, 0, 0.6);
      g.box(3, 0.12, 0.5, 0xa97c50, 0, 0.5, -0.3);
      break;
  }
  return g.build();
}

export class DecorRenderer {
  group = new THREE.Group();
  private ver = -1;
  private mat = lowpolyMaterial();
  private lampHeads: THREE.InstancedMesh | null = null;
  private lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1c1 });

  constructor(private sim: Sim, private city: CityMeshes) {}

  rebuild() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      const m = c as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    }
    const sim = this.sim;
    const decor = sim.world.decor;
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const kind of ['bench', 'tree', 'flowers', 'lamp'] as const) {
      const list = decor.filter((d) => d.kind === kind);
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo(kind), this.mat, list.length);
      list.forEach((d, i) => {
        q.setFromAxisAngle(up, d.ry);
        mx.compose(new THREE.Vector3(d.x, 0.1, d.z), q, one);
        im.setMatrixAt(i, mx);
        // коллизии
        if (kind === 'tree') this.city.collision.addCircle({ x: d.x, z: d.z, r: 0.3 });
        if (kind === 'lamp') this.city.collision.addCircle({ x: d.x, z: d.z, r: 0.18 });
      });
      im.castShadow = true;
      im.receiveShadow = true;
      this.group.add(im);
      if (kind === 'lamp') {
        const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.25, 0.5), this.lampMat, list.length);
        list.forEach((d, i) => {
          const c = Math.cos(d.ry), s = Math.sin(d.ry);
          mx.makeTranslation(d.x + 0.7 * c, 4.3, d.z - 0.7 * s);
          heads.setMatrixAt(i, mx);
        });
        this.lampHeads = heads;
        this.group.add(heads);
      }
    }
    // пешеходные улицы — плитка поверх асфальта
    const ped = new GB();
    for (const e of sim.world.edges) {
      if (!e.pedestrian) continue;
      const A = sim.world.nodes[e.a], B = sim.world.nodes[e.b];
      const mxp = (A.x + B.x) / 2, mzp = (A.z + B.z) / 2;
      const len = e.len - ROAD_HALF * 2;
      if (e.axis === 'x') ped.quad(len, ROAD_HALF * 2, 0xd8c3a5, mxp, 0.09, mzp);
      else ped.quad(ROAD_HALF * 2, len, 0xd8c3a5, mxp, 0.09, mzp);
      for (let k = -1; k <= 1; k += 2) {
        const px = mxp + (e.axis === 'x' ? k * len * 0.25 : 0), pz = mzp + (e.axis === 'z' ? k * len * 0.25 : 0);
        ped.cyl(1, 1.1, 0.7, 8, 0xa98467, px, 0.09, pz);
        ped.ico(0.9, 0x6ab04c, px, 1.2, pz, { jitter: 0.3 });
        this.city.collision.addCircle({ x: px, z: pz, r: 1.1 });
      }
    }
    if (ped.parts.length) {
      const m = new THREE.Mesh(ped.build(), this.mat);
      m.receiveShadow = true;
      this.group.add(m);
    }
    // новые остановки
    const st = sim.transport.stops.filter((s) => s.added);
    if (st.length) {
      const im = new THREE.InstancedMesh(geo('stop'), this.mat, st.length);
      st.forEach((s, i) => {
        const e = sim.world.edges[s.place.edge];
        const p = sim.world.pointOn(e.id, s.place.t, s.place.side * 7.4);
        const ry = (e.axis === 'x' ? 0 : Math.PI / 2) + (s.place.side * (e.axis === 'x' ? 1 : -1) > 0 ? Math.PI : 0);
        q.setFromAxisAngle(up, ry);
        mx.compose(new THREE.Vector3(p.x, 0.16, p.z), q, one);
        im.setMatrixAt(i, mx);
      });
      im.castShadow = true;
      this.group.add(im);
    }
    this.ver = sim.world.version;
  }

  update(night: number) {
    if (this.sim.world.version !== this.ver) this.rebuild();
    this.lampMat.color.set(night > 0.35 ? 0xfff1c1 : 0x777777);
  }
}
