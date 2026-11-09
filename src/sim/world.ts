// Генерация города: сетка улиц, кварталы, участки, здания, маршруты.
import { RNG } from './rng';
import { BUILDINGS, BUILDING_BY_ID, BuildingDef, Zone } from './content/buildings';
import { SHOP_NAMES, STREET_NAMES_X, STREET_NAMES_Z } from './content/names';

export const BLOCKS = 7;
export const PITCH = 48;
export const ROAD_HALF = 5;
export const LOT_EDGE = 8; // расстояние от оси дороги до границы участка
export const PED_OFF = 6.6; // ось тротуара
export const LANE_OFF = 2.5;
export const STOP_OFF = 6.6; // стоп-линия от центра перекрёстка
export const FLOOR_H = 3.2;
export const NODES = BLOCKS + 1;
export const HALF_CITY = (BLOCKS / 2) * PITCH;

export interface V2 { x: number; z: number }

export interface RoadNode {
  id: number;
  i: number;
  j: number;
  x: number;
  z: number;
  edges: number[];
  hasLight: boolean;
  lightOffset: number;
}

export interface Edge {
  id: number;
  a: number;
  b: number;
  len: number;
  axis: 'x' | 'z'; // вдоль какой оси идёт дорога
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  closed: string | null; // причина перекрытия
  street: string;
  traffic: number; // сглаженная загруженность 0..1
}

export interface Place {
  edge: number;
  t: number; // расстояние от узла a
  side: number; // +1 / -1 относительно нормали ребра
  pos: V2; // точка входа
}

export interface Building {
  id: number;
  def: BuildingDef;
  type: string;
  name: string;
  x: number;
  z: number;
  w: number; // по x
  d: number; // по z
  faceX: number; // направление «фасада» (к дороге)
  faceZ: number;
  floors: number;
  height: number;
  entrance: Place;
  block: [number, number];
  zone: Zone;
  district: number;
  seed: number;
  residents: number[];
  workers: number[];
  homeCapacity: number;
  inside: Set<number>;
  /** события */
  closedReason: string | null;
  onFire: number; // 0..1 интенсивность
  powerOut: boolean;
  attraction: number; // множитель привлекательности от событий
  priceMul: number;
  litWindows: number; // 0..1 — доля горящих окон (считается симуляцией)
  growth: number; // для стройки
}

export interface Route {
  nodes: number[];
  startS: number;
  endS: number;
  length: number;
}

const MASC: Record<string, string> = { Морская: 'Морской', Лесная: 'Лесной' };
function masc(f: string) {
  return MASC[f] ?? f.replace(/ая$/, 'ый');
}

export const DISTRICT_NAMES = ['Заводской', 'Северный', 'Озёрный', 'Спортивный'];

export class World {
  nodes: RoadNode[] = [];
  edges: Edge[] = [];
  buildings: Building[] = [];
  byType = new Map<string, Building[]>();
  edgeAt = new Map<string, number>();
  private distCar = new Float64Array(0);
  private nextCar = new Int16Array(0);
  private distPed = new Float64Array(0);
  private nextPed = new Int16Array(0);
  rng: RNG;

  constructor(seed: number) {
    this.rng = new RNG(seed);
    this.buildRoads();
    this.buildLots();
    this.recomputeRouting();
  }

  nodeId(i: number, j: number) {
    return j * NODES + i;
  }
  static coord(i: number) {
    return (i - BLOCKS / 2) * PITCH;
  }

