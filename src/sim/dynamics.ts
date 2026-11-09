// Город меняется сам: заведения закрываются и открываются, стройки, районы, культура.
import type { Sim } from './sim';
import type { Building } from './world';
import { DISTRICT_NAMES, isOpen } from './world';
import { BUILDINGS, BUILDING_BY_ID, BuildingDef } from './content/buildings';
import { displayName } from './citizen';
import { RNG } from './rng';
import { SPECIAL_JOBS } from './content/jobs';

export interface DistrictStat { name: string; residents: number; jobs: number; open: number; vacant: number; mood: number; visits: number; trend: number }

/** заведения, которые могут закрываться и меняться */
const SWAPPABLE = ['grocery', 'kiosk', 'coffee', 'cafe', 'shawarma', 'pizzeria', 'bar', 'bakery', 'gym', 'pharmacy', 'office', 'cowork', 'itoffice', 'warehouse'];

export class Dynamics {
  rng = new RNG(4321);
  districts: DistrictStat[] = [];
  favorite: number = -1;
  traditions: { eventId: string; name: string; weekday: number; hour: number; since: number }[] = [];
  private eventCounts = new Map<string, number[]>();
  week = { opened: [] as string[], closed: [] as string[], built: [] as string[], favorite: '', traditions: [] as string[] };
  /** колбэк для перестройки моделей */
  onChanged?: (b: Building) => void;

  constructor(private sim: Sim) {}

  visit(b: Building) {
    b.visits++;
  }

  daily() {
    const sim = this.sim;
    const day = sim.clock.day;
    // статистика посещений
    for (const b of sim.world.buildings) {
      b.visitHist.push(b.visits);
      if (b.visitHist.length > 7) b.visitHist.shift();
      b.visits = 0;
    }
    // закрытие пустых заведений
    for (const b of sim.world.buildings) {
      if (!SWAPPABLE.includes(b.type) || b.vacantSince >= 0 || b.closedReason) continue;
      if (b.visitHist.length < 5) continue;
      const avg = b.visitHist.reduce((a, x) => a + x, 0) / b.visitHist.length;
      const need = b.def.cat === 'office' || b.def.cat === 'industry' ? -1 : Math.max(1.2, (b.def.capacity || 10) * 0.07);
      const same = (sim.world.byType.get(b.type) ?? []).filter((x) => !x.closedReason).length;
      if (avg < need && same > (b.def.min ?? 0) && this.rng.chance(0.12)) this.close(b, 'нет покупателей');
    }
    // открытие новых на месте пустующих
    for (const b of sim.world.buildings) {
      if (b.vacantSince < 0) continue;
      if (day - b.vacantSince >= 2 && this.rng.chance(0.4)) this.reopen(b);
    }
    this.updateDistricts();
    // любимое место недели
    const leisure = sim.world.buildings.filter((b) => ['food', 'leisure', 'shop', 'outdoor'].includes(b.def.cat) && b.type !== 'nook');
    let best: Building | null = null, bv = 0;
    for (const b of leisure) { const v = b.visitHist.reduce((a, x) => a + x, 0); if (v > bv) { bv = v; best = b; } }
    if (best && best.id !== this.favorite && day % 7 === 0) {
      if (this.favorite >= 0) sim.world.buildings[this.favorite].attraction = Math.max(1, sim.world.buildings[this.favorite].attraction - 0.4);
      this.favorite = best.id;
      best.attraction += 0.4;
      this.week.favorite = best.name;
      sim.news.push('❤️', `Любимое место горожан этой недели — ${best.name} (${bv} визитов)`, 'city', { focus: { x: best.x, z: best.z } });
    }
    // ежегодный День города
    const yd = Math.max(5, sim.params.yearDays);
    if (day > 0 && day % yd === yd - 1) {
      sim.news.push('🎉', 'Сегодня День города! Фестиваль, бесплатный проезд и салют вечером', 'city');
      sim.events.trigger('freeride', false);
      this.pending.push({ at: day * 1440 + 11 * 60, id: 'festival' }, { at: day * 1440 + 21.2 * 60, id: 'fireworks' });
    }
  }

  pending: { at: number; id: string }[] = [];

