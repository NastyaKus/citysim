// Визуальные эффекты событий.
import * as THREE from 'three';
import { GB, lowpolyMaterial } from './lowpoly';
import { Particles } from './particles';
import type { Sim, Fx } from '../sim/sim';

interface Live { obj: THREE.Object3D; fx: Fx; t: number; extra?: Record<string, unknown> }

export class FxRenderer {
  group = new THREE.Group();
  private live = new Map<number, Live>();
  private mat = lowpolyMaterial();
  fire = new Particles(2500, 'fire');
  smoke = new Particles(2500, 'smoke');
  sparks = new Particles(4000, 'spark');
  private fireLights: THREE.PointLight[] = [];
  private meteorLines: { line: THREE.Line; t: number; v: THREE.Vector3 }[] = [];

  constructor(private sim: Sim) {
    this.group.add(this.fire.points, this.smoke.points, this.sparks.points);
    this.sparks.gravity = -6;
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff7a1a, 0, 60, 1.6);
      this.fireLights.push(l);
      this.group.add(l);
    }
  }

  private build(f: Fx): THREE.Object3D {
    const g = new GB();
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    switch (f.kind) {
      case 'tent': {
        const cols = [0xe63946, 0xf4a261, 0x2a9d8f, 0x8338ec];
        for (let i = 0; i < 3; i++) {
          const x = i * 4.5 - 4.5, c = cols[i % cols.length];
          g.box(3.4, 1.8, 3.4, 0xffffff, x, 0, 0);
          for (let k = 0; k < 4; k++) g.box(3.45, 1.8, 0.1, k % 2 ? c : 0xffffff, x, 0, -1.7 + k * 1.13);
          g.hip(4, 1.8, 4, c, x, 1.8, 0);
          g.cyl(0.04, 0.04, 1, 4, 0x555555, x, 3.6, 0);
          g.box(0.6, 0.35, 0.02, 0xffd166, x + 0.3, 4.3, 0);
        }
        break;
      }
      case 'circus': {
        const stripes = 16;
        for (let i = 0; i < stripes; i++) {
          const a = (i / stripes) * Math.PI * 2;
          g.box(2.45, 4, 0.2, i % 2 ? 0xd62828 : 0xffffff, Math.cos(a) * 5.4, 0, Math.sin(a) * 5.4, { ry: -a + Math.PI / 2 });
        }
        for (let i = 0; i < 16; i++) {
          const slice = new THREE.ConeGeometry(6.8, 5, 1, 1, true, (i / 16) * Math.PI * 2, Math.PI / 8);
          g.add(slice, i % 2 ? 0xd62828 : 0xfff3b0, 0, 6.5, 0);
        }
        const merged = g.build();
        const mesh = new THREE.Mesh(merged, lowpolyMaterial({ side: THREE.DoubleSide }));
        const grp = new THREE.Group();
        grp.add(mesh);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshLambertMaterial({ color: 0xffd166, side: THREE.DoubleSide }));
        flag.position.set(0.7, 10, 0);
        grp.add(flag);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2), this.mat);
        pole.position.set(0, 9.5, 0);
        grp.add(pole);
        return grp;
      }
      case 'stage': {
        g.box(9, 1.2, 5, 0x2b2d42, 0, 0, 0);
        for (const [x, z] of [[-4.3, -2.3], [4.3, -2.3], [-4.3, 2.3], [4.3, 2.3]]) g.box(0.25, 6, 0.25, 0x888888, x, 1.2, z);
        g.box(9, 0.3, 0.3, 0x888888, 0, 7, -2.3);
        g.box(9, 0.3, 0.3, 0x888888, 0, 7, 2.3);
        g.box(1.4, 2.4, 1.2, 0x111111, -3.6, 1.2, 1.5);
        g.box(1.4, 2.4, 1.2, 0x111111, 3.6, 1.2, 1.5);
        g.box(0.9, 0.9, 0.9, 0xe63946, 0, 1.2, -1);
        g.box(6, 3, 0.15, 0x111111, 0, 3, -2.4);
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(g.build(), this.mat));
        const beams: THREE.Mesh[] = [];
        for (let i = 0; i < 4; i++) {
          const cone = new THREE.ConeGeometry(1.6, 9, 8, 1, true);
          cone.translate(0, -4.5, 0);
          const m = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: [0xff006e, 0x3a86ff, 0xffbe0b, 0x8338ec][i], transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          m.position.set(-3 + i * 2, 7, 0);
          beams.push(m);
          grp.add(m);
        }
        grp.userData.beams = beams;
        return grp;
      }
      case 'garlands': {
        const b = this.sim.world.buildings[f.building ?? 0];
        const grp = new THREE.Group();
        const geo = new THREE.SphereGeometry(0.16, 5, 4);
        const n = 120;
        const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
        const m = new THREE.Matrix4();
        const cols = [0xff006e, 0xffbe0b, 0x3a86ff, 0x8ac926, 0xffffff];
        for (let i = 0; i < n; i++) {
          const line = Math.floor(i / 30), t = (i % 30) / 29;
          const r = 9.5 + line * 0.3;
          const a0 = line * (Math.PI / 2);
          const a = a0 + t * (Math.PI / 2);
          m.makeTranslation(Math.cos(a) * r, 3.4 - Math.sin(t * Math.PI) * 0.7, Math.sin(a) * r);
          im.setMatrixAt(i, m);
          im.setColorAt(i, new THREE.Color(cols[i % cols.length]));
        }
        grp.add(im);
        void b;
        return grp;
      }
      case 'stalls': {
        const n = 6;
        const cols = [0xe63946, 0x2a9d8f, 0xf4a261, 0x8338ec, 0xffbe0b, 0x3a86ff];
        for (let i = 0; i < n; i++) {
          const x = -11 + i * 4.4, z = -6.5;
          g.box(3, 0.9, 1.6, 0xa97c50, x, 0, z);
          g.gable(3.4, 1, 2.2, cols[i], x, 2.4, z);
          g.box(0.1, 2.4, 0.1, 0x555555, x - 1.5, 0, z + 0.9);
          g.box(0.1, 2.4, 0.1, 0x555555, x + 1.5, 0, z + 0.9);
        }
        break;
      }
      case 'balloons': {
        const grp = new THREE.Group();
        const cols = [0xff006e, 0xffbe0b, 0x3a86ff, 0x8ac926, 0xffffff, 0xff99c8];
        const b = this.sim.world.buildings[f.building ?? 0];
        const ex = b.entrance.pos.x - f.x, ez = b.entrance.pos.z - f.z;
        for (let i = 0; i < 9; i++) {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshLambertMaterial({ color: cols[i % cols.length], flatShading: true }));
          m.position.set(ex * 0.85 + rnd(-1.4, 1.4), 3 + rnd(0, 1.6), ez * 0.85 + rnd(-1.4, 1.4));
          m.userData.base = m.position.y;
          grp.add(m);
          const s = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, m.position.y), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          s.position.set(m.position.x, m.position.y / 2, m.position.z);
          grp.add(s);
        }
        return grp;
      }
      case 'cones': {
        const e = this.sim.world.edges[f.edge ?? 0];
        const along = e.axis === 'x';
        for (let i = -3; i <= 3; i++) {
          const ox = along ? i * 2.4 : rnd(-0.3, 0.3), oz = along ? rnd(-0.3, 0.3) : i * 2.4;
          g.cone(0.35, 0.9, 6, 0xff6b00, ox + (along ? 0 : -2.5), 0, oz + (along ? -2.5 : 0));
          g.box(0.55, 0.12, 0.55, 0x222222, ox + (along ? 0 : -2.5), 0, oz + (along ? -2.5 : 0));
        }
        for (const s of [-1, 1]) {
          const bx = along ? s * 10 : 0, bz = along ? 0 : s * 10;
          g.box(along ? 0.3 : 9, 1.1, along ? 9 : 0.3, 0xffffff, bx, 0, bz);
          for (let k = 0; k < 4; k++) g.box(along ? 0.32 : 1.1, 0.35, along ? 1.1 : 0.32, 0xe63946, bx + (along ? 0 : -3.3 + k * 2.2), 0.55, bz + (along ? -3.3 + k * 2.2 : 0));
        }
        g.ico(1.2, 0x4a3a2a, along ? 4 : 1, 0, along ? 1 : 4, { jitter: 0.4 });
        g.box(2, 1.1, 1.4, 0xf4d35e, along ? -4 : 1.5, 0, along ? 1.5 : -4);
        break;
      }
      case 'flood': {
        const e = this.sim.world.edges[f.edge ?? 0];
        const along = e.axis === 'x';
        const m = new THREE.Mesh(new THREE.PlaneGeometry(along ? 34 : 13, along ? 13 : 34, 8, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a7ca5, transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.3, flatShading: true }));
        m.position.y = 0.25;
        const grp = new THREE.Group();
        grp.add(m);
        grp.userData.water = m;
        g.cyl(0.35, 0.35, 0.3, 8, 0x555555, 0, 0, 0);
        grp.add(new THREE.Mesh(g.build(), this.mat));
        return grp;
      }
      case 'crash': {
        g.ico(0.4, 0x777777, 1, 0.2, 1, { jitter: 0.2 });
        g.box(0.6, 0.05, 0.3, 0xcccccc, -1, 0.05, 0.5, { ry: 0.6 });
        for (let i = 0; i < 4; i++) g.cone(0.3, 0.8, 6, 0xff6b00, -3 + i * 2, 0, -3.2);
        break;
      }
      case 'ballot': {
        g.box(1.2, 1, 1.2, 0x1d3557, 0, 0, 0);
        g.box(1.3, 0.1, 1.3, 0xffffff, 0, 1, 0);
        g.box(3, 1.2, 0.15, 0xffffff, 0, 2.2, 0);
        g.box(3, 0.4, 0.17, 0x1c57d6, 0, 2.6, 0);
        g.box(3, 0.4, 0.17, 0xd52b1e, 0, 2.2, 0);
        g.box(0.12, 2.2, 0.12, 0x555555, -1.4, 0, 0);
        g.box(0.12, 2.2, 0.12, 0x555555, 1.4, 0, 0);
        break;
      }
      case 'icecream': {
        g.box(2.2, 1.2, 1.2, 0xffffff, 0, 0.4, 0);
        g.box(2.3, 0.2, 1.3, 0xff99c8, 0, 1.6, 0);
        g.cyl(0.35, 0.35, 0.2, 8, 0x333333, -0.8, 0.2, 0.62, { rx: Math.PI / 2 });
        g.cyl(0.35, 0.35, 0.2, 8, 0x333333, 0.8, 0.2, 0.62, { rx: Math.PI / 2 });
        g.cyl(0.04, 0.04, 2, 4, 0x555555, 0, 1.6, 0);
        g.cone(1.4, 0.6, 8, 0xff99c8, 0, 3.4, 0);
        g.cone(0.25, 0.6, 6, 0xd4a373, 1.3, 1.8, 0, { rx: Math.PI });
        g.ico(0.3, 0xfff1e6, 1.3, 2.5, 0);
        break;
      }
      case 'crowd': {
        // зрители на трибунах — разноцветные точки
        const b = this.sim.world.buildings[f.building ?? 0];
        const grp = new THREE.Group();
        const n = b.type === 'stadium' ? 360 : 120;
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.8, 0.4), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
        const cols = [0x3a86ff, 0xffffff, 0x3a86ff, 0xe63946, 0xffbe0b, 0x222222];
        const pts: [number, number, number][] = [];
        for (let i = 0; i < n; i++) {
          let x: number, y: number, z: number;
          if (b.type === 'stadium') {
            const side = i % 4;
            const row = Math.floor(Math.random() * 3);
            if (side < 2) { x = rnd(-12, 12); z = (side ? 1 : -1) * (b.d / 2 - 1.8 - (2 - row) * 1.3 - 1.3); y = 0.8 + (row + 1) * 0.8; }
            else { z = rnd(-9, 9); x = (side === 2 ? 1 : -1) * (b.w / 2 - 1.5 - (1 - Math.min(1, row)) * 1.3 - 1.3); y = 0.8 + (Math.min(1, row) + 1) * 0.8; }
          } else { const a = rnd(0, Math.PI * 2), r = rnd(3, 12); x = Math.cos(a) * r; z = Math.sin(a) * r + 6; y = 0; }
          pts.push([x, y, z]);
          im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y + 0.4, z));
          im.setColorAt(i, new THREE.Color(cols[i % cols.length]));
        }
        grp.add(im);
        grp.userData.crowd = { im, pts };
        return grp;
      }
      case 'pigeons': {
        const grp = new THREE.Group();
        const bg = new GB();
        bg.box(0.3, 0.2, 0.45, 0x8d99ae, 0, 0, 0);
        bg.box(0.18, 0.18, 0.18, 0x6c757d, 0, 0.15, 0.25);
        bg.box(0.7, 0.04, 0.25, 0xadb5bd, 0, 0.08, 0);
        const im = new THREE.InstancedMesh(bg.build(), this.mat, 50);
        grp.add(im);
        grp.userData.pigeons = im;
        return grp;
      }
      case 'lostdog': {
        const d = new GB();
        d.box(0.36, 0.32, 0.75, 0xc69c6d, 0, 0.3, 0);
        d.box(0.3, 0.3, 0.34, 0xc69c6d, 0, 0.58, 0.45);
        for (const [x, z] of [[0.12, 0.27], [-0.12, 0.27], [0.12, -0.27], [-0.12, -0.27]]) d.box(0.09, 0.3, 0.09, 0xa07850, x, 0, z);
        d.box(0.08, 0.08, 0.32, 0xc69c6d, 0, 0.58, -0.45, { rx: -0.7 });
        return new THREE.Mesh(d.build(), this.mat);
      }
      case 'rave': {
        const grp = new THREE.Group();
        const b = this.sim.world.buildings[f.building ?? 0];
        const beams: THREE.Mesh[] = [];
        for (let i = 0; i < 6; i++) {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.5, 60, 6, 1, true).translate(0, 30, 0), new THREE.MeshBasicMaterial({ color: [0x00ff9f, 0xff00e4, 0x00b3ff, 0xfff000, 0xff3c00, 0x9d00ff][i], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
          m.position.y = b.height + 0.5;
          beams.push(m);
          grp.add(m);
        }
        grp.userData.beams = beams;
        return grp;
      }
      default:
        return new THREE.Group();
    }
    const mesh = new THREE.Mesh(g.build(), this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  update(dt: number, time: number, night: number) {
    const sim = this.sim;
    const seen = new Set<number>();
    let fireIdx = 0;
    for (const f of sim.fx) {
      seen.add(f.id);
      let l = this.live.get(f.id);
      if (!l && !['fire', 'fireworks', 'meteors', 'smoke'].includes(f.kind)) {
        const obj = this.build(f);
        obj.position.set(f.x, 0, f.z);
        if (f.kind === 'stalls' || f.kind === 'garlands' || f.kind === 'crowd') {
          const b = sim.world.buildings[f.building ?? 0];
          obj.position.set(b.x, 0, b.z);
        }
        this.group.add(obj);
        l = { obj, fx: f, t: 0 };
        this.live.set(f.id, l);
      } else if (!l) {
        l = { obj: new THREE.Group(), fx: f, t: 0 };
        this.live.set(f.id, l);
      }
      l.t += dt;
      const o = l.obj;
      switch (f.kind) {
        case 'fire': {
          const b = sim.world.buildings[f.building ?? 0];
          const k = b.onFire;
          if (k > 0) {
            const top = Math.max(2, b.height);
            this.fire.emit(dt * 160 * k, b.x, top, b.z, 0, 1.6, null);
            this.fire.emit(dt * 50 * k, b.x + (Math.random() - 0.5) * 6, top * 0.5, b.z + (Math.random() - 0.5) * 6, 0, 1, null);
            if (fireIdx < this.fireLights.length) {
              const pl = this.fireLights[fireIdx++];
              pl.position.set(b.x, top + 3, b.z);
              pl.intensity = (60 + Math.random() * 40) * k;
            }
          }
          this.smoke.emit(dt * (30 * k + 6), b.x, Math.max(2, b.height) + 2, b.z, k > 0 ? 0x333333 : 0x777777, 3, null);
          break;
        }
        case 'fireworks': {
          if (Math.random() < dt * 2.2) {
            const x = f.x + (Math.random() - 0.5) * 30, z = f.z + (Math.random() - 0.5) * 30, y = 40 + Math.random() * 25;
            const c = new THREE.Color().setHSL(Math.random(), 1, 0.55);
            const n = 160;
            for (let i = 0; i < n; i++) {
              const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
              const s = 12 + Math.random() * 6;
              this.sparks.spawn(x, y, z, Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s, c, 0.75, 1.4 + Math.random() * 0.6);
            }
            for (let i = 0; i < 10; i++) this.sparks.spawn(x, y - i * 3, z, 0, -1, 0, 0xffe0a0, 1, 0.4);
          }
          break;
        }
        case 'meteors': {
          if (Math.random() < dt * 1.5) {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-14, -5, -6)]);
            const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, fog: false }));
            const a = Math.random() * Math.PI * 2;
            line.position.set(Math.cos(a) * 300, 220 + Math.random() * 80, Math.sin(a) * 300);
            this.group.add(line);
            this.meteorLines.push({ line, t: 0.8, v: new THREE.Vector3(-260, -90, -110) });
          }
          break;
        }
        case 'stage':
        case 'rave': {
          const beams = o.userData.beams as THREE.Mesh[] | undefined;
          beams?.forEach((m, i) => {
            m.rotation.z = Math.sin(time * 1.3 + i) * 0.6;
            m.rotation.x = Math.cos(time * 0.9 + i * 2) * 0.4;
            (m.material as THREE.MeshBasicMaterial).opacity = (f.kind === 'rave' ? 0.35 : 0.18) * (0.4 + night * 0.9);
          });
          break;
        }
        case 'balloons':
          o.children.forEach((m, i) => { if (m.userData.base !== undefined) m.position.y = m.userData.base + Math.sin(time * 1.5 + i) * 0.2; });
          break;
        case 'crowd': {
          const cd = o.userData.crowd as { im: THREE.InstancedMesh; pts: [number, number, number][] };
          const m = new THREE.Matrix4();
          cd.pts.forEach((p, i) => { m.makeTranslation(p[0], p[1] + 0.4 + Math.max(0, Math.sin(time * 5 + i * 1.7)) * 0.3, p[2]); cd.im.setMatrixAt(i, m); });
          cd.im.instanceMatrix.needsUpdate = true;
          break;
        }
        case 'pigeons': {
          const im = o.userData.pigeons as THREE.InstancedMesh;
          const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
          for (let i = 0; i < 50; i++) {
            const a = time * (0.4 + (i % 7) * 0.08) + i;
            const r = 3 + (i % 9) * 1.2;
            const fly = Math.sin(time * 0.3 + i) > 0.2;
            const y = fly ? 3 + Math.sin(time * 2 + i) * 2 + (i % 5) : 0.15;
            q.setFromAxisAngle(up, -a);
            m.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), q, new THREE.Vector3(1, fly ? 1 + Math.sin(time * 20 + i) * 0.3 : 1, 1));
            im.setMatrixAt(i, m);
          }
          im.instanceMatrix.needsUpdate = true;
          break;
        }
        case 'lostdog': {
          const dx = f.x - o.position.x, dz = f.z - o.position.z;
          if (Math.hypot(dx, dz) > 0.01) o.rotation.y = Math.atan2(dx, dz);
          o.position.set(f.x, Math.abs(Math.sin(time * 8)) * 0.1, f.z);
          break;
        }
        case 'flood': {
          const wmesh = o.userData.water as THREE.Mesh;
          const pa = wmesh.geometry.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < pa.count; i++) pa.setY(i, Math.sin(time * 2 + pa.getX(i) * 0.5 + pa.getZ(i) * 0.3) * 0.08);
          pa.needsUpdate = true;
          if (Math.random() < dt * 20) this.sparks.spawn(f.x + (Math.random() - 0.5) * 0.4, 0.4, f.z, (Math.random() - 0.5) * 2, 6, (Math.random() - 0.5) * 2, 0x9fd3ff, 0.8, 0.8);
          break;
        }
        case 'crash':
          this.smoke.emit(dt * 6, f.x, 1.2, f.z, 0x666666, 1.4, null);
          break;
      }
    }
    for (const [id, l] of this.live) {
      if (seen.has(id)) continue;
      this.group.remove(l.obj);
      l.obj.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
      this.live.delete(id);
    }
    for (let i = fireIdx; i < this.fireLights.length; i++) this.fireLights[i].intensity = 0;
    for (const m of this.meteorLines) {
      m.t -= dt;
      m.line.position.addScaledVector(m.v, dt);
      (m.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, m.t);
      if (m.t <= 0) this.group.remove(m.line);
    }
    this.meteorLines = this.meteorLines.filter((m) => m.t > 0);
    this.fire.update(dt, sim.weather.wind);
    this.smoke.update(dt, sim.weather.wind);
    this.sparks.update(dt, 0);
  }

  setScale(h: number) {
    this.fire.setScale(h);
    this.smoke.setScale(h);
    this.sparks.setScale(h);
  }
}
