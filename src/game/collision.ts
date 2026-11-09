// Коллизии для игрока: прямоугольники стен и круги стволов в пространственной сетке.
export interface Box { x0: number; z0: number; x1: number; z1: number; h: number }
export interface Circle { x: number; z: number; r: number }

const CELL = 8;

export class Collision {
  boxes: Box[] = [];
  circles: Circle[] = [];
  private grid = new Map<number, { b: number[]; c: number[] }>();

  private key(ix: number, iz: number) {
    return (ix + 500) * 1000 + (iz + 500);
  }

  private cell(ix: number, iz: number) {
    const k = this.key(ix, iz);
    let c = this.grid.get(k);
    if (!c) this.grid.set(k, (c = { b: [], c: [] }));
    return c;
  }

  addBox(b: Box) {
    const i = this.boxes.length;
    this.boxes.push(b);
    for (let ix = Math.floor(b.x0 / CELL); ix <= Math.floor(b.x1 / CELL); ix++)
      for (let iz = Math.floor(b.z0 / CELL); iz <= Math.floor(b.z1 / CELL); iz++) this.cell(ix, iz).b.push(i);
  }

  addCircle(c: Circle) {
    const i = this.circles.length;
    this.circles.push(c);
    for (let ix = Math.floor((c.x - c.r) / CELL); ix <= Math.floor((c.x + c.r) / CELL); ix++)
      for (let iz = Math.floor((c.z - c.r) / CELL); iz <= Math.floor((c.z + c.r) / CELL); iz++) this.cell(ix, iz).c.push(i);
  }

  private near(x: number, z: number) {
    const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
    const bs = new Set<number>(), cs = new Set<number>();
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const c = this.grid.get(this.key(ix + dx, iz + dz));
        if (!c) continue;
        for (const i of c.b) bs.add(i);
        for (const i of c.c) cs.add(i);
      }
    return { bs, cs };
  }

  /** вытолкнуть круг радиуса r из препятствий; возвращает true, если было столкновение */
  resolve(p: { x: number; z: number }, r: number): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const { bs, cs } = this.near(p.x, p.z);
      let moved = false;
      for (const i of bs) {
        const b = this.boxes[i];
        const cx = Math.max(b.x0, Math.min(b.x1, p.x));
        const cz = Math.max(b.z0, Math.min(b.z1, p.z));
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = moved = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // внутри — выталкиваем по кратчайшей оси
          const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z;
          const m = Math.min(l, rr, t, bb);
          if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r;
        }
      }
      for (const i of cs) {
        const c = this.circles[i];
        const dx = p.x - c.x, dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + r;
        if (d >= min) continue;
        hit = moved = true;
        if (d > 1e-6) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
        else p.x += min;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** доля отрезка from→to (0..1), на которой его перекрывает стена; 1 — свободно */
  rayBlock(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): number {
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const x = fx + (tx - fx) * k, y = fy + (ty - fy) * k, z = fz + (tz - fz) * k;
      const { bs } = this.near(x, z);
      for (const j of bs) {
        const b = this.boxes[j];
        if (y < b.h && x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3) return Math.max(0.15, (i - 1) / steps);
      }
    }
    return 1;
  }

  /** точка внутри препятствия? */
  blocked(x: number, z: number, r = 0.3): boolean {
    const p = { x, z };
    return this.resolve(p, r);
  }
}
