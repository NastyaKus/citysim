// Деревья, фонари, светофоры, снеговики и прочие анимированные детали.
import * as THREE from 'three';
import { GB, lowpolyMaterial } from './lowpoly';
import type { TreeSpec, LampSpec, DynSpec, TreeKind } from './buildCtx';
import { TREE_GREENS, TREE_AUTUMN, TREE_SPRING, PINE_GREENS } from './palette';
import type { Sim } from '../sim/sim';
import type { CityMeshes } from './city';
import { RNG } from '../sim/rng';
import { Particles } from './particles';

const KINDS: TreeKind[] = ['round', 'pine', 'birch', 'bush', 'willow', 'poplar'];

function treeGeos(kind: TreeKind): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry; cap: THREE.BufferGeometry } {
  const t = new GB(), c = new GB(), s = new GB();
  switch (kind) {
    case 'round':
      t.cyl(0.18, 0.28, 2.4, 5, 0x7a5232, 0, 0, 0);
      c.ico(1.7, 0xffffff, 0, 3.4, 0, { jitter: 0.5, seed: 1 });
      c.ico(1.1, 0xeeeeee, 0.9, 2.8, 0.4, { jitter: 0.3, seed: 2 });
      s.dome(1.45, 0xffffff, 0, 4.35, 0);
      break;
    case 'pine':
      t.cyl(0.15, 0.22, 1.2, 5, 0x6b4226, 0, 0, 0);
      c.cone(1.8, 2.4, 7, 0xffffff, 0, 1, 0);
      c.cone(1.4, 2.2, 7, 0xf0f0f0, 0, 2.5, 0);
      c.cone(1, 2, 7, 0xffffff, 0, 3.9, 0);
      s.cone(0.75, 1.1, 7, 0xffffff, 0, 4.85, 0);
      s.cone(1.45, 0.6, 7, 0xffffff, 0, 2.4, 0);
      break;
    case 'birch':
      t.cyl(0.14, 0.18, 3, 5, 0xf3f0e6, 0, 0, 0);
      t.box(0.3, 0.1, 0.3, 0x222222, 0, 1, 0);
      t.box(0.3, 0.1, 0.3, 0x222222, 0, 2, 0);
      c.ico(1.3, 0xffffff, 0, 3.8, 0, { jitter: 0.4, seed: 3 });
      c.ico(0.9, 0xf2f2f2, -0.5, 3.1, 0.3, { jitter: 0.3, seed: 4 });
      s.dome(1.1, 0xffffff, 0, 4.5, 0);
      break;
    case 'bush':
      c.ico(1, 0xffffff, 0, 0.7, 0, { jitter: 0.35, seed: 5 });
      c.ico(0.7, 0xf2f2f2, 0.6, 0.5, 0.2, { jitter: 0.25, seed: 6 });
      s.dome(0.85, 0xffffff, 0, 1.15, 0);
      break;
    case 'willow': {
      t.cyl(0.25, 0.4, 2.6, 5, 0x6b4f3a, 0, 0, 0);
      const g = new THREE.DodecahedronGeometry(2, 0);
      g.scale(1.25, 0.9, 1.25);
      c.add(g, 0xffffff, 0, 3.6, 0, { jitter: 0.4, seed: 7 });
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; c.cone(0.5, 2.2, 4, 0xe8e8e8, Math.cos(a) * 1.9, 1.3, Math.sin(a) * 1.9, { rx: Math.PI }); }
      s.dome(2, 0xffffff, 0, 4.6, 0);
      break;
    }
    case 'poplar': {
      t.cyl(0.15, 0.22, 1.6, 5, 0x7a5232, 0, 0, 0);
      const g = new THREE.IcosahedronGeometry(1, 0);
      g.scale(1, 2.6, 1);
      c.add(g, 0xffffff, 0, 3.8, 0, { jitter: 0.25, seed: 8 });
      s.dome(0.7, 0xffffff, 0, 5.8, 0);
      break;
    }
  }
  return { trunk: t.build(), crown: c.build(), cap: s.build() };
}

