// Транспорт: машины, автобусы, спецтранспорт, светофоры.
import { World, Place, Route, V2, LANE_OFF, STOP_OFF, Edge } from './world';
import { RNG, clamp } from './rng';
import type { Sim } from './sim';

export type VehicleType =
  | 'sedan' | 'hatch' | 'pickup' | 'cabrio' | 'suv' | 'taxi' | 'bus' | 'truck' | 'garbage'
  | 'ambulance' | 'police' | 'firetruck' | 'van' | 'plow';

export const VEHICLE_INFO: Record<VehicleType, { len: number; speed: number; name: string }> = {
  sedan: { len: 4.4, speed: 1, name: 'седан' },
  hatch: { len: 3.8, speed: 1, name: 'хэтчбек' },
  pickup: { len: 5, speed: 0.95, name: 'пикап' },
  cabrio: { len: 4.2, speed: 1.08, name: 'кабриолет' },
  suv: { len: 4.8, speed: 0.98, name: 'кроссовер' },
  taxi: { len: 4.4, speed: 1.03, name: 'такси' },
  bus: { len: 10, speed: 0.75, name: 'автобус' },
  truck: { len: 6.5, speed: 0.8, name: 'грузовик доставки' },
  garbage: { len: 7, speed: 0.55, name: 'мусоровоз' },
  ambulance: { len: 5.6, speed: 1.3, name: 'скорая' },
  police: { len: 4.6, speed: 1.3, name: 'полиция' },
  firetruck: { len: 8, speed: 1.15, name: 'пожарная машина' },
  van: { len: 6, speed: 0.85, name: 'фургон для переезда' },
  plow: { len: 6.5, speed: 0.55, name: 'снегоуборщик' },
};

export const CAR_COLORS = [0xe63946, 0xf1faee, 0x1d3557, 0x457b9d, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0x264653, 0x8d99ae, 0x111111, 0xd8d8d8, 0x6a4c93, 0x8ac926, 0xff595e, 0xc0c0c0, 0x7f5539];

export interface Seg {
  ax: number; az: number; bx: number; bz: number;
  len: number; ux: number; uz: number;
  key: number; // направленное ребро или -1 для перекрёстка
  node: number; // конечный узел (для ребра) или узел перекрёстка
  base: number; // координата начала вдоль ребра
  axis: 'x' | 'z';
  edge: number;
}

export type VehicleRole = 'citizen' | 'taxi' | 'bus' | 'through' | 'service' | 'emergency' | 'wedding';

export interface Vehicle {
  id: number;
  type: VehicleType;
  role: VehicleRole;
  color: number;
  segs: Seg[];
  si: number;
  s: number;
  v: number;
  len: number;
  maxV: number;
  loop: boolean;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  yieldAmt: number;
  yieldTarget: number;
  emergency: boolean;
  siren: boolean;
  passengers: number[];
  owner: number;
  dwell: number;
  routeId: number;
  nextStop: number;
  stuck: number;
  ghost: number;
  done: boolean;
  decorated: boolean;
  hazard: boolean;
  frozen: number; // стоит (ДТП) до времени
  onArrive?: (v: Vehicle) => void;
  label?: string;
  travelled: number;
  blocked?: boolean;
}

export interface BusStop {
  id: number;
  routeId: number;
  seg: number;
  s: number;
  place: Place;
  name: string;
  waiting: number[];
  order: number; // расстояние вдоль маршрута
}

export interface BusRoute {
  id: number;
  name: string;
  color: number;
  nodes: number[];
  segs: Seg[];
  stops: BusStop[];
  length: number;
  cum: number[];
}

export type LightState = 'green' | 'yellow' | 'red' | 'blink';

export class Transport {
  vehicles: Vehicle[] = [];
  routes: BusRoute[] = [];
  stops: BusStop[] = [];
  private nextId = 1;
  lightsBroken = new Set<number>(); // узлы с неработающими светофорами
  strike = false;
  rng: RNG;
  spawnAcc = 0;
  avgSpeedRatio = 1;
  /** точки, перед которыми машины тормозят (игрок) */
  obstacles: V2[] = [];
  constructor(private sim: Sim, private world: World) {
    this.rng = new RNG(777);
    this.buildRoutes();
  }

