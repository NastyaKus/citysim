// События города: праздники, происшествия, экономика, личные истории.
import type { Sim } from './sim';
import type { Building, Edge } from './world';
import { ACTIVITY_BY_ID, gender } from './content/activities';
import { Citizen, displayName, assignJob, pickJob, computeSleep } from './citizen';
import { SPECIAL_JOBS } from './content/jobs';
import { SURNAMES } from './content/names';
import { RNG, clamp } from './rng';
import { DISTRICT_NAMES } from './world';
import type { Vehicle } from './transport';

export type EventCat = 'праздник' | 'происшествие' | 'транспорт' | 'экономика' | 'люди' | 'природа';

export interface ActiveEvent {
  id: number;
  def: EventDef;
  start: number;
  end: number;
  title: string;
  data: Record<string, unknown>;
  focus?: { x: number; z: number };
}

export interface EventDef {
  id: string;
  name: string;
  emoji: string;
  cat: EventCat;
  weight: number; // ~ раз в день при eventRate=1
  hours?: [number, number];
  manual?: boolean; // есть кнопка
  cond?: (s: Sim) => boolean;
  dur: [number, number];
  start: (s: Sim, ev: ActiveEvent, m: EventManager) => boolean;
  tick?: (s: Sim, ev: ActiveEvent, dt: number, m: EventManager) => void;
  end?: (s: Sim, ev: ActiveEvent, m: EventManager) => void;
}

const F = (c: Citizen, m: string, f: string) => (c.female ? f : m);

export class EventManager {
  active: ActiveEvent[] = [];
  rng = new RNG(31337);
  private id = 1;
  private lastHour = -1;
  history: { t: number; name: string; emoji: string }[] = [];

  constructor(private sim: Sim) {}

  get defs() { return EVENTS; }

  b(type: string): Building | undefined {
    const arr = this.sim.world.byType.get(type);
    return arr && arr.length ? this.rng.pick(arr) : undefined;
  }

  isActive(id: string) {
    return this.active.some((e) => e.def.id === id);
  }

  /** пригласить N свободных жителей */
  invite(n: number, actId: string, b: Building, dur: number, filter?: (c: Citizen) => boolean) {
    const sim = this.sim;
    const act = ACTIVITY_BY_ID[actId];
    const cand = sim.citizens.filter((c) => c.alive && c.age >= act.ages[0] && c.age <= act.ages[1] && sim.brain.isAvailable(c) && (!filter || filter(c)));
    this.rng.shuffle(cand);
    const d = (c: Citizen) => Math.abs(c.x - b.x) + Math.abs(c.z - b.z);
    cand.sort((a, c) => d(a) - d(c) + this.rng.range(-150, 150));
    const picked = cand.slice(0, n);
    for (const c of picked) sim.force(c, act, b, dur * this.rng.range(0.6, 1));
    return picked;
  }

  closeEdge(e: Edge, reason: string) {
    e.closed = reason;
    this.sim.routingDirty = true;
  }

  openEdge(e: Edge) {
    e.closed = null;
    this.sim.routingDirty = true;
  }

  randomInnerEdge(): Edge {
    const w = this.sim.world;
    const inner = w.edges.filter((e) => !e.closed && w.nodes[e.a].edges.length === 4 && w.nodes[e.b].edges.length === 4);
    return this.rng.pick(inner);
  }