function addSway(mat: THREE.Material, uniforms: { uTime: { value: number }; uWind: { value: number } }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uWind = uniforms.uWind;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        float sway = (sin(uTime * (1.3 + uWind * 2.0) + ph) + 0.4 * sin(uTime * 3.1 + ph * 2.0)) * uWind * 0.06 * max(position.y - 0.8, 0.0);
        transformed.x += sway;
        transformed.z += sway * 0.6;
      #endif`,
    );
  };
}

export class Props {
  group = new THREE.Group();
  uniforms = { uTime: { value: 0 }, uWind: { value: 0.2 } };
  private crowns: { mesh: THREE.InstancedMesh; specs: TreeSpec[]; kind: TreeKind }[] = [];
  private caps: THREE.Material[] = [];
  private season = '';
  private lampHeads!: THREE.InstancedMesh;
  private pools!: THREE.InstancedMesh;
  private lampState = new Uint8Array(0);
  private lightHeads!: THREE.InstancedMesh;
  private crane?: THREE.Object3D;
  private construction?: { mesh: THREE.Mesh; b: number; maxH: number; scaffold: THREE.Mesh };
  private flags: { mesh: THREE.Mesh; base: Float32Array }[] = [];
  private ducks?: { mesh: THREE.InstancedMesh; cx: number; cz: number; r: number };
  private fountains: { mesh: THREE.Mesh; s: number }[] = [];
  private floodlights: THREE.Mesh[] = [];
  private snowmen!: THREE.InstancedMesh;
  private chimneys: DynSpec[] = [];
  private rng = new RNG(8);
  readonly smoke: Particles;

  constructor(private sim: Sim, private city: CityMeshes) {
    this.smoke = new Particles(3000, 'smoke');
    this.group.add(this.smoke.points);
    this.buildTrees(city.trees);
    this.buildLamps(city.lamps);
    this.buildTrafficLights();
    this.buildDyn(city.dyn);
    this.buildSnowmen();
  }

