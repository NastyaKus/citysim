// Личные цели и привычки жителей.
import type { Sim } from './sim';
import type { Citizen } from './citizen';
import { displayName, assignJob, removeFromWork, computeSleep } from './citizen';
import { JOBS, JobDef } from './content/jobs';
import { RNG } from './rng';
import { gender } from './content/activities';

export type GoalKind = 'car' | 'bike' | 'friends' | 'job' | 'move' | 'savings' | 'love';

export interface Goal {
  kind: GoalKind;
  text: string;
  target: number;
  since: number;
}

export const PRICES = { car: 2500, bike: 300, move: 1500 };

export class Goals {
  rng = new RNG(808);
  week = { achieved: 0, cars: 0, bikes: 0, moves: 0, jobs: 0 };
  constructor(private sim: Sim) {}

  /** текущий прогресс цели 0..1 */
  progress(c: Citizen): number {
    const g = c.goal;
    if (!g) return 0;
    switch (g.kind) {
      case 'car': case 'bike': case 'move': case 'savings': return Math.max(0, Math.min(1, c.money / g.target));
      case 'friends': return Math.min(1, c.friends.length / g.target);
      case 'love': return c.partner >= 0 ? 1 : 0;
      case 'job': return c.job.id !== 'unemployed' && c.job.salary >= g.target ? 1 : 0;
    }
  }

  /** копит ли житель (тратит меньше) */
  saving(c: Citizen): boolean {
    return !!c.goal && ['car', 'bike', 'move', 'savings'].includes(c.goal.kind);
  }

  private pick(c: Citizen): Goal | undefined {
    const now = this.sim.clock.total;
    const opts: [GoalKind, number][] = [];
    if (c.age < 16) return undefined;
    if (!c.hasCar && c.age >= 18 && !c.traits.some((t) => t.id === 'eco')) opts.push(['car', c.traits.some((t) => t.id === 'carlover') ? 4 : 1.2]);
    if (!c.hasBike && c.age < 70) opts.push(['bike', c.traits.some((t) => t.id === 'sporty' || t.id === 'eco') ? 3 : 0.8]);
    if (c.friends.length < 3) opts.push(['friends', c.traits.some((t) => t.id === 'social') ? 3 : 1.5]);
    if (c.job.id === 'unemployed' && c.age < 63) opts.push(['job', 5]);
    else if (c.work >= 0 && c.job.salary < 150 && c.age < 55) opts.push(['job', 0.8]);
    if (c.partner < 0 && c.age >= 18 && c.age < 60) opts.push(['love', c.traits.some((t) => t.id === 'romantic') ? 3 : 1]);
    const home = this.sim.world.buildings[c.home];
    if (home.type !== 'house' && c.age >= 25 && c.children.length) opts.push(['move', 1]);
    opts.push(['savings', c.traits.some((t) => t.id === 'frugal') ? 2 : 0.5]);
    const k = this.rng.weighted(opts, (o) => o[1])?.[0];
    if (!k) return undefined;
    switch (k) {
      case 'car': return { kind: k, text: 'накопить на машину', target: PRICES.car, since: now };
      case 'bike': return { kind: k, text: 'купить велосипед', target: PRICES.bike, since: now };
      case 'friends': return { kind: k, text: 'завести друзей', target: Math.max(3, c.friends.length + 2), since: now };
      case 'job': return { kind: k, text: c.job.id === 'unemployed' ? 'найти работу' : 'найти работу получше', target: c.job.id === 'unemployed' ? 1 : c.job.salary + 30, since: now };
      case 'love': return { kind: k, text: 'встретить свою любовь', target: 1, since: now };
      case 'move': return { kind: k, text: 'переехать в свой дом', target: PRICES.move, since: now };
      default: return { kind: 'savings', text: 'отложить денег на чёрный день', target: Math.round(c.money + 600), since: now };
    }
  }

  daily() {
    const sim = this.sim;
    for (const c of sim.citizens) {
      if (!c.alive || c.age < 16) continue;
      if (!c.goal) {
        if (this.rng.chance(0.35)) {
          c.goal = this.pick(c);
          if (c.goal) sim.brain.log(c, `поставил${c.female ? 'а' : ''} цель: ${c.goal.text}`);
        }
        continue;
      }
      if (c.controlled) continue; // за игрока решает игрок
      const g = c.goal;
      if (this.progress(c) >= 1) this.achieve(c);
      else if (g.kind === 'job' && c.job.id === 'unemployed' && this.rng.chance(0.15)) this.changeJob(c);
      else if (g.kind === 'job' && c.work >= 0 && this.rng.chance(0.08)) this.changeJob(c, g.target);
      else if (sim.clock.total - g.since > sim.params.yearDays * 1440 * 0.6 && this.rng.chance(0.3)) {
        sim.brain.log(c, `передумал${c.female ? 'а' : ''}: ${g.text}`);
        c.goal = undefined;
      }
    }
  }

