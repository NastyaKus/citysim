// Рендер жителей и транспорта через InstancedMesh.
import * as THREE from 'three';
import { GB, lowpolyMaterial } from './lowpoly';
import type { Sim } from '../sim/sim';
import type { Citizen } from '../sim/citizen';
import type { Vehicle, VehicleType } from '../sim/transport';
import { VEHICLE_INFO } from '../sim/transport';

const MAXP = 1400;
const tmp = new THREE.Matrix4();
const base = new THREE.Matrix4();
const loc = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();

function geoBox(w: number, h: number, d: number, y: number, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y, z);
  return g;
}

type PartName = 'torso' | 'head' | 'hair' | 'longhair' | 'legL' | 'legR' | 'armL' | 'armR' | 'hat' | 'umbrella' | 'scarf' | 'bike' | 'dog' | 'bag' | 'stroller';

export class Agents {
  group = new THREE.Group();
  parts = {} as Record<PartName, THREE.InstancedMesh>;
  pickIndex: number[] = []; // instance -> citizen id
  private phase = new Float32Array(4000);
  private dogPos = new Map<number, { x: number; z: number; a: number }>();
  // транспорт
  private vMeshes = new Map<VehicleType, { body: THREE.InstancedMesh; lights: THREE.InstancedMesh; ids: number[] }>();
  private markers: THREE.InstancedMesh;
  private beams: THREE.InstancedMesh;
  private heading = new Map<number, number>();
  vehicleAt = new Map<THREE.Object3D, number[]>();

