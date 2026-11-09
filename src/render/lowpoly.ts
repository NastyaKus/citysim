// Хелперы для сборки low-poly моделей из примитивов с вершинными цветами.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const col = new THREE.Color();

export interface PartOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  jitter?: number;
  seed?: number;
  shade?: number; // затемнение низа (фейковый AO)
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class GB {
  parts: THREE.BufferGeometry[] = [];

  add(g: THREE.BufferGeometry, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    let geo = g.index ? g.toNonIndexed() : g;
    if (geo === g) geo = g.clone();
    g.dispose();
    if (o.jitter) {
      const p = geo.attributes.position as THREE.BufferAttribute;
      // одинаковые точки сдвигаем одинаково, чтобы не было щелей
      for (let i = 0; i < p.count; i++) {
        const k = Math.round(p.getX(i) * 100) * 7 + Math.round(p.getY(i) * 100) * 13 + Math.round(p.getZ(i) * 100) * 17 + (o.seed ?? 0);
        p.setXYZ(i, p.getX(i) + (hash(k) - 0.5) * o.jitter, p.getY(i) + (hash(k + 1) - 0.5) * o.jitter, p.getZ(i) + (hash(k + 2) - 0.5) * o.jitter);
      }
    }
    tmpE.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    tmpQ.setFromEuler(tmpE);
    tmpP.set(x, y, z);
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpP, tmpQ, tmpS);
    geo.applyMatrix4(tmpM);
    const n = geo.attributes.position.count;
    const colors = new Float32Array(n * 3);
    col.set(color as THREE.ColorRepresentation);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    let minY = Infinity, maxY = -Infinity;
    if (o.shade) for (let i = 0; i < n; i++) { const yy = pos.getY(i); if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (o.shade) k = 1 - o.shade * (1 - (pos.getY(i) - minY) / Math.max(0.01, maxY - minY));
      colors[i * 3] = col.r * k;
      colors[i * 3 + 1] = col.g * k;
      colors[i * 3 + 2] = col.b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (geo.attributes.normal) geo.deleteAttribute('normal');
    this.parts.push(geo);
    return this;
  }

  box(w: number, h: number, d: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    // y — низ коробки
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, o);
  }

  cyl(rt: number, rb: number, h: number, seg: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z, o);
  }

  cone(r: number, h: number, seg: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z, o);
  }

  ico(r: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}, detail = 0) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z, o);
  }

  dodeca(r: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    return this.add(new THREE.DodecahedronGeometry(r, 0), color, x, y, z, o);
  }

  /** двускатная крыша: треугольная призма вдоль X */
  gable(w: number, h: number, d: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    const g = new THREE.BufferGeometry();
    const hw = w / 2, hd = d / 2;
    const v = [
      // торцы
      -hw, 0, -hd, -hw, 0, hd, -hw, h, 0,
      hw, 0, hd, hw, 0, -hd, hw, h, 0,
      // скаты
      -hw, 0, hd, hw, 0, hd, hw, h, 0,
      -hw, 0, hd, hw, h, 0, -hw, h, 0,
      hw, 0, -hd, -hw, 0, -hd, -hw, h, 0,
      hw, 0, -hd, -hw, h, 0, hw, h, 0,
      // низ
      -hw, 0, -hd, hw, 0, -hd, hw, 0, hd,
      -hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return this.add(g, color, x, y, z, o);
  }

  /** четырёхскатная (пирамида) */
  hip(w: number, h: number, d: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    g.scale(w, h, d);
    return this.add(g, color, x, y + h / 2, z, o);
  }

  quad(w: number, d: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return this.add(g, color, x, y, z, o);
  }

  disc(r: number, seg: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    const g = new THREE.CircleGeometry(r, seg);
    g.rotateX(-Math.PI / 2);
    return this.add(g, color, x, y, z, o);
  }

  dome(r: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    return this.add(new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), color, x, y, z, o);
  }

  torus(r: number, tube: number, color: number | THREE.Color, x: number, y: number, z: number, o: PartOpts = {}) {
    return this.add(new THREE.TorusGeometry(r, tube, 3, 8), color, x, y, z, o);
  }

  /** объединить и вернуть геометрию с нормалями для плоского шейдинга */
  build(): THREE.BufferGeometry {
    if (!this.parts.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(this.parts, false)!;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }

  /** вписать другой билдер со смещением/поворотом */
  merge(other: GB, x = 0, y = 0, z = 0, ry = 0) {
    tmpE.set(0, ry, 0);
    tmpQ.setFromEuler(tmpE);
    tmpP.set(x, y, z);
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpP, tmpQ, tmpS);
    for (const p of other.parts) {
      p.applyMatrix4(tmpM);
      this.parts.push(p);
    }
    other.parts = [];
    return this;
  }
}

export function lowpolyMaterial(opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0, ...opts });
}

export function shadeColor(c: number, k: number): THREE.Color {
  return new THREE.Color(c).multiplyScalar(k);
}

export function mixColor(a: number, b: number, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

export { hash };