  /** цель достигнута: покупка, переезд и т.д. */
  achieve(c: Citizen) {
    const sim = this.sim;
    const g = c.goal;
    if (!g) return;
    let news = '';
    switch (g.kind) {
      case 'car': if (!this.buyCar(c)) return; news = gender('купил{|а} машину мечты', c.female); break;
      case 'bike': if (!this.buyBike(c)) return; news = gender('купил{|а} велосипед', c.female); break;
      case 'move': if (!this.moveHouse(c)) return; news = gender('переехал{|а} в собственный дом', c.female); break;
      case 'friends': news = gender('обзавёл{ся|ась} друзьями', c.female); break;
      case 'love': news = gender('наш{ёл|ла} свою любовь', c.female); break;
      case 'job': news = gender(`наш{ёл|ла} работу: ${c.female && c.job.nameF ? c.job.nameF : c.job.name}`, c.female); break;
      case 'savings': news = gender('отложил{|а} денег на чёрный день', c.female); break;
    }
    c.goal = undefined;
    c.mood = Math.min(100, c.mood + 20);
    sim.brain.log(c, `🎯 цель достигнута: ${news}`);
    sim.news.push('🎯', `${displayName(c)} ${news}`, 'people', { citizen: c.id });
    this.week.achieved++;
  }

  buyCar(c: Citizen): boolean {
    if (c.money < PRICES.car || c.hasCar) return false;
    c.money -= PRICES.car;
    c.hasCar = true;
    c.carAt = c.at >= 0 ? c.at : c.home;
    c.fuel = 1;
    c.carColor = this.rng.pick([0xe63946, 0x1d3557, 0x2a9d8f, 0xe9c46a, 0x111111, 0xf1faee, 0x6a4c93]);
    c.carType = this.rng.pick(['sedan', 'hatch', 'suv', 'cabrio'] as const);
    c.modeBias = { ...(c.modeBias ?? {}), car: (c.modeBias?.car ?? 0) + 0.5 };
    this.week.cars++;
    return true;
  }

  buyBike(c: Citizen): boolean {
    if (c.money < PRICES.bike || c.hasBike) return false;
    c.money -= PRICES.bike;
    c.hasBike = true;
    c.modeBias = { ...(c.modeBias ?? {}), bike: (c.modeBias?.bike ?? 0) + 0.6 };
    this.week.bikes++;
    return true;
  }

  moveHouse(c: Citizen, target?: number): boolean {
    const sim = this.sim;
    const members = [c, ...c.household.map((id) => sim.citizens[id])].filter((m) => m?.alive);
    const homes = sim.world.buildings.filter((b) => b.def.cat === 'home' && b.id !== c.home && b.homeCapacity - b.residents.length >= members.length && (target === undefined || b.id === target));
    if (!homes.length || c.money < PRICES.move) return false;
    const pref = homes.filter((b) => b.type === 'house');
    const nb = target !== undefined ? homes[0] : this.rng.pick(pref.length ? pref : homes);
    c.money -= PRICES.move;
    const old = sim.world.buildings[c.home];
    for (const m of members) {
      old.residents = old.residents.filter((x) => x !== m.id);
      nb.residents.push(m.id);
      if (m.at === m.home && !m.trip && !m.controlled) { old.inside.delete(m.id); nb.inside.add(m.id); m.at = nb.id; m.x = nb.entrance.pos.x; m.z = nb.entrance.pos.z; }
      m.home = nb.id;
      if (m.carAt === old.id) m.carAt = nb.id;
    }
    this.week.moves++;
    return true;
  }

  /** сменить работу (найти лучше или любую) */
  changeJob(c: Citizen, minSalary = 0, job?: JobDef): boolean {
    const sim = this.sim;
    const cand = job ? [job] : JOBS.filter((j) => c.age >= j.ages[0] && c.age <= j.ages[1] && j.salary >= minSalary && j.places.some((p) => sim.world.byType.has(p)));
    if (!cand.length) return false;
    const j = job ?? this.rng.weighted(cand, (x) => x.weight)!;
    removeFromWork(c, sim.world);
    assignJob(c, j, sim.world, this.rng);
    computeSleep(c, this.rng);
    sim.adjustWake(c);
    this.week.jobs++;
    if (c.goal?.kind === 'job' && c.job.salary >= c.goal.target) this.achieve(c);
    return true;
  }
}
