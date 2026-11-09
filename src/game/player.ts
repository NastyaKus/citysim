// Управление жителем от третьего лица.
import type { Sim } from '../sim/sim';
import type { Citizen } from '../sim/citizen';
import { displayName, hasTrait } from '../sim/citizen';
import type { Building } from '../sim/world';
import { HALF_CITY, isOpen } from '../sim/world';
import { ACTIVITIES, ACTIVITY_BY_ID, ActivityDef, gender } from '../sim/content/activities';
import type { Collision } from './collision';
import type { InteriorView, Spot, Pose } from '../render/interior';
import { JOBS } from '../sim/content/jobs';
import { PRICES } from '../sim/goals';
import { DISTRICT_NAMES } from '../sim/world';

export type Target =
  | { kind: 'building'; b: Building; label: string }
  | { kind: 'outdoor'; b: Building; label: string }
  | { kind: 'citizen'; c: Citizen; label: string }
  | { kind: 'dog'; c: Citizen; label: string }
  | { kind: 'spot'; spot: Spot; label: string }
  | { kind: 'npc'; c: Citizen; label: string };

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
  enterRoom: (b: Building) => InteriorView;
  exitRoom: () => void;
  dialog: (npc: Citizen) => void;
}

export interface Special { emoji: string; label: string; sub: string; disabled?: string; run: () => void; submenu?: () => Special[] }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
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
  room: InteriorView | null = null;
  rx = 0;
  rz = 0;
  rdirX = 0;
  rdirZ = -1;
  roomPose: Pose = 'stand';
  roomMoving = 0;
  /** приглашение: житель ждёт в месте */
  meeting: { npc: number; b: number; until: number } | null = null;

  constructor(private sim: Sim, private col: Collision, private hooks: PlayerHooks) {
    sim.onPlayerActivityEnd = (c) => {
      if (c !== this.c) return false;
      this.stopFastForward();
      hooks.toast(`Готово: ${c.diary[0]?.text ?? 'занятие закончилось'}`);
      if (this.room?.building) {
        // остаёмся в комнате, встаём рядом с местом
        c.act = null;
        this.roomPose = 'stand';
        this.rz += 0.8;
        return true;
      }
      hooks.sound('door', c.x, c.z);
      return false;
    };
  }

  get active() {
    return !!this.c;
  }

  hooks_heart(npc: Citizen) {
    this.hooks.heart(npc.x, npc.z);
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
    if (this.room) this.exitRoom(true);
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
    if (this.room) return this.updateRoom(dt);
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
      o.pausedUntil = sim.clock.total + 3;
      o.dirX = c.x - o.x; o.dirZ = c.z - o.z;
      const l = Math.hypot(o.dirX, o.dirZ) || 1;
      o.dirX /= l; o.dirZ /= l;
      this.hooks.dialog(o);
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
    if (t.kind === 'npc') { this.hooks.dialog(t.c); return null; }
    if (t.kind === 'spot') return this.useSpot(t.spot);
    const closed = t.kind === 'building' ? this.closedText(t.b) : null;
    if (closed) { this.hooks.toast(closed); this.hooks.sound('beep'); return null; }
    if (t.kind === 'building') { this.enterRoom(t.b); return null; }
    return t.b;
  }

  // ——— интерьер
  enterRoom(b: Building) {
    const c = this.c!;
    const sim = this.sim;
    c.at = b.id;
    b.inside.add(c.id);
    c.state = 'inside';
    c.act = null;
    c.x = b.entrance.pos.x; c.z = b.entrance.pos.z;
    sim.transport.obstacles = [];
    this.room = this.hooks.enterRoom(b);
    this.rx = this.room.door.x;
    this.rz = this.room.door.z - 0.8;
    this.rdirX = 0; this.rdirZ = -1;
    this.roomPose = 'stand';
    this.yaw = 0;
    this.pitch = 0.42;
    this.dist = 5.5;
    this.target = null;
    this.hooks.sound('door', c.x, c.z);
    if (b.id !== c.home && !['office', 'industry'].includes(b.def.cat)) sim.dynamics.visit(b);
    // встреча по приглашению
    if (this.meeting && this.meeting.b === b.id && sim.clock.total < this.meeting.until) {
      const o = sim.citizens[this.meeting.npc];
      if (o?.at === b.id) {
        sim.social.add(o, c, 15, 'провели время вместе', 0.9);
        sim.brain.log(c, `встреча: ${o.first} — ${b.name}`);
        this.hooks.toast(`${o.first} уже здесь и машет тебе 👋`);
        this.meeting = null;
      }
    }
  }

  exitRoom(silent = false) {
    const c = this.c!;
    const sim = this.sim;
    const b = this.room?.building;
    if (c.act) { this.stopFastForward(); sim.brain.endActivity(c); }
    c.act = null;
    if (b) {
      b.inside.delete(c.id);
      c.x = b.entrance.pos.x; c.z = b.entrance.pos.z;
    }
    c.at = -1;
    c.state = 'walk';
    this.room = null;
    this.yaw = Math.atan2(-c.dirX, -c.dirZ);
    this.pitch = 0.38;
    this.dist = 9;
    if (!silent) this.hooks.sound('door', c.x, c.z);
    this.hooks.exitRoom();
  }

  private updateRoom(dt: number) {
    const c = this.c!;
    const room = this.room!;
    const ix = this.input.x, iz = this.input.z;
    const mag = Math.min(1, Math.hypot(ix, iz));
    if (c.act && mag > 0.35) { this.sim.brain.endActivity(c); c.act = null; this.roomPose = 'stand'; this.stopFastForward(); }
    if (c.act) { this.roomMoving = 0; return; }
    if (mag > 0.08) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = -fz, rz = fx;
      let mx = fx * -iz + rx * ix, mz = fz * -iz + rz * ix;
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml; mz /= ml;
      const speed = (this.input.run ? 5 : 3) * mag;
      const p = { x: this.rx + mx * speed * dt, z: this.rz + mz * speed * dt };
      room.collision.resolve(p, 0.35);
      p.x = Math.max(-room.w / 2 + 0.5, Math.min(room.w / 2 - 0.5, p.x));
      p.z = Math.max(-room.d / 2 + 0.5, Math.min(room.d / 2 - 0.4, p.z));
      const moved = Math.hypot(p.x - this.rx, p.z - this.rz);
      this.rx = p.x; this.rz = p.z;
      this.rdirX = mx; this.rdirZ = mz;
      this.roomMoving = moved / Math.max(dt, 1e-4);
      this.stepAcc += moved;
      if (this.stepAcc > 0.9) { this.stepAcc = 0; this.hooks.sound('step'); }
    } else this.roomMoving = 0;
    this.targetAt -= dt;
    if (this.targetAt <= 0) {
      this.targetAt = 0.12;
      const n = room.nearest(this.rx, this.rz);
      if (!n) this.target = null;
      else if (n.npc) {
        const known = c.rel?.[n.npc.id] !== undefined;
        this.target = { kind: 'npc', c: n.npc, label: `💬 ${known ? 'Поговорить' : 'Познакомиться'}: ${n.npc.first}` };
      } else if (n.spot) {
        const sp = n.spot;
        if (sp.acts.includes('__exit')) this.target = { kind: 'spot', spot: sp, label: '🚪 Выйти на улицу' };
        else {
          const ok = this.spotOptions(sp);
          this.target = { kind: 'spot', spot: sp, label: ok.length ? `${ok[0].act.emoji} ${cap(sp.label)}: ${ok.length > 1 ? 'выбрать' : ok[0].act.label}` : `${cap(sp.label)} — сейчас нечего делать` };
        }
      }
    }
  }

  spotOptions(sp: Spot): ActivityOption[] {
    const b = this.room?.building;
    if (!b) return [];
    return this.options(b).filter((o) => !o.disabled && sp.acts.includes(o.act.id));
  }

  /** использовать место; вернёт здание, если нужно показать список */
  private useSpot(sp: Spot): Building | null {
    if (sp.acts.includes('__exit')) { this.exitRoom(); return null; }
    const ok = this.spotOptions(sp);
    if (!ok.length) { this.hooks.toast('Здесь сейчас нечем заняться'); return null; }
    if (ok.length === 1) { this.startAtSpot(sp, ok[0]); return null; }
    this.pendingSpot = sp;
    return this.room!.building;
  }

  pendingSpot: Spot | null = null;

  startAtSpot(sp: Spot | null, opt: ActivityOption) {
    const b = this.room?.building;
    const c = this.c;
    if (!b || !c) return;
    const sim = this.sim;
    if (opt.act.id === 'work' && b.id !== c.work) return;
    sim.brain.beginActivity(c, opt.act, b.id, opt.dur, opt.act.id === 'work' ? (sim.brain.shiftWindow(c)?.[0] ?? 0) : 0);
    if (['work', 'school', 'study'].includes(opt.act.id)) c.shiftDay = Math.floor((sim.brain.shiftWindow(c)?.[0] ?? sim.clock.total) / 1440);
    c.state = 'inside';
    if (sp) { this.rx = sp.x; this.rz = sp.z; this.rdirX = -Math.sin(sp.ry + Math.PI); this.rdirZ = -Math.cos(sp.ry + Math.PI); this.roomPose = sp.pose; }
    else this.roomPose = 'stand';
    this.pendingSpot = null;
    // встреча по приглашению
    if (this.meeting && this.meeting.b === b.id) {
      const o = sim.citizens[this.meeting.npc];
      if (o?.at === b.id) { sim.social.add(o, c, 15, 'провели время вместе', 0.9); this.hooks.toast(`Вы с ${o.first} отлично провели время 💛`); this.meeting = null; }
    }
  }

  /** особые действия в здании: работа, покупки, переезд */
  specials(b: Building): Special[] {
    const c = this.c!;
    const sim = this.sim;
    const out: Special[] = [];
    const jobsHere = JOBS.filter((j) => j.places.includes(b.type) && c.age >= j.ages[0] && c.age <= j.ages[1]);
    if (b.id !== c.work && b.def.cat !== 'home' && !b.def.outdoor && jobsHere.length) {
      for (const j of jobsHere.slice(0, 3)) {
        const name = c.female && j.nameF ? j.nameF : j.name;
        out.push({ emoji: '💼', label: `Устроиться: ${name}`, sub: `${Math.round(j.salary * sim.params.wageLevel)}₽ в день · ${String(j.shift[0]).padStart(2, '0')}:00–${String(j.shift[1] % 24).padStart(2, '0')}:00`, disabled: c.age < 16 ? 'рано работать' : undefined, run: () => this.takeJob(b, j.id) });
      }
    }
    if (b.type === 'autoservice' || b.type === 'gasstation') out.push({ emoji: '🚗', label: 'Купить машину', sub: `${PRICES.car}₽`, disabled: c.hasCar ? 'уже есть' : c.age < 18 ? 'нет прав' : c.money < PRICES.car ? `нужно ${PRICES.car}₽` : undefined, run: () => { if (sim.goals.buyCar(c)) { this.done(`Купил${c.female ? 'а' : ''} машину! Теперь можно ездить на работу`, '🚗'); if (c.goal?.kind === 'car') sim.goals.achieve(c); } } });
    if (['supermarket', 'market', 'gym', 'autoservice'].includes(b.type)) out.push({ emoji: '🚲', label: 'Купить велосипед', sub: `${PRICES.bike}₽`, disabled: c.hasBike ? 'уже есть' : c.money < PRICES.bike ? `нужно ${PRICES.bike}₽` : undefined, run: () => { if (sim.goals.buyBike(c)) { this.done(`Купил${c.female ? 'а' : ''} велосипед — теперь он${c.female ? 'а' : ''} будет на нём ездить`, '🚲'); if (c.goal?.kind === 'bike') sim.goals.achieve(c); } } });
    if (b.type === 'bank' || b.type === 'cityhall') {
      out.push({ emoji: '🏠', label: 'Агентство: переехать', sub: `${PRICES.move}₽ за переезд`, disabled: c.money < PRICES.move ? `нужно ${PRICES.move}₽` : undefined, run: () => undefined, submenu: () => {
        const members = 1 + c.household.filter((id) => sim.citizens[id]?.alive).length;
        return sim.world.buildings.filter((h) => h.def.cat === 'home' && h.id !== c.home && h.homeCapacity - h.residents.length >= members).slice(0, 8).map((h) => ({ emoji: h.type === 'house' ? '🏡' : '🏢', label: h.name, sub: `${h.def.name} · р-н ${DISTRICT_NAMES[h.district]} · свободно ${h.homeCapacity - h.residents.length}`, run: () => { if (sim.goals.moveHouse(c, h.id)) { this.done(`Переезд! Новый дом: ${h.name}`, '🏠'); if (c.goal?.kind === 'move') sim.goals.achieve(c); } } }));
      } });
    }
    if (b.type === 'cityhall') {
      out.push({ emoji: '📋', label: 'Биржа труда: вакансии', sub: 'любая работа в городе', run: () => undefined, submenu: () => sim.rng.shuffle(JOBS.filter((j) => c.age >= j.ages[0] && c.age <= j.ages[1] && j.places.some((p) => sim.world.byType.has(p)))).slice(0, 6).map((j) => ({ emoji: '💼', label: c.female && j.nameF ? j.nameF : j.name, sub: `${Math.round(j.salary * sim.params.wageLevel)}₽ в день`, run: () => this.takeJob(null, j.id) })) });
    }
    return out;
  }

  private done(text: string, emoji: string) {
    const c = this.c!;
    this.sim.brain.log(c, text);
    this.sim.news.push(emoji, `${displayName(c)}: ${text.charAt(0).toLowerCase() + text.slice(1)}`, 'people', { citizen: c.id });
    this.hooks.toast(text);
  }

  takeJob(b: Building | null, jobId: string) {
    const c = this.c!;
    const sim = this.sim;
    const job = JOBS.find((j) => j.id === jobId);
    if (!job) return;
    sim.goals.changeJob(c, 0, job);
    if (b && c.work !== b.id) {
      if (c.work >= 0) { const w = sim.world.buildings[c.work]; w.workers = w.workers.filter((x) => x !== c.id); }
      c.work = b.id;
      b.workers.push(c.id);
    }
    const wb = c.work >= 0 ? sim.world.buildings[c.work] : null;
    this.done(`Устроил${c.female ? 'ась' : 'ся'} на работу: ${c.female && job.nameF ? job.nameF : job.name}${wb ? ` — ${wb.name}` : ''}. Смена с ${String(job.shift[0]).padStart(2, '0')}:00`, '💼');
  }
}