  // ——— светофоры
  light(node: number, axis: 'x' | 'z', t: number): LightState {
    const n = this.world.nodes[node];
    if (!n.hasLight) return 'green';
    if (this.lightsBroken.has(node)) return 'blink';
    const G = this.sim.params.lightCycle;
    const Y = Math.max(0.2, G * 0.18);
    const T = 2 * (G + Y);
    let p = (t + n.lightOffset) % T;
    if (axis === 'z') p = (p + G + Y) % T;
    if (p < G) return 'green';
    if (p < G + Y) return 'yellow';
    return 'red';
  }

  // ——— построение ломаных
  segsForRoute(r: Route): Seg[] {
    const w = this.world;
    const segs: Seg[] = [];
    const k = r.nodes.length - 1;
    for (let i = 0; i < k; i++) {
      const P = w.nodes[r.nodes[i]], Q = w.nodes[r.nodes[i + 1]];
      const e = w.edgeBetween(P.id, Q.id)!;
      const dir = e.a === P.id ? 1 : -1;
      const ux = (Q.x - P.x) / e.len, uz = (Q.z - P.z) / e.len;
      const ox = e.nx * dir * LANE_OFF, oz = e.nz * dir * LANE_OFF;
      const s0 = i === 0 ? Math.max(r.startS, 0.5) : STOP_OFF;
      const s1 = i === k - 1 ? r.endS : e.len - STOP_OFF;
      if (i > 0) {
        const prev = segs[segs.length - 1];
        const ax = prev.bx, az = prev.bz, bx = P.x + ux * s0 + ox, bz = P.z + uz * s0 + oz;
        const len = Math.hypot(bx - ax, bz - az) || 0.01;
        segs.push({ ax, az, bx, bz, len, ux: (bx - ax) / len, uz: (bz - az) / len, key: -1, node: P.id, base: 0, axis: e.axis, edge: -1 });
      }
      const ax = P.x + ux * s0 + ox, az = P.z + uz * s0 + oz, bx = P.x + ux * s1 + ox, bz = P.z + uz * s1 + oz;
      const len = Math.max(0.01, s1 - s0);
      segs.push({ ax, az, bx, bz, len, ux, uz, key: e.id * 2 + (dir > 0 ? 0 : 1), node: Q.id, base: s0, axis: e.axis, edge: e.id });
    }
    return segs;
  }

  private loopSegs(nodes: number[]): Seg[] {
    const w = this.world;
    const segs: Seg[] = [];
    const n = nodes.length - 1; // последний == первый
    const edgeSeg = (i: number): Seg => {
      const P = w.nodes[nodes[i]], Q = w.nodes[nodes[i + 1]];
      const e = w.edgeBetween(P.id, Q.id)!;
      const dir = e.a === P.id ? 1 : -1;
      const ux = (Q.x - P.x) / e.len, uz = (Q.z - P.z) / e.len;
      const ox = e.nx * dir * LANE_OFF, oz = e.nz * dir * LANE_OFF;
      const s0 = STOP_OFF, s1 = e.len - STOP_OFF;
      return { ax: P.x + ux * s0 + ox, az: P.z + uz * s0 + oz, bx: P.x + ux * s1 + ox, bz: P.z + uz * s1 + oz, len: s1 - s0, ux, uz, key: e.id * 2 + (dir > 0 ? 0 : 1), node: Q.id, base: s0, axis: e.axis, edge: e.id };
    };
    const es: Seg[] = [];
    for (let i = 0; i < n; i++) es.push(edgeSeg(i));
    for (let i = 0; i < n; i++) {
      segs.push(es[i]);
      const nx = es[(i + 1) % n];
      const len = Math.hypot(nx.ax - es[i].bx, nx.az - es[i].bz) || 0.01;
      segs.push({ ax: es[i].bx, az: es[i].bz, bx: nx.ax, bz: nx.az, len, ux: (nx.ax - es[i].bx) / len, uz: (nx.az - es[i].bz) / len, key: -1, node: es[i].node, base: 0, axis: nx.axis, edge: -1 });
    }
    return segs;
  }