  private buildTrees(specs: TreeSpec[]) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const kind of KINDS) {
      const list = specs.filter((t) => t.kind === kind);
      if (!list.length) continue;
      const g = treeGeos(kind);
      const trunkMat = lowpolyMaterial();
      const crownMat = lowpolyMaterial();
      addSway(crownMat, this.uniforms);
      const capMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0, flatShading: true });
      addSway(capMat, this.uniforms);
      this.caps.push(capMat);
      const trunk = new THREE.InstancedMesh(g.trunk, trunkMat, list.length);
      const crown = new THREE.InstancedMesh(g.crown, crownMat, list.length);
      const cap = new THREE.InstancedMesh(g.cap, capMat, list.length);
      list.forEach((t, i) => {
        q.setFromAxisAngle(up, (t.x * 13.7 + t.z * 7.1) % (Math.PI * 2));
        p.set(t.x, t.y ?? 0, t.z);
        s.setScalar(t.s);
        m.compose(p, q, s);
        trunk.setMatrixAt(i, m);
        crown.setMatrixAt(i, m);
        cap.setMatrixAt(i, m);
      });
      for (const mesh of [trunk, crown]) { mesh.castShadow = true; mesh.receiveShadow = true; }
      if (kind === 'bush') trunk.count = 0;
      this.group.add(trunk, crown, cap);
      this.crowns.push({ mesh: crown, specs: list, kind });
    }
    this.applySeason();
  }

  applySeason() {
    const season = this.sim.params.season;
    if (season === this.season) return;
    this.season = season;
    const c = new THREE.Color();
    for (const { mesh, specs, kind } of this.crowns) {
      specs.forEach((t, i) => {
        const h = Math.abs(Math.sin(t.x * 12.9898 + t.z * 78.233)) % 1;
        let pal = TREE_GREENS;
        if (kind === 'pine') pal = PINE_GREENS;
        else if (season === 'autumn') pal = h < 0.25 ? TREE_GREENS : TREE_AUTUMN;
        else if (season === 'spring') pal = TREE_SPRING;
        c.set(pal[Math.floor(h * 997) % pal.length]);
        if (season === 'winter' && kind !== 'pine') c.set(0x9c8f80).lerp(new THREE.Color(0xd8d4cc), h * 0.5);
        if (season === 'summer') c.multiplyScalar(0.9);
        mesh.setColorAt(i, c);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private buildLamps(lamps: LampSpec[]) {
    const head = new THREE.BoxGeometry(0.9, 0.3, 0.6);
    this.lampHeads = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: 0xffffff }), lamps.length);
    const pool = new THREE.CircleGeometry(3.8, 12);
    pool.rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(pool, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), lamps.length);
    const m = new THREE.Matrix4();
    lamps.forEach((l, i) => {
      m.makeTranslation(l.x, l.h, l.z);
      this.lampHeads.setMatrixAt(i, m);
      m.makeTranslation(l.x, 0.2, l.z);
      this.pools.setMatrixAt(i, m);
      this.lampHeads.setColorAt(i, new THREE.Color(0x777777));
      this.pools.setColorAt(i, new THREE.Color(0x000000));
    });
    this.pools.renderOrder = 3;
    this.lampState = new Uint8Array(lamps.length).fill(2);
    this.group.add(this.lampHeads, this.pools);
  }

  private buildTrafficLights() {
    const heads = this.city.lightHeads;
    const g = new THREE.SphereGeometry(0.28, 6, 4);
    this.lightHeads = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), heads.length);
    const m = new THREE.Matrix4();
    heads.forEach((h, i) => { m.makeTranslation(h.pos.x, h.pos.y, h.pos.z); this.lightHeads.setMatrixAt(i, m); this.lightHeads.setColorAt(i, new THREE.Color(0x00ff00)); });
    this.group.add(this.lightHeads);
  }

  private buildDyn(dyn: DynSpec[]) {
    const mat = lowpolyMaterial();
    for (const d of dyn) {
      if (d.kind === 'crane') {
        const mast = new GB();
        for (let k = 0; k < 9; k++) mast.box(1.2, 2.6, 1.2, k % 2 ? 0xf4d35e : 0xe9b949, 0, k * 2.6, 0);
        mast.box(2.4, 1.6, 2.4, 0x555555, 0, 0, 0);
        const mm = new THREE.Mesh(mast.build(), mat);
        mm.position.set(d.x, 0, d.z);
        mm.castShadow = true;
        const jibG = new GB();
        jibG.box(20, 0.9, 0.9, 0xf4d35e, 6, 0, 0);
        jibG.box(4, 1.6, 1.6, 0x555555, -4, -0.3, 0);
        jibG.box(2, 2, 2, 0xffffff, 0, 0.9, 0);
        jibG.box(0.1, 6, 0.1, 0x333333, 12, -6, 0);
        jibG.box(1.4, 0.8, 1.4, 0xa97c50, 12, -6.6, 0);
        const jib = new THREE.Mesh(jibG.build(), mat);
        jib.position.set(d.x, 23.4, d.z);
        jib.castShadow = true;
        this.crane = jib;
        this.group.add(mm, jib);
      } else if (d.kind === 'construction') {
        const b = this.sim.world.buildings[d.b];
        const g = new GB();
        g.box(b.w - 6, 1, b.d - 8, 0xc9c3b6, 0, 0, 0);
        const mesh = new THREE.Mesh(g.build(), mat);
        mesh.position.set(d.x, d.y, d.z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        const sg = new GB();
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1]]) sg.box(0.15, 1, 0.15, 0x8d99ae, x * (b.w - 5) / 2, 0, z * (b.d - 7) / 2);
        sg.box(b.w - 5, 0.1, 0.15, 0x8d99ae, 0, 0.95, (b.d - 7) / 2);
        sg.box(b.w - 5, 0.1, 0.15, 0x8d99ae, 0, 0.95, -(b.d - 7) / 2);
        const scaffold = new THREE.Mesh(sg.build(), mat);
        scaffold.position.set(d.x, d.y, d.z);
        this.construction = { mesh, b: d.b, maxH: (d.s ?? 10) * 3.2, scaffold };
        this.group.add(mesh, scaffold);
      } else if (d.kind === 'flag') {
        const g = new THREE.PlaneGeometry(1.8, 1.2, 6, 3);
        const cols: number[] = [];
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const c = new THREE.Color(y > 0.2 ? 0xffffff : y > -0.2 ? 0x1c57d6 : 0xd52b1e);
          cols.push(c.r, c.g, c.b);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        mesh.position.set(d.x, d.y, d.z);
        mesh.rotation.y = d.ry;
        this.flags.push({ mesh, base: Float32Array.from(pos.array as Float32Array) });
        this.group.add(mesh);
      } else if (d.kind === 'ducks') {
        const g = new GB();
        g.box(0.7, 0.4, 0.4, 0xffffff, 0, 0, 0);
        g.box(0.3, 0.35, 0.3, 0x2d6a4f, 0.35, 0.35, 0);
        g.box(0.2, 0.08, 0.12, 0xf4a261, 0.55, 0.45, 0);
        const mesh = new THREE.InstancedMesh(g.build(), mat, 7);
        this.ducks = { mesh, cx: d.x, cz: d.z, r: d.s ?? 7 };
        this.group.add(mesh);
      } else if (d.kind === 'fountain') {
        const g = new THREE.ConeGeometry(0.5 * (d.s ?? 1), 2.4 * (d.s ?? 1), 8, 1, true);
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.55, depthWrite: false }));
        mesh.position.set(d.x, d.y + 1.2 * (d.s ?? 1), d.z);
        mesh.rotation.x = Math.PI;
        this.fountains.push({ mesh, s: d.s ?? 1 });
        this.group.add(mesh);
      } else if (d.kind === 'chimney') {
        this.chimneys.push(d);
      } else if (d.kind === 'floodlight') {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.1), new THREE.MeshBasicMaterial({ color: 0x777777 }));
        mesh.position.set(d.x, d.y, d.z);
        mesh.lookAt(this.sim.world.buildings[d.b].x, 0, this.sim.world.buildings[d.b].z);
        this.floodlights.push(mesh);
        this.group.add(mesh);
      }
    }
  }

  private buildSnowmen() {
    const g = new GB();
    g.ico(0.9, 0xffffff, 0, 0.8, 0, { jitter: 0.1 }, 1);
    g.ico(0.65, 0xffffff, 0, 2, 0, { jitter: 0.08 }, 1);
    g.ico(0.45, 0xffffff, 0, 2.9, 0, { jitter: 0.05 }, 1);
    g.cone(0.08, 0.5, 4, 0xf77f00, 0, 2.85, 0.6, { rx: Math.PI / 2 });
    g.cyl(0.32, 0.32, 0.5, 6, 0x222222, 0, 3.25, 0);
    g.box(0.06, 0.06, 0.04, 0x111111, -0.15, 3.05, 0.42);
    g.box(0.06, 0.06, 0.04, 0x111111, 0.15, 3.05, 0.42);
    g.box(0.08, 0.9, 0.08, 0x6b4226, 0.7, 1.9, 0, { rz: 1 });
    g.box(1.3, 0.16, 0.16, 0xe63946, 0, 2.4, 0);
    this.snowmen = new THREE.InstancedMesh(g.build(), lowpolyMaterial(), 50);
    this.snowmen.count = 0;
    this.snowmen.castShadow = true;
    this.group.add(this.snowmen);
  }

  update(dt: number, time: number, night: number) {
    const sim = this.sim;
    const w = sim.weather;
    this.uniforms.uTime.value = time;
    this.uniforms.uWind.value = sim.params.treeSway ? 0.15 + w.wind * 1.4 : 0;
    this.applySeason();
    const capOp = Math.min(1, w.snowCover * 1.3);
    for (const m of this.caps) (m as THREE.MeshLambertMaterial).opacity = capOp;

    // фонари: включаются в сумерках, гаснут при отключении света
    const lamps = this.city.lamps;
    const c = new THREE.Color();
    let changed = false;
    for (let i = 0; i < lamps.length; i++) {
      const on = night > 0.35 && !sim.outages.has(lamps[i].district) ? 1 : 0;
      if (this.lampState[i] === on) continue;
      this.lampState[i] = on;
      changed = true;
      this.lampHeads.setColorAt(i, c.set(on ? 0xfff1c1 : 0x6d6d6d));
      this.pools.setColorAt(i, c.set(on ? 0x3d321c : 0x000000));
    }
    if (changed) { this.lampHeads.instanceColor!.needsUpdate = true; this.pools.instanceColor!.needsUpdate = true; }

    // светофоры
    const heads = this.city.lightHeads;
    const t = sim.clock.total;
    const blink = Math.floor(time * 2) % 2 === 0;
    for (let i = 0; i < heads.length; i++) {
      const st = sim.transport.light(heads[i].node, heads[i].axis, t);
      const dist = sim.outages.size && sim.transport.lightsBroken.has(heads[i].node);
      c.set(st === 'green' ? 0x3dff6e : st === 'yellow' ? 0xffd23f : st === 'red' ? 0xff3b30 : blink && !dist ? 0xffb703 : 0x333333);
      this.lightHeads.setColorAt(i, c);
    }
    this.lightHeads.instanceColor!.needsUpdate = true;

    // кран
    if (this.crane) {
      const b = this.construction ? sim.world.buildings[this.construction.b] : null;
      const working = b && b.inside.size > 0;
      if (working) this.crane.rotation.y += dt * 0.15 * Math.sin(time * 0.1 + 1);
    }
    if (this.construction) {
      const b = sim.world.buildings[this.construction.b];
      const h = Math.max(1, b.growth * this.construction.maxH);
      this.construction.mesh.scale.y = h;
      this.construction.scaffold.scale.y = h + 1.5;
      this.construction.scaffold.visible = b.growth < 1;
    }
    // флаги
    for (const f of this.flags) {
      const pos = f.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = f.base[i * 3];
        pos.setZ(i, Math.sin(time * (3 + w.wind * 6) + x * 2.5) * 0.18 * (x + 0.9) * (0.4 + w.wind));
      }
      pos.needsUpdate = true;
    }
    // утки
    if (this.ducks) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      const frozen = w.temp < -3;
      for (let i = 0; i < 7; i++) {
        const a = time * 0.05 * (1 + i * 0.13) + i * 0.9;
        const r = this.ducks.r * (0.35 + 0.6 * ((i * 0.37) % 1));
        const x = this.ducks.cx + Math.cos(a) * r, z = this.ducks.cz + Math.sin(a) * r * 0.9;
        q.setFromAxisAngle(up, -a - Math.PI);
        m.compose(new THREE.Vector3(x, 0.18 + Math.sin(time * 2 + i) * 0.03, z), q, new THREE.Vector3(1, 1, 1));
        this.ducks.mesh.setMatrixAt(i, m);
      }
      this.ducks.mesh.count = frozen ? 0 : 7;
      this.ducks.mesh.instanceMatrix.needsUpdate = true;
    }
    // фонтаны (зимой выключены)
    for (const f of this.fountains) {
      f.mesh.visible = w.temp > 1;
      f.mesh.scale.y = 1 + Math.sin(time * 4) * 0.08;
    }
    // прожекторы стадиона
    const stadium = sim.world.byType.get('stadium')?.[0];
    const floodOn = night > 0.3 && !!stadium && stadium.inside.size > 3;
    for (const f of this.floodlights) (f.material as THREE.MeshBasicMaterial).color.set(floodOn ? 0xffffff : 0x777777);
    // дым из труб
    for (const ch of this.chimneys) {
      const b = sim.world.buildings[ch.b];
      const active = b.type === 'factory' ? !b.closedReason && b.inside.size > 3 : b.inside.size > 0 || this.rng.chance(0.2);
      if (!active || b.powerOut) continue;
      const rate = (ch.s ?? 1) * (b.type === 'factory' ? 18 : 4);
      this.smoke.emit(dt * rate, ch.x, ch.y, ch.z, b.type === 'factory' ? 0xd9d9d9 : 0xeeeeee, 1.2 * (ch.s ?? 1), w);
    }
    this.smoke.update(dt, w.wind);
    // снеговики
    const sm = sim.snowmen;
    const mm = new THREE.Matrix4();
    for (let i = 0; i < Math.min(50, sm.length); i++) {
      const s = sm[i];
      const k = s.size * Math.min(1, 0.15 + (sim.clock.total - s.built) / 45);
      mm.compose(new THREE.Vector3(s.x, 0, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.x), new THREE.Vector3(k, k, k));
      this.snowmen.setMatrixAt(i, mm);
    }
    this.snowmen.count = Math.min(50, sm.length);
    this.snowmen.instanceMatrix.needsUpdate = true;
  }
}
