import type { Sim } from './sim';
import type { Mode } from './content/traits';

export interface Snapshot {
  t: number;
  sleeping: number;
  working: number;
  travelling: number;
  leisure: number;
  home: number;
  outdoors: number;
  mood: number;
  money: number;
  congestion: number;
  busLoad: number;
  waiting: number;
  pollution: number;
  cars: number;
  sick: number;
  unemployed: number;
}

export const HISTORY_LEN = 144;

export class Stats {
  modeTrips: Record<Mode, number> = { walk: 0, bike: 0, car: 0, bus: 0, taxi: 0 };
  earned = 0;
  spent = 0;
  earnedToday = 0;
  spentToday = 0;
  lateArrivals = 0;
  lateToday = 0;
  tripTimeSum = 0;
  tripTimeN = 0;
  pollution = 10;
  history: Snapshot[] = [];
  current: Snapshot = this.empty();
  private lastSample = -999;
  private lastDecay = 0;

  constructor(private sim: Sim) {}

  empty(): Snapshot {
    return { t: 0, sleeping: 0, working: 0, travelling: 0, leisure: 0, home: 0, outdoors: 0, mood: 0, money: 0, congestion: 0, busLoad: 0, waiting: 0, pollution: 0, cars: 0, sick: 0, unemployed: 0 };
  }

  recordTrip(min: number) {
    this.tripTimeSum += min;
    this.tripTimeN += 1;
  }

  get avgTrip() {
    return this.tripTimeN ? this.tripTimeSum / this.tripTimeN : 0;
  }

  update(dt: number) {
    const sim = this.sim;
    const now = sim.clock.total;
    // скользящее затухание
    if (now - this.lastDecay > 30) {
      this.lastDecay = now;
      for (const k of Object.keys(this.modeTrips) as Mode[]) this.modeTrips[k] *= 0.93;
      this.tripTimeSum *= 0.93;
      this.tripTimeN *= 0.93;
    }
    // загрязнение
    const cars = sim.transport.vehicles.filter((v) => !v.done && v.role !== 'bus').length;
    const factoryOn = (sim.world.byType.get('factory') ?? []).some((f) => !f.closedReason && f.inside.size > 5);
    this.pollution += dt * (cars * 0.0035 + (factoryOn ? 0.06 : 0) + sim.transport.busesOnRoute(0).length * 0.002);
    this.pollution -= dt * this.pollution * (0.006 + sim.weather.wind * 0.02 + (sim.weather.raining ? 0.012 : 0));
    this.pollution = Math.max(0, Math.min(100, this.pollution));
    this.earnedToday += 0;
    if (now - this.lastSample >= 10) {
      this.lastSample = now;
      const s = this.snapshot();
      this.current = s;
      this.history.push(s);
      if (this.history.length > HISTORY_LEN) this.history.shift();
    }
  }

  snapshot(): Snapshot {
    const sim = this.sim;
    const s = this.empty();
    s.t = sim.clock.total;
    let n = 0;
    for (const c of sim.citizens) {
      if (!c.alive) continue;
      n++;
      s.mood += c.mood;
      s.money += c.money;
      if (c.sick > 0) s.sick++;
      if (c.job.id === 'unemployed') s.unemployed++;
      if (c.trip) { s.travelling++; continue; }
      const a = c.act?.id;
      if (a === 'sleep' || a === 'nap') s.sleeping++;
      else if (a === 'work' || a === 'school' || a === 'study' || a === 'kinder') s.working++;
      else if (c.at === c.home) s.home++;
      else s.leisure++;
      if (c.state === 'outdoor') s.outdoors++;
    }
    s.mood = n ? s.mood / n : 0;
    s.money = n ? s.money / n : 0;
    s.congestion = 1 - sim.transport.avgSpeedRatio;
    const buses = sim.transport.vehicles.filter((v) => !v.done && v.role === 'bus');
    s.busLoad = buses.length ? buses.reduce((a, b) => a + b.passengers.length, 0) / (buses.length * 32) : 0;
    s.waiting = sim.transport.stops.reduce((a, st) => a + st.waiting.length, 0);
    s.pollution = this.pollution;
    s.cars = sim.transport.vehicles.filter((v) => !v.done && v.role !== 'bus').length;
    return s;
  }

  newDay() {
    this.earnedToday = this.earned;
    this.spentToday = this.spent;
    this.lateToday = this.lateArrivals;
    this.earned = 0;
    this.spent = 0;
    this.lateArrivals = 0;
  }
}