  /** стройка закончена — здание превращается в то, что задумано */
  completeConstruction(b: Building) {
    const sim = this.sim;
    const target = BUILDING_BY_ID[b.futureType ?? 'panel'];
    for (const id of b.workers) { const c = sim.citizens[id]; if (c?.alive && c.work === b.id) { c.work = -1; c.job = SPECIAL_JOBS.unemployed; } }
    b.workers = [];
    for (const id of [...b.inside]) { const c = sim.citizens[id]; if (c && !c.controlled) c.actEnd = sim.clock.total; }
    sim.world.changeType(b, target);
    b.fast = false;
    b.futureType = undefined;
    this.week.built.push(b.name);
    sim.news.push('🏠', `Стройка завершена: ${b.name}! ${target.cat === 'home' ? `Ждёт ${b.homeCapacity} новых жильцов` : 'Открывается для посетителей'}`, 'city', { focus: { x: b.x, z: b.z } });
    if (target.cat !== 'home') this.hire(b);
    this.onChanged?.(b);
    // где-то начинается новая стройка
    const vac = sim.world.buildings.filter((x) => x.vacantSince >= 0);
    if (vac.length && this.rng.chance(0.5) && !(sim.world.byType.get('construction') ?? []).length) this.startConstruction(this.rng.pick(vac), 'panel');
  }

  hire(b: Building, n = 3) {
    const sim = this.sim;
    const unemployed = sim.citizens.filter((c) => c.alive && c.job.id === 'unemployed' && c.age >= 18 && c.age < 63 && !c.controlled);
    for (let i = 0; i < Math.min(n, unemployed.length); i++) {
      const c = unemployed[i];
      sim.goals.changeJob(c, 0, sim.jobFor(b.type));
      if (c.work !== b.id) {
        if (c.work >= 0) { const w = sim.world.buildings[c.work]; w.workers = w.workers.filter((x) => x !== c.id); }
        c.work = b.id;
        b.workers.push(c.id);
      }
      sim.brain.log(c, `устроил${c.female ? 'ась' : 'ся'} на новое место — ${b.name}`);
    }
  }

  hourly() {
    const sim = this.sim;
    const now = sim.clock.total;
    const due = this.pending.filter((p) => p.at <= now);
    this.pending = this.pending.filter((p) => p.at > now);
    for (const p of due) sim.events.trigger(p.id, true);
    // традиции
    const wd = sim.clock.weekday, h = Math.floor(sim.clock.hour);
    for (const t of this.traditions) if (t.weekday === wd && t.hour === h && now - t.since > 1440) sim.events.trigger(t.eventId, true);
  }

  /** событие произошло — может стать традицией */
  noteEvent(id: string, name: string) {
    if (!['festival', 'concert', 'star', 'fair', 'match', 'fireworks', 'circus', 'rave', 'subbotnik', 'museum_night', 'premiere', 'dogshow', 'bookfair', 'meteors', 'marathon', 'freecoffee'].includes(id)) return;
    if (this.traditions.some((t) => t.eventId === id)) return;
    const sim = this.sim;
    const list = this.eventCounts.get(id) ?? [];
    list.push(sim.clock.total);
    this.eventCounts.set(id, list);
    if (list.length >= 3) {
      const t = { eventId: id, name, weekday: sim.clock.weekday, hour: Math.floor(sim.clock.hour), since: sim.clock.total };
      this.traditions.push(t);
      this.week.traditions.push(name);
      const days = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
      sim.news.push('🎏', `Новая городская традиция: «${name}» теперь каждую ${days[t.weekday]} в ${String(t.hour).padStart(2, '0')}:00`, 'city');
    }
  }

  close(b: Building, why: string) {
    const sim = this.sim;
    b.closedReason = 'закрыто';
    b.vacantSince = sim.clock.day;
    for (const id of [...b.inside]) { const c = sim.citizens[id]; if (c && !c.controlled) c.actEnd = sim.clock.total; }
    const fired = b.workers.slice();
    for (const id of fired) {
      const c = sim.citizens[id];
      if (!c?.alive) continue;
      c.work = -1;
      c.job = SPECIAL_JOBS.unemployed;
      sim.brain.log(c, `${b.name} закрылось — остал${c.female ? 'ась' : 'ся'} без работы`);
    }
    b.workers = [];
    this.week.closed.push(b.name);
    sim.news.push('🔒', `${b.name} закрывается: ${why}${fired.length ? `. Без работы остались ${fired.length} чел.` : ''}`, 'economy', { focus: { x: b.x, z: b.z } });
    sim.addFx('forrent', b.x, b.z, 1e9, { building: b.id });
  }