  private buildRoutes() {
    const w = this.world;
    const rect = (i0: number, j0: number, i1: number, j1: number): number[] => {
      const out: number[] = [];
      for (let i = i0; i < i1; i++) out.push(w.nodeId(i, j0));
      for (let j = j0; j < j1; j++) out.push(w.nodeId(i1, j));
      for (let i = i1; i > i0; i--) out.push(w.nodeId(i, j1));
      for (let j = j1; j > j0; j--) out.push(w.nodeId(i0, j));
      out.push(w.nodeId(i0, j0));
      return out;
    };
    const defs: [string, number, number[]][] = [
      ['№1 Кольцевой', 0xe63946, rect(1, 1, 6, 6)],
      ['№2 Вокзал — Стадион', 0x2a9d8f, rect(2, 0, 5, 7)],
      ['№3 Заводской', 0xf4a261, rect(0, 2, 7, 5)],
    ];
    defs.forEach(([name, color, nodes], id) => {
      const segs = this.loopSegs(nodes);
      const cum: number[] = [];
      segs.reduce((a, sg) => (cum.push(a), a + sg.len), 0);
      const route: BusRoute = { id, name, color, nodes, segs, stops: [], length: segs.reduce((a, s) => a + s.len, 0), cum };
      let acc = 0;
      segs.forEach((s, si) => {
        if (s.key >= 0 && (si / 2) % 2 === 0) {
          const e = w.edges[s.edge];
          const dir = s.key % 2 === 0 ? 1 : -1;
          const sl = s.len / 2;
          const tCanon = dir > 0 ? s.base + sl : e.len - (s.base + sl);
          const pp = w.pointOn(e.id, tCanon, dir * 8.6);
          const stop: BusStop = { id: this.stops.length, routeId: id, seg: si, s: sl, place: { edge: e.id, t: tCanon, side: dir, pos: pp }, name: `ост. «${e.street}»`, waiting: [], order: acc + sl };
          route.stops.push(stop);
          this.stops.push(stop);
        }
        acc += s.len;
      });
      this.routes.push(route);
    });
  }

  // ——— создание машин
  spawn(type: VehicleType, role: VehicleRole, segs: Seg[], opts: Partial<Vehicle> = {}): Vehicle {
    const info = VEHICLE_INFO[type];
    const v: Vehicle = {
      id: this.nextId++, type, role, color: opts.color ?? this.rng.pick(CAR_COLORS), segs, si: 0, s: 0, v: 0, len: info.len,
      maxV: 22 * info.speed * this.rng.range(0.9, 1.1), loop: false, x: segs[0]?.ax ?? 0, z: segs[0]?.az ?? 0,
      dirX: segs[0]?.ux ?? 1, dirZ: segs[0]?.uz ?? 0, yieldAmt: 0, yieldTarget: 0, emergency: false, siren: false,
      passengers: [], owner: -1, dwell: 0, routeId: -1, nextStop: 0, stuck: 0, ghost: 0, done: false, decorated: false,
      hazard: false, frozen: 0, travelled: 0, ...opts,
    };
    this.vehicles.push(v);
    return v;
  }

  driveTo(type: VehicleType, role: VehicleRole, from: Place, to: Place, opts: Partial<Vehicle> = {}): Vehicle | null {
    const r = this.world.route(from, to, true) ?? this.world.route(from, to, false);
    if (!r) return null;
    const segs = this.segsForRoute(r);
    if (!segs.length) return null;
    return this.spawn(type, role, segs, opts);
  }

  spawnBus(route: BusRoute, atSeg?: number) {
    const si = atSeg ?? this.rng.int(0, route.segs.length - 1) & ~1;
    const v = this.spawn('bus', 'bus', route.segs, { loop: true, routeId: route.id, color: route.color, si, label: route.name });
    const seg = route.segs[si];
    v.x = seg.ax; v.z = seg.az;
    v.nextStop = this.firstStopAhead(route, si, 0);
    return v;
  }

