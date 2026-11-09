// Управление жителем от третьего лица.
import type { Sim } from '../sim/sim';
import type { Citizen } from '../sim/citizen';
import { displayName, hasTrait } from '../sim/citizen';
import type { Building } from '../sim/world';
import { HALF_CITY, isOpen } from '../sim/world';
import { ACTIVITIES, ACTIVITY_BY_ID, ActivityDef, gender } from '../sim/content/activities';
import type { Collision } from './collision';

export type Target =
  | { kind: 'building'; b: Building; label: string }
  | { kind: 'outdoor'; b: Building; label: string }
  | { kind: 'citizen'; c: Citizen; label: string }
  | { kind: 'dog'; c: Citizen; label: string };

export interface ActivityOption {
  act: ActivityDef;
  dur: number;
  price: number;
  disabled?: string;
}

export interface PlayerHooks {
  toast: (text: string) => void;
  sound: (kind: 'door' | 'talk' | 'bark' | 'beep' | 'step', x?: number, z?: number) => void;
  heart: (x: number, z: number) => void;
}

const HOME_ACTS = ['sleep', 'nap', 'breakfast', 'eat_home', 'cook', 'tv', 'games', 'read_home', 'music_home', 'call', 'cleaning'];
const OUTDOOR_ACTS = ['bench', 'picnic', 'ducks', 'snowman', 'snowballs', 'playground', 'street_music', 'icecream'];

export class Player {
  c: Citizen | null = null;
  yaw = 0.6;
  pitch = 0.38;
  dist = 9;
  input = { x: 0, z: 0, run: false };
  target: Target | null = null;
  private targetAt = 0;
  private stepAcc = 0;
  private prevSpeed = 1;
  fastForward = false;

  constructor(private sim: Sim, private col: Collision, private hooks: PlayerHooks) {
    sim.onPlayerActivityEnd = (c) => {
      if (c !== this.c) return;
      this.stopFastForward();
      hooks.sound('door', c.x, c.z);
      hooks.toast(`Готово: ${c.diary[0]?.text ?? 'занятие закончилось'}`);
    };
  }

  get active() {
    return !!this.c;
  }

  /** взять жителя под управление; строка — причина отказа */
  take(c: Citizen): string | null {
    if (!c.alive) return 'этого жителя больше нет';
    if (c.age < 6) return 'малыши пока не ходят по городу одни';
    if (c.trip && (c.trip.stage === 'drive' || c.trip.stage === 'ride')) return `${c.first} сейчас в транспорте — подожди, пока доедет`;
    if (this.c) this.release();
    const sim = this.sim;
    if (c.trip?.stage === 'wait') {
      const st = sim.transport.stops[c.trip.boardStop];
      st.waiting = st.waiting.filter((x) => x !== c.id);
    }
    if (c.act) sim.brain.endActivity(c);
    sim.emerge(c);
    c.controlled = true;
    c.invitedBy = -1;
    // встать в свободное место рядом
    const p = { x: c.x, z: c.z };
    this.col.resolve(p, 0.4);
    c.x = p.x; c.z = p.z;
    this.yaw = Math.atan2(-c.dirX, -c.dirZ);
    this.c = c;
    sim.brain.log(c, '🎮 теперь под твоим управлением');
    return null;
  }

  release() {
    const c = this.c;
    if (!c) return;
    this.stopFastForward();
    if (c.act && c.state !== 'outdoor') {
      // оставляем занятие — дальше житель сам
    } else if (c.act) {
      this.sim.brain.endActivity(c);
      this.sim.emerge(c);
    }
    c.controlled = false;
    c.moving = 0;
    this.sim.brain.log(c, 'снова живёт своей жизнью');
    this.sim.transport.obstacles = [];
    this.c = null;
    this.target = null;
  }

  get inside() {
    return !!this.c?.act && this.c.state === 'inside';
  }