  /** что не хватает району — то и откроется */
  private pickNew(b: Building): BuildingDef {
    const sim = this.sim;
    const counts = new Map<string, number>();
    for (const x of sim.world.buildings) if (x.district === b.district && !x.closedReason) counts.set(x.type, (counts.get(x.type) ?? 0) + 1);
    const residents = sim.world.buildings.filter((x) => x.district === b.district).reduce((a, x) => a + x.residents.length, 0);
    const opts = BUILDINGS.filter((d) => d.size === 'lot' && SWAPPABLE.includes(d.id) && d.zones.includes(b.zone));
    return this.rng.weighted(opts, (d) => (d.weight + 0.5) * (residents / 60 + 1) / (1 + (counts.get(d.id) ?? 0) * 1.5) * (d.id === b.type ? 0.2 : 1)) ?? BUILDING_BY_ID.cafe;
  }

  reopen(b: Building, def?: BuildingDef) {
    const sim = this.sim;
    const old = b.name;
    const nd = def ?? this.pickNew(b);
    sim.world.changeType(b, nd);
    b.attraction = 2.5; // ажиотаж открытия
    b.priceMul = 0.8;
    this.week.opened.push(b.name);
    sim.news.push('🎈', `На месте «${old}» открылось новое заведение: ${b.name}`, 'economy', { focus: { x: b.x, z: b.z } });
    sim.addFx('balloons', b.x, b.z, 600, { building: b.id });
    this.onChanged?.(b);
    sim.fx = sim.fx.filter((f) => !(f.kind === 'forrent' && f.building === b.id));
    this.hire(b);
  }

  startConstruction(b: Building, future: string) {
    const sim = this.sim;
    for (const id of b.workers) { const c = sim.citizens[id]; if (c) { c.work = -1; c.job = SPECIAL_JOBS.unemployed; } }
    b.workers = [];
    const old = b.name;
    sim.fx = sim.fx.filter((f) => !(f.kind === 'forrent' && f.building === b.id));
    sim.world.changeType(b, BUILDING_BY_ID.construction, `Стройка: ${BUILDING_BY_ID[future].name.toLowerCase()}`);
    b.futureType = future;
    sim.news.push('🏗️', `На месте «${old}» началась стройка — будет ${BUILDING_BY_ID[future].name.toLowerCase()}`, 'city', { focus: { x: b.x, z: b.z } });
    // строители
    const unemployed = sim.citizens.filter((c) => c.alive && c.job.id === 'unemployed' && c.age >= 19 && c.age < 60).slice(0, 4);
    for (const c of unemployed) {
      sim.goals.changeJob(c, 0, sim.jobFor('construction'));
      if (c.work >= 0 && c.work !== b.id) { const w = sim.world.buildings[c.work]; w.workers = w.workers.filter((x) => x !== c.id); c.work = b.id; b.workers.push(c.id); }
    }
    this.onChanged?.(b);
  }

  updateDistricts() {
    const sim = this.sim;
    const prev = this.districts;
    this.districts = DISTRICT_NAMES.map((name, d) => {
      const bs = sim.world.buildings.filter((b) => b.district === d);
      const residents = bs.reduce((a, b) => a + b.residents.length, 0);
      const jobs = bs.reduce((a, b) => a + b.workers.length, 0);
      const open = bs.filter((b) => !b.closedReason && b.def.cat !== 'home' && isOpen(b, 12, 2)).length;
      const vacant = bs.filter((b) => b.vacantSince >= 0).length;
      const people = bs.flatMap((b) => b.residents).map((id) => sim.citizens[id]).filter((c) => c?.alive);
      const mood = people.length ? people.reduce((a, c) => a + c.mood, 0) / people.length : 0;
      const visits = bs.reduce((a, b) => a + (b.visitHist[b.visitHist.length - 1] ?? 0), 0);
      const p = prev[d];
      const trend = p ? Math.sign(Math.round((residents - p.residents) + (jobs - p.jobs) * 0.5 + (visits - p.visits) * 0.1)) : 0;
      return { name, residents, jobs, open, vacant, mood, visits, trend };
    });
  }

  resetWeek() {
    this.week = { opened: [], closed: [], built: [], favorite: '', traditions: [] };
  }
}

export { displayName };
