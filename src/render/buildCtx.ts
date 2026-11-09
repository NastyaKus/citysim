// Контекст сборки одного участка: локальные билдеры + списки окон, деревьев, фонарей.
import { GB } from './lowpoly';
import { RNG } from '../sim/rng';
import type { Building } from '../sim/world';

export type TreeKind = 'round' | 'pine' | 'birch' | 'bush' | 'willow' | 'poplar';

export interface WinSpec { x: number; y: number; z: number; ry: number; sx: number; sy: number; b: number }
export interface TreeSpec { x: number; z: number; kind: TreeKind; s: number; y?: number }
export interface LampSpec { x: number; z: number; district: number; h: number }
export interface DynSpec { kind: 'crane' | 'construction' | 'fountain' | 'chimney' | 'ducks' | 'flag' | 'floodlight' | 'swing'; x: number; y: number; z: number; ry: number; b: number; s?: number }

export class BuildCtx {
  gb = new GB();
  grass = new GB();
  neon = new GB();
  snow = new GB();
  water = new GB();
  wins: WinSpec[] = [];
  trees: TreeSpec[] = [];
  lamps: LampSpec[] = [];
  dyn: DynSpec[] = [];
  W: number;
  D: number;
  constructor(public b: Building, public rng: RNG) {
    const alongX = Math.abs(b.faceX) > 0.5;
    this.W = alongX ? b.d : b.w;
    this.D = alongX ? b.w : b.d;
  }

  win(x: number, y: number, z: number, ry: number, sx = 1, sy = 1) {
    this.wins.push({ x, y, z, ry, sx, sy, b: this.b.id });
  }

  /** окна по периметру коробки */
  facade(cx: number, cz: number, w: number, d: number, y0: number, floors: number, fh = 3.2, o: { sp?: number; sx?: number; sy?: number; skipFront?: number; sides?: boolean; back?: boolean } = {}) {
    const sp = o.sp ?? 3;
    const sx = o.sx ?? 1, sy = o.sy ?? 1;
    const row = (len: number, place: (t: number) => void) => {
      const n = Math.max(1, Math.floor((len - 1.5) / sp));
      const step = len / n;
      for (let i = 0; i < n; i++) place(-len / 2 + step * (i + 0.5));
    };
    for (let f = 0; f < floors; f++) {
      const y = y0 + f * fh + fh * 0.55;
      if (f >= (o.skipFront ?? 0)) row(w, (t) => this.win(cx + t, y, cz + d / 2 + 0.02, 0, sx, sy));
      if (o.back !== false) row(w, (t) => this.win(cx + t, y, cz - d / 2 - 0.02, Math.PI, sx, sy));
      if (o.sides !== false) {
        row(d, (t) => this.win(cx + w / 2 + 0.02, y, cz + t, Math.PI / 2, sx, sy));
        row(d, (t) => this.win(cx - w / 2 - 0.02, y, cz + t, -Math.PI / 2, sx, sy));
      }
    }
  }

  tree(x: number, z: number, kind: TreeKind = 'round', s = 1) {
    this.trees.push({ x, z, kind, s: s * this.rng.range(0.8, 1.2) });
  }

  lamp(x: number, z: number, h = 4.5) {
    this.lamps.push({ x, z, district: this.b.district, h });
  }

  /** газон под участком */
  lawn(w = this.W, d = this.D, x = 0, z = 0, y = 0.06) {
    this.grass.quad(w, d, 0xffffff, x, y, z);
  }

  paved(w: number, d: number, color: number, x = 0, z = 0, y = 0.09) {
    this.gb.quad(w, d, color, x, y, z);
  }

  /** снег на плоской крыше */
  snowFlat(w: number, d: number, x: number, y: number, z: number) {
    this.snow.box(w + 0.1, 0.25, d + 0.1, 0xffffff, x, y, z);
  }

  snowGable(w: number, h: number, d: number, x: number, y: number, z: number) {
    this.snow.gable(w + 0.3, h + 0.18, d + 0.35, 0xffffff, x, y + 0.08, z);
  }

  bench(x: number, z: number, ry = 0) {
    const g = new GB();
    g.box(1.8, 0.12, 0.5, 0x9c6b3f, 0, 0.45, 0);
    g.box(1.8, 0.5, 0.1, 0x9c6b3f, 0, 0.55, -0.22);
    g.box(0.1, 0.45, 0.45, 0x333333, -0.8, 0, 0);
    g.box(0.1, 0.45, 0.45, 0x333333, 0.8, 0, 0);
    this.gb.merge(g, x, 0, z, ry);
  }

