// Ядро симуляции: связывает мир, жителей, транспорт, погоду и события.
import { World, Building, V2 } from './world';
import { RNG, clamp } from './rng';
import { Params, DEFAULT_PARAMS } from './params';
import { Clock, News } from './news';
import { Citizen, generatePopulation, displayName, assignJob, pickJob, removeFromWork, makeCitizen, computeSleep } from './citizen';
import { Brain, EventSpot } from './brain';
import { Transport, Vehicle, BusStop } from './transport';
import { WeatherSystem } from './weather';
import { Stats } from './stats';
import { EventManager } from './events';
import { Social } from './social';
import { Goals } from './goals';
import { Dynamics } from './dynamics';
import { Newspaper } from './newspaper';
import { JOBS, JobDef } from './content/jobs';
import { ACTIVITY_BY_ID, ActivityDef, gender } from './content/activities';
import { SPECIAL_JOBS } from './content/jobs';
import type { WeatherDef } from './content/weather';
import { SEASON_NAMES, Season } from './content/weather';

export type FxKind =
  | 'fire' | 'smoke' | 'flood' | 'cones' | 'tent' | 'circus' | 'stage' | 'fireworks' | 'pigeons' | 'crash'
  | 'stalls' | 'balloons' | 'meteors' | 'lostdog' | 'rave' | 'ballot' | 'confetti' | 'crowd' | 'garlands' | 'icecream' | 'forrent';

export interface Fx {
  id: number;
  kind: FxKind;
  x: number;
  z: number;
  w?: number;
  d?: number;
  rot?: number;
  building?: number;
  edge?: number;
  until: number;
  intensity: number;
}

export interface Snowman { x: number; z: number; size: number; built: number; hat: number }

export interface Mods {
  wageMul: number;
  priceMul: number;
  outdoorMul: number;
  moodBonus: number;
  sickMul: number;
  freeTransit: boolean;
}

export class Sim {
  params: Params;
  clock = new Clock();
  world: World;
  rng = new RNG(2024);
  citizens: Citizen[] = [];
  brain: Brain;
  transport: Transport;
  weather: WeatherSystem;
  news: News;
  stats: Stats;
  events: EventManager;
  social: Social;
  goals: Goals;
  dynamics: Dynamics;
  paper: Newspaper;
  eventSpots: EventSpot[] = [];
  fx: Fx[] = [];
  snowmen: Snowman[] = [];
  outages = new Set<number>();
  mods: Mods = { wageMul: 1, priceMul: 1, outdoorMul: 1, moodBonus: 0, sickMul: 1, freeTransit: false };
  private fxId = 1;
  private spotId = 1;
  private lastDay = -1;
  private lastRouting = 0;
  private lastHour = -1;
  version = 0; // растёт при пересоздании населения
  routingDirty = false;
  lastLateNews = -999;