  constructor(private sim: Sim) {
    const mat = lowpolyMaterial({ roughness: 0.8 });
    const add = (name: PartName, g: THREE.BufferGeometry, m: THREE.Material = mat, count = MAXP) => {
      const im = new THREE.InstancedMesh(g, m, count);
      im.count = 0;
      im.castShadow = name !== 'umbrella' ? true : false;
      im.frustumCulled = false;
      this.parts[name] = im;
      this.group.add(im);
      return im;
    };
    const flat = (g: THREE.BufferGeometry) => {
      const n = g.index ? g.toNonIndexed() : g;
      n.computeVertexNormals();
      n.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 3).fill(1), 3));
      return n;
    };
    const torso = new THREE.CylinderGeometry(0.22, 0.26, 0.62, 6);
    torso.translate(0, 1.13, 0);
    add('torso', flat(torso));
    add('head', flat(new THREE.IcosahedronGeometry(0.2, 0).translate(0, 1.62, 0)));
    const hair = new THREE.IcosahedronGeometry(0.215, 0);
    hair.scale(1, 0.6, 1.05);
    hair.translate(0, 1.71, -0.02);
    add('hair', flat(hair));
    add('longhair', flat(geoBox(0.36, 0.42, 0.1, 1.5, -0.16)));
    add('legL', flat(geoBox(0.16, 0.8, 0.18, -0.4)), mat, MAXP);
    add('legR', flat(geoBox(0.16, 0.8, 0.18, -0.4)), mat, MAXP);
    add('armL', flat(geoBox(0.11, 0.6, 0.13, -0.3)), mat, MAXP);
    add('armR', flat(geoBox(0.11, 0.6, 0.13, -0.3)), mat, MAXP);
    const hat = new GB();
    hat.cyl(0.2, 0.22, 0.2, 7, 0xffffff, 0, 1.74, 0);
    hat.ico(0.07, 0xffffff, 0, 1.98, 0);
    add('hat', hat.build());
    const scarf = new THREE.CylinderGeometry(0.2, 0.22, 0.12, 7);
    scarf.translate(0, 1.47, 0);
    add('scarf', flat(scarf));
    const umb = new GB();
    umb.cone(0.95, 0.4, 8, 0xffffff, 0, 2.15, 0);
    umb.cyl(0.02, 0.02, 1, 4, 0x333333, 0, 1.3, 0);
    add('umbrella', umb.build());
    const bike = new GB();
    bike.torus(0.36, 0.05, 0x222222, 0, 0.38, 0.55, { ry: Math.PI / 2 });
    bike.torus(0.36, 0.05, 0x222222, 0, 0.38, -0.55, { ry: Math.PI / 2 });
    bike.box(0.06, 0.06, 1.1, 0xffffff, 0, 0.6, 0, { rx: 0.15 });
    bike.box(0.06, 0.5, 0.06, 0xffffff, 0, 0.45, -0.1);
    bike.box(0.06, 0.55, 0.06, 0xffffff, 0, 0.5, 0.5, { rx: -0.3 });
    bike.box(0.5, 0.05, 0.05, 0x333333, 0, 1.02, 0.42);
    bike.box(0.2, 0.06, 0.3, 0x222222, 0, 0.82, -0.2);
    add('bike', bike.build(), mat, 400);
    const dog = new GB();
    dog.box(0.32, 0.3, 0.7, 0xffffff, 0, 0.3, 0);
    dog.box(0.28, 0.28, 0.32, 0xffffff, 0, 0.55, 0.42);
    dog.box(0.14, 0.1, 0.14, 0x222222, 0, 0.6, 0.62);
    dog.box(0.08, 0.14, 0.08, 0xdddddd, 0.1, 0.8, 0.38);
    dog.box(0.08, 0.14, 0.08, 0xdddddd, -0.1, 0.8, 0.38);
    for (const [x, z] of [[0.11, 0.25], [-0.11, 0.25], [0.11, -0.25], [-0.11, -0.25]]) dog.box(0.08, 0.3, 0.08, 0xeeeeee, x, 0, z);
    dog.box(0.06, 0.06, 0.3, 0xffffff, 0, 0.55, -0.45, { rx: -0.6 });
    add('dog', dog.build(), mat, 300);
    const st = new GB();
    st.box(0.55, 0.38, 0.8, 0xffffff, 0, 0.42, 0);
    st.dome(0.32, 0xffffff, 0, 0.8, -0.18, { rx: -0.6 });
    st.box(0.05, 0.05, 0.5, 0x333333, 0.22, 0.95, -0.55, { rx: -0.7 });
    st.box(0.05, 0.05, 0.5, 0x333333, -0.22, 0.95, -0.55, { rx: -0.7 });
    st.box(0.5, 0.05, 0.05, 0x333333, 0, 1.12, -0.74);
    for (const [x, z] of [[0.26, 0.28], [-0.26, 0.28], [0.26, -0.28], [-0.26, -0.28]]) st.cyl(0.13, 0.13, 0.05, 8, 0x222222, x, 0.06, z, { rz: Math.PI / 2 });
    add('stroller', st.build(), mat, 200);
    this.parts.umbrella.material = lowpolyMaterial({ side: THREE.DoubleSide });

    // транспорт
    const vmat = lowpolyMaterial({ roughness: 0.55, metalness: 0.15 });
    const lmat = new THREE.MeshBasicMaterial({ vertexColors: true });
    for (const t of Object.keys(VEHICLE_INFO) as VehicleType[]) {
      const [body, lights] = vehicleGeo(t);
      const cap = t === 'bus' ? 40 : ['sedan', 'hatch', 'suv', 'taxi', 'through'].includes(t) ? 160 : 60;
      const bm = new THREE.InstancedMesh(body, vmat, cap);
      bm.castShadow = true;
      bm.receiveShadow = true;
      bm.count = 0;
      bm.frustumCulled = false;
      const lm = new THREE.InstancedMesh(lights, lmat.clone(), cap);
      lm.count = 0;
      lm.frustumCulled = false;
      this.group.add(bm, lm);
      this.vMeshes.set(t, { body: bm, lights: lm, ids: [] });
    }
    const mk = new THREE.IcosahedronGeometry(0.2, 0);
    this.markers = new THREE.InstancedMesh(mk, new THREE.MeshBasicMaterial({ color: 0xffffff }), 600);
    this.markers.count = 0;
    this.markers.frustumCulled = false;
    this.group.add(this.markers);
    const beam = new THREE.BufferGeometry();
    beam.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 4, 0, 11, -1, 0, 0, 4, 0, 11, -4, 0, 11], 3));
    beam.computeVertexNormals();
    this.beams = new THREE.InstancedMesh(beam, new THREE.MeshBasicMaterial({ color: 0x8a7a50, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 400);
    this.beams.count = 0;
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 3;
    this.group.add(this.beams);
  }

  private visible(c: Citizen) {
    return c.alive && (c.state === 'walk' || c.state === 'bike' || c.state === 'waitBus' || c.state === 'waitTaxi' || c.state === 'outdoor');
  }

  update(dt: number, gdt: number, time: number, night: number) {
    const sim = this.sim;
    const w = sim.weather;
    const raining = (w.raining || w.def.precip === 'hail') && w.intensity > 0.15;
    const cold = w.temp < 3;
    const P = this.parts;
    let n = 0, nb = 0, nd = 0, nhair = 0, nlong = 0, nhat = 0, nu = 0, ns = 0, nst = 0;
    const maxP = Math.min(MAXP, sim.params.maxVisible);
    this.pickIndex.length = 0;
    for (const c of sim.citizens) {
      if (!this.visible(c)) continue;
      if (n >= maxP) break;
      const act = c.act?.id;
      const cycling = c.state === 'bike' || (c.state === 'outdoor' && act === 'bike_ride' && c.moving > 0.1);
      const sitting = !c.trip && c.state === 'outdoor' && (act === 'bench' || act === 'picnic');
      const jumping = !c.trip && c.state === 'outdoor' && (act === 'concert' || act === 'match' || act === 'rave' || act === 'festival' || act === 'wedding');
      const h = c.look.height;
      // фаза шага
      const sp = c.moving;
      if (sp > 0.05) this.phase[c.id] += Math.min(14, sp * 1.6) * dt * (cycling ? 0.8 : 1);
      const ph = this.phase[c.id];
      const swing = sp > 0.05 && !cycling ? Math.sin(ph) * Math.min(0.75, 0.25 + sp * 0.07) : 0;
      let y = 0;
      if (jumping) y = Math.max(0, Math.sin(time * 6 + c.id)) * 0.25;
      if (sitting) y = -0.35;
      if (cycling) y = 0.35;
      const ry = Math.atan2(c.dirX, c.dirZ);
      q.setFromAxisAngle(up, ry);
      v3.set(c.x, y, c.z);
      s3.set(h, h, h);
      base.compose(v3, q, s3);
      P.torso.setMatrixAt(n, base);
      P.torso.setColorAt(n, col.set(c.look.shirt));
      P.head.setMatrixAt(n, base);
      P.head.setColorAt(n, col.set(c.look.skin));
      // ноги
      const legSet = (mesh: THREE.InstancedMesh, side: number, ang: number) => {
        loc.makeRotationX(ang);
        loc.setPosition(side * 0.11, 0.82, 0);
        tmp.multiplyMatrices(base, loc);
        mesh.setMatrixAt(n, tmp);
        mesh.setColorAt(n, col.set(c.look.pants));
      };
      if (cycling) { legSet(P.legL, 1, -1 + Math.sin(ph * 1.4) * 0.5); legSet(P.legR, -1, -1 - Math.sin(ph * 1.4) * 0.5); }
      else if (sitting) { legSet(P.legL, 1, -1.45); legSet(P.legR, -1, -1.45); }
      else { legSet(P.legL, 1, swing); legSet(P.legR, -1, -swing); }
      // руки
      const armSet = (mesh: THREE.InstancedMesh, side: number, ang: number, roll = 0) => {
        loc.makeRotationFromEuler(new THREE.Euler(ang, 0, roll));
        loc.setPosition(side * 0.31, 1.42, 0);
        tmp.multiplyMatrices(base, loc);
        mesh.setMatrixAt(n, tmp);
        mesh.setColorAt(n, col.set(c.look.shirt));
      };
      const umbrella = raining && !cycling && (c.state === 'walk' || c.state === 'waitBus' || c.state === 'waitTaxi' || c.state === 'outdoor');
      if (jumping && Math.sin(time * 3 + c.id) > 0.3) { armSet(P.armL, 1, Math.PI * 0.9); armSet(P.armR, -1, Math.PI * 0.9); }
      else if (cycling || act === 'stroller' || c.trip?.act.id === 'stroller') { armSet(P.armL, 1, -1.05); armSet(P.armR, -1, -1.05); }
      else if (act === 'snowman' && !c.trip) { armSet(P.armL, 1, -1.2 + Math.sin(time * 4) * 0.4); armSet(P.armR, -1, -1.2 - Math.sin(time * 4) * 0.4); }
      else if (umbrella) { armSet(P.armL, 1, -swing * 0.8); armSet(P.armR, -1, -1.9); }
      else { armSet(P.armL, 1, -swing * 0.9); armSet(P.armR, -1, swing * 0.9); }
      // волосы, шапка, шарф
      if (c.look.hairStyle !== 4) { P.hair.setMatrixAt(nhair, base); P.hair.setColorAt(nhair, col.set(c.look.hair)); nhair++; }
      if (c.look.hairStyle === 2 || c.look.hairStyle === 3) { P.longhair.setMatrixAt(nlong, base); P.longhair.setColorAt(nlong, col.set(c.look.hair)); nlong++; }
      if ((c.look.hat || cold) && !umbrella) { P.hat.setMatrixAt(nhat, base); P.hat.setColorAt(nhat, col.set(c.look.hat || c.look.scarf)); nhat++; }
      if (cold) { P.scarf.setMatrixAt(ns, base); P.scarf.setColorAt(ns, col.set(c.look.scarf)); ns++; }
      if (umbrella) { P.umbrella.setMatrixAt(nu, base); P.umbrella.setColorAt(nu, col.set(c.look.umbrella)); nu++; }
      if (cycling && nb < 400) {
        v3.set(c.x, 0, c.z);
        s3.set(1, 1, 1);
        tmp.compose(v3, q, s3);
        P.bike.setMatrixAt(nb, tmp);
        P.bike.setColorAt(nb, col.set(c.look.shirt).lerp(new THREE.Color(0x555555), 0.4));
        nb++;
      }
      // коляска перед родителем
      if ((act === 'stroller' || c.trip?.act.id === 'stroller') && nst < 200) {
        v3.set(c.x + c.dirX * 0.95, 0, c.z + c.dirZ * 0.95);
        s3.set(1, 1, 1);
        tmp.compose(v3, q, s3);
        P.stroller.setMatrixAt(nst, tmp);
        P.stroller.setColorAt(nst, col.set(c.look.umbrella));
        nst++;
      }
      // собака
      const withDog = c.hasDog && !c.dogLost && (act === 'dogwalk' || c.trip?.act.id === 'dogwalk' || (c.trip && act === 'dogwalk'));
      if (withDog && nd < 300) {
        let d = this.dogPos.get(c.id);
        const tx = c.x + c.dirZ * 0.9 - c.dirX * 1.1, tz = c.z - c.dirX * 0.9 - c.dirZ * 1.1;
        if (!d) { d = { x: tx, z: tz, a: ry }; this.dogPos.set(c.id, d); }
        const k = Math.min(1, gdt * 3 + dt * 2);
        const dx = tx - d.x, dz = tz - d.z;
        d.x += dx * k; d.z += dz * k;
        if (Math.hypot(dx, dz) > 0.05) d.a = Math.atan2(dx, dz);
        q.setFromAxisAngle(up, d.a);
        v3.set(d.x, Math.abs(Math.sin(ph * 1.5)) * 0.06, d.z);
        s3.set(1, 1, 1);
        tmp.compose(v3, q, s3);
        P.dog.setMatrixAt(nd, tmp);
        P.dog.setColorAt(nd, col.set(c.dogColor));
        nd++;
      }
      this.pickIndex.push(c.id);
      n++;
    }
    const counts: [PartName, number][] = [['torso', n], ['head', n], ['legL', n], ['legR', n], ['armL', n], ['armR', n], ['hair', nhair], ['longhair', nlong], ['hat', nhat], ['scarf', ns], ['umbrella', nu], ['bike', nb], ['dog', nd], ['stroller', nst]];
    for (const [k, cnt] of counts) {
      const m = P[k];
      m.count = cnt;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.updateVehicles(dt, time, night);
  }

  private updateVehicles(dt: number, time: number, night: number) {
    const sim = this.sim;
    for (const m of this.vMeshes.values()) { m.ids.length = 0; m.body.count = 0; m.lights.count = 0; }
    let nm = 0, nbm = 0;
    const blink = Math.floor(time * 4) % 2 === 0;
    const lightK = 0.35 + night * 0.9;
    for (const v of sim.transport.vehicles) {
      if (v.done) continue;
      const m = this.vMeshes.get(v.type);
      if (!m) continue;
      const i = m.body.count;
      if (i >= m.body.instanceMatrix.count) continue;
      const target = Math.atan2(v.dirX, v.dirZ);
      let a = this.heading.get(v.id) ?? target;
      let d = target - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      a += d * Math.min(1, dt * 7 + 0.05);
      this.heading.set(v.id, a);
      q.setFromAxisAngle(up, a);
      v3.set(v.x, 0, v.z);
      s3.set(1, 1, 1);
      base.compose(v3, q, s3);
      m.body.setMatrixAt(i, base);
      const white = ['police', 'ambulance', 'firetruck', 'taxi', 'garbage', 'plow', 'van'].includes(v.type);
      m.body.setColorAt(i, col.set(white ? 0xffffff : v.color));
      m.lights.setMatrixAt(i, base);
      m.lights.setColorAt(i, col.setScalar(lightK));
      m.ids.push(v.id);
      m.body.count = i + 1;
      m.lights.count = i + 1;
      const len = v.len;
      // мигалки, аварийка, свадебные шарики
      const mark = (x: number, y: number, z: number, c: number) => {
        if (nm >= 600) return;
        loc.makeTranslation(x, y, z);
        tmp.multiplyMatrices(base, loc);
        this.markers.setMatrixAt(nm, tmp);
        this.markers.setColorAt(nm, col.set(c));
        nm++;
      };
      const roof = v.type === 'bus' ? 3 : v.type === 'firetruck' || v.type === 'ambulance' ? 2.9 : 1.75;
      if (v.siren) { mark(0.45, roof, 0.2, blink ? 0xff2020 : 0x330000); mark(-0.45, roof, 0.2, blink ? 0x001133 : 0x2060ff); }
      if (v.hazard && blink) { mark(0.8, 0.8, len / 2, 0xffa500); mark(-0.8, 0.8, len / 2, 0xffa500); mark(0.8, 0.8, -len / 2, 0xffa500); mark(-0.8, 0.8, -len / 2, 0xffa500); }
      if (v.decorated) { mark(0.3, 2, -len / 3, 0xff99c8); mark(-0.3, 2.2, -len / 3, 0xffffff); mark(0, 2.4, -len / 3 - 0.3, 0xff99c8); mark(0, 1.2, len / 2 + 0.1, 0xffffff); }
      if (night > 0.3 && nbm < 400) {
        loc.makeTranslation(0, 0.08, len / 2);
        tmp.multiplyMatrices(base, loc);
        this.beams.setMatrixAt(nbm++, tmp);
      }
    }
    for (const m of this.vMeshes.values()) {
      m.body.instanceMatrix.needsUpdate = true;
      m.lights.instanceMatrix.needsUpdate = true;
      if (m.body.instanceColor) m.body.instanceColor.needsUpdate = true;
      if (m.lights.instanceColor) m.lights.instanceColor.needsUpdate = true;
    }
    this.markers.count = nm;
    this.markers.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
    this.beams.count = nbm;
    this.beams.instanceMatrix.needsUpdate = true;
    (this.beams.material as THREE.MeshBasicMaterial).opacity = 0.45 * night;
    if (this.heading.size > 2000) this.heading.clear();
  }

  /** найти транспорт по клику */
  vehicleFromHit(obj: THREE.Object3D, instance: number): number | undefined {
    for (const m of this.vMeshes.values()) if (m.body === obj) return m.ids[instance];
    return undefined;
  }

  vehicleMeshes() {
    return [...this.vMeshes.values()].map((m) => m.body);
  }
}

// ——— модели машин (вперёд — +Z)
function vehicleGeo(t: VehicleType): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const b = new GB(), l = new GB();
  const glass = 0x2b3a4a, tire = 0x1b1b1b, chrome = 0xd0d0d0;
  const wheels = (wz: number[], r = 0.38, wx = 0.88) => { for (const z of wz) for (const x of [-wx, wx]) b.cyl(r, r, 0.3, 8, tire, x, r - 0.15, z, { rz: Math.PI / 2 }); };
  const heads = (z: number, x = 0.62, y = 0.65) => { l.box(0.4, 0.22, 0.1, 0xfff4c0, x, y, z); l.box(0.4, 0.22, 0.1, 0xfff4c0, -x, y, z); };
  const tails = (z: number, x = 0.65, y = 0.7) => { l.box(0.38, 0.2, 0.1, 0xff2a2a, x, y, z); l.box(0.38, 0.2, 0.1, 0xff2a2a, -x, y, z); };
  switch (t) {
    case 'sedan': case 'taxi': case 'police': {
      b.box(1.9, 0.6, 4.4, 0xffffff, 0, 0.35, 0);
      b.box(1.86, 0.18, 4.3, 0xe8e8e8, 0, 0.95, 0);
      b.box(1.7, 0.62, 2.2, glass, 0, 1.12, -0.2);
      b.box(1.62, 0.1, 2, 0xffffff, 0, 1.74, -0.2);
      b.box(1.95, 0.12, 0.2, chrome, 0, 0.4, 2.2);
      wheels([1.35, -1.35]);
      heads(2.21); tails(-2.21);
      if (t === 'taxi') { b.box(1.92, 0.2, 4.42, 0xffd60a, 0, 0.55, 0); b.box(1.93, 0.1, 4.43, 0x111111, 0, 0.75, 0); for (let i = 0; i < 6; i++) b.box(1.94, 0.1, 0.25, 0xffd60a, 0, 0.75, -1.5 + i * 0.6); b.box(1.86, 0.4, 4.3, 0xffd60a, 0, 0.55, 0); l.box(0.7, 0.25, 0.35, 0xffe066, 0, 1.85, -0.2); }
      if (t === 'police') { b.box(1.93, 0.25, 4.42, 0x1d4ed8, 0, 0.62, 0); b.box(1, 0.15, 0.4, 0x222222, 0, 1.83, 0.2); }
      break;
    }
    case 'hatch':
      b.box(1.8, 0.6, 3.8, 0xffffff, 0, 0.35, 0);
      b.box(1.66, 0.65, 2.3, glass, 0, 0.95, -0.4);
      b.box(1.58, 0.1, 2.2, 0xffffff, 0, 1.6, -0.45);
      wheels([1.15, -1.15], 0.35, 0.84);
      heads(1.91, 0.58); tails(-1.91, 0.6, 0.85);
      break;
    case 'suv':
      b.box(2, 0.85, 4.8, 0xffffff, 0, 0.45, 0);
      b.box(1.88, 0.7, 3, glass, 0, 1.3, -0.4);
      b.box(1.8, 0.12, 2.9, 0xffffff, 0, 2, -0.4);
      b.box(1.5, 0.1, 2.2, 0x333333, 0, 2.12, -0.4);
      wheels([1.5, -1.5], 0.45, 0.9);
      heads(2.41, 0.65, 0.85); tails(-2.41, 0.7, 0.95);
      break;
    case 'pickup':
      b.box(2, 0.75, 5, 0xffffff, 0, 0.45, 0);
      b.box(1.86, 0.75, 1.8, glass, 0, 1.2, 0.9);
      b.box(1.8, 0.12, 1.7, 0xffffff, 0, 1.95, 0.9);
      b.box(2, 0.5, 0.12, 0xffffff, 0, 1.2, -2.45);
      b.box(0.12, 0.5, 2.3, 0xffffff, 0.94, 1.2, -1.3);
      b.box(0.12, 0.5, 2.3, 0xffffff, -0.94, 1.2, -1.3);
      b.box(1.6, 0.3, 1.2, 0x8b5a2b, 0, 1.2, -1.4);
      wheels([1.6, -1.6], 0.45, 0.92);
      heads(2.51, 0.65, 0.8); tails(-2.51, 0.75, 0.85);
      break;
    case 'cabrio':
      b.box(1.9, 0.6, 4.2, 0xffffff, 0, 0.35, 0);
      b.box(1.6, 0.5, 0.1, glass, 0, 0.95, 0.6, { rx: -0.4 });
      b.box(0.6, 0.6, 0.6, 0x5c3a21, 0.4, 0.9, -0.3);
      b.box(0.6, 0.6, 0.6, 0x5c3a21, -0.4, 0.9, -0.3);
      b.box(1.6, 0.25, 1, 0x333333, 0, 0.95, -1.4);
      wheels([1.3, -1.3]);
      heads(2.11); tails(-2.11);
      break;
    case 'bus':
      b.box(2.5, 2.5, 10, 0xffffff, 0, 0.45, 0);
      b.box(2.54, 1, 9.2, glass, 0, 1.55, -0.2);
      b.box(2.4, 1.2, 0.1, glass, 0, 1.4, 5.0);
      b.box(2.3, 0.3, 9.6, 0xd9d9d9, 0, 2.95, 0);
      b.box(1.2, 0.35, 2.2, 0xbbbbbb, 0, 3.25, -2);
      wheels([3.4, -3.2], 0.5, 1.12);
      heads(5.01, 0.85, 0.75); tails(-5.01, 0.95, 0.85);
      l.box(1.6, 0.35, 0.06, 0xffb703, 0, 2.6, 5.03);
      for (let i = 0; i < 6; i++) l.box(0.02, 0.7, 1.2, 0xfff2c2, 1.27, 1.55, -3.8 + i * 1.5), l.box(0.02, 0.7, 1.2, 0xfff2c2, -1.27, 1.55, -3.8 + i * 1.5);
      break;
    case 'truck': case 'van': case 'garbage': case 'plow': {
      const L = VEHICLE_INFO[t].len;
      b.box(2.2, 1.6, 1.9, t === 'plow' ? 0xff8800 : 0xffffff, 0, 0.5, L / 2 - 0.95);
      b.box(2.1, 0.7, 0.1, glass, 0, 1.3, L / 2 + 0.02);
      b.box(0.08, 0.6, 1, glass, 1.11, 1.3, L / 2 - 0.9);
      b.box(0.08, 0.6, 1, glass, -1.11, 1.3, L / 2 - 0.9);
      const cargoC = t === 'garbage' ? 0x2a9d8f : t === 'van' ? 0xf4a261 : t === 'plow' ? 0x666666 : 0xf1f1f1;
      if (t === 'plow') { b.box(2.2, 0.6, L - 2.2, cargoC, 0, 0.5, -1.1); b.box(2.9, 0.9, 0.2, 0xffb703, 0, 0.1, L / 2 + 0.5, { ry: 0.3 }); }
      else b.box(2.3, t === 'garbage' ? 2.2 : 2.5, L - 2.2, cargoC, 0, 0.5, -1.1);
      if (t === 'van') b.box(2.32, 0.4, L - 2.4, 0xffffff, 0, 1.6, -1.1);
      wheels([L / 2 - 1, -L / 2 + 1.2], 0.5, 1.02);
      heads(L / 2 + 0.01, 0.8, 0.8); tails(-L / 2 + 0.05, 0.9, 0.8);
      if (t === 'garbage' || t === 'plow') l.box(0.5, 0.2, 0.3, 0xffa500, 0, 2.2, L / 2 - 0.9);
      break;
    }
    case 'ambulance':
      b.box(2.1, 2.3, 5.6, 0xffffff, 0, 0.45, 0);
      b.box(2.0, 0.7, 0.1, glass, 0, 1.6, 2.81);
      b.box(2.12, 0.35, 5.62, 0xe63946, 0, 1.1, 0);
      b.box(0.6, 0.15, 0.06, 0xe63946, 0, 2.1, -2.82);
      wheels([1.9, -1.9], 0.45, 0.98);
      heads(2.81, 0.7, 0.8); tails(-2.81, 0.8, 0.9);
      break;
    case 'firetruck':
      b.box(2.4, 2.2, 8, 0xd62828, 0, 0.5, 0);
      b.box(2.3, 0.8, 0.1, glass, 0, 1.7, 4.02);
      b.box(2.42, 0.2, 8.02, 0xffffff, 0, 1.2, 0);
      b.box(0.5, 0.3, 6.5, chrome, 0.5, 2.75, -0.6);
      b.box(0.5, 0.3, 6.5, chrome, -0.5, 2.75, -0.6);
      for (let i = 0; i < 9; i++) b.box(1.1, 0.1, 0.12, chrome, 0, 2.85, -3.6 + i * 0.75);
      wheels([2.8, -2, -3.2], 0.55, 1.12);
      heads(4.01, 0.8, 0.85); tails(-4.01, 0.95, 0.9);
      break;
  }
  return [b.build(), l.build()];
}

export type { Vehicle };