  update(dt: number) {
    const c = this.c;
    if (!c) return;
    const sim = this.sim;
    sim.transport.obstacles = c.state === 'inside' ? [] : [{ x: c.x, z: c.z }];
    if (c.state === 'inside') { c.moving = 0; return; }
    const ix = this.input.x, iz = this.input.z;
    const mag = Math.min(1, Math.hypot(ix, iz));
    // занятие на улице прерывается движением
    if (c.act && c.state === 'outdoor' && mag > 0.35) {
      sim.brain.endActivity(c);
      sim.emerge(c);
    }
    if (c.act) { c.moving = 0; return; }
    if (mag < 0.08) {
      c.moving = 0;
    } else {
      // вперёд — от камеры
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = -fz, rz = fx;
      let mx = fx * -iz + rx * ix, mz = fz * -iz + rz * ix;
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml; mz /= ml;
      const run = this.input.run && c.needs.energy > 5;
      let speed = (run ? 8 : 4.5) * mag;
      if (sim.weather.icy) speed *= 0.75;
      speed *= 1 - sim.weather.snowCover * 0.15;
      if (c.age > 70) speed *= 0.8;
      const p = { x: c.x + mx * speed * dt, z: c.z + mz * speed * dt };
      this.col.resolve(p, 0.4);
      const lim = HALF_CITY + 40;
      p.x = Math.max(-lim, Math.min(lim, p.x));
      p.z = Math.max(-lim, Math.min(lim, p.z));
      const moved = Math.hypot(p.x - c.x, p.z - c.z);
      c.x = p.x; c.z = p.z;
      c.dirX = mx; c.dirZ = mz;
      // c.moving — в «игровых» единицах для анимации шага
      c.moving = (moved / Math.max(dt, 1e-4)) * 0.9;
      if (run) c.needs.energy = Math.max(0, c.needs.energy - dt * 0.12);
      this.stepAcc += moved;
      const stride = run ? 1.5 : 1.05;
      if (this.stepAcc > stride) { this.stepAcc = 0; this.hooks.sound('step', c.x, c.z); }
    }
    this.targetAt -= dt;
    if (this.targetAt <= 0) { this.targetAt = 0.15; this.target = this.findTarget(); }
  }

  private findTarget(): Target | null {
    const c = this.c!;
    const sim = this.sim;
    let best: Target | null = null;
    let bd = 2.6;
    for (const o of sim.citizens) {
      if (o === c || !o.alive) continue;
      if (!(o.state === 'walk' || o.state === 'outdoor' || o.state === 'waitBus' || o.state === 'waitTaxi' || o.state === 'bike')) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (o.hasDog && !o.dogLost && (o.act?.id === 'dogwalk' || o.trip?.act.id === 'dogwalk') && d < bd + 0.6) {
        bd = d - 0.6;
        best = { kind: 'dog', c: o, label: `🐕 Погладить: ${o.dogName}` };
        continue;
      }
      if (d < bd) {
        bd = d;
        const known = c.friends.includes(o.id) || c.household.includes(o.id) || c.partner === o.id;
        best = { kind: 'citizen', c: o, label: `💬 ${known ? 'Поболтать' : 'Познакомиться'}: ${o.first}` };
      }
    }
    if (best) return best;
    let bb: Building | null = null;
    let bdist = 3.2;
    for (const b of sim.world.buildings) {
      if (b.def.outdoor) continue;
      const d = Math.hypot(b.entrance.pos.x - c.x, b.entrance.pos.z - c.z);
      if (d < bdist) { bdist = d; bb = b; }
    }
    if (bb) return { kind: 'building', b: bb, label: `🚪 Зайти: ${bb.id === c.home ? 'домой' : bb.name}` };
    for (const b of sim.world.buildings) {
      if (!b.def.outdoor) continue;
      if (Math.abs(c.x - b.x) < b.w / 2 && Math.abs(c.z - b.z) < b.d / 2) {
        if (this.options(b).some((o) => !o.disabled)) return { kind: 'outdoor', b, label: `🌳 Чем заняться: ${b.name}` };
      }
    }
    return null;
  }