  private buildRoads() {
    for (let j = 0; j < NODES; j++)
      for (let i = 0; i < NODES; i++)
        this.nodes.push({ id: this.nodeId(i, j), i, j, x: World.coord(i), z: World.coord(j), edges: [], hasLight: false, lightOffset: this.rng.range(0, 10) });
    const add = (a: number, b: number, axis: 'x' | 'z', street: string) => {
      const A = this.nodes[a], B = this.nodes[b];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const ux = (B.x - A.x) / len, uz = (B.z - A.z) / len;
      const e: Edge = { id: this.edges.length, a, b, len, axis, ux, uz, nx: -uz, nz: ux, closed: null, street, traffic: 0 };
      this.edges.push(e);
      A.edges.push(e.id);
      B.edges.push(e.id);
      this.edgeAt.set(a < b ? `${a}-${b}` : `${b}-${a}`, e.id);
    };
    for (let j = 0; j < NODES; j++)
      for (let i = 0; i < BLOCKS; i++) add(this.nodeId(i, j), this.nodeId(i + 1, j), 'x', `${STREET_NAMES_X[j % STREET_NAMES_X.length]} улица`);
    for (let i = 0; i < NODES; i++)
      for (let j = 0; j < BLOCKS; j++) add(this.nodeId(i, j), this.nodeId(i, j + 1), 'z', i % 2 ? `${masc(STREET_NAMES_Z[i % STREET_NAMES_Z.length])} проспект` : `${STREET_NAMES_Z[i % STREET_NAMES_Z.length]} улица`);
    for (const n of this.nodes) n.hasLight = n.edges.length >= 3;
  }

  edgeBetween(a: number, b: number): Edge | undefined {
    const id = this.edgeAt.get(a < b ? `${a}-${b}` : `${b}-${a}`);
    return id === undefined ? undefined : this.edges[id];
  }

  // ——— участки и здания
  private buildLots() {
    const rng = this.rng;
    const fixed: Record<string, string> = { '3,3': 'park', '1,5': 'pond', '5,5': 'stadium', '5,1': 'hospital', '2,5': 'school', '5,3': 'university' };
    const industry = new Set(['0,0', '1,0', '0,1']);
    interface Lot { bi: number; bj: number; qx: number; qz: number; zone: Zone; used: boolean }
    const lots: Lot[] = [];
    for (let bj = 0; bj < BLOCKS; bj++)
      for (let bi = 0; bi < BLOCKS; bi++) {
        const key = `${bi},${bj}`;
        if (fixed[key]) {
          this.addBuilding(BUILDING_BY_ID[fixed[key]], bi, bj, 'block', 0, 0, 'mid');
          continue;
        }
        const d = Math.max(Math.abs(bi - 3), Math.abs(bj - 3));
        const zone: Zone = industry.has(key) ? 'industry' : d <= 1 ? 'center' : d === 2 ? 'mid' : 'outer';
        for (let qz = 0; qz < 2; qz++) for (let qx = 0; qx < 2; qx++) lots.push({ bi, bj, qx, qz, zone, used: false });
      }
    rng.shuffle(lots);
    const count = new Map<string, number>();
    const inc = (id: string) => count.set(id, (count.get(id) ?? 0) + 1);

    // широкие здания — две соседние клетки по горизонтали
    for (const def of BUILDINGS.filter((b) => b.size === 'wide')) {
      for (let k = 0; k < (def.min ?? 0); k++) {
        const lot = lots.find((l) => !l.used && def.zones.includes(l.zone) && l.qx === 0 && lots.some((m) => !m.used && m.bi === l.bi && m.bj === l.bj && m.qz === l.qz && m.qx === 1));
        if (!lot) continue;
        const other = lots.find((m) => !m.used && m.bi === lot.bi && m.bj === lot.bj && m.qz === lot.qz && m.qx === 1)!;
        lot.used = other.used = true;
        this.addBuilding(def, lot.bi, lot.bj, 'wide', 0, lot.qz, lot.zone);
        inc(def.id);
      }
    }
    // обязательные одиночные
    for (const def of BUILDINGS.filter((b) => b.size === 'lot' && (b.min ?? 0) > 0)) {
      for (let k = 0; k < (def.min ?? 0); k++) {
        const lot = lots.find((l) => !l.used && def.zones.includes(l.zone));
        if (!lot) break;
        lot.used = true;
        this.addBuilding(def, lot.bi, lot.bj, 'lot', lot.qx, lot.qz, lot.zone);
        inc(def.id);
      }
    }
    // остальное — взвешенный случайный выбор
    for (const lot of lots) {
      if (lot.used) continue;
      const cand = BUILDINGS.filter((b) => b.size === 'lot' && b.zones.includes(lot.zone) && (b.max === undefined || (count.get(b.id) ?? 0) < b.max));
      const def = rng.weighted(cand, (b) => {
        let w = b.weight;
        if (b.cat === 'home') w *= lot.zone === 'center' ? 0.6 : 1.6;
        if (lot.zone === 'industry') w = b.zones.length === 1 ? 3 : w * 0.3;
        return w;
      });
      if (!def) continue;
      lot.used = true;
      this.addBuilding(def, lot.bi, lot.bj, 'lot', lot.qx, lot.qz, lot.zone);
      inc(def.id);
    }
  }