  private firstStopAhead(route: BusRoute, si: number, s: number) {
    for (let k = 0; k < route.stops.length; k++) {
      const st = route.stops[k];
      if (st.seg > si || (st.seg === si && st.s > s)) return k;
    }
    return 0;
  }

  remove(v: Vehicle) {
    v.done = true;
  }

  busesOnRoute(id: number) {
    return this.vehicles.filter((v) => !v.done && v.role === 'bus' && v.routeId === id);
  }

  // ——— шаг симуляции
  update(dt: number, t: number) {
    const sim = this.sim;
    const p = sim.params;
    const weather = sim.weather;
    const driveMul = weather.driveFactor() * p.speedLimit;
    // автобусы: подстраиваем количество
    for (const r of this.routes) {
      const buses = this.busesOnRoute(r.id);
      const want = this.strike ? 0 : p.busCount;
      if (buses.length < want && this.rng.chance(0.02 + dt * 0.5)) this.spawnBus(r);
      else if (buses.length > want) {
        const b = buses.find((x) => x.passengers.length === 0) ?? buses[0];
        sim.unloadVehicle(b);
        this.remove(b);
      }
    }
    // транзитный трафик
    const hour = sim.clock.hour;
    const rush = 0.35 + Math.exp(-((hour - 8.3) ** 2) / 1.2) * 1.2 + Math.exp(-((hour - 18) ** 2) / 2) * 1.1 + (hour > 10 && hour < 17 ? 0.35 : 0) - (hour < 5 ? 0.25 : 0);
    const throughCount = this.vehicles.filter((v) => v.role === 'through' && !v.done).length;
    const target = Math.round(p.throughTraffic * 34 * rush * (p.fuelPrice > 0 ? clamp(1.6 - p.fuelPrice / 10, 0.3, 1.6) : 1.6));
    this.spawnAcc += dt;
    if (throughCount < target && this.spawnAcc > 0.15) {
      this.spawnAcc = 0;
      this.spawnThrough();
    }

    // корзины по направленным рёбрам
    const buckets = new Map<number, Vehicle[]>();
    for (const v of this.vehicles) {
      if (v.done) continue;
      const seg = v.segs[v.si];
      if (!seg) continue;
      const key = seg.key;
      if (key < 0) continue;
      let arr = buckets.get(key);
      if (!arr) buckets.set(key, (arr = []));
      arr.push(v);
    }
    const coord = (v: Vehicle) => v.segs[v.si].base + v.s;
    for (const arr of buckets.values()) arr.sort((a, b) => coord(a) - coord(b));
    // уступить дорогу спецтранспорту
    for (const arr of buckets.values()) {
      for (const v of arr) v.yieldTarget = 0;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (!e.siren) continue;
        for (let j = i + 1; j < arr.length; j++) {
          if (coord(arr[j]) - coord(e) > 40) break;
          if (!arr[j].emergency) arr[j].yieldTarget = 1;
        }
      }
    }
    // загруженность рёбер
    for (const e of this.world.edges) e.traffic *= Math.exp(-dt * 0.05);
    for (const [key, arr] of buckets) {
      const e = this.world.edges[key >> 1];
      const slow = arr.filter((v) => v.v < v.maxV * 0.35).length;
      e.traffic = Math.max(e.traffic, clamp(slow / 7));
    }