  /** список занятий для здания или открытого места */
  options(b: Building): ActivityOption[] {
    const c = this.c!;
    const sim = this.sim;
    const h = sim.clock.hour, wd = sim.clock.weekday;
    const out: ActivityOption[] = [];
    const priceOf = (a: ActivityDef) => Math.round(a.cost * sim.params.priceLevel * sim.mods.priceMul * b.priceMul * 10) / 10;
    const hourOk = (a: ActivityDef) => a.hours.some(([x, y]) => (h >= x && h < y) || (y > 24 && h < y - 24));
    const add = (a: ActivityDef, durOverride?: number) => {
      if (out.some((o) => o.act.id === a.id)) return;
      let disabled: string | undefined;
      if (c.age < a.ages[0] || c.age > a.ages[1]) disabled = 'не по возрасту';
      else if (!a.eventOnly && !hourOk(a)) disabled = 'не то время';
      else if (a.days && !a.days.includes(wd)) disabled = 'не сегодня';
      else if (!sim.brain.requirementOk(c, a) && a.requires !== 'friend') disabled = a.requires === 'snowOnGround' ? 'нет снега' : a.requires === 'dog' ? 'нет собаки' : 'не получится';
      const price = priceOf(a);
      if (!disabled && price > c.money) disabled = `нужно ${price}₽`;
      const dur = durOverride ?? Math.round((a.dur[0] + a.dur[1]) / 2);
      out.push({ act: a, dur, price, disabled });
    };
    if (b.id === c.home) {
      for (const id of HOME_ACTS) {
        const a = ACTIVITY_BY_ID[id];
        if (id === 'sleep') { add(a, Math.round(((((c.wake - h) % 24) + 24) % 24) * 60) || 480); continue; }
        add(a);
      }
      return out;
    }
    if (b.id === c.work) {
      const kind = c.job.kind;
      const a = ACTIVITY_BY_ID[kind === 'school' ? 'school' : kind === 'study' ? 'study' : kind === 'kinder' ? 'kinder' : 'work'];
      const sw = sim.brain.shiftWindow(c);
      add(a, sw ? Math.max(30, Math.round(sw[1] - sim.clock.total)) : 120);
    }
    for (const sp of sim.eventSpots) if (sp.building === b.id && sp.until > sim.clock.total) add(sp.act);
    for (const a of ACTIVITIES) {
      if (a.eventOnly || !Array.isArray(a.places) || !a.places.includes(b.type)) continue;
      if (b.def.outdoor && !OUTDOOR_ACTS.includes(a.id) && !a.outdoor) continue;
      if (b.def.outdoor && (a.id === 'jog' || a.id === 'park_walk' || a.id === 'dogwalk' || a.id === 'bike_ride' || a.id === 'football')) continue;
      add(a);
    }
    return out;
  }

  /** закрыто ли здание для игрока */
  closedText(b: Building): string | null {
    const c = this.c!;
    if (b.id === c.home || b.id === c.work) return null;
    if (b.onFire > 0) return `${b.name} горит!`;
    if (b.powerOut) return 'там нет света';
    if (b.closedReason) return `закрыто (${b.closedReason})`;
    const sim = this.sim;
    if (!isOpen(b, sim.clock.hour, sim.clock.weekday)) {
      const o = b.def.open;
      return o ? `закрыто, работает с ${String(o[0]).padStart(2, '0')}:00 до ${String(o[1] % 24).padStart(2, '0')}:00` : 'закрыто';
    }
    return null;
  }

  /** начать занятие в здании или на месте */
  start(b: Building, opt: ActivityOption) {
    const c = this.c;
    if (!c || opt.disabled) return;
    const sim = this.sim;
    const outdoor = !!(opt.act.outdoor || b.def.outdoor);
    const px = c.x, pz = c.z;
    sim.brain.beginActivity(c, opt.act, b.id, opt.dur, opt.act.id === 'work' ? (sim.brain.shiftWindow(c)?.[0] ?? 0) : 0);
    if (opt.act.id === 'work' || opt.act.id === 'school' || opt.act.id === 'study') c.shiftDay = Math.floor((sim.brain.shiftWindow(c)?.[0] ?? sim.clock.total) / 1440);
    if (outdoor) {
      // остаёмся там, где стоим
      c.x = px; c.z = pz;
      c.state = 'outdoor';
      c.wander = { x: px, z: pz, pause: 999 };
    } else this.hooks.sound('door', c.x, c.z);
  }