  private addBuilding(def: BuildingDef, bi: number, bj: number, size: 'lot' | 'wide' | 'block', qx: number, qz: number, zone: Zone) {
    const rng = this.rng;
    const cx = World.coord(bi) + PITCH / 2, cz = World.coord(bj) + PITCH / 2;
    const inner = PITCH / 2 - LOT_EDGE; // 16
    let x = cx, z = cz, w = inner * 2, d = inner * 2;
    let edge: Edge;
    if (size === 'lot') {
      x = cx + (qx ? inner / 2 : -inner / 2);
      z = cz + (qz ? inner / 2 : -inner / 2);
      w = d = inner;
      const faceVertical = rng.chance(0.5);
      if (faceVertical) edge = this.edgeBetween(this.nodeId(bi + qx, bj), this.nodeId(bi + qx, bj + 1))!;
      else edge = this.edgeBetween(this.nodeId(bi, bj + qz), this.nodeId(bi + 1, bj + qz))!;
    } else if (size === 'wide') {
      z = cz + (qz ? inner / 2 : -inner / 2);
      d = inner;
      edge = this.edgeBetween(this.nodeId(bi, bj + qz), this.nodeId(bi + 1, bj + qz))!;
    } else {
      const k = rng.int(0, 3);
      const opts: [number, number, number, number][] = [
        [bi, bj, bi + 1, bj], [bi, bj + 1, bi + 1, bj + 1], [bi, bj, bi, bj + 1], [bi + 1, bj, bi + 1, bj + 1],
      ];
      const o = opts[k];
      edge = this.edgeBetween(this.nodeId(o[0], o[1]), this.nodeId(o[2], o[3]))!;
    }
    const A = this.nodes[edge.a];
    // проекция центра на ребро
    let t = (x - A.x) * edge.ux + (z - A.z) * edge.uz;
    t = Math.max(STOP_OFF + 2, Math.min(edge.len - STOP_OFF - 2, t));
    const px = A.x + edge.ux * t, pz = A.z + edge.uz * t;
    const side = Math.sign((x - px) * edge.nx + (z - pz) * edge.nz) || 1;
    const entrance: Place = { edge: edge.id, t, side, pos: { x: px + edge.nx * side * (LOT_EDGE + 0.6), z: pz + edge.nz * side * (LOT_EDGE + 0.6) } };
    const floors = def.floors[1] === 0 ? 0 : rng.int(def.floors[0], def.floors[1]);
    const id = this.buildings.length;
    const district = (bi >= 3.5 ? 1 : 0) + (bj >= 3.5 ? 2 : 0);
    let name = def.name;
    if (['shop', 'food', 'leisure'].includes(def.cat) || ['gym', 'pharmacy', 'bakery', 'autoservice'].includes(def.id)) name = `${def.prefix} ${rng.pick(SHOP_NAMES)}`;
    else if (def.cat === 'home') name = `${def.prefix}, ${edge.street.split(' ')[0]} ${Math.floor(t / 4) + 1 + edge.id % 7 * 10}`;
    else if (['school'].includes(def.id)) name = `Школа №${rng.int(3, 112)}`;
    else if (def.id === 'kindergarten') name = `Детский сад «${rng.pick(['Солнышко', 'Колокольчик', 'Теремок', 'Радуга'])}»`;
    else if (def.id === 'park') name = 'Центральный парк';
    else if (def.id === 'pond') name = 'Лебединый пруд';
    else if (def.id === 'stadium') name = 'Стадион «Метеор»';
    else if (def.id === 'square') name = `Сквер ${rng.pick(['Победы', 'Липовый', 'Влюблённых', 'Учителей', 'Дружбы', 'Тихий'])}`;
    const b: Building = {
      id, def, type: def.id, name, x, z, w, d,
      faceX: -edge.nx * side, faceZ: -edge.nz * side,
      floors, height: floors * FLOOR_H, entrance, block: [bi, bj], zone, district, seed: rng.int(0, 1e9),
      residents: [], workers: [], homeCapacity: def.residentsPerFloor ? Math.max(1, Math.round(def.residentsPerFloor * Math.max(1, floors) * 1.2)) : 0,
      inside: new Set(), closedReason: null, onFire: 0, powerOut: false, attraction: 1, priceMul: 1, litWindows: 0,
      growth: def.id === 'construction' ? 0.15 : 1,
    };
    this.buildings.push(b);
    if (!this.byType.has(def.id)) this.byType.set(def.id, []);
    this.byType.get(def.id)!.push(b);
  }