  constructor(params: Partial<Params> = {}, seed = 7) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.world = new World(seed);
    this.news = new News(() => this.clock.total);
    this.weather = new WeatherSystem(this);
    this.transport = new Transport(this, this.world);
    this.brain = new Brain(this);
    this.stats = new Stats(this);
    this.events = new EventManager(this);
    this.social = new Social(this);
    this.goals = new Goals(this);
    this.dynamics = new Dynamics(this);
    this.paper = new Newspaper(this);
    this.weather.set(this.params.weather);
    this.regenerate();
    this.news.push('🏙️', 'Добро пожаловать в город! Понедельник, утро — город просыпается и спешит на работу.', 'city');
  }

  regenerate() {
    for (const c of this.citizens) c.controlled = false;
    for (const v of this.transport.vehicles) if (v.role === 'citizen' || v.role === 'taxi') v.done = true;
    for (const st of this.transport.stops) st.waiting = [];
    for (const v of this.transport.vehicles) v.passengers = [];
    this.citizens = generatePopulation(this.world, this.params, this.rng);
    for (const c of this.citizens) {
      // кто уже должен быть на смене — сразу на работе
      this.adjustWake(c);
      const sw = this.brain.shiftWindow(c);
      if (sw && c.work >= 0 && this.clock.total >= sw[0] - this.brain.estimateMinutes(c, this.world.buildings[c.work]) - 10) {
        c.shiftDay = Math.floor(sw[0] / 1440);
        const kind = c.job.kind;
        const act = ACTIVITY_BY_ID[kind === 'school' ? 'school' : kind === 'study' ? 'study' : kind === 'kinder' ? 'kinder' : 'work'];
        this.world.buildings[c.home].inside.delete(c.id);
        const wb = this.world.buildings[c.work];
        c.x = wb.entrance.pos.x; c.z = wb.entrance.pos.z;
        this.brain.beginActivity(c, act, c.work, sw[1] - this.clock.total);
        continue;
      }
      this.brain.decide(c);
    }
    this.social.init();
    this.paper.resetWeek();
    this.version++;
  }

  // ——— основной цикл
  step(realDt: number) {
    if (this.params.paused) return;
    let gameDt = Math.min(realDt, 0.1) * this.params.timeSpeed;
    while (gameDt > 0) {
      const dt = Math.min(gameDt, 0.12);
      gameDt -= dt;
      this.substep(dt);
    }
  }

  substep(dt: number) {
    this.clock.total += dt;
    const now = this.clock.total;
    this.weather.update(dt);
    this.transport.update(dt, now);
    for (const c of this.citizens) if (c.alive) this.updateCitizen(c, dt);
    this.events.update(dt);
    this.stats.update(dt);
    this.eventSpots = this.eventSpots.filter((s) => s.until > now);
    this.fx = this.fx.filter((f) => f.until > now);
    if (now - this.lastRouting > 20 || this.routingDirty) {
      this.lastRouting = now;
      this.routingDirty = false;
      this.world.recomputeRouting();
    }
    // снеговики тают
    if (this.weather.temp > 2) for (const s of this.snowmen) s.size -= dt * 0.002 * this.weather.temp;
    this.snowmen = this.snowmen.filter((s) => s.size > 0.1);
    const h = Math.floor(this.clock.hour);
    if (h !== this.lastHour) {
      this.lastHour = h;
      this.hourly(h);
    }
    if (this.clock.day !== this.lastDay) {
      if (this.lastDay >= 0) this.daily();
      this.lastDay = this.clock.day;
    }
    // окна
    if (Math.floor(now * 2) !== Math.floor((now - dt) * 2)) this.updateWindows();
  }

  /** колбэк: у управляемого жителя закончилось занятие */
  onPlayerActivityEnd?: (c: Citizen) => boolean | void;
  /** житель вошёл в здание (для звуков) */
  onEnter?: (b: Building, c: Citizen) => void;

  /** вывести жителя из здания на улицу у входа */
  emerge(c: Citizen) {
    const b = c.at >= 0 ? this.world.buildings[c.at] : null;
    if (b) {
      b.inside.delete(c.id);
      if (!b.def.outdoor || c.state !== 'outdoor') { c.x = b.entrance.pos.x; c.z = b.entrance.pos.z; }
      c.lastPlace = b.id;
    }
    c.at = -1;
    c.act = null;
    c.trip = null;
    c.state = 'walk';
  }

  updateCitizen(c: Citizen, dt: number) {
    const now = this.clock.total;
    const brain = this.brain;
    brain.updateNeeds(c, dt);
    if (c.controlled) {
      if (c.act && now >= c.actEnd) {
        brain.endActivity(c);
        if (!this.onPlayerActivityEnd?.(c)) this.emerge(c);
      }
      return;
    }
    c.moving = 0;
    if (c.pausedUntil && c.pausedUntil > now) return;
    const trip = c.trip;
    if (trip) {
      switch (trip.stage) {
        case 'walk':
        case 'bike':
        case 'fromStop':
          if (brain.advancePath(c, brain.speedOf(c, trip.stage === 'bike' ? 'bike' : 'walk'), dt)) this.arrive(c);
          break;
        case 'toStop':
          if (brain.advancePath(c, brain.speedOf(c, 'walk'), dt)) {
            const stop = this.transport.stops[trip.boardStop];
            trip.stage = 'wait';
            trip.waitUntil = now + (this.weather.raining ? 50 : 40);
            c.state = 'waitBus';
            stop.waiting.push(c.id);
            const a = Math.random() * Math.PI * 2;
            c.x = stop.place.pos.x + Math.cos(a) * 1.5;
            c.z = stop.place.pos.z + Math.sin(a) * 0.8;
          }
          break;
        case 'wait':
          if (now > trip.waitUntil) {
            const stop = this.transport.stops[trip.boardStop];
            stop.waiting = stop.waiting.filter((x) => x !== c.id);
            brain.log(c, gender('не дождал{ся|ась} автобуса и пош{ёл|ла} пешком', c.female));
            if (stop.waiting.length >= 2) this.news.push('🚏', `На ${stop.name} люди не могут дождаться автобуса`, 'traffic', { focus: stop.place.pos }, 400);
            this.walkFrom(c, stop.place, trip.dest);
          }
          break;
        case 'waitTaxi':
          if (now >= trip.waitUntil) {
            const from = c.lastPlace >= 0 ? this.world.buildings[c.lastPlace].entrance : this.world.buildings[c.home].entrance;
            const dest = this.world.buildings[trip.dest];
            const v = this.transport.driveTo('taxi', 'taxi', from, dest.entrance, { color: 0xffd60a, owner: c.id, onArrive: () => this.arriveByVehicle(c) });
            if (v) { trip.stage = 'drive'; trip.vehicle = v.id; c.state = 'car'; }
            else this.walkFrom(c, from, trip.dest);
          }
          break;
        default:
          break;
      }
    } else if (c.act) {
      if (now >= c.actEnd) {
        brain.endActivity(c);
        brain.decide(c);
      } else if (c.state === 'outdoor') this.wander(c, dt);
    } else brain.decide(c);
    // периодические проверки
    if (now >= c.nextCheck) {
      c.nextCheck = now + 5 + Math.random() * 4;
      this.check(c);
    }
  }

  private wander(c: Citizen, dt: number) {
    const w = c.wander;
    const act = c.act!;
    if (['snowman', 'bench', 'evacuated', 'ducks', 'picnic', 'match', 'concert', 'fireworks', 'queue', 'street_music', 'vote'].includes(act.id)) {
      // стоят/сидят на месте, иногда чуть двигаются
      if (w.pause <= 0 && Math.random() < dt * 0.03) w.pause = 0;
      const dx = w.x - c.x, dz = w.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) { const s = Math.min(d, 1.4 * dt); c.x += (dx / d) * s; c.z += (dz / d) * s; c.dirX = dx / d; c.dirZ = dz / d; c.moving = 1.4; }
      return;
    }
    if (w.pause > 0) { w.pause -= dt; return; }
    const speed = act.id === 'jog' ? 9 : act.id === 'bike_ride' ? 10 : act.id === 'football' || act.id === 'snowballs' || act.id === 'playground' ? 5.5 : 1.8;
    const dx = w.x - c.x, dz = w.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) {
      const b = this.world.buildings[c.at];
      if (!b) return;
      const p = this.world.randomPointIn(b, this.rng, 2.5);
      w.x = p.x; w.z = p.z;
      w.pause = speed > 4 ? 0 : Math.random() * 6;
      return;
    }
    const s = Math.min(d, speed * dt);
    c.x += (dx / d) * s; c.z += (dz / d) * s;
    c.dirX = dx / d; c.dirZ = dz / d;
    c.moving = speed;
  }

  private check(c: Citizen) {
    const w = this.weather;
    const brain = this.brain;
    const act = c.act;
    // непогода выгоняет с улицы
    const nasty = (w.raining && w.intensity > 0.45) || w.def.precip === 'hail' || w.def.lightning || (w.def.id === 'blizzard');
    if (!c.trip && act && c.state === 'outdoor' && nasty && !['snowman', 'snowballs', 'evacuated', 'search_dog', 'volunteer'].includes(act.id) && !c.job.outdoorWork) {
      if (this.rng.chance(0.6)) {
        brain.log(c, gender('непогода прогнала с улицы — уш{ёл|ла} под крышу', c.female));
        this.news.push(w.def.emoji, `${w.def.name}: люди разбегаются из парков и скверов`, 'weather', {}, 180);
        c.actEnd = this.clock.total;
        this.mods.outdoorMul = Math.min(this.mods.outdoorMul, 1);
        return;
      }
    }
    // спрятаться от дождя по пути
    if (c.trip && (c.trip.stage === 'walk') && nasty && !c.trip.shelter && this.rng.chance(0.25)) {
      const remaining = c.trip.path.length - c.trip.pi;
      const dest = this.world.buildings[c.trip.dest];
      if (remaining > 3 && c.trip.act.id !== 'work' && !['school', 'study', 'kinder', 'sleep'].includes(c.trip.act.id)) {
        const sh = this.world.nearestBuilding(ACTIVITY_BY_ID.shelter.places as string[], { x: c.x, z: c.z }, (b) => !b.closedReason && b.id !== dest.id && Math.abs(b.entrance.pos.x - c.x) + Math.abs(b.entrance.pos.z - c.z) < 40);
        if (sh) {
          const ok = c.trip;
          ok.shelter = true;
          // идём прямо к ближайшему укрытию
          ok.path = [{ x: c.x, z: c.z }, { ...sh.entrance.pos }];
          ok.pi = 1;
          ok.dest = sh.id;
          ok.act = ACTIVITY_BY_ID.shelter;
          ok.dur = this.rng.range(15, 35);
        }
      }
    }
    // здание закрыли / пожар
    if (!c.trip && c.at >= 0 && c.at !== c.home && act) {
      const b = this.world.buildings[c.at];
      if ((b.closedReason || b.powerOut) && !b.def.outdoor && act.id !== 'hospitalized' && act.id !== 'evacuated') {
        c.actEnd = this.clock.total;
      }
    }
    // голод прерывает досуг
    if (!c.trip && act && c.needs.hunger < 8 && c.at !== c.home && !act.effects.hunger && !['work', 'school', 'study', 'kinder', 'hospitalized', 'wedding', 'birthday', 'evacuated'].includes(act.id)) c.actEnd = this.clock.total;
  }

  walkFrom(c: Citizen, from: { edge: number; t: number; side: number; pos: V2 }, destId: number) {
    const trip = c.trip!;
    const dest = this.world.buildings[destId];
    const r = this.world.route(from, dest.entrance, false);
    trip.stage = 'walk';
    trip.mode = 'walk';
    c.state = 'walk';
    c.x = from.pos.x; c.z = from.pos.z;
    trip.path = r ? this.world.pedPolyline(r, from, dest.entrance) : [{ ...from.pos }, { ...dest.entrance.pos }];
    trip.pi = 1;
  }

  arrive(c: Citizen) {
    const trip = c.trip!;
    const dest = this.world.buildings[trip.dest];
    c.x = dest.entrance.pos.x; c.z = dest.entrance.pos.z;
    const took = this.clock.total - trip.started;
    if (trip.act.id === 'work' || trip.act.id === 'school' || trip.act.id === 'study') this.stats.recordTrip(took);
    c.commuteMin = took;
    const sched = (trip as unknown as { sched?: number }).sched ?? 0;
    const dur = trip.act.id === 'work' || trip.act.id === 'school' || trip.act.id === 'study' || trip.act.id === 'kinder'
      ? Math.max(30, trip.dur - took) : trip.act.id === 'sleep' ? Math.max(60, trip.dur - took) : trip.dur;
    this.brain.beginActivity(c, trip.act, dest.id, dur, sched);
  }

  arriveByVehicle(c: Citizen) {
    if (!c.trip) return;
    const dest = this.world.buildings[c.trip.dest];
    if (c.trip.mode === 'car') c.carAt = dest.id;
    this.arrive(c);
  }

  /** автобус на остановке: высадка и посадка, возвращает число людей */
  busAtStop(bus: Vehicle, stop: BusStop): number {
    let n = 0;
    const keep: number[] = [];
    for (const id of bus.passengers) {
      const c = this.citizens[id];
      if (c?.trip && c.trip.alightStop === stop.id) {
        this.walkFrom(c, stop.place, c.trip.dest);
        c.trip.stage = 'fromStop';
        n++;
      } else keep.push(id);
    }
    bus.passengers = keep;
    const left: number[] = [];
    for (const id of stop.waiting) {
      const c = this.citizens[id];
      if (!c?.trip || c.trip.stage !== 'wait') continue;
      if (c.trip.routeId !== bus.routeId) { left.push(id); continue; }
      if (bus.passengers.length >= 32) {
        left.push(id);
        if (this.rng.chance(0.3)) this.news.push('🚌', `Автобус ${bus.label} переполнен — на ${stop.name} не все уехали`, 'traffic', {}, 90);
        continue;
      }
      c.trip.stage = 'ride';
      c.trip.vehicle = bus.id;
      c.state = 'bus';
      bus.passengers.push(id);
      n++;
    }
    stop.waiting = left;
    return n;
  }

  unloadVehicle(v: Vehicle) {
    if (!v.passengers.length) return;
    const place = this.transport.placeFromVehicle(v);
    for (const id of v.passengers) {
      const c = this.citizens[id];
      if (!c?.trip) continue;
      this.walkFrom(c, place, c.trip.dest);
    }
    v.passengers = [];
  }

  // ——— API для событий
  addSpot(actId: string, building: number, weight: number, minutes: number, ages?: [number, number]) {
    const act = ACTIVITY_BY_ID[actId];
    this.eventSpots.push({ id: this.spotId++, act, building, weight, until: this.clock.total + minutes, ages });
  }

  addFx(kind: FxKind, x: number, z: number, minutes: number, extra: Partial<Fx> = {}): Fx {
    const f: Fx = { id: this.fxId++, kind, x, z, until: this.clock.total + minutes, intensity: 1, ...extra };
    this.fx.push(f);
    return f;
  }

  /** заставить жителя пойти на занятие (событие, приглашение) */
  force(c: Citizen, act: ActivityDef, b: Building, dur: number) {
    if (!c.alive || c.controlled) return;
    if (c.trip) {
      // прервать текущую поездку: если в машине/автобусе — дождёмся конца
      if (c.trip.stage === 'drive' || c.trip.stage === 'ride' || c.trip.stage === 'wait') return;
      c.trip = null;
      const p = this.nearestPlace(c);
      c.at = -1;
      c.lastPlace = -1;
      c.x = p.pos.x; c.z = p.pos.z;
      this.forceFromPlace(c, act, b, dur, p);
      return;
    }
    if (c.act) this.brain.endActivity(c);
    this.brain.goDo(c, act, b, dur);
  }

  private forceFromPlace(c: Citizen, act: ActivityDef, b: Building, dur: number, p: { edge: number; t: number; side: number; pos: V2 }) {
    const r = this.world.route(p, b.entrance, false);
    c.trip = { mode: 'walk', stage: 'walk', dest: b.id, act, dur, path: r ? this.world.pedPolyline(r, p, b.entrance) : [p.pos, b.entrance.pos], pi: 1, vehicle: -1, boardStop: -1, alightStop: -1, routeId: -1, waitUntil: 0, started: this.clock.total };
    c.state = 'walk';
  }

  nearestPlace(c: Citizen) {
    let best = this.world.buildings[c.home].entrance;
    let bd = Infinity;
    for (const b of this.world.buildings) {
      const d = Math.abs(b.entrance.pos.x - c.x) + Math.abs(b.entrance.pos.z - c.z);
      if (d < bd) { bd = d; best = b.entrance; }
    }
    return best;
  }

  planSnowman(c: Citizen, b: Building) {
    if (this.snowmen.length > 40 || this.rng.chance(0.4)) return;
    const p = this.world.randomPointIn(b, this.rng, 3);
    this.snowmen.push({ x: p.x, z: p.z, size: 1, built: this.clock.total, hat: this.rng.int(0, 3) });
  }

  onWeatherChange(was: WeatherDef, now: WeatherDef) {
    if (!this.news) return;
    const t = Math.round(this.weather.temp);
    const phrases: Record<string, string> = {
      clear: 'Небо прояснилось', partly: 'Переменная облачность', overcast: 'Затянуло тучами', drizzle: 'Заморосило',
      rain: 'Пошёл дождь — открываются зонты', downpour: 'Ливень! Улицы превращаются в реки', storm: 'Гроза над городом',
      hail: 'Град! Все бегут под крыши', fog: 'Город утонул в тумане', sleet: 'Мокрый снег и слякоть',
      snow: 'Пошёл снег', blizzard: 'Метель! Видимость почти нулевая', ice: 'Гололёд — осторожно на дорогах',
      heat: 'Жара, асфальт плавится', windy: 'Сильный ветер срывает шапки',
    };
    void was;
    this.news.push(now.emoji, `${phrases[now.id] ?? now.name} (${t > 0 ? '+' : ''}${t}°C)`, 'weather');
  }

  // ——— периодические дела
  /** профессия для работы в здании такого типа */
  jobFor(type: string): JobDef {
    const cand = JOBS.filter((j) => j.places.includes(type));
    return this.rng.weighted(cand, (j) => j.weight + 0.1) ?? JOBS.find((j) => j.id === 'seller')!;
  }

  hourly(h: number) {
    this.social.hourly();
    this.dynamics.hourly();
    // погода и шанс заболеть
    const sickBase = 0.0012 * this.params.sickness * this.mods.sickMul * (this.params.season === 'winter' || this.params.season === 'autumn' ? 1.6 : 1) * (this.weather.temp < -10 ? 1.5 : 1);
    for (const c of this.citizens) {
      if (!c.alive || c.sick > 0) continue;
      const p = sickBase * (c.age > 65 ? 1.6 : c.age < 10 ? 1.4 : 1) * (c.needs.energy < 25 ? 1.8 : 1);
      if (this.rng.chance(p)) {
        c.sick = this.rng.range(0.5, 1.5);
        c.needs.health = Math.min(c.needs.health, 60);
        this.brain.log(c, gender('почувствовал{|а} себя плохо — кажется, простуда', c.female));
      }
    }
    // скорая для тяжело больных
    for (const c of this.citizens) {
      if (c.alive && !c.controlled && c.sick > 0 && c.needs.health < 12 && !c.trip && c.act?.id !== 'hospitalized' && this.rng.chance(0.5)) this.events.ambulanceFor(c);
    }
    if (h === 9 && !this.clock.isWeekend) this.adjustEmployment();
    if (h === 6) {
      // мусоровоз
      this.events.serviceRound('garbage');
    }
    if (h === 7 || h === 11 || h === 15) this.events.deliveries();
    if (this.weather.snowCover > 0.35 && h % 3 === 0) this.events.serviceRound('plow');
    // стройка растёт
    for (const b of [...(this.world.byType.get('construction') ?? [])]) {
      if (b.inside.size > 0 && h >= 7 && h < 19) b.growth = Math.min(1, b.growth + 0.006 * Math.min(6, b.inside.size) * (b.fast ? 3 : 1));
      if (b.growth >= 1) this.dynamics.completeConstruction(b);
    }
  }

  daily() {
    const day = this.clock.day;
    this.stats.newDay();
    // аренда, стипендии, пенсии
    for (const b of this.world.buildings) {
      if (b.def.cat !== 'home') continue;
      const adults = b.residents.map((id) => this.citizens[id]).filter((c) => c && c.alive && c.age >= 18);
      if (!adults.length) continue;
      const rent = (b.type === 'house' ? 45 : b.type === 'tower' ? 55 : 35) * this.params.rent * this.params.priceLevel / adults.length * Math.max(1, b.residents.length / 2.5);
      for (const c of adults) c.money -= rent;
    }
    for (const c of this.citizens) {
      if (!c.alive) continue;
      if (['retiree', 'unemployed', 'student'].includes(c.job.id)) c.money += c.job.salary * this.params.wageLevel;
      if (c.age < 18) c.money = Math.max(c.money, 20);
      if (c.mood > 70) c.happyDays++;
      // машина осталась у бара — утром забрали
      if (c.hasCar && c.carAt !== c.home && c.at === c.home) c.carAt = c.home;
    }
    // смена сезона
    if (this.params.seasonAuto && day > 0 && day % 7 === 0) {
      const order: Season[] = ['spring', 'summer', 'autumn', 'winter'];
      this.params.season = order[(order.indexOf(this.params.season) + 1) % 4];
      this.news.push('🍂', `Наступает ${SEASON_NAMES[this.params.season]}`, 'weather');
    }
    this.events.daily();
    this.social.daily();
    this.goals.daily();
    this.dynamics.daily();
    this.paper.daily();
    // естественная рождаемость: шанс на пару в день
    const yd = Math.max(3, this.params.yearDays);
    for (const m of this.citizens) {
      if (!m.alive || !m.female || m.partner < 0 || m.age < 20 || m.age > 42) continue;
      const f = this.citizens[m.partner];
      if (!f?.alive || f.home !== m.home) continue;
      const kids = m.children.filter((k) => this.citizens[k]?.alive && this.citizens[k].age < 18).length;
      const p = (0.55 / yd) * this.params.birthRate * (kids === 0 ? 1.2 : kids === 1 ? 0.8 : kids === 2 ? 0.35 : 0.1);
      if (this.rng.chance(p)) this.birth(m, f);
    }
    // переезды из города, если людей больше нормы
    const alive = this.citizens.filter((c) => c.alive).length;
    const over = alive / Math.max(1, this.params.population);
    if (this.params.migration > 0 && this.rng.chance(Math.min(0.9, 0.12 * this.params.migration * (over > 1.05 ? 3 : 1)))) {
      const cand = this.citizens.filter((c) => c.alive && c.age >= 20 && c.at === c.home && !c.trip && !c.controlled);
      if (cand.length) this.depart(this.rng.pick(cand));
    }
    const s = this.stats;
    this.news.push('📰', `Итоги дня: заработано ${Math.round(s.earnedToday)}₽, потрачено ${Math.round(s.spentToday)}₽, опозданий: ${s.lateToday}`, 'economy');
  }

  adjustEmployment() {
    const elig = this.citizens.filter((c) => c.alive && c.age >= 18 && c.age <= 62 && !['student', 'retiree'].includes(c.job.id));
    const unemployed = elig.filter((c) => c.job.id === 'unemployed');
    const target = this.params.unemployment * elig.length;
    if (unemployed.length > target + 1) {
      const n = Math.min(3, Math.ceil((unemployed.length - target) / 3));
      for (let i = 0; i < n; i++) {
        const c = this.rng.pick(unemployed);
        if (c.job.id !== 'unemployed') continue;
        assignJob(c, pickJob(this.rng, c.age, this.world), this.world, this.rng);
        this.adjustWake(c);
        const wb = this.world.buildings[c.work];
        this.brain.log(c, gender(`наш{ёл|ла} работу: ${c.female && c.job.nameF ? c.job.nameF : c.job.name}`, c.female));
        this.news.push('🎉', `${displayName(c)} наш${c.female ? 'ла' : 'ёл'} работу — теперь ${c.female && c.job.nameF ? c.job.nameF : c.job.name}${wb ? ` (${wb.name})` : ''}`, 'economy', { citizen: c.id });
      }
    } else if (unemployed.length < target - 1) {
      const workers = elig.filter((c) => c.job.id !== 'unemployed');
      const n = Math.min(3, Math.ceil((target - unemployed.length) / 3));
      for (let i = 0; i < n; i++) {
        const c = this.rng.pick(workers);
        if (!c || c.job.id === 'unemployed') continue;
        this.fire(c);
      }
    }
  }

  /** будильник с учётом дороги до работы */
  adjustWake(c: Citizen) {
    if (c.work < 0) return;
    const j = c.job;
    if (j.shift[0] >= 12 || j.shift[1] > 26) return;
    const home = this.world.buildings[c.home];
    const wb = this.world.buildings[c.work];
    const d = Math.abs(home.entrance.pos.x - wb.entrance.pos.x) + Math.abs(home.entrance.pos.z - wb.entrance.pos.z);
    const est = c.hasCar ? d / 15 + 5 : c.hasBike ? d / 9.5 + 5 : d / 4;
    const need = j.shift[0] - (Math.min(est, 75) + 25) / 60;
    if (need < c.wake) c.wake = ((need % 24) + 24) % 24;
  }

  fire(c: Citizen, reason = 'сокращение') {
    const old = c.female && c.job.nameF ? c.job.nameF : c.job.name;
    removeFromWork(c, this.world);
    c.job = SPECIAL_JOBS.unemployed;
    computeSleep(c, this.rng);
    this.brain.log(c, gender(`потерял{|а} работу (${reason})`, c.female));
    this.news.push('📉', `${displayName(c)} (${old}) потерял${c.female ? 'а' : ''} работу: ${reason}`, 'economy', { citizen: c.id });
  }

  /** рождение ребёнка у пары */
  birth(a: Citizen, b: Citizen): Citizen {
    const mother = a.female ? a : b;
    const father = a.female ? b : a;
    const female = this.rng.chance(0.5);
    const kid = this.addCitizen(0, female, father.last.replace(/а$/, ''), mother.home);
    kid.job = SPECIAL_JOBS.baby;
    kid.look.height = 0.35;
    computeSleep(kid, this.rng);
    for (const p of [mother, father]) p.children.push(kid.id);
    const hh = new Set([mother.id, father.id, ...mother.household, ...father.household]);
    hh.delete(kid.id);
    kid.household = [...hh].filter((x) => this.citizens[x]?.alive);
    for (const id of kid.household) { const m = this.citizens[id]; if (!m.household.includes(kid.id)) m.household.push(kid.id); }
    this.brain.beginActivity(kid, ACTIVITY_BY_ID.sleep, mother.home, 300);
    for (const p of [mother, father]) {
      p.mood = 100;
      this.brain.log(p, `стал${p.female ? 'а мамой' : ' папой'}! малыша зовут ${kid.first}`);
    }
    // мама — в роддом
    const hosp = this.world.byType.get('hospital')?.[0];
    if (hosp && !mother.controlled && !mother.trip) this.force(mother, ACTIVITY_BY_ID.maternity, hosp, 300);
    this.news.push('👶', `${mother.first} и ${father.first} стали родителями: родил${female ? 'ась дочка' : 'ся сын'} ${kid.first}!`, 'people', { citizen: kid.id });
    this.stats.births++;
    return kid;
  }

  /** дети растут: садик → школа → вуз или работа */
  growUp(c: Citizen) {
    const a = c.age;
    c.look.height = a < 2 ? 0.35 : a < 4 ? 0.45 : a < 8 ? 0.6 : a < 13 ? 0.75 : a < 16 ? 0.9 : Math.max(c.look.height, 0.95);
    const say = (emoji: string, text: string) => {
      this.brain.log(c, text);
      if (emoji !== '🧸') this.news.push(emoji, `${displayName(c)}: ${text}`, 'people', { citizen: c.id }, 0);
    };
    const id = c.job.id;
    if (id === 'baby' && a >= 2) {
      assignJob(c, SPECIAL_JOBS.toddler, this.world, this.rng);
      say('🧸', gender('пош{ёл|ла} в детский сад', c.female));
    } else if (id === 'toddler' && a >= 7) {
      removeFromWork(c, this.world);
      assignJob(c, SPECIAL_JOBS.pupil, this.world, this.rng);
      say('🎒', gender('пош{ёл|ла} в первый класс!', c.female));
    } else if (id === 'pupil' && a >= 17) {
      removeFromWork(c, this.world);
      const job = this.rng.chance(0.65) ? SPECIAL_JOBS.student : pickJob(this.rng, a, this.world);
      assignJob(c, job, this.world, this.rng);
      say('🎓', gender(`окончил{|а} школу и теперь ${job.id === 'student' ? 'студент{|ка}' : c.female && job.nameF ? job.nameF : job.name}`, c.female));
    } else if (id === 'student' && a >= 23) {
      removeFromWork(c, this.world);
      assignJob(c, pickJob(this.rng, a, this.world), this.world, this.rng);
      say('📜', gender(`получил{|а} диплом и устроил{ся|ась}: ${c.female && c.job.nameF ? c.job.nameF : c.job.name}`, c.female));
    } else return;
    computeSleep(c, this.rng);
    this.adjustWake(c);
  }

  /** семья уезжает из города */
  depart(c: Citizen) {
    const members = [c, ...c.household.map((id) => this.citizens[id])].filter((m) => m && m.alive);
    if (members.some((m) => m.controlled || (m.trip && (m.trip.stage === 'drive' || m.trip.stage === 'ride')))) return false;
    for (const m of members) {
      m.alive = false;
      if (m.at >= 0) this.world.buildings[m.at]?.inside.delete(m.id);
      const home = this.world.buildings[m.home];
      home.residents = home.residents.filter((x) => x !== m.id);
      removeFromWork(m, this.world);
      if (m.trip?.stage === 'wait') { const st = this.transport.stops[m.trip.boardStop]; st.waiting = st.waiting.filter((x) => x !== m.id); }
      m.trip = null;
      m.act = null;
      m.state = 'inside';
      for (const f of m.friends) { const fr = this.citizens[f]; if (fr) fr.friends = fr.friends.filter((x) => x !== m.id); }
      if (m.partner >= 0 && !members.includes(this.citizens[m.partner])) this.citizens[m.partner].partner = -1;
    }
    const who = members.length > 1 ? `Семья ${c.last.replace(/а$/, '')}ых (${members.length} чел.)` : displayName(c);
    this.news.push('🧳', `${who} переезжа${members.length > 1 ? 'ет' : c.female ? 'ет' : 'ет'} в другой город`, 'people');
    this.stats.departures += members.length;
    return true;
  }

  addCitizen(age: number, female: boolean, last: string, home: number): Citizen {
    const c = makeCitizen(this.rng, age, female, last, home, this.world);
    // id совпадает с индексом
    c.id = this.citizens.length;
    c.rel = {};
    c.memories = [];
    this.citizens.push(c);
    this.world.buildings[home].residents.push(c.id);
    return c;
  }

  // ——— освещение окон
  updateWindows() {
    const h = this.clock.hour;
    const [sr, ss] = this.weather.sunTimes();
    const dark = h < sr + 0.5 || h > ss - 0.5 || this.weather.cloud > 0.9;
    for (const b of this.world.buildings) {
      if (b.powerOut || b.def.floors[1] === 0) { b.litWindows = 0; continue; }
      let lit = 0;
      if (b.def.cat === 'home') {
        let awake = 0;
        for (const id of b.inside) { const c = this.citizens[id]; if (c && c.act?.id !== 'sleep') awake++; }
        lit = clamp(awake / Math.max(1, b.residents.length) * 1.3 + (dark ? 0.04 : 0));
      } else {
        const open = b.def.open ? b.inside.size > 0 || isOpenNow(b, h, this.clock.weekday) : true;
        lit = open ? clamp(0.25 + b.inside.size / Math.max(5, b.def.capacity || 20)) : 0.04;
        if (b.def.cat === 'office' && !open) lit = 0.06;
      }
      if (!dark) lit *= 0.5;
      b.litWindows = lit;
    }
  }
}

import { isOpen } from './world';
function isOpenNow(b: Building, h: number, d: number) { return isOpen(b, h, d); }