  edgeMid(e: Edge) {
    const w = this.sim.world;
    const A = w.nodes[e.a], B = w.nodes[e.b];
    return { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
  }

  trigger(id: string, manual = true): boolean {
    const def = EVENTS.find((e) => e.id === id);
    if (!def) return false;
    if (this.isActive(id) && !['birthday', 'newcomer', 'baby', 'fired', 'love', 'breakup', 'accident', 'fire', 'promotion', 'lottery', 'retire', 'cat'].includes(id)) return false;
    if (!manual && def.cond && !def.cond(this.sim)) return false;
    const now = this.sim.clock.total;
    const ev: ActiveEvent = { id: this.id++, def, start: now, end: now + this.rng.range(def.dur[0], def.dur[1]), title: def.name, data: {} };
    const ok = def.start(this.sim, ev, this);
    if (ok) {
      this.sim.paper?.noteEvent(def.id);
      this.sim.dynamics?.noteEvent(def.id, def.name);
    }
    if (!ok) {
      if (manual) this.sim.news.push('🤷', `Не получилось: «${def.name}» — сейчас нет подходящих условий`, 'event');
      return false;
    }
    this.active.push(ev);
    this.history.unshift({ t: now, name: ev.title, emoji: def.emoji });
    if (this.history.length > 40) this.history.length = 40;
    return true;
  }

  update(dt: number) {
    const sim = this.sim;
    const now = sim.clock.total;
    for (const ev of this.active) ev.def.tick?.(sim, ev, dt, this);
    const ended = this.active.filter((e) => e.end <= now);
    if (ended.length) {
      this.active = this.active.filter((e) => e.end > now);
      for (const ev of ended) ev.def.end?.(sim, ev, this);
    }
    const h = Math.floor(sim.clock.hour);
    if (h !== this.lastHour) {
      this.lastHour = h;
      if (h === 18 && ((this as unknown as { pendingBirthdays?: number[] }).pendingBirthdays ?? []).length) this.trigger('birthday', false);
      if (sim.params.eventsAuto) this.randomRoll(sim.clock.hour);
    }
  }

  private randomRoll(hour: number) {
    const sim = this.sim;
    if (this.active.filter((e) => e.def.weight > 0).length >= 5) return;
    for (const def of EVENTS) {
      if (def.weight <= 0) continue;
      if (def.hours && !(hour >= def.hours[0] && hour < def.hours[1])) continue;
      if (def.cond && !def.cond(sim)) continue;
      const span = def.hours ? def.hours[1] - def.hours[0] : 24;
      let w = def.weight;
      if (def.id === 'accident') w *= (sim.weather.icy ? 4 : 1) * (sim.weather.fog > 0.5 ? 2.5 : 1) * (sim.weather.raining ? 1.5 : 1) * (0.5 + sim.transport.vehicles.length / 60);
      if (def.id === 'outage' && sim.weather.def.lightning) w *= 6;
      if (def.id === 'accident') w *= sim.params.accidentRate;
      if (def.id === 'fire') w *= sim.params.fireRate;
      if (def.id === 'love') w *= sim.params.loveRate;
      if (def.id === 'newcomer') w *= sim.params.migration * (sim.citizens.filter((c) => c.alive).length < sim.params.population ? 2 : 0.5);
      if (def.id === 'baby') w = 0; // рождения идут естественным путём
      if (this.rng.chance((w * sim.params.eventRate) / span)) {
        this.trigger(def.id, false);
        break; // не больше одного случайного события в час
      }
    }
  }

  daily() {
    const sim = this.sim;
    const day = sim.clock.day;
    // дни рождения
    for (const c of sim.citizens) {
      const yd = Math.max(3, sim.params.yearDays);
      if (c.alive && c.birthdayDay % yd === day % yd) {
        c.age += 1;
        sim.growUp(c);
        if (c.age < 3) continue;
        (this as unknown as { pendingBirthdays: number[] }).pendingBirthdays ??= [];
        (this as unknown as { pendingBirthdays: number[] }).pendingBirthdays.push(c.id);
      }
    }
  }

  /** вечерний праздник для именинников */
  birthdaysNow() {
    const self = this as unknown as { pendingBirthdays?: number[] };
    const list = self.pendingBirthdays ?? [];
    self.pendingBirthdays = [];
    return list;
  }

  // ——— сервисные машины
  serviceRound(type: 'garbage' | 'plow') {
    const tr = this.sim.transport;
    const routes = type === 'garbage' ? [tr.routes[0]] : tr.routes;
    for (const r of routes) {
      const v = tr.spawn(type, 'service', r.segs, { color: type === 'garbage' ? 0x2a9d8f : 0xff8800, label: type === 'garbage' ? 'мусоровоз' : 'снегоуборщик' });
      v.si = this.rng.int(0, r.segs.length / 2 - 1) * 2;
      v.segs = [...r.segs.slice(v.si), ...r.segs.slice(0, v.si)];
      v.si = 0;
    }
    if (type === 'plow') this.sim.news.push('🚜', 'Снегоуборочная техника вышла на улицы', 'traffic', {}, 300);
  }

  deliveries() {
    const sim = this.sim;
    const wh = this.b('warehouse');
    if (!wh) return;
    const shops = sim.world.buildings.filter((b) => ['grocery', 'supermarket', 'kiosk', 'pharmacy', 'bakery', 'cafe', 'restaurant'].includes(b.type));
    for (let i = 0; i < 3; i++) {
      const s = this.rng.pick(shops);
      sim.transport.driveTo('truck', 'service', wh.entrance, s.entrance, { color: this.rng.pick([0xffffff, 0x2b59c3, 0xe76f51]), label: 'доставка' });
    }
  }

  ambulanceFor(c: Citizen) {
    const sim = this.sim;
    if (c.at < 0) return;
    const hosp = sim.world.byType.get('hospital')?.[0];
    if (!hosp) return;
    const place = sim.world.buildings[c.at];
    if (place.id === hosp.id) return;
    c.actEnd = sim.clock.total + 600;
    sim.brain.log(c, gender('стало совсем плохо — вызвал{|а} скорую', c.female));
    sim.news.push('🚑', `Вызов скорой: ${displayName(c)} (${place.name})`, 'event', { citizen: c.id, focus: place.entrance.pos });
    sim.transport.dispatch('ambulance', 'hospital', place.entrance, 'скорая', () => {
      if (!c.alive) return;
      place.inside.delete(c.id);
      c.at = -1;
      c.trip = { mode: 'taxi', stage: 'drive', dest: hosp.id, act: ACTIVITY_BY_ID.hospitalized, dur: this.rng.range(300, 600), path: [], pi: 0, vehicle: -1, boardStop: -1, alightStop: -1, routeId: -1, waitUntil: 0, started: sim.clock.total };
      c.state = 'car';
      const v = sim.transport.driveTo('ambulance', 'emergency', place.entrance, hosp.entrance, { emergency: true, siren: true, label: 'скорая', onArrive: () => sim.arriveByVehicle(c) });
      if (!v) sim.arrive(c);
    });
  }

  movingVehicleOnEdge(): Vehicle | undefined {
    const vs = this.sim.transport.vehicles.filter((v) => !v.done && !v.emergency && v.role !== 'bus' && v.segs[v.si]?.key >= 0 && v.v > 5 && v.frozen < this.sim.clock.total);
    return vs.length ? this.rng.pick(vs) : undefined;
  }
}

// ——— хелперы
const hourIn = (s: Sim, a: number, b: number) => s.clock.hour >= a && s.clock.hour < b;
const dark = (s: Sim) => { const [sr, ss] = s.weather.sunTimes(); return s.clock.hour < sr || s.clock.hour > ss; };
const goodWeather = (s: Sim) => !s.weather.raining && s.weather.def.precip !== 'hail' && !s.weather.def.lightning && s.weather.def.id !== 'blizzard';

function couple(s: Sim, rng: RNG, minAge = 22, maxAge = 60): [Citizen, Citizen] | null {
  const cand = s.citizens.filter((c) => c.alive && c.partner > c.id && c.age >= minAge && c.age <= maxAge);
  if (!cand.length) return null;
  const a = rng.pick(cand);
  return [a, s.citizens[a.partner]];
}

export const EVENTS: EventDef[] = [
  // ——— праздники
  {
    id: 'festival', name: 'Фестиваль в парке', emoji: '🎪', cat: 'праздник', weight: 0.25, hours: [10, 16], manual: true, dur: [300, 480],
    cond: (s) => goodWeather(s) && (s.clock.isWeekend || Math.random() < 0.3),
    start: (s, ev, m) => {
      const park = m.b('park')!;
      s.addSpot('festival', park.id, 7, ev.end - ev.start);
      s.addFx('tent', park.x - 8, park.z - 6, ev.end - ev.start, { building: park.id });
      s.addFx('stage', park.x + 8, park.z + 4, ev.end - ev.start, { building: park.id });
      s.addFx('garlands', park.x, park.z, ev.end - ev.start, { building: park.id });
      m.invite(30, 'festival', park, 150);
      ev.focus = { x: park.x, z: park.z };
      s.news.push('🎪', 'В Центральном парке начался фестиваль: музыка, ярмарка, сладкая вата!', 'event', { focus: ev.focus });
      return true;
    },
    end: (s) => s.news.push('🎪', 'Фестиваль закончился, парк пустеет', 'event'),
  },
  {
    id: 'concert', name: 'Уличный концерт', emoji: '🎸', cat: 'праздник', weight: 0.35, hours: [15, 21], manual: true, dur: [90, 150], cond: goodWeather,
    start: (s, ev, m) => {
      const sq = m.b('square') ?? m.b('park')!;
      s.addSpot('concert', sq.id, 5, ev.end - ev.start);
      s.addFx('stage', sq.x, sq.z, ev.end - ev.start, { building: sq.id });
      m.invite(14, 'concert', sq, 100);
      ev.focus = { x: sq.x, z: sq.z };
      s.news.push('🎸', `${sq.name}: местная группа играет бесплатный концерт`, 'event', { focus: ev.focus });
      return true;
    },
  },
  {
    id: 'star', name: 'Концерт звезды', emoji: '🌟', cat: 'праздник', weight: 0.05, hours: [18, 21], manual: true, dur: [150, 180],
    start: (s, ev, m) => {
      const park = m.b('park')!;
      s.addSpot('concert', park.id, 12, ev.end - ev.start);
      s.addFx('stage', park.x, park.z + 6, ev.end - ev.start, { building: park.id });
      s.addFx('crowd', park.x, park.z, ev.end - ev.start, { building: park.id });
      m.invite(70, 'concert', park, 160, (c) => c.age < 50 || m.rng.chance(0.3));
      ev.focus = { x: park.x, z: park.z };
      s.mods.moodBonus += 4;
      s.news.push('🌟', 'Звезда эстрады приехала с бесплатным концертом! Пол-города идёт в парк', 'event', { focus: ev.focus });
      return true;
    },
    end: (s) => { s.mods.moodBonus -= 4; s.news.push('🌟', 'Концерт закончился — люди расходятся, напевая хиты', 'event'); },
  },
  {
    id: 'fair', name: 'Ярмарка', emoji: '🎡', cat: 'праздник', weight: 0.2, hours: [9, 13], manual: true, dur: [300, 420], cond: (s) => goodWeather(s) && s.clock.isWeekend,
    start: (s, ev, m) => {
      const mk = m.b('market') ?? m.b('square')!;
      s.addSpot('fair', mk.id, 5, ev.end - ev.start);
      s.addFx('stalls', mk.x, mk.z, ev.end - ev.start, { building: mk.id, w: mk.w, d: mk.d });
      s.addFx('balloons', mk.x, mk.z, ev.end - ev.start, { building: mk.id });
      m.invite(20, 'fair', mk, 80);
      ev.focus = { x: mk.x, z: mk.z };
      s.news.push('🎡', `${mk.name}: открылась ярмарка мёда, пирогов и ремёсел`, 'event', { focus: ev.focus });
      return true;
    },
  },
  {
    id: 'match', name: 'Футбольный матч', emoji: '⚽', cat: 'праздник', weight: 0.2, hours: [16, 19], manual: true, dur: [130, 150],
    start: (s, ev, m) => {
      const st = m.b('stadium')!;
      s.addSpot('match', st.id, 6, ev.end - ev.start, [7, 90]);
      s.addFx('crowd', st.x, st.z, ev.end - ev.start, { building: st.id });
      m.invite(60, 'match', st, 130, (c) => !c.female || m.rng.chance(0.5));
      s.params.throughTraffic += 0.5;
      ev.data.boost = 0.5;
      ev.focus = { x: st.x, z: st.z };
      s.news.push('⚽', '«Метеор» принимает соперников! Болельщики стекаются к стадиону, у стадиона пробки', 'event', { focus: ev.focus });
      return true;
    },
    end: (s, ev, m) => {
      s.params.throughTraffic = Math.max(0, s.params.throughTraffic - (ev.data.boost as number));
      const a = m.rng.int(0, 4), b = m.rng.int(0, 3);
      if (a > b) { s.mods.moodBonus += 3; setTimeoutGame(s, 180, () => (s.mods.moodBonus -= 3)); }
      s.news.push('⚽', a > b ? `Победа! «Метеор» выиграл ${a}:${b} — город ликует` : a === b ? `Ничья ${a}:${b}` : `«Метеор» проиграл ${a}:${b}... болельщики расстроены`, 'event');
    },
  },
  {
    id: 'fireworks', name: 'Салют', emoji: '🎆', cat: 'праздник', weight: 0.1, manual: true, dur: [35, 50], hours: [20, 23],
    cond: (s) => dark(s) && goodWeather(s),
    start: (s, ev, m) => {
      const park = m.b('park')!;
      s.addFx('fireworks', park.x, park.z, ev.end - ev.start, { building: park.id });
      s.addSpot('fireworks', park.id, 8, ev.end - ev.start);
      const pond = m.b('pond');
      if (pond) s.addSpot('fireworks', pond.id, 5, ev.end - ev.start);
      m.invite(35, 'fireworks', park, 40);
      ev.focus = { x: park.x, z: park.z };
      s.news.push('🎆', 'Над парком гремит праздничный салют!', 'event', { focus: ev.focus });
      return true;
    },
  },
  {
    id: 'circus', name: 'Приехал цирк-шапито', emoji: '🎪', cat: 'праздник', weight: 0.06, manual: true, dur: [1440, 2880], hours: [9, 12],
    start: (s, ev, m) => {
      const park = m.b('park')!;
      s.addFx('circus', park.x + 7, park.z - 7, ev.end - ev.start, { building: park.id });
      s.addSpot('circus', park.id, 3, ev.end - ev.start, [3, 90]);
      ev.focus = { x: park.x, z: park.z };
      s.news.push('🤡', 'В парке раскинул шатёр цирк-шапито: клоуны, акробаты и пудели', 'event', { focus: ev.focus });
      return true;
    },
    end: (s) => s.news.push('🎪', 'Цирк уехал, а клоуны остались... шутка. Тоже уехали', 'event'),
  },
  {
    id: 'rave', name: 'Ночной рейв', emoji: '🔊', cat: 'праздник', weight: 0.15, hours: [22, 24], manual: true, dur: [240, 330],
    cond: (s) => s.clock.weekday >= 4,
    start: (s, ev, m) => {
      const w = m.b('warehouse') ?? m.b('club')!;
      s.addSpot('rave', w.id, 6, ev.end - ev.start, [18, 40]);
      s.addFx('rave', w.x, w.z, ev.end - ev.start, { building: w.id });
      m.invite(30, 'rave', w, 260, (c) => c.age >= 18 && c.age <= 40);
      ev.focus = { x: w.x, z: w.z };
      s.news.push('🔊', `${w.name}: подпольный рейв, басы слышно на три квартала`, 'event', { focus: ev.focus });
      return true;
    },
  },
  {
    id: 'subbotnik', name: 'Субботник', emoji: '🧤', cat: 'праздник', weight: 0.4, hours: [9, 11], manual: true, dur: [150, 200],
    cond: (s) => s.clock.weekday === 5 && goodWeather(s) && s.params.season !== 'winter',
    start: (s, ev, m) => {
      const park = m.b('park')!;
      s.addSpot('subbotnik', park.id, 4, ev.end - ev.start, [10, 80]);
      m.invite(25, 'subbotnik', park, 130, (c) => c.age >= 12);
      ev.focus = { x: park.x, z: park.z };
      s.news.push('🧤', 'Городской субботник: жители убирают парк и красят лавочки', 'event', { focus: ev.focus });
      return true;
    },
    end: (s) => { s.stats.pollution = Math.max(0, s.stats.pollution - 15); s.news.push('🌿', 'После субботника в парке стало чисто и красиво', 'event'); },
  },
  {
    id: 'museum_night', name: 'Ночь музеев', emoji: '🖼️', cat: 'праздник', weight: 0.08, hours: [17, 19], manual: true, dur: [300, 360],
    start: (s, ev, m) => {
      const mu = m.b('museum');
      if (!mu) return false;
      s.addSpot('museum', mu.id, 6, ev.end - ev.start);
      s.addFx('balloons', mu.x, mu.z, ev.end - ev.start, { building: mu.id });
      ev.focus = { x: mu.x, z: mu.z };
      s.news.push('🖼️', 'Ночь музеев: музей открыт до полуночи, вход бесплатный', 'event', { focus: ev.focus });
      return true;
    },
  },
  {
    id: 'premiere', name: 'Премьера в кино', emoji: '🎬', cat: 'праздник', weight: 0.2, hours: [16, 20], manual: true, dur: [240, 300],
    start: (s, ev, m) => {
      const cn = m.b('cinema');
      if (!cn) return false;
      s.addSpot('cinema', cn.id, 6, ev.end - ev.start);
      s.addFx('balloons', cn.x, cn.z, ev.end - ev.start, { building: cn.id });
      ev.focus = { x: cn.x, z: cn.z };
      s.news.push('🎬', `${cn.name}: премьера долгожданного фильма, очередь за билетами`, 'event', { focus: ev.focus });
      return true;
    },
  },
  {
    id: 'dogshow', name: 'Выставка собак', emoji: '🐩', cat: 'праздник', weight: 0.1, hours: [10, 14], manual: true, dur: [150, 200], cond: goodWeather,
    start: (s, ev, m) => {
      const park = m.b('park')!;
      const owners = s.citizens.filter((c) => c.alive && c.hasDog && !c.dogLost && s.brain.isAvailable(c));
      for (const c of owners.slice(0, 20)) s.force(c, ACTIVITY_BY_ID.dogwalk, park, 120);
      s.addSpot('park_walk', park.id, 3, ev.end - ev.start);
      ev.focus = { x: park.x, z: park.z };
      s.news.push('🐩', `В парке выставка собак — пришли ${owners.length ? Math.min(20, owners.length) : 'несколько'} хозяев с питомцами`, 'event', { focus: ev.focus });
      return true;
    },
  },
  {
    id: 'bookfair', name: 'Книжная ярмарка', emoji: '📚', cat: 'праздник', weight: 0.08, hours: [11, 15], manual: true, dur: [240, 300],
    start: (s, ev, m) => {
      const lib = m.b('library');
      if (!lib) return false;
      s.addSpot('library', lib.id, 5, ev.end - ev.start);
      s.addFx('balloons', lib.x, lib.z, ev.end - ev.start, { building: lib.id });
      ev.focus = { x: lib.x, z: lib.z };
      s.news.push('📚', 'В библиотеке книжная ярмарка и встреча с писателем', 'event', { focus: ev.focus });
      return true;
    },
  },
  {
    id: 'meteors', name: 'Звездопад', emoji: '🌠', cat: 'природа', weight: 0.08, hours: [22, 24], manual: true, dur: [120, 180],
    cond: (s) => s.weather.cloud < 0.3,
    start: (s, ev, m) => {
      s.addFx('meteors', 0, 0, ev.end - ev.start);
      const park = m.b('park')!, pond = m.b('pond');
      s.addSpot('bench', park.id, 4, ev.end - ev.start);
      if (pond) s.addSpot('bench', pond.id, 4, ev.end - ev.start);
      m.invite(15, 'bench', pond ?? park, 60, (c) => c.age >= 12);
      s.news.push('🌠', 'Метеорный поток! Романтики выходят к пруду загадывать желания', 'event');
      return true;
    },
  },

  // ——— происшествия
  {
    id: 'accident', name: 'ДТП', emoji: '💥', cat: 'происшествие', weight: 0.35, manual: true, dur: [50, 100],
    cond: (s) => s.transport.vehicles.length > 10,
    start: (s, ev, m) => {
      const v = m.movingVehicleOnEdge();
      if (!v) return false;
      // вероятнее в гололёд/туман — вес увеличивается в weightMul
      const seg = v.segs[v.si];
      const e = s.world.edges[seg.edge];
      v.frozen = ev.end;
      v.hazard = true;
      const others = s.transport.vehicles.filter((o) => o !== v && !o.done && o.segs[o.si]?.key === seg.key && Math.abs(o.s - v.s) < 12);
      const o2 = others[0];
      if (o2) { o2.frozen = ev.end; o2.hazard = true; }
      ev.data.v = [v, o2].filter(Boolean);
      ev.data.edge = e.id;
      m.closeEdge(e, 'ДТП');
      s.addFx('crash', v.x, v.z, ev.end - ev.start, { edge: e.id });
      ev.focus = { x: v.x, z: v.z };
      const place = s.transport.placeFromVehicle(v);
      s.transport.dispatch('police', 'police', place, 'полиция');
      if (m.rng.chance(0.6)) s.transport.dispatch('ambulance', 'hospital', place, 'скорая');
      const why = s.weather.icy ? ' — скользко!' : s.weather.fog > 0.5 ? ' — плохая видимость' : '';
      s.news.push('💥', `ДТП: ${e.street}${why}. Движение перекрыто, собирается пробка`, 'traffic', { focus: ev.focus });
      return true;
    },
    end: (s, ev, m) => {
      for (const v of ev.data.v as Vehicle[]) { v.frozen = 0; v.hazard = false; }
      m.openEdge(s.world.edges[ev.data.edge as number]);
      s.news.push('🚗', 'Последствия ДТП устранены, движение восстановлено', 'traffic');
    },
  },
  {
    id: 'fire', name: 'Пожар', emoji: '🔥', cat: 'происшествие', weight: 0.08, manual: true, dur: [150, 240],
    start: (s, ev, m) => {
      const cand = s.world.buildings.filter((b) => !b.def.outdoor && b.floors > 0 && !['hospital', 'firestation'].includes(b.type) && !b.onFire);
      const b = m.rng.pick(cand);
      b.onFire = 1;
      b.closedReason = 'fire';
      ev.data.b = b.id;
      s.addFx('fire', b.x, b.z, ev.end - ev.start, { building: b.id });
      // эвакуация
      for (const id of [...b.inside]) {
        const c = s.citizens[id];
        if (!c) continue;
        s.brain.endActivity(c);
        s.brain.beginActivity(c, ACTIVITY_BY_ID.evacuated, b.id, m.rng.range(30, 50));
      }
      ev.focus = { x: b.x, z: b.z };
      for (let i = 0; i < 2; i++) s.transport.dispatch('firetruck', 'firestation', b.entrance, 'пожарные', () => { ev.data.arrived = true; });
      s.transport.dispatch('ambulance', 'hospital', b.entrance, 'скорая');
      s.news.push('🔥', `Пожар: горит ${b.name}! Жильцы эвакуированы, пожарные уже в пути`, 'event', { focus: ev.focus });
      return true;
    },
    tick: (s, ev, dt) => {
      const b = s.world.buildings[ev.data.b as number];
      if (ev.data.arrived) b.onFire = Math.max(0, b.onFire - dt / 40);
      if (b.onFire <= 0 && !ev.data.out) {
        ev.data.out = true;
        s.news.push('🧯', `Пожар в здании «${b.name}» потушен`, 'event');
      }
    },
    end: (s, ev) => {
      const b = s.world.buildings[ev.data.b as number];
      b.onFire = 0;
      b.closedReason = null;
    },
  },
  {
    id: 'flood', name: 'Прорыв трубы', emoji: '💧', cat: 'происшествие', weight: 0.15, manual: true, dur: [120, 300],
    start: (s, ev, m) => {
      const e = m.randomInnerEdge();
      m.closeEdge(e, 'потоп');
      const p = m.edgeMid(e);
      s.addFx('flood', p.x, p.z, ev.end - ev.start, { edge: e.id });
      ev.data.e = e.id;
      ev.focus = p;
      s.news.push('💧', `Прорвало трубу — ${e.street} под водой, проезд закрыт`, 'traffic', { focus: p });
      return true;
    },
    end: (s, ev, m) => { m.openEdge(s.world.edges[ev.data.e as number]); s.news.push('🔧', 'Трубу починили, вода ушла', 'traffic'); },
  },
  {
    id: 'roadworks', name: 'Ремонт дороги', emoji: '🚧', cat: 'транспорт', weight: 0.2, hours: [7, 11], manual: true, dur: [480, 1440],
    start: (s, ev, m) => {
      const e = m.randomInnerEdge();
      m.closeEdge(e, 'ремонт');
      const p = m.edgeMid(e);
      s.addFx('cones', p.x, p.z, ev.end - ev.start, { edge: e.id });
      ev.data.e = e.id;
      ev.focus = p;
      s.news.push('🚧', `Ремонт дороги: ${e.street} — движение перекрыто. Объезд!`, 'traffic', { focus: p });
      return true;
    },
    end: (s, ev, m) => { m.openEdge(s.world.edges[ev.data.e as number]); s.news.push('🛣️', 'Ремонт закончен — новый асфальт', 'traffic'); },
  },
  {
    id: 'outage', name: 'Отключение света', emoji: '🔌', cat: 'происшествие', weight: 0.12, manual: true, dur: [60, 240],
    start: (s, ev, m) => {
      const d = m.rng.int(0, 3);
      ev.data.d = d;
      for (const b of s.world.buildings) if (b.district === d) b.powerOut = true;
      const nodes = s.world.nodes.filter((n) => (n.i >= 4 ? 1 : 0) + (n.j >= 4 ? 2 : 0) === d).map((n) => n.id);
      ev.data.nodes = nodes;
      for (const n of nodes) s.transport.lightsBroken.add(n);
      s.outages.add(d);
      s.news.push('🔌', `В районе «${DISTRICT_NAMES[d]}» отключилось электричество: темно, светофоры не работают`, 'event');
      return true;
    },
    end: (s, ev) => {
      const d = ev.data.d as number;
      for (const b of s.world.buildings) if (b.district === d) b.powerOut = false;
      for (const n of ev.data.nodes as number[]) s.transport.lightsBroken.delete(n);
      s.outages.delete(d);
      s.news.push('💡', `Электричество в районе «${DISTRICT_NAMES[d]}» вернули`, 'event');
    },
  },
  {
    id: 'lights', name: 'Сбой светофоров', emoji: '🚦', cat: 'транспорт', weight: 0.15, manual: true, dur: [60, 150],
    start: (s, ev, m) => {
      const nodes = s.world.nodes.filter((n) => n.hasLight && m.rng.chance(0.5)).map((n) => n.id);
      for (const n of nodes) s.transport.lightsBroken.add(n);
      ev.data.nodes = nodes;
      s.news.push('🚦', 'Сбой в системе управления — светофоры мигают жёлтым', 'traffic');
      return true;
    },
    end: (s, ev) => { for (const n of ev.data.nodes as number[]) s.transport.lightsBroken.delete(n); s.news.push('🚦', 'Светофоры снова работают', 'traffic'); },
  },
  {
    id: 'lostdog', name: 'Потерялась собака', emoji: '🐕', cat: 'люди', weight: 0.2, manual: true, dur: [90, 200],
    start: (s, ev, m) => {
      const owners = s.citizens.filter((c) => c.alive && c.hasDog && !c.dogLost);
      if (!owners.length) return false;
      const o = m.rng.pick(owners);
      o.dogLost = true;
      ev.data.o = o.id;
      const park = m.b('park')!;
      const f = s.addFx('lostdog', park.x + m.rng.range(-10, 10), park.z + m.rng.range(-10, 10), ev.end - ev.start, { building: park.id });
      ev.data.fx = f;
      s.force(o, ACTIVITY_BY_ID.search_dog, park, ev.end - ev.start);
      for (const fid of o.friends.slice(0, 3)) { const fr = s.citizens[fid]; if (fr && s.brain.isAvailable(fr)) s.force(fr, ACTIVITY_BY_ID.search_dog, park, 90); }
      s.brain.log(o, `потерял${o.female ? 'а' : ''} собаку ${o.dogName}!`);
      ev.focus = { x: park.x, z: park.z };
      s.news.push('🐕', `Потерялась собака по кличке ${o.dogName}! ${displayName(o)} и друзья ищут её в парке`, 'people', { citizen: o.id, focus: ev.focus });
      return true;
    },
    tick: (s, ev, dt, m) => {
      const f = ev.data.fx as { x: number; z: number };
      f.x += m.rng.range(-1, 1) * dt * 6;
      f.z += m.rng.range(-1, 1) * dt * 6;
      const park = s.world.byType.get('park')![0];
      f.x = clamp(f.x, park.x - 14, park.x + 14);
      f.z = clamp(f.z, park.z - 14, park.z + 14);
    },
    end: (s, ev) => {
      const o = s.citizens[ev.data.o as number];
      o.dogLost = false;
      s.brain.log(o, `нашёл${o.female ? 'ла' : ''} ${o.dogName}! счастье`);
      s.news.push('🐶', `${o.dogName} нашёлся! ${displayName(o)} счастлив${o.female ? 'а' : ''}`, 'people', { citizen: o.id });
    },
  },
  {
    id: 'cat', name: 'Кот на дереве', emoji: '🐈', cat: 'люди', weight: 0.12, manual: true, dur: [40, 60],
    start: (s, ev, m) => {
      const park = m.b('square') ?? m.b('park')!;
      s.transport.dispatch('firetruck', 'firestation', park.entrance, 'пожарные', () => s.news.push('🐈', 'Пожарные сняли кота с дерева. Кот недоволен, но цел', 'people'));
      ev.focus = { x: park.x, z: park.z };
      s.news.push('🐈', `${park.name}: кот залез на дерево и не может слезть. Вызвали пожарных`, 'people', { focus: ev.focus });
      return true;
    },
  },
  {
    id: 'pigeons', name: 'Нашествие голубей', emoji: '🐦', cat: 'природа', weight: 0.15, hours: [8, 18], manual: true, dur: [120, 200],
    start: (s, ev, m) => {
      const b = m.b('pond') ?? m.b('square')!;
      s.addFx('pigeons', b.x, b.z, ev.end - ev.start, { building: b.id });
      s.addSpot('ducks', b.id, 2, ev.end - ev.start);
      ev.focus = { x: b.x, z: b.z };
      s.news.push('🐦', `${b.name}: сотни голубей! Пенсионеры в восторге, автомобилисты — нет`, 'event', { focus: ev.focus });
      return true;
    },
  },
  {
    id: 'epidemic', name: 'Эпидемия гриппа', emoji: '🤧', cat: 'происшествие', weight: 0.04, manual: true, dur: [1440, 2880],
    cond: (s) => s.params.season === 'winter' || s.params.season === 'autumn',
    start: (s, ev, m) => {
      s.mods.sickMul *= 5;
      for (const ph of s.world.byType.get('pharmacy') ?? []) s.addSpot('queue', ph.id, 2, ev.end - ev.start);
      for (const c of s.citizens) if (c.alive && m.rng.chance(0.06)) { c.sick = m.rng.range(0.6, 1.4); c.needs.health = Math.min(c.needs.health, 50); }
      s.news.push('🤧', 'В городе эпидемия гриппа: очереди в аптеках, школы полупустые', 'event');
      return true;
    },
    end: (s) => { s.mods.sickMul /= 5; s.news.push('💪', 'Эпидемия гриппа пошла на спад', 'event'); },
  },
  {
    id: 'stormwarn', name: 'Штормовое предупреждение', emoji: '⚠️', cat: 'природа', weight: 0.5, manual: false, dur: [180, 300],
    cond: (s) => !!s.weather.def.lightning || s.weather.def.id === 'blizzard' || s.weather.def.id === 'hail' || s.weather.def.id === 'downpour',
    start: (s) => { s.mods.outdoorMul *= 0.15; s.news.push('⚠️', 'МЧС: штормовое предупреждение! Без нужды из дома не выходить', 'weather'); return true; },
    end: (s) => { s.mods.outdoorMul /= 0.15; },
  },
  {
    id: 'snowchaos', name: 'Снежный коллапс', emoji: '☃️', cat: 'природа', weight: 0.6, manual: true, dur: [480, 900],
    cond: (s) => s.weather.snowCover > 0.55,
    start: (s, ev, m) => {
      if (s.weather.snowCover < 0.2) s.weather.snowCover = 0.8;
      const closed: number[] = [];
      for (const t of ['school', 'kindergarten']) for (const b of s.world.byType.get(t) ?? []) { b.closedReason = 'снег'; closed.push(b.id); }
      ev.data.closed = closed;
      for (const t of ['square', 'playground']) for (const b of s.world.byType.get(t) ?? []) s.addSpot('volunteer', b.id, 2, ev.end - ev.start, [14, 75]);
      m.serviceRound('plow');
      s.news.push('☃️', 'Снежный коллапс: школы и садики закрыты, жители откапывают машины', 'weather');
      return true;
    },
    end: (s, ev) => { for (const id of ev.data.closed as number[]) s.world.buildings[id].closedReason = null; },
  },
  {
    id: 'heatwave', name: 'Жара: очередь за мороженым', emoji: '🍦', cat: 'природа', weight: 0.6, hours: [11, 15], manual: true, dur: [240, 360],
    cond: (s) => s.weather.temp > 26,
    start: (s, ev, m) => {
      for (const t of ['kiosk', 'park', 'square']) for (const b of s.world.byType.get(t) ?? []) s.addSpot('icecream', b.id, 4, ev.end - ev.start);
      const park = m.b('park')!;
      s.addFx('icecream', park.x - 3, park.z + 10, ev.end - ev.start, { building: park.id });
      s.news.push('🍦', 'Жара! У киосков с мороженым выстроились очереди, фонтан в парке облеплен детьми', 'weather');
      return true;
    },
  },

  // ——— транспорт
  {
    id: 'strike', name: 'Забастовка водителей автобусов', emoji: '✊', cat: 'транспорт', weight: 0.05, hours: [6, 9], manual: true, dur: [300, 720],
    start: (s) => {
      s.transport.strike = true;
      for (const st of s.transport.stops) {
        for (const id of st.waiting) { const c = s.citizens[id]; if (c?.trip) c.trip.waitUntil = s.clock.total; }
      }
      s.news.push('✊', 'Водители автобусов бастуют за повышение зарплат! Автобусы не ходят', 'traffic');
      return true;
    },
    end: (s) => { s.transport.strike = false; s.news.push('🚌', 'Забастовка окончена — автобусы вернулись на маршруты', 'traffic'); },
  },
  {
    id: 'freeride', name: 'День города: бесплатный проезд', emoji: '🎫', cat: 'транспорт', weight: 0.06, hours: [5, 8], manual: true, dur: [960, 1080],
    start: (s) => { s.mods.freeTransit = true; s.mods.moodBonus += 2; s.news.push('🎫', 'День города! Проезд в автобусах бесплатный весь день', 'traffic'); return true; },
    end: (s) => { s.mods.freeTransit = false; s.mods.moodBonus -= 2; },
  },
  {
    id: 'marathon', name: 'Городской забег', emoji: '🏃', cat: 'транспорт', weight: 0.1, hours: [8, 10], manual: true, dur: [150, 180],
    cond: (s) => s.clock.isWeekend && goodWeather(s),
    start: (s, ev, m) => {
      const park = m.b('park')!;
      const [bi, bj] = park.block;
      const w = s.world;
      const edges = [
        w.edgeBetween(w.nodeId(bi, bj), w.nodeId(bi + 1, bj)), w.edgeBetween(w.nodeId(bi, bj + 1), w.nodeId(bi + 1, bj + 1)),
        w.edgeBetween(w.nodeId(bi, bj), w.nodeId(bi, bj + 1)), w.edgeBetween(w.nodeId(bi + 1, bj), w.nodeId(bi + 1, bj + 1)),
      ].filter(Boolean) as Edge[];
      for (const e of edges) { m.closeEdge(e, 'забег'); const p = m.edgeMid(e); s.addFx('cones', p.x, p.z, ev.end - ev.start, { edge: e.id }); }
      ev.data.edges = edges.map((e) => e.id);
      s.addSpot('jog', park.id, 6, ev.end - ev.start, [12, 70]);
      m.invite(25, 'jog', park, 90, (c) => c.traits.some((t) => t.id === 'sporty') || m.rng.chance(0.2));
      ev.focus = { x: park.x, z: park.z };
      s.news.push('🏃', 'Городской забег вокруг парка! Улицы вокруг перекрыты', 'traffic', { focus: ev.focus });
      return true;
    },
    end: (s, ev, m) => { for (const id of ev.data.edges as number[]) m.openEdge(s.world.edges[id]); },
  },
  {
    id: 'wedding', name: 'Свадьба', emoji: '💒', cat: 'люди', weight: 0.15, hours: [11, 15], manual: true, dur: [300, 360],
    start: (s, ev, m) => {
      const cp = couple(s, m.rng, 21, 45);
      const church = m.b('church'), rest = m.b('restaurant') ?? m.b('cafe');
      if (!cp || !rest) return false;
      const [a, b] = cp;
      for (const c of [a, b]) { s.force(c, ACTIVITY_BY_ID.wedding, rest, 300); s.brain.log(c, 'свадьба! 💍'); c.mood = 100; }
      const guests = [...a.friends, ...b.friends, ...a.household, ...b.household].map((id) => s.citizens[id]).filter((c) => c && c.alive && s.brain.isAvailable(c));
      for (const g of guests.slice(0, 16)) s.force(g, ACTIVITY_BY_ID.wedding, rest, 280);
      // свадебный кортеж
      const from = church ?? s.world.buildings[a.home];
      for (let i = 0; i < 4; i++) {
        setTimeoutGame(s, i * 0.6, () => s.transport.driveTo(i === 0 ? 'cabrio' : 'sedan', 'wedding', from.entrance, rest.entrance, { color: i === 0 ? 0xffffff : 0x111111, decorated: true, label: 'свадебный кортеж' }));
      }
      ev.focus = { x: rest.x, z: rest.z };
      s.news.push('💒', `${a.first} и ${b.first} ${a.last.replace(/а$/, '')}ы празднуют свадьбу! Кортеж едет в ${rest.name}`, 'people', { citizen: a.id, focus: ev.focus });
      return true;
    },
  },
  {
    id: 'election', name: 'Выборы мэра', emoji: '🗳️', cat: 'люди', weight: 0.03, hours: [8, 9], manual: true, dur: [600, 720],
    start: (s, ev, m) => {
      const school = m.b('school') ?? m.b('cityhall')!;
      s.addSpot('vote', school.id, 6, ev.end - ev.start, [18, 120]);
      s.addFx('ballot', school.x, school.z, ev.end - ev.start, { building: school.id });
      const cands = s.citizens.filter((c) => c.alive && c.age > 35 && c.age < 65);
      ev.data.cands = [m.rng.pick(cands).id, m.rng.pick(cands).id];
      ev.focus = { x: school.x, z: school.z };
      s.news.push('🗳️', 'Выборы мэра! Участок открыт в школе, явка растёт', 'city', { focus: ev.focus });
      return true;
    },
    end: (s, ev, m) => {
      const [a, b] = (ev.data.cands as number[]).map((id) => s.citizens[id]);
      const winner = m.rng.chance(0.5) ? a : b;
      const pct = m.rng.int(51, 68);
      s.news.push('🏛️', `Новым мэром избран${winner.female ? 'а' : ''} ${displayName(winner)} (${pct}%). Обещает новые автобусы и лавочки`, 'city', { citizen: winner.id });
      s.brain.log(winner, F(winner, 'избран мэром города!', 'избрана мэром города!'));
    },
  },

  // ——— экономика
  {
    id: 'opening', name: 'Открытие нового кафе', emoji: '🎈', cat: 'экономика', weight: 0.15, hours: [10, 13], manual: true, dur: [600, 900],
    start: (s, ev, m) => {
      const cand = s.world.buildings.filter((b) => ['cafe', 'coffee', 'pizzeria', 'shawarma', 'bar'].includes(b.type) && b.attraction <= 1);
      if (!cand.length) return false;
      const b = m.rng.pick(cand);
      b.attraction = 3;
      b.priceMul = 0.7;
      ev.data.b = b.id;
      s.addFx('balloons', b.x, b.z, ev.end - ev.start, { building: b.id });
      ev.focus = { x: b.x, z: b.z };
      s.news.push('🎈', `Открылось: ${b.name}! Скидки 30% в честь открытия — очередь на улице`, 'economy', { focus: ev.focus });
      return true;
    },
    end: (s, ev) => { const b = s.world.buildings[ev.data.b as number]; b.attraction = 1.3; b.priceMul = 1; },
  },
  {
    id: 'freecoffee', name: 'Бесплатный кофе', emoji: '☕', cat: 'экономика', weight: 0.15, hours: [7, 10], manual: true, dur: [150, 200],
    start: (s, ev, m) => {
      const b = m.b('coffee');
      if (!b) return false;
      b.attraction = 4; b.priceMul = 0;
      ev.data.b = b.id;
      s.addSpot('coffee', b.id, 5, ev.end - ev.start);
      s.addFx('balloons', b.x, b.z, ev.end - ev.start, { building: b.id });
      ev.focus = { x: b.x, z: b.z };
      s.news.push('☕', `${b.name} раздаёт бесплатный кофе всё утро`, 'economy', { focus: ev.focus });
      return true;
    },
    end: (s, ev) => { const b = s.world.buildings[ev.data.b as number]; b.attraction = 1; b.priceMul = 1; },
  },
  {
    id: 'sale', name: 'Распродажа в супермаркете', emoji: '🏷️', cat: 'экономика', weight: 0.2, hours: [9, 12], manual: true, dur: [300, 480],
    start: (s, ev, m) => {
      const b = m.b('supermarket') ?? m.b('grocery');
      if (!b) return false;
      b.attraction = 3.5; b.priceMul = 0.5;
      ev.data.b = b.id;
      s.addSpot('groceries', b.id, 4, ev.end - ev.start);
      s.addFx('balloons', b.x, b.z, ev.end - ev.start, { building: b.id });
      ev.focus = { x: b.x, z: b.z };
      s.news.push('🏷️', `${b.name}: всё за полцены! Парковка забита`, 'economy', { focus: ev.focus });
      return true;
    },
    end: (s, ev) => { const b = s.world.buildings[ev.data.b as number]; b.attraction = 1; b.priceMul = 1; },
  },
  {
    id: 'raise', name: 'Повышение зарплат', emoji: '💰', cat: 'экономика', weight: 0.04, manual: true, dur: [2880, 4320],
    start: (s) => { s.mods.wageMul *= 1.25; s.mods.moodBonus += 3; s.news.push('💰', 'Работодатели города подняли зарплаты на 25%!', 'economy'); return true; },
    end: (s) => { s.mods.wageMul /= 1.25; s.mods.moodBonus -= 3; },
  },
  {
    id: 'inflation', name: 'Скачок цен', emoji: '📈', cat: 'экономика', weight: 0.04, manual: true, dur: [2880, 4320],
    start: (s) => { s.mods.priceMul *= 1.35; s.mods.moodBonus -= 3; s.news.push('📈', 'Цены выросли на 35% — горожане экономят и чаще сидят дома', 'economy'); return true; },
    end: (s) => { s.mods.priceMul /= 1.35; s.mods.moodBonus += 3; s.news.push('📉', 'Цены вернулись к обычному уровню', 'economy'); },
  },
  {
    id: 'factoryclose', name: 'Завод встал', emoji: '🏭', cat: 'экономика', weight: 0.02, manual: true, dur: [1440, 2880],
    start: (s, ev, m) => {
      const f = m.b('factory');
      if (!f) return false;
      f.closedReason = 'простой';
      ev.data.b = f.id;
      for (const id of f.inside) { const c = s.citizens[id]; if (c) c.actEnd = s.clock.total; }
      s.mods.moodBonus -= 1;
      ev.focus = { x: f.x, z: f.z };
      s.news.push('🏭', `${f.name}: простой из-за нехватки заказов, ${f.workers.length} рабочих отправлены по домам`, 'economy', { focus: ev.focus });
      return true;
    },
    end: (s, ev) => { s.world.buildings[ev.data.b as number].closedReason = null; s.mods.moodBonus += 1; s.news.push('🏭', 'Завод снова работает', 'economy'); },
  },
  {
    id: 'lottery', name: 'Выигрыш в лотерею', emoji: '🎰', cat: 'экономика', weight: 0.05, manual: true, dur: [1, 2],
    start: (s, ev, m) => {
      const c = m.rng.pick(s.citizens.filter((x) => x.alive && x.age >= 18));
      const sum = m.rng.int(5, 50) * 1000;
      c.money += sum;
      c.mood = 100;
      s.brain.log(c, F(c, `выиграл ${sum}₽ в лотерею!!!`, `выиграла ${sum}₽ в лотерею!!!`));
      s.news.push('🎰', `${displayName(c)} выиграл${c.female ? 'а' : ''} в лотерею ${sum.toLocaleString('ru')}₽!`, 'economy', { citizen: c.id });
      return true;
    },
  },
  {
    id: 'construction', name: 'Стройка ускорилась', emoji: '🏗️', cat: 'экономика', weight: 0.1, manual: true, dur: [1, 2],
    start: (s) => {
      const b = s.world.byType.get('construction')?.[0];
      if (!b || b.growth >= 1) return false;
      b.growth = Math.min(1, b.growth + 0.2);
      s.news.push('🏗️', `Стройка: возведено ещё несколько этажей (${Math.round(b.growth * 100)}%)`, 'city', { focus: { x: b.x, z: b.z } });
      return true;
    },
  },

  // ——— личные истории
  {
    id: 'birthday', name: 'День рождения', emoji: '🎂', cat: 'люди', weight: 0, hours: [17, 19], manual: true, dur: [1, 2],
    start: (s, ev, m) => {
      let ids = m.birthdaysNow();
      if (!ids.length) {
        const c = m.rng.pick(s.citizens.filter((x) => x.alive && x.friends.length && x.age > 5));
        if (!c) return false;
        ids = [c.id];
      }
      for (const id of ids) {
        const c = s.citizens[id];
        const home = s.world.buildings[c.home];
        s.force(c, ACTIVITY_BY_ID.birthday, home, 220);
        const guests = [...c.friends, ...c.household].map((x) => s.citizens[x]).filter((g) => g && s.brain.isAvailable(g));
        for (const g of guests.slice(0, 7)) s.force(g, ACTIVITY_BY_ID.birthday, home, 190);
        s.addFx('balloons', home.x, home.z, 240, { building: home.id });
        s.news.push('🎂', `День рождения: ${c.first} ${c.last}, ${c.age}! Гости уже идут с тортом`, 'people', { citizen: c.id, focus: home.entrance.pos });
      }
      return true;
    },
  },
  {
    id: 'newcomer', name: 'Новый житель', emoji: '📦', cat: 'люди', weight: 0.25, hours: [9, 17], manual: true, dur: [1, 2],
    start: (s, ev, m) => {
      const homes = s.world.buildings.filter((b) => b.def.cat === 'home' && b.residents.length < b.homeCapacity);
      if (!homes.length) return false;
      const home = m.rng.pick(homes);
      const border = s.world.edges.filter((e) => s.world.nodes[e.a].edges.length < 4);
      const e = m.rng.pick(border);
      const from = { edge: e.id, t: 8, side: 1, pos: s.world.pointOn(e.id, 8, 0) };
      const last = m.rng.pick(SURNAMES);
      const female = m.rng.chance(0.5);
      const age = m.rng.int(20, 45);
      s.transport.driveTo('van', 'service', from, home.entrance, {
        color: 0xf4a261, label: 'переезд',
        onArrive: () => {
          const c = s.addCitizen(age, female, last, home.id);
          assignJob(c, pickJob(m.rng, age, s.world), s.world, m.rng);
          c.money = 300;
          c.hasCar = m.rng.chance(s.params.carOwnership);
          c.hasBike = m.rng.chance(s.params.bikeOwnership);
          s.brain.log(c, F(c, 'переехал в город! распаковывает коробки', 'переехала в город! распаковывает коробки'));
          // знакомится с соседями
          for (const nid of home.residents.slice(0, 3)) { const n = s.citizens[nid]; if (n && n.id !== c.id) s.social.add(c, n, 18, 'новые соседи', 1); }
          s.brain.beginActivity(c, ACTIVITY_BY_ID.cleaning, home.id, 120);
          s.news.push('📦', `В город переехал${female ? 'а' : ''} ${displayName(c)} — ${c.female && c.job.nameF ? c.job.nameF : c.job.name}, ${home.name}`, 'people', { citizen: c.id });
        },
      });
      s.news.push('🚚', `Фургон с вещами едет к дому «${home.name}» — у нас новые соседи`, 'people', { focus: home.entrance.pos });
      return true;
    },
  },
  {
    id: 'baby', name: 'Рождение ребёнка', emoji: '👶', cat: 'люди', weight: 0.12, manual: true, dur: [1, 2],
    start: (s, ev, m) => {
      const cp = couple(s, m.rng, 20, 44);
      if (!cp) return false;
      s.birth(cp[0], cp[1]);
      return true;
    },
  },
  {
    id: 'love', name: 'Новая любовь', emoji: '💘', cat: 'люди', weight: 0.35, hours: [12, 23], manual: true, dur: [1, 2],
    start: (s, ev, m) => {
      const singles = s.citizens.filter((c) => c.alive && c.partner < 0 && c.age >= 18 && c.at >= 0 && !c.trip && c.at !== c.home);
      m.rng.shuffle(singles);
      for (const a of singles) {
        const b = singles.find((x) => x !== a && x.at === a.at && x.female !== a.female && Math.abs(x.age - a.age) < 10);
        if (!b) continue;
        a.partner = b.id; b.partner = a.id;
        const place = s.world.buildings[a.at];
        s.social.add(a, b, 60, `влюбились — ${place.name}`, 1);
        s.brain.log(a, `познакомил${a.female ? 'ась' : 'ся'} с ${b.first} — ${place.name}. кажется, это любовь`);
        s.brain.log(b, `познакомил${b.female ? 'ась' : 'ся'} с ${a.first} — ${place.name}. кажется, это любовь`);
        a.mood = b.mood = 95;
        s.news.push('💘', `${displayName(a)} и ${displayName(b)} познакомились (${place.name}) и, кажется, влюбились`, 'people', { citizen: a.id, focus: place.entrance.pos });
        return true;
      }
      return false;
    },
  },
  {
    id: 'breakup', name: 'Расставание', emoji: '💔', cat: 'люди', weight: 0.08, manual: true, dur: [1, 2],
    start: (s, ev, m) => {
      const cand = s.citizens.filter((c) => c.alive && c.partner > c.id && c.children.length === 0 && c.age < 45);
      if (!cand.length) return false;
      const a = m.rng.pick(cand), b = s.citizens[a.partner];
      a.partner = -1; b.partner = -1;
      a.mood -= 30; b.mood -= 30;
      a.needs.fun = 10; b.needs.fun = 10;
      s.brain.log(a, F(a, 'расстался с ' + b.first + '... грустно', 'рассталась с ' + b.first + '... грустно'));
      s.brain.log(b, F(b, 'расстался с ' + a.first + '... грустно', 'рассталась с ' + a.first + '... грустно'));
      s.news.push('💔', `${a.first} и ${b.first} расстались. Друзья зовут их развеяться в бар`, 'people', { citizen: a.id });
      return true;
    },
  },
  {
    id: 'fired', name: 'Увольнение', emoji: '📉', cat: 'экономика', weight: 0.15, hours: [10, 17], manual: true, dur: [1, 2],
    start: (s, ev, m) => {
      const cand = s.citizens.filter((c) => c.alive && c.work >= 0 && c.job.salary > 0 && !['pupil', 'student', 'toddler'].includes(c.job.id));
      if (!cand.length) return false;
      const c = m.rng.pick(cand);
      s.fire(c, m.rng.pick(['сокращение штата', 'поругал' + (c.female ? 'ась' : 'ся') + ' с начальником', 'компания переехала', 'опоздания', 'решил' + (c.female ? 'а' : '') + ' уйти в никуда']));
      return true;
    },
  },
  {
    id: 'promotion', name: 'Повышение по службе', emoji: '📈', cat: 'экономика', weight: 0.2, hours: [10, 17], manual: true, dur: [1, 2],
    start: (s, ev, m) => {
      const cand = s.citizens.filter((c) => c.alive && c.work >= 0 && c.job.salary > 0 && c.job.kind === undefined);
      if (!cand.length) return false;
      const c = m.rng.pick(cand.filter((x) => x.traits.some((t) => t.id === 'workaholic')).concat(cand));
      c.money += 500;
      c.mood = Math.min(100, c.mood + 20);
      s.brain.log(c, F(c, 'получил повышение! вечером надо отметить', 'получила повышение! вечером надо отметить'));
      s.news.push('📈', `${displayName(c)} получил${c.female ? 'а' : ''} повышение — ${s.world.buildings[c.work]?.name ?? ''}`, 'economy', { citizen: c.id });
      return true;
    },
  },
  {
    id: 'retire', name: 'Проводы на пенсию', emoji: '🎉', cat: 'люди', weight: 0.06, hours: [15, 18], manual: true, dur: [1, 2],
    start: (s, ev, m) => {
      const cand = s.citizens.filter((c) => c.alive && c.work >= 0 && c.age >= 58 && c.job.salary > 0);
      if (!cand.length) return false;
      const c = m.rng.pick(cand);
      const where = s.world.buildings[c.work]?.name ?? '';
      const wasJob = F(c, c.job.name, c.job.nameF ?? c.job.name);
      if (c.work >= 0) { const b = s.world.buildings[c.work]; b.workers = b.workers.filter((x) => x !== c.id); }
      c.work = -1;
      c.job = SPECIAL_JOBS.retiree;
      computeSleep(c, m.rng);
      s.brain.log(c, F(c, 'вышел на пенсию! теперь — дача и рыбалка', 'вышла на пенсию! теперь — дача и сериалы'));
      s.news.push('🎉', `${displayName(c)} (${wasJob}, ${where}) провожают на пенсию — коллеги подарили часы`, 'people', { citizen: c.id });
      return true;
    },
  },
];

// отложенный вызов в игровом времени
function setTimeoutGame(s: Sim, minutes: number, fn: () => void) {
  const def: EventDef = { id: 'timer', name: '', emoji: '', cat: 'люди', weight: 0, dur: [minutes, minutes], start: () => true, end: () => fn() };
  const now = s.clock.total;
  s.events.active.push({ id: -1, def, start: now, end: now + minutes, title: '', data: {} });
}