  // ——— маршруты (Флойд–Уоршелл на 64 узлах — мгновенно)
  recomputeRouting() {
    const N = this.nodes.length;
    const run = (car: boolean): [Float64Array, Int16Array] => {
      const dist = new Float64Array(N * N).fill(Infinity);
      const next = new Int16Array(N * N).fill(-1);
      for (let i = 0; i < N; i++) { dist[i * N + i] = 0; next[i * N + i] = i; }
      for (const e of this.edges) {
        if (car && e.closed) continue;
        const w = e.len * (car ? 1 + e.traffic * 1.5 : 1);
        dist[e.a * N + e.b] = w; dist[e.b * N + e.a] = w;
        next[e.a * N + e.b] = e.b; next[e.b * N + e.a] = e.a;
      }
      for (let k = 0; k < N; k++)
        for (let i = 0; i < N; i++) {
          const dik = dist[i * N + k];
          if (dik === Infinity) continue;
          for (let j = 0; j < N; j++) {
            const nd = dik + dist[k * N + j];
            if (nd < dist[i * N + j]) { dist[i * N + j] = nd; next[i * N + j] = next[i * N + k]; }
          }
        }
      return [dist, next];
    };
    [this.distCar, this.nextCar] = run(true);
    [this.distPed, this.nextPed] = run(false);
  }

  nodePath(a: number, b: number, car: boolean): number[] | null {
    const N = this.nodes.length;
    const next = car ? this.nextCar : this.nextPed;
    if (next[a * N + b] < 0) return null;
    const path = [a];
    let cur = a;
    let guard = 0;
    while (cur !== b && guard++ < 200) { cur = next[cur * N + b]; path.push(cur); }
    return path;
  }

  nodeDist(a: number, b: number, car: boolean) {
    return (car ? this.distCar : this.distPed)[a * this.nodes.length + b];
  }