  fence(x0: number, z0: number, x1: number, z1: number, color = 0xf5f5f0, h = 1, gapAt?: number) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(-(z1 - z0), x1 - x0);
    const n = Math.max(1, Math.floor(len / 0.8));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (gapAt !== undefined && Math.abs(t - gapAt) < 0.12) continue;
      this.gb.box(0.12, h, 0.12, color, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t);
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (gapAt === undefined) this.gb.box(len, 0.1, 0.08, color, cx, h * 0.7, cz, { ry });
    else {
      const a = gapAt - 0.12, b = gapAt + 0.12;
      this.gb.box(len * a, 0.1, 0.08, color, x0 + (x1 - x0) * a / 2, h * 0.7, z0 + (z1 - z0) * a / 2, { ry });
      this.gb.box(len * (1 - b), 0.1, 0.08, color, x0 + (x1 - x0) * (1 + b) / 2, h * 0.7, z0 + (z1 - z0) * (1 + b) / 2, { ry });
    }
  }

  door(x: number, z: number, color = 0x5a3e2b, w = 1.4, h = 2.3, ry = 0) {
    this.gb.box(w, h, 0.2, color, x, 0, z, { ry });
  }

  canopy(x: number, y: number, z: number, w = 2.4, color = 0x8d99a6) {
    this.gb.box(w, 0.18, 1.4, color, x, y, z + 0.6);
  }

  sign(x: number, y: number, z: number, w: number, h: number, color: number, glow = true) {
    this.gb.box(w, h, 0.25, 0x333333, x, y, z - 0.05);
    if (glow) this.neon.box(w - 0.3, h - 0.3, 0.1, color, x, y + 0.15, z + 0.12);
    else this.gb.box(w - 0.3, h - 0.3, 0.1, color, x, y + 0.15, z + 0.12);
  }

  awning(x: number, y: number, z: number, w: number, c1: number, c2: number, depth = 1.6) {
    const n = Math.max(2, Math.round(w / 0.8));
    for (let i = 0; i < n; i++) {
      this.gb.box(w / n, 0.12, depth, i % 2 ? c1 : c2, x - w / 2 + (w / n) * (i + 0.5), y, z + depth / 2, { rx: 0.35 });
    }
  }

  ac(x: number, y: number, z: number) {
    this.gb.box(1.2, 0.8, 1, 0xd0d0d0, x, y, z);
    this.gb.cyl(0.35, 0.35, 0.05, 8, 0x555555, x, y + 0.8, z);
  }

  umbrellaTable(x: number, z: number, c: number) {
    this.gb.cyl(0.5, 0.5, 0.06, 8, 0xf5f5f0, x, 0.75, z);
    this.gb.cyl(0.06, 0.06, 0.75, 4, 0x555555, x, 0, z);
    this.gb.cyl(0.04, 0.04, 2.2, 4, 0x555555, x, 0.8, z);
    this.gb.cone(1.3, 0.5, 8, c, x, 2.4, z);
    this.gb.box(0.4, 0.45, 0.4, 0x6b4f3a, x + 0.8, 0, z);
    this.gb.box(0.4, 0.45, 0.4, 0x6b4f3a, x - 0.8, 0, z);
  }

  flower(x: number, z: number, w: number, d: number) {
    this.gb.box(w, 0.35, d, 0x7a5232, x, 0, z);
    const cols = [0xff5d8f, 0xffd166, 0xf8f9fa, 0xc77dff, 0xff7b54];
    for (let i = 0; i < Math.round(w * d * 1.2); i++) this.gb.ico(0.18, this.rng.pick(cols), x + this.rng.range(-w / 2 + 0.2, w / 2 - 0.2), 0.45, z + this.rng.range(-d / 2 + 0.2, d / 2 - 0.2));
    this.grass.box(w - 0.1, 0.05, d - 0.1, 0xddffdd, x, 0.35, z);
  }

  trash(x: number, z: number) {
    this.gb.cyl(0.3, 0.25, 0.8, 6, 0x3d5a40, x, 0, z);
  }

  hydrant(x: number, z: number) {
    this.gb.cyl(0.18, 0.2, 0.6, 6, 0xd62828, x, 0, z);
    this.gb.ico(0.18, 0xd62828, x, 0.65, z);
  }
}