    let speedSum = 0, speedN = 0;
    const firstOn = (key: number) => buckets.get(key)?.[0];
    for (const v of this.vehicles) {
      if (v.done) continue;
      if (v.frozen > t) { v.v = 0; continue; }
      if (v.dwell > 0) {
        v.dwell -= dt;
        v.v = 0;
        continue;
      }
      const seg = v.segs[v.si];
      if (!seg) { this.finish(v); continue; }
      let gap = Infinity;
      const isLastSeg = !v.loop && v.si === v.segs.length - 1;
      if (isLastSeg) {
        gap = seg.len - v.s;
        if (gap < 0.6) { this.finish(v); continue; }
        gap += 1.2; // доезжаем до точки, не тормозя в ноль заранее
      }
      if (seg.key >= 0) {
        const arr = buckets.get(seg.key);
        const idx = arr ? arr.indexOf(v) : -1;
        const leader = arr && idx >= 0 ? arr[idx + 1] : undefined;
        if (leader && v.ghost <= 0 && !(v.emergency && leader.yieldTarget > 0)) {
          gap = Math.min(gap, coord(leader) - coord(v) - (leader.len + v.len) / 2 - 1.6);
        }
        if (!isLastSeg) {
          const toEnd = seg.len - v.s;
          const st = this.light(seg.node, seg.axis, t);
          if (!v.emergency) {
            if (st === 'red' || (st === 'yellow' && toEnd > 4)) gap = Math.min(gap, toEnd - 0.6);
          }
          if (!leader) {
            const inter = v.segs[(v.si + 1) % v.segs.length];
            const nextEdge = v.segs[(v.si + 2) % v.segs.length];
            if (nextEdge && nextEdge.key >= 0 && inter) {
              const tail = firstOn(nextEdge.key);
              if (tail && tail !== v && v.ghost <= 0) gap = Math.min(gap, toEnd + inter.len + (coord(tail) - nextEdge.base) - (tail.len + v.len) / 2 - 1.6);
            }
          }
          // мигающий жёлтый — притормозить
          if (st === 'blink' && toEnd < 12) gap = Math.min(gap, Math.max(1.5, toEnd));
        }
      } else {
        const nextEdge = v.segs[(v.si + 1) % v.segs.length];
        if (nextEdge && nextEdge.key >= 0) {
          const tail = firstOn(nextEdge.key);
          if (tail && tail !== v && v.ghost <= 0) gap = Math.min(gap, seg.len - v.s + (coord(tail) - nextEdge.base) - (tail.len + v.len) / 2 - 1.6);
        }
      }
      // пешеход-игрок на полосе
      v.blocked = false;
      for (const o of this.obstacles) {
        const rx = o.x - v.x, rz = o.z - v.z;
        const along = rx * v.dirX + rz * v.dirZ;
        const lat = Math.abs(-rx * v.dirZ + rz * v.dirX);
        if (along > 0 && along < 16 && lat < 2.3) {
          gap = Math.min(gap, along - v.len / 2 - 1.6);
          v.blocked = true;
        }
      }
      // автобусные остановки
      if (v.role === 'bus') {
        const route = this.routes[v.routeId];
        const stop = route.stops[v.nextStop];
        if (stop && stop.seg === v.si) {
          const d = stop.s - v.s;
          if (d <= 0.4) {
            const n = sim.busAtStop(v, stop);
            v.dwell = 0.35 + 0.05 * n;
            // выравнивание интервалов: если догоняем впереди идущий автобус — придержаться
            const others = this.busesOnRoute(v.routeId).filter((o) => o !== v);
            if (others.length) {
              const L = route.length;
              const pos = route.cum[v.si] + v.s;
              let ahead = L;
              for (const o of others) ahead = Math.min(ahead, (route.cum[o.si] + o.s - pos + L) % L || L);
              const ideal = L / (others.length + 1);
              if (ahead < ideal * 0.75) v.dwell += Math.min(4, (ideal * 0.75 - ahead) / 12);
            }
            v.nextStop = (v.nextStop + 1) % route.stops.length;
            v.v = 0;
            continue;
          }
          gap = Math.min(gap, d);
        }
      }
      if (v.role === 'service' && v.type === 'garbage' && seg.key >= 0 && this.rng.chance(dt * 0.15)) {
        v.dwell = 0.4; // забирает мусор
      }
      let vmax = v.maxV * (v.emergency ? 1.15 : driveMul);
      if (v.yieldTarget > 0) vmax *= 0.35;
      if (weather.icy && !v.emergency) vmax *= this.rng.range(0.85, 1);
      const allowed = Math.sqrt(Math.max(0, gap) * 2 * 140);
      const accel = v.type === 'bus' || v.type === 'garbage' ? 40 : 65;
      v.v = Math.min(vmax, allowed, v.v + accel * dt);
      if (gap < 0.05) v.v = 0;
      v.yieldAmt += (v.yieldTarget - v.yieldAmt) * Math.min(1, dt * 6);
      const ds = v.v * dt;
      v.s += ds;
      v.travelled += ds;
      if (v.v < 0.3) v.stuck += dt; else v.stuck = 0;
      if (v.stuck > 8) { v.ghost = 1.2; v.stuck = 0; }
      if (v.ghost > 0) v.ghost -= dt;
      while (v.s >= v.segs[v.si].len) {
        if (!v.loop && v.si === v.segs.length - 1) { this.finish(v); break; }
        v.s -= v.segs[v.si].len;
        v.si = (v.si + 1) % v.segs.length;
      }
      if (v.done) continue;
      const sg = v.segs[v.si];
      const f = clamp(v.s / sg.len);
      // сдвиг к обочине при уступании
      const nx = -sg.uz, nz = sg.ux;
      v.x = sg.ax + (sg.bx - sg.ax) * f + nx * v.yieldAmt * 1.7;
      v.z = sg.az + (sg.bz - sg.az) * f + nz * v.yieldAmt * 1.7;
      v.dirX = sg.ux; v.dirZ = sg.uz;
      if (!v.emergency && v.role !== 'bus') { speedSum += v.v / Math.max(1, vmax); speedN++; }
    }
    this.avgSpeedRatio = speedN ? speedSum / speedN : 1;
    if (this.vehicles.length > 50 && this.vehicles.some((v) => v.done)) this.vehicles = this.vehicles.filter((v) => !v.done);
  }

  private finish(v: Vehicle) {
    v.done = true;
    v.v = 0;
    v.onArrive?.(v);
  }

  private spawnThrough() {
    const w = this.world;
    const border = w.edges.filter((e) => {
      const A = w.nodes[e.a], B = w.nodes[e.b];
      return (A.edges.length < 4 || B.edges.length < 4) && !e.closed;
    });
    const e1 = this.rng.pick(border);
    let e2 = this.rng.pick(border);
    if (e2 === e1) e2 = this.rng.pick(w.edges);
    const mk = (e: Edge): Place => {
      const t = this.rng.range(STOP_OFF + 1, e.len - STOP_OFF - 1);
      return { edge: e.id, t, side: 1, pos: w.pointOn(e.id, t, 0) };
    };
    // часть машин едет к случайным зданиям (жители соседних районов)
    let to = mk(e2);
    if (this.rng.chance(0.4)) {
      const b = this.rng.pick(w.buildings);
      to = b.entrance;
    }
    const type = this.rng.weighted<VehicleType>(['sedan', 'hatch', 'pickup', 'cabrio', 'suv', 'truck', 'taxi'], (x) => ({ sedan: 5, hatch: 4, pickup: 1.2, cabrio: this.sim.weather.temp > 18 && this.sim.weather.def.precip === 'none' ? 1.2 : 0.2, suv: 3, truck: 0.8, taxi: 1 } as Record<string, number>)[x])!;
    this.driveTo(type, 'through', mk(e1), to);
  }

  dispatch(type: VehicleType, fromType: string, to: Place, label: string, onArrive?: (v: Vehicle) => void): Vehicle | null {
    const base = this.world.byType.get(fromType)?.[0];
    const from = base ? base.entrance : to;
    const v = this.driveTo(type, 'emergency', from, to, { emergency: true, siren: true, label, color: type === 'police' ? 0xffffff : type === 'firetruck' ? 0xd62828 : 0xffffff, onArrive });
    if (v) v.maxV = 22 * VEHICLE_INFO[type].speed;
    return v;
  }

  placeFromVehicle(v: Vehicle): Place {
    const seg = v.segs[v.si];
    const w = this.world;
    let edge = seg.edge;
    if (edge < 0) {
      const n = w.nodes[seg.node];
      edge = n.edges[0];
    }
    const e = w.edges[edge];
    const A = w.nodes[e.a];
    const t = clamp((v.x - A.x) * e.ux + (v.z - A.z) * e.uz, 1, e.len - 1);
    const side = Math.sign((v.x - A.x) * e.nx + (v.z - A.z) * e.nz) || 1;
    const pos: V2 = w.pointOn(e.id, t, side * 8.6);
    return { edge: e.id, t, side, pos };
  }
}