  route(from: Place, to: Place, car: boolean): Route | null {
    const ef = this.edges[from.edge], et = this.edges[to.edge];
    if (from.edge === to.edge) {
      if (to.t >= from.t) return { nodes: [ef.a, ef.b], startS: from.t, endS: to.t, length: to.t - from.t };
      return { nodes: [ef.b, ef.a], startS: ef.len - from.t, endS: ef.len - to.t, length: from.t - to.t };
    }
    let best: Route | null = null;
    let bestCost = Infinity;
    const starts: [number, number, number, number][] = [
      // [первый узел ребра, узел выхода, стоимость, startS]
      [ef.b, ef.a, from.t, ef.len - from.t],
      [ef.a, ef.b, ef.len - from.t, from.t],
    ];
    const ends: [number, number, number, number][] = [
      // [узел входа, конечный узел, стоимость, endS]
      [et.a, et.b, to.t, to.t],
      [et.b, et.a, et.len - to.t, et.len - to.t],
    ];
    for (const [s0, e1, c1, sS] of starts)
      for (const [e2, e3, c2, eS] of ends) {
        const mid = this.nodeDist(e1, e2, car);
        const cost = c1 + mid + c2;
        if (cost < bestCost) {
          const path = this.nodePath(e1, e2, car);
          if (!path) continue;
          bestCost = cost;
          best = { nodes: [s0, ...path, e3], startS: sS, endS: eS, length: cost };
        }
      }
    return best;
  }

  /** точка на тротуаре или полосе */
  pointOn(edgeId: number, t: number, offset: number): V2 {
    const e = this.edges[edgeId];
    const A = this.nodes[e.a];
    return { x: A.x + e.ux * t + e.nx * offset, z: A.z + e.uz * t + e.nz * offset };
  }

  /** ломаная пешехода по тротуарам с переходами на перекрёстках */
  pedPolyline(r: Route, from: Place, to: Place): V2[] {
    const pts: V2[] = [{ ...from.pos }];
    const k = r.nodes.length - 1;
    for (let s = 0; s < k; s++) {
      const P = this.nodes[r.nodes[s]], Q = this.nodes[r.nodes[s + 1]];
      const e = this.edgeBetween(P.id, Q.id)!;
      const dir = e.a === P.id ? 1 : -1;
      const ux = (Q.x - P.x) / e.len, uz = (Q.z - P.z) / e.len;
      const side = s === 0 ? from.side : s === k - 1 ? to.side : dir;
      const ox = e.nx * side * PED_OFF, oz = e.nz * side * PED_OFF;
      const s0 = s === 0 ? r.startS : PED_OFF;
      const s1 = s === k - 1 ? r.endS : e.len - PED_OFF;
      pts.push({ x: P.x + ux * s0 + ox, z: P.z + uz * s0 + oz });
      pts.push({ x: P.x + ux * s1 + ox, z: P.z + uz * s1 + oz });
    }
    pts.push({ ...to.pos });
    return pts;
  }

  randomPointIn(b: Building, rng: RNG, margin = 2): V2 {
    return { x: b.x + rng.range(-b.w / 2 + margin, b.w / 2 - margin), z: b.z + rng.range(-b.d / 2 + margin, b.d / 2 - margin) };
  }

  /** граничные узлы для въезда/выезда транзитного трафика */
  borderNodes(): number[] {
    return this.nodes.filter((n) => n.edges.length === 3).map((n) => n.id);
  }

  nearestBuilding(types: string[], pos: V2, filter?: (b: Building) => boolean): Building | undefined {
    let best: Building | undefined, bd = Infinity;
    for (const t of types)
      for (const b of this.byType.get(t) ?? []) {
        if (filter && !filter(b)) continue;
        const d = Math.abs(b.entrance.pos.x - pos.x) + Math.abs(b.entrance.pos.z - pos.z);
        if (d < bd) { bd = d; best = b; }
      }
    return best;
  }
}

export function isOpen(b: Building, hour: number, day: number): boolean {
  if (b.closedReason) return false;
  const o = b.def.open;
  if (!o) return true;
  const h = hour;
  // работает после полуночи?
  if (o[1] > 24 && h < o[1] - 24) {
    const prevDay = (day + 6) % 7;
    return !b.def.days || b.def.days.includes(prevDay);
  }
  if (b.def.days && !b.def.days.includes(day)) return false;
  return h >= o[0] && h < Math.min(o[1], 24);
}