  /** выйти из здания досрочно */
  leave() {
    const c = this.c;
    if (!c || !c.act) return;
    this.stopFastForward();
    this.sim.brain.endActivity(c);
    this.sim.emerge(c);
    this.hooks.sound('door', c.x, c.z);
  }

  toggleFastForward() {
    if (this.fastForward) return this.stopFastForward();
    this.fastForward = true;
    this.prevSpeed = this.sim.params.timeSpeed;
    this.sim.params.timeSpeed = 20;
    this.sim.params.paused = false;
  }

  stopFastForward() {
    if (!this.fastForward) return;
    this.fastForward = false;
    this.sim.params.timeSpeed = this.prevSpeed;
  }

  /** действие по кнопке; вернёт здание, если нужно показать меню занятий */
  act(): Building | null {
    const c = this.c;
    const t = this.target;
    if (!c || !t) return null;
    const sim = this.sim;
    if (t.kind === 'citizen') {
      const o = t.c;
      const known = c.friends.includes(o.id) || c.household.includes(o.id) || c.partner === o.id;
      c.needs.social = Math.min(100, c.needs.social + 25);
      c.needs.fun = Math.min(100, c.needs.fun + 5);
      o.needs.social = Math.min(100, o.needs.social + 20);
      o.pausedUntil = sim.clock.total + 1.5;
      o.dirX = c.x - o.x; o.dirZ = c.z - o.z;
      const l = Math.hypot(o.dirX, o.dirZ) || 1;
      o.dirX /= l; o.dirZ /= l;
      this.hooks.sound('talk', o.x, o.z);
      if (known) {
        const topic = sim.rng.pick(['погоду', 'новости города', 'цены', 'вчерашний матч', 'сериалы', 'соседей', 'музыку', 'планы на выходные']);
        sim.brain.log(c, `поболтал${c.female ? 'а' : ''} с ${o.first} про ${topic}`);
        sim.brain.log(o, `поболтал${o.female ? 'а' : ''} с ${c.first} про ${topic}`);
        this.hooks.toast(`Вы с ${o.first} поболтали про ${topic} 💬`);
      } else {
        let p = 0.45;
        if (hasTrait(o, 'social')) p += 0.3;
        if (hasTrait(o, 'introvert')) p -= 0.25;
        if (hasTrait(c, 'social')) p += 0.1;
        if (o.mood < 40) p -= 0.15;
        if (Math.abs(o.age - c.age) > 25) p -= 0.15;
        if (sim.rng.chance(p)) {
          c.friends.push(o.id);
          o.friends.push(c.id);
          sim.brain.log(c, gender(`познакомил{ся|ась} и подружил{ся|ась}: ${o.first}`, c.female));
          sim.brain.log(o, gender(`познакомил{ся|ась} и подружил{ся|ась}: ${c.first}`, o.female));
          sim.news.push('🤝', `${displayName(c)} и ${displayName(o)} познакомились на улице и подружились`, 'people', { citizen: c.id });
          this.hooks.toast(`${o.first} теперь ${o.female ? 'твоя подруга' : 'твой друг'}! 🤝`);
        } else {
          this.hooks.toast(sim.rng.pick([`${o.first} вежливо кивнул${o.female ? 'а' : ''} и пош${o.female ? 'ла' : 'ёл'} дальше`, `${o.first} торопится — может, в другой раз`, `${o.first} не в настроении болтать`]));
        }
      }
      return null;
    }
    if (t.kind === 'dog') {
      const o = t.c;
      c.needs.fun = Math.min(100, c.needs.fun + 15);
      c.mood = Math.min(100, c.mood + 4);
      o.needs.social = Math.min(100, o.needs.social + 5);
      o.pausedUntil = sim.clock.total + 1;
      this.hooks.sound('bark', o.x, o.z);
      this.hooks.heart(o.x, o.z);
      sim.brain.log(c, `погладил${c.female ? 'а' : ''} собаку ${o.dogName} 🐕`);
      this.hooks.toast(`${o.dogName} радостно виляет хвостом 🐶`);
      return null;
    }
    const closed = t.kind === 'building' ? this.closedText(t.b) : null;
    if (closed) { this.hooks.toast(closed); this.hooks.sound('beep'); return null; }
    return t.b;
  }
}
