// «Мозг» жителя: расписание + utility AI, выбор места и транспорта, поездки.
import { ACTIVITIES, ACTIVITY_BY_ID, ActivityDef, Need, NEEDS, gender } from './content/activities';
import { Citizen, Trip, hasTrait, displayName } from './citizen';
import { Mode } from './content/traits';
import { Building, Place, V2, isOpen } from './world';
import { RNG, clamp, plural } from './rng';
import type { Sim } from './sim';
import type { BusStop } from './transport';

const WALK = 4.2; // ед./игр. мин
const BIKE = 10.5;
const HOME_ONLY = new Set(['sleep', 'sick_home', 'birthday']);
const BUSY = new Set(['sleep', 'work', 'school', 'study', 'kinder', 'sick_home', 'hospitalized', 'birthday', 'wedding', 'evacuated']);

export interface EventSpot {
  id: number;
  act: ActivityDef;
  building: number;
  weight: number;
  until: number;
  ages?: [number, number];
}

const NEED_DECAY: Record<Need, number> = { hunger: -5, energy: -3.3, fun: -3.6, social: -2.4, health: 0.4 };
const MODE_NAMES: Record<Mode, string> = { walk: 'пешком', bike: 'на велосипеде', car: 'на машине', bus: 'на автобусе', taxi: 'на такси' };

export class Brain {
  rng = new RNG(99);
  constructor(private sim: Sim) {}

  private get world() { return this.sim.world; }
  private get clock() { return this.sim.clock; }

  log(c: Citizen, text: string) {
    c.diary.unshift({ t: this.clock.total, text });
    if (c.diary.length > 40) c.diary.length = 40;
  }

  /** часов до наступления часа h */
  static until(now: number, h: number) {
    return (((h - now) % 24) + 24) % 24;
  }

  isSleepTime(c: Citizen, h: number) {
    const b = c.bed, w = this.wakeToday(c);
    if (b < w) return h >= b && h < w;
    return h >= b || h < w;
  }

  wakeToday(c: Citizen) {
    // по выходным подольше, если не работать
    const day = this.clock.weekday;
    if (!this.worksOn(c, day) && c.wake < 12 && c.age >= 7) return Math.min(c.wake + 1.5, 11);
    return c.wake;
  }

  worksOn(c: Citizen, day: number) {
    return c.work >= 0 && c.job.days.includes(day);
  }

  /** ближайшая смена: [начало, конец] в абсолютных минутах, если сегодня ещё предстоит/идёт */
  shiftWindow(c: Citizen): [number, number] | null {
    if (c.work < 0) return null;
    const j = c.job;
    const day = this.clock.day;
    const wd = this.clock.weekday;
    const b = this.world.buildings[c.work];
    if (b.closedReason && b.closedReason !== 'fire') return null;
    // смена, начавшаяся вчера и ещё идущая
    const candidates: [number, number, number][] = [];
    for (const dd of [-1, 0, 1]) {
      const d = day + dd;
      const w = (wd + dd + 7) % 7;
      if (!j.days.includes(w)) continue;
      candidates.push([d * 1440 + j.shift[0] * 60, d * 1440 + j.shift[1] * 60, d]);
    }
    const now = this.clock.total;
    for (const [s, e, d] of candidates) {
      if (e <= now) continue;
      if (c.workedDay === d) continue;
      if (s - now > 16 * 60) continue;
      return [s, e];
    }
    return null;
  }

  shiftDay(c: Citizen): number {
    const w = this.shiftWindow(c);
    return w ? Math.floor(w[0] / 1440) : -1;
  }

  // ——— главное решение
  decide(c: Citizen) {
    const sim = this.sim;
    const now = this.clock.total;
    const h = this.clock.hour;
    const home = this.world.buildings[c.home];
    c.invitedBy = -1;

    if (c.job.id === 'baby') return this.startHere(c, ACTIVITY_BY_ID[this.isSleepTime(c, h) ? 'sleep' : 'tv'], 120, c.home);

    // болезнь
    if (c.sick > 0) {
      if (c.needs.health < 35 && c.at !== this.findHospitalId() && this.rng.chance(0.4)) {
        const hosp = this.world.nearestBuilding(['hospital'], this.pos(c));
        if (hosp && isOpen(hosp, h, this.clock.weekday)) return this.travel(c, hosp, ACTIVITY_BY_ID.doctor, 60);
      }
      if (c.needs.health < 55 && this.rng.chance(0.3)) {
        const ph = this.pickPlace(c, ACTIVITY_BY_ID.pharmacy);
        if (ph) return this.travel(c, ph, ACTIVITY_BY_ID.pharmacy, 15);
      }
      return this.goDo(c, ACTIVITY_BY_ID.sick_home, home, this.rng.range(120, 300));
    }

    // поздний подъём/опоздание
    if (c.lateUntil > now && c.at === c.home) return this.startHere(c, ACTIVITY_BY_ID.tv, c.lateUntil - now, c.home);

    // сон
    const sleepTime = this.isSleepTime(c, h);
    const exhausted = c.needs.energy < 10;
    if (sleepTime || exhausted) {
      const wakeIn = Brain.until(h, this.wakeToday(c)) * 60;
      const dur = exhausted && !sleepTime ? 90 : Math.max(30, wakeIn + this.rng.range(-10, 15));
      return this.goDo(c, ACTIVITY_BY_ID[exhausted && !sleepTime ? 'nap' : 'sleep'], home, dur);
    }

    // работа / учёба
    const shift = this.shiftWindow(c);
    if (shift) {
      const [s, e] = shift;
      const wb = this.world.buildings[c.work];
      const lead = this.estimateMinutes(c, wb) + 8;
      if (now >= s - lead && now < e - 20) {
        const day = Math.floor(s / 1440);
        // удалёнка
        if (c.remoteDay !== day) {
          c.remoteDay = day;
          c.remoteToday = this.rng.chance(c.job.remote ?? 0);
          // опоздание
          let late = 0;
          for (const t of c.traits) late += t.late ?? 0;
          if (sim.weather.def.precip === 'snow' && sim.weather.intensity > 0.8) late += 0.2;
          if (c.at === c.home && this.rng.chance(clamp((0.05 + late) * sim.params.oversleep)) && c.job.kind !== 'kinder') {
            c.lateUntil = now + this.rng.range(15, 45);
            this.log(c, gender('проспал{|а} будильник', c.female));
            return this.startHere(c, ACTIVITY_BY_ID.tv, c.lateUntil - now, c.home);
          }
        }
        return this.goWork(c, shift);
      }
    }

    // безработные — иногда на биржу
    if (c.job.id === 'unemployed' && !this.clock.isWeekend && h > 9 && h < 15 && this.rng.chance(0.12)) {
      const ch = this.world.byType.get('cityhall')?.[0];
      if (ch && isOpen(ch, h, this.clock.weekday)) return this.travel(c, ch, ACTIVITY_BY_ID.job_search, 60);
    }

    // машина: заправка/ремонт
    if (c.hasCar && c.carAt === c.at && c.fuel < 0.15 && h > 7 && h < 22) {
      const gs = this.world.byType.get('gasstation')?.[0];
      if (gs) return this.travel(c, gs, ACTIVITY_BY_ID.refuel, 10, 'car');
    }
    if (c.carBroken && c.carAt === c.at && h > 8 && h < 18) {
      const as = this.world.byType.get('autoservice')?.[0];
      if (as && isOpen(as, h, this.clock.weekday)) return this.travel(c, as, ACTIVITY_BY_ID.carservice, 90, 'walk');
    }

    // голоден — сначала поесть
    if (c.needs.hunger < 22 && this.freeMinutes(c) > 30) {
      if (c.at === c.home) return this.startHere(c, ACTIVITY_BY_ID[h < 11 ? 'breakfast' : 'eat_home'], 30, c.home);
      const food = this.pickPlace(c, ACTIVITY_BY_ID[h > 11 && h < 16 ? 'lunch' : 'shawarma']) ?? this.pickPlace(c, ACTIVITY_BY_ID.kiosk);
      if (food && c.money > 10) return this.travel(c, food, ACTIVITY_BY_ID[food.type === 'kiosk' ? 'kiosk' : h > 11 && h < 16 ? 'lunch' : 'shawarma'], 30);
      return this.goDo(c, ACTIVITY_BY_ID.eat_home, home, 30);
    }

    // свободное время — выбираем по полезности
    this.chooseFree(c);
  }

  goWork(c: Citizen, shift: [number, number]) {
    const [s, e] = shift;
    const now = this.clock.total;
    const kind = c.job.kind;
    const act = ACTIVITY_BY_ID[kind === 'school' ? 'school' : kind === 'study' ? 'study' : kind === 'kinder' ? 'kinder' : 'work'];
    c.shiftDay = Math.floor(s / 1440);
    const home = this.world.buildings[c.home];
    if (c.remoteToday && act.id === 'work') return this.goDo(c, act, home, e - now);
    return this.goDo(c, act, this.world.buildings[c.work], e - Math.max(now, s - 2), false, s);
  }

  private findHospitalId() {
    return this.world.byType.get('hospital')?.[0]?.id ?? -1;
  }

  pos(c: Citizen): V2 {
    return { x: c.x, z: c.z };
  }

  /** сколько минут до ближайшей обязанности (работа, сон) */
  freeMinutes(c: Citizen): number {
    const now = this.clock.total;
    const h = this.clock.hour;
    let lim = Brain.until(h, c.bed) * 60;
    const sw = this.shiftWindow(c);
    if (sw && sw[0] > now) lim = Math.min(lim, sw[0] - now - this.estimateMinutes(c, this.world.buildings[c.work]) - 12);
    if (c.lateUntil > now) lim = Math.min(lim, c.lateUntil - now);
    return lim;
  }

  chooseFree(c: Citizen) {
    const sim = this.sim;
    const h = this.clock.hour;
    const wd = this.clock.weekday;
    const free = this.freeMinutes(c);
    const home = this.world.buildings[c.home];
    if (free < 25) {
      // немного свободного времени: дома или на месте
      if (c.at === c.home) return this.startHere(c, ACTIVITY_BY_ID.tv, Math.max(10, free), c.home);
      const shift = this.shiftWindow(c);
      if (shift && c.work >= 0) return this.goWork(c, shift);
      return this.goDo(c, ACTIVITY_BY_ID.tv, home, 60);
    }
    const weather = sim.weather;
    const discomfort = weather.discomfort();
    const night = h < 6 || h > 21;
    const sunny = weather.cloud < 0.35 && !night;
    const meteo = c.traits.reduce((a, t) => a * (t.weatherSens ?? 1), 1);
    const p = sim.params;
    const options: { act: ActivityDef; place: Building; score: number; dur: number }[] = [];

    const consider = (act: ActivityDef, place: Building | undefined, baseW: number) => {
      if (!place) return;
      if (c.age < act.ages[0] || c.age > act.ages[1]) return;
      let need = 0.15;
      for (const n of NEEDS) {
        const eff = act.effects[n] ?? 0;
        const deficit = (100 - c.needs[n]) / 100;
        if (eff > 0) need += (eff / 30) * Math.pow(deficit, 1.4) * 2.2;
        else if (eff < 0 && c.needs[n] < 30) need *= 0.6;
      }
      if (c.needs.hunger < 30 && (act.effects.hunger ?? 0) > 30) need *= 2.5;
      let tagMul = 1;
      for (const t of c.traits) for (const tag of act.tags) tagMul *= t.tags?.[tag] ?? 1;
      // погода
      let wMul = 1;
      const ww = act.weather ?? {};
      if (act.outdoor || place.def.outdoor) {
        const I = weather.intensity;
        if (weather.def.precip === 'rain' || weather.def.precip === 'sleet') wMul *= 1 + ((ww.rain ?? 0.3) - 1) * I;
        if (weather.def.precip === 'hail') wMul *= 0.02;
        if (weather.def.precip === 'snow') wMul *= 1 + ((ww.snow ?? 0.7) - 1) * I;
        if (weather.temp < 0) wMul *= 1 + ((ww.cold ?? 0.75) - 1) * clamp(-weather.temp / 15);
        if (weather.temp > 27) wMul *= 1 + ((ww.hot ?? 0.85) - 1) * clamp((weather.temp - 27) / 8);
        if (sunny) wMul *= ww.sunny ?? 1.1;
        if (night) wMul *= ww.dark ?? 0.6;
        if (weather.wind > 0.6) wMul *= ww.wind ?? 0.8;
        if (weather.def.lightning) wMul *= 0.05;
        wMul *= sim.mods.outdoorMul;
        wMul = Math.pow(Math.max(0.001, wMul), meteo);
      } else if (act.places === 'home') {
        wMul *= 1 + discomfort * 0.5;
      } else if (ww.rain && weather.raining) wMul *= ww.rain;
      // деньги
      const price = act.cost * p.priceLevel * sim.mods.priceMul * place.priceMul * c.traits.reduce((a, t) => a * (t.spend ?? 1), 1);
      let mMul = 1;
      if (price > 0) {
        if (c.money < price) mMul = 0.01;
        else mMul = Math.exp(-price / (c.money * 0.2 + 15));
      }
      // расстояние
      let dMul = 1;
      if (place.id !== c.at) {
        const d = Math.abs(place.entrance.pos.x - c.x) + Math.abs(place.entrance.pos.z - c.z);
        dMul = Math.exp(-d / 320);
        if (act.places !== 'home') dMul *= 1 / (1 + discomfort * 0.4);
      } else dMul = 1.25;
      // выходные — больше досуга
      const socMul = act.places === 'home' ? 1 / Math.max(0.2, p.sociability) : p.sociability;
      const weekendMul = this.clock.isWeekend && !act.tags.includes('work') && act.places !== 'home' ? 1.35 : 1;
      const score = baseW * need * tagMul * wMul * mMul * dMul * weekendMul * socMul * place.attraction * this.rng.range(0.6, 1.4);
      if (score <= 0.0005) return;
      const travel = place.id === c.at ? 0 : this.estimateMinutes(c, place) * (act.places === 'home' ? 1 : 2);
      const dur = Math.min(free - 10 - travel, this.rng.range(act.dur[0], act.dur[1]));
      if (dur < Math.min(15, act.dur[0])) return;
      options.push({ act, place, score, dur });
    };

    for (const act of ACTIVITIES) {
      if (act.eventOnly) continue;
      if (!act.hours.some(([a, b]) => (h >= a && h < b) || (b > 24 && h < b - 24))) continue;
      if (act.days && !act.days.includes(wd)) continue;
      if (!this.requirementOk(c, act)) continue;
      if (act.places === 'home') { consider(act, home, act.base); continue; }
      if (act.places === 'friendHome') {
        const fr = this.availableFriend(c, true);
        if (fr) consider(act, this.world.buildings[fr.home], act.base);
        continue;
      }
      consider(act, this.pickPlace(c, act), act.base);
    }
    // событийные точки
    for (const sp of sim.eventSpots) {
      if (sp.until < this.clock.total) continue;
      if (sp.ages && (c.age < sp.ages[0] || c.age > sp.ages[1])) continue;
      consider(sp.act, this.world.buildings[sp.building], sp.weight);
    }
    if (!options.length) return this.goDo(c, ACTIVITY_BY_ID.tv, home, Math.max(20, Math.min(free, 90)));
    options.sort((a, b) => b.score - a.score);
    const top = options.slice(0, 5);
    const pick = this.rng.weighted(top, (o) => o.score * o.score)!;
    // пригласить друга/партнёра
    if (pick.act.id === 'date' && c.partner >= 0) {
      const pt = sim.citizens[pick.act.id === 'date' ? c.partner : -1];
      if (pt && this.isAvailable(pt)) this.invite(c, pt, pick.act, pick.place, pick.dur);
    } else if ((pick.act.social || pick.act.id === 'guests') && this.rng.chance(pick.act.id === 'guests' ? 1 : 0.5)) {
      const fr = this.availableFriend(c, pick.act.id === 'guests');
      if (fr && pick.act.id !== 'guests') this.invite(c, fr, pick.act, pick.place, pick.dur);
      if (fr && pick.act.id === 'guests') {
        this.log(c, `идёт в гости: ${fr.first}`);
      }
    }
    this.goDo(c, pick.act, pick.place, pick.dur);
  }

  requirementOk(c: Citizen, act: ActivityDef) {
    const sim = this.sim;
    switch (act.requires) {
      case 'dog': return c.hasDog && !c.dogLost;
      case 'bike': return c.hasBike && sim.weather.snowCover < 0.3 && !sim.weather.icy;
      case 'car': return c.hasCar;
      case 'partner': return c.partner >= 0;
      case 'friend': return c.friends.length > 0;
      case 'snowOnGround': return sim.weather.snowCover > 0.25 && sim.weather.temp < 3;
      case 'kids': return c.children.some((k) => sim.citizens[k] && sim.citizens[k].alive && sim.citizens[k].age < 10);
      case 'baby': return c.children.some((k) => sim.citizens[k] && sim.citizens[k].alive && sim.citizens[k].age < 2) && c.at === c.home;
      default: return true;
    }
  }

  isAvailable(f: Citizen) {
    return f.alive && !f.controlled && !f.trip && f.at === f.home && (!f.act || !BUSY.has(f.act.id)) && f.sick === 0 && f.age >= 6 && this.freeMinutes(f) > 60;
  }

  availableFriend(c: Citizen, atHomeOk: boolean): Citizen | undefined {
    const sim = this.sim;
    const fs = this.rng.shuffle([...c.friends]);
    for (const id of fs) {
      const f = sim.citizens[id];
      if (!f) continue;
      if (atHomeOk) { if (f.alive && !f.controlled && f.at === f.home && (!f.act || f.act.id !== 'sleep') && !f.trip) return f; continue; }
      if (this.isAvailable(f)) return f;
    }
    return undefined;
  }

  invite(c: Citizen, f: Citizen, act: ActivityDef, place: Building, dur: number) {
    f.invitedBy = c.id;
    const rel = c.partner === f.id ? (f.female ? 'с любимой' : 'с любимым') : f.female ? 'с подругой' : 'с другом';
    this.log(c, `договорил${c.female ? 'ась' : 'ся'} ${rel} (${f.first}): ${act.emoji} ${place.name}`);
    this.log(f, `${c.first} позвал${c.female ? 'а' : ''} ${act.emoji} в ${place.name}`);
    this.goDo(f, act, place, dur);
  }

  pickPlace(c: Citizen, act: ActivityDef): Building | undefined {
    if (!Array.isArray(act.places)) return undefined;
    const h = this.clock.hour, wd = this.clock.weekday;
    const cand: Building[] = [];
    for (const t of act.places) for (const b of this.world.byType.get(t) ?? []) {
      if (!isOpen(b, h, wd) || !isOpen(b, (h + 0.5) % 24, wd)) continue;
      if (b.onFire > 0 || b.powerOut && !b.def.outdoor) continue;
      if (b.def.capacity && b.inside.size > b.def.capacity * 1.3) continue;
      cand.push(b);
    }
    if (!cand.length) return undefined;
    return this.rng.weighted(cand, (b) => {
      const d = Math.abs(b.entrance.pos.x - c.x) + Math.abs(b.entrance.pos.z - c.z);
      return b.attraction * Math.exp(-d / 160) * (b.priceMul < 1 ? 1.6 : 1) + 0.001;
    });
  }

  // ——— выполнение
  startHere(c: Citizen, act: ActivityDef, dur: number, place: number) {
    this.beginActivity(c, act, place, dur);
  }

  /** пойти и сделать: если уже на месте — сразу */
  goDo(c: Citizen, act: ActivityDef, place: Building, dur: number, _unused = false, scheduledStart = 0) {
    if (c.at === place.id && !c.trip) return this.beginActivity(c, act, place.id, dur, scheduledStart);
    this.travel(c, place, act, dur, undefined, scheduledStart);
  }

  beginActivity(c: Citizen, act: ActivityDef, placeId: number, dur: number, scheduledStart = 0) {
    const sim = this.sim;
    const now = this.clock.total;
    const b = this.world.buildings[placeId];
    const prevAct = c.act;
    c.act = act;
    c.actStart = now;
    c.actEnd = now + Math.max(5, dur);
    c.actPlace = placeId;
    c.trip = null;
    if (c.at !== placeId) {
      if (c.at >= 0) this.world.buildings[c.at]?.inside.delete(c.id);
      c.at = placeId;
      b.inside.add(c.id);
      if (placeId !== c.home && !b.def.outdoor) sim.onEnter?.(b, c);
    } else b.inside.add(c.id);
    const outdoor = !!(act.outdoor || b.def.outdoor);
    c.state = outdoor ? 'outdoor' : 'inside';
    if (outdoor) {
      const p = act.id === 'evacuated' ? { x: b.entrance.pos.x + this.rng.range(-4, 4), z: b.entrance.pos.z + this.rng.range(-2, 2) } : this.world.randomPointIn(b, this.rng, 2.5);
      if (c.state === 'outdoor' && act.id !== 'evacuated' && !(b.def.outdoor)) { c.x = b.entrance.pos.x; c.z = b.entrance.pos.z; }
      c.wander = { x: p.x, z: p.z, pause: 0 };
      if (act.id === 'evacuated') { c.x = p.x; c.z = p.z; }
    }
    // оплата
    const price = act.cost * sim.params.priceLevel * sim.mods.priceMul * b.priceMul * c.traits.reduce((a, t) => a * (t.spend ?? 1), 1);
    if (price > 0) { c.money -= price; sim.stats.spent += price; }
    // дневник
    if (prevAct?.id !== act.id || act.id === 'work') {
      let text = gender(act.diary, c.female);
      if (placeId !== c.home && !['work', 'school', 'study', 'kinder'].includes(act.id)) text += ` — ${b.name}`;
      if (act.id === 'work' && scheduledStart && now > scheduledStart + 180) {
        text = gender(`добрал{ся|ась} до работы только к ${String(Math.floor((now % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(now % 60)).padStart(2, '0')}`, c.female);
      } else if (act.id === 'work' && scheduledStart && now > scheduledStart + 5) {
        const late = Math.round(now - scheduledStart);
        text = `опоздал${c.female ? 'а' : ''} на работу на ${late} ${plural(late, 'минуту', 'минуты', 'минут')}`;
        sim.stats.lateArrivals++;
        if (late > 25 && now - sim.lastLateNews > 150) sim.lastLateNews = now, sim.news.push('⏰', `${displayName(c)} опоздал${c.female ? 'а' : ''} на работу на ${late} ${plural(late, 'минуту', 'минуты', 'минут')}`, 'people', { citizen: c.id }, 60);
      }
      if (act.id === 'work' && c.remoteToday && placeId === c.home) text = 'работает из дома (удалёнка)';
      this.log(c, text);
    }
    if (act.id === 'refuel') c.fuel = 1;
    if (act.id === 'carservice') { c.carBroken = false; }
    if (act.id === 'snowman' || act.id === 'snowballs') sim.planSnowman(c, b);
  }

  endActivity(c: Citizen) {
    const sim = this.sim;
    const act = c.act;
    if (!act) return;
    if (['work', 'school', 'study', 'kinder'].includes(act.id)) {
      c.workedDay = c.shiftDay;
      if (act.id === 'work') {
        const hours = (this.clock.total - c.actStart) / 60;
        const full = Math.max(1, c.job.shift[1] - c.job.shift[0]);
        const pay = c.job.salary * sim.params.wageLevel * sim.mods.wageMul * clamp(hours / full, 0.2, 1.1);
        c.money += pay;
        sim.stats.earned += pay;
      }
    }
  }

  estimateMinutes(c: Citizen, b: Building): number {
    const d = Math.abs(b.entrance.pos.x - c.x) + Math.abs(b.entrance.pos.z - c.z);
    if (c.hasCar && c.carAt === c.at) return d / 16 + 3;
    if (c.hasBike && this.sim.weather.snowCover < 0.25 && !this.sim.weather.icy) return d / BIKE + 4;
    return d < 200 ? d / WALK * 1.1 + 5 : Math.min(d / WALK * 1.1, d / 7 + 20);
  }

  // ——— поездки
  placeOf(c: Citizen): Place {
    if (c.at >= 0) return this.world.buildings[c.at].entrance;
    return this.world.buildings[c.home].entrance;
  }

  travel(c: Citizen, dest: Building, act: ActivityDef, dur: number, forceMode?: Mode, scheduledStart = 0) {
    const sim = this.sim;
    const from = this.placeOf(c);
    const to = dest.entrance;
    if (c.at === dest.id) return this.beginActivity(c, act, dest.id, dur, scheduledStart);
    const walkRoute = this.world.route(from, to, false);
    if (!walkRoute) return this.beginActivity(c, act, c.at >= 0 ? c.at : c.home, 30);
    const d = walkRoute.length;
    const mode: { mode: Mode; bus?: { board: BusStop; alight: BusStop } } = forceMode && forceMode !== "bus" ? { mode: forceMode } : this.chooseMode(c, from, to, d, act);
    // уходим из здания
    if (c.at >= 0) this.world.buildings[c.at].inside.delete(c.id);
    const startPos = from.pos;
    c.x = startPos.x; c.z = startPos.z;
    c.lastPlace = c.at;
    c.at = -1;
    const trip: Trip = { mode: mode.mode, stage: 'walk', dest: dest.id, act, dur, path: [], pi: 1, vehicle: -1, boardStop: -1, alightStop: -1, routeId: -1, waitUntil: 0, started: this.clock.total };
    (trip as Trip & { sched?: number }).sched = scheduledStart;
    c.trip = trip;
    c.tripCount++;
    sim.stats.modeTrips[mode.mode] += 1;
    const purpose = act.id === 'sleep' ? 'домой' : act.id === 'work' ? 'на работу' : dest.id === c.home ? 'домой' : `в ${dest.name}`;
    let wtxt = '';
    if (sim.weather.raining && mode.mode !== 'walk') wtxt = ' — на улице дождь';
    else if (sim.weather.snowing) wtxt = ' — идёт снег';
    else if (sim.weather.temp < -12) wtxt = ' — мороз';
    if (mode.mode !== 'walk' || this.rng.chance(0.3)) this.log(c, `${gender(mode.mode === 'walk' ? 'пош{ёл|ла}' : 'поехал{|а}', c.female)} ${purpose} ${MODE_NAMES[mode.mode]}${wtxt}`);
    switch (mode.mode) {
      case 'walk':
      case 'bike':
        trip.stage = mode.mode;
        trip.path = this.world.pedPolyline(walkRoute, from, to);
        c.state = mode.mode === 'bike' ? 'bike' : 'walk';
        break;
      case 'car': {
        const v = sim.transport.driveTo(c.carType, 'citizen', from, to, { color: c.carColor, owner: c.id, onArrive: () => sim.arriveByVehicle(c) });
        if (!v) { trip.stage = 'walk'; trip.mode = 'walk'; trip.path = this.world.pedPolyline(walkRoute, from, to); c.state = 'walk'; break; }
        trip.stage = 'drive';
        trip.vehicle = v.id;
        c.state = 'car';
        const fuelUse = d / 2500;
        c.fuel = Math.max(0, c.fuel - fuelUse);
        const cost = sim.params.fuelPrice * d / 120;
        c.money -= cost;
        sim.stats.spent += cost;
        if (this.rng.chance(0.004 + (sim.weather.icy ? 0.01 : 0))) c.carBroken = true;
        break;
      }
      case 'taxi': {
        trip.stage = 'waitTaxi';
        trip.waitUntil = this.clock.total + this.rng.range(3, 9);
        c.state = 'waitTaxi';
        const cost = (5 + d * 0.08) * sim.params.taxiPrice * sim.params.priceLevel;
        c.money -= cost;
        sim.stats.spent += cost;
        break;
      }
      case 'bus': {
        const b = mode.bus!;
        trip.stage = 'toStop';
        trip.boardStop = b.board.id;
        trip.alightStop = b.alight.id;
        trip.routeId = b.board.routeId;
        const r1 = this.world.route(from, b.board.place, false)!;
        trip.path = this.world.pedPolyline(r1, from, b.board.place);
        c.state = 'walk';
        const fare = sim.mods.freeTransit ? 0 : sim.params.ticketPrice;
        c.money -= fare;
        sim.stats.spent += fare;
        break;
      }
    }
  }

  chooseMode(c: Citizen, from: Place, to: Place, d: number, act: ActivityDef): { mode: Mode; bus?: { board: BusStop; alight: BusStop } } {
    const sim = this.sim;
    const p = sim.params;
    const w = sim.weather;
    if (d < 45 || c.age < 7) return { mode: 'walk' };
    const disc = w.discomfort();
    const opts: { mode: Mode; cost: number; bus?: { board: BusStop; alight: BusStop } }[] = [];
    const moneySens = 4 / (c.money / 150 + 0.3) * c.traits.reduce((a, t) => a * (t.spend ? 1 / t.spend : 1), 1);
    const modeMul = (m: Mode) => c.traits.reduce((a, t) => a * (t.modes?.[m] ?? 1), 1);
    const ageWalk = c.age > 70 ? 0.7 : 1;
    // пешком
    const walkT = d / (WALK * ageWalk * (w.icy ? 0.75 : 1) * (1 - w.snowCover * 0.2));
    opts.push({ mode: 'walk', cost: walkT * 0.72 * (1 + disc * 0.9) + (c.age > 70 ? walkT * 0.3 : 0) });
    // велосипед
    if (c.hasBike && w.snowCover < 0.25 && !w.icy && w.def.precip !== 'hail' && c.age < 76) {
      const t = d / BIKE;
      opts.push({ mode: 'bike', cost: t * (1 + disc * 2.2) + 2 });
    }
    // машина
    const drunk = !!c.act && ['bar', 'club', 'rave', 'wedding', 'birthday'].includes(c.act.id);
    if (c.hasCar && c.age >= 18 && c.carAt === c.at && !c.carBroken && !(c.fuel <= 0) && !drunk) {
      const congestion = 1 - sim.transport.avgSpeedRatio;
      const t = d / (17 * w.driveFactor() * p.speedLimit) + 3 + congestion * 10;
      const money = p.fuelPrice * d / 120;
      opts.push({ mode: 'car', cost: t + money * moneySens + (w.icy ? 4 : 0) });
    }
    // автобус
    if (!sim.transport.strike && p.busCount > 0) {
      const best = this.bestBus(from, to);
      if (best) {
        const fare = sim.mods.freeTransit ? 0 : p.ticketPrice;
        const t = best.walk / WALK * 0.72 * (1 + disc * 0.7) + best.wait + best.ride / (10 * w.driveFactor()) + 1;
        if (best.walk < d * 0.75) opts.push({ mode: 'bus', cost: t * 0.85 + fare * moneySens + 1, bus: { board: best.board, alight: best.alight } });
      }
    }
    // такси
    const taxiCost = (5 + d * 0.08) * p.taxiPrice * p.priceLevel;
    if (c.money > taxiCost * 5 && c.age >= 14) {
      const t = d / 17 + 9;
      opts.push({ mode: 'taxi', cost: t + taxiCost * moneySens * 1.7 + 4 });
    }
    // спешка на работу
    const hurry = act.id === 'work' || act.id === 'school' || act.id === 'study';
    let best = opts[0];
    let bestU = Infinity;
    for (const o of opts) {
      let u = o.cost / Math.max(0.05, modeMul(o.mode));
      if (hurry && o.mode === 'walk' && d > 200) u *= 1.3;
      u += this.rng.gauss(0, 3);
      if (u < bestU) { bestU = u; best = o; }
    }
    return { mode: best.mode, bus: best.bus };
  }

  bestBus(from: Place, to: Place): { board: BusStop; alight: BusStop; walk: number; wait: number; ride: number } | null {
    const sim = this.sim;
    let best: { board: BusStop; alight: BusStop; walk: number; wait: number; ride: number } | null = null;
    let bestT = Infinity;
    for (const r of sim.transport.routes) {
      const n = sim.transport.busesOnRoute(r.id).length;
      if (!n) continue;
      let b1: BusStop | null = null, w1 = Infinity, b2: BusStop | null = null, w2 = Infinity;
      for (const st of r.stops) {
        const da = Math.abs(st.place.pos.x - from.pos.x) + Math.abs(st.place.pos.z - from.pos.z);
        if (da < w1) { w1 = da; b1 = st; }
        const db = Math.abs(st.place.pos.x - to.pos.x) + Math.abs(st.place.pos.z - to.pos.z);
        if (db < w2) { w2 = db; b2 = st; }
      }
      if (!b1 || !b2 || b1 === b2) continue;
      const ride = (b2.order - b1.order + r.length) % r.length;
      const wait = r.length / (n * 10) / 2;
      const t = (w1 + w2) / WALK + wait + ride / 10;
      if (t < bestT) { bestT = t; best = { board: b1, alight: b2, walk: w1 + w2, wait, ride }; }
    }
    return best;
  }

  /** движение по ломаной; true — дошли */
  advancePath(c: Citizen, speed: number, dt: number): boolean {
    const trip = c.trip!;
    let remain = speed * dt;
    c.moving = speed;
    while (remain > 0 && trip.pi < trip.path.length) {
      const tgt = trip.path[trip.pi];
      const dx = tgt.x - c.x, dz = tgt.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= remain) {
        c.x = tgt.x; c.z = tgt.z;
        remain -= dist;
        trip.pi++;
      } else {
        c.x += (dx / dist) * remain;
        c.z += (dz / dist) * remain;
        c.dirX = dx / dist; c.dirZ = dz / dist;
        remain = 0;
      }
    }
    return trip.pi >= trip.path.length;
  }

  speedOf(c: Citizen, mode: 'walk' | 'bike'): number {
    const w = this.sim.weather;
    let s = mode === 'bike' ? BIKE : WALK;
    if (c.age > 70) s *= 0.7;
    if (c.age < 8) s *= 0.85;
    if (hasTrait(c, 'sporty')) s *= 1.1;
    if (w.icy) s *= mode === 'bike' ? 0.6 : 0.7;
    s *= 1 - w.snowCover * 0.2;
    if (w.raining && mode === 'walk') s *= 1.12; // спешат под дождём
    return s;
  }

  /** обновление потребностей */
  updateNeeds(c: Citizen, dt: number) {
    const hours = dt / 60;
    const act = c.act;
    const doing = !c.trip && act;
    const sleeping = doing && (act!.id === 'sleep' || act!.id === 'nap');
    for (const n of NEEDS) {
      let rate = NEED_DECAY[n];
      for (const t of c.traits) if (t.needs && (t.needs as Record<string, number>)[n]) rate *= (t.needs as Record<string, number>)[n];
      if (sleeping && n !== 'hunger') rate = n === 'health' ? 0.6 : 0;
      if (n === 'health' && c.sick > 0) rate = -1.5 * c.sick;
      let v = c.needs[n] + rate * hours;
      if (doing && act!.effects[n]) v += act!.effects[n]! * hours;
      c.needs[n] = clamp(v, 0, 100);
    }
    if (c.sick > 0 && c.needs.health > 85) {
      c.sick = 0;
      this.log(c, gender('выздоровел{|а}!', c.female));
    }
    const w = this.sim.weather;
    const outside = c.state === 'walk' || c.state === 'bike' || c.state === 'waitBus' || c.state === 'outdoor' || c.state === 'waitTaxi';
    let target = (c.needs.hunger + c.needs.energy + c.needs.fun * 1.2 + c.needs.social * 0.8 + c.needs.health) / 5;
    if (c.money < 60) target -= (60 - c.money) / 60 * 18;
    if (c.money > 600) target += 4;
    const sens = c.traits.reduce((a, t) => a * (t.weatherSens ?? 1), 1);
    target += w.def.mood * 3 * sens * (outside ? 1.6 : 0.7);
    if (w.rainbow > 0 && outside) target += 6;
    if (c.job.id === 'unemployed' && c.age < 63) target -= 6;
    if (c.partner >= 0) target += 3;
    if (c.dogLost) target -= 25;
    target += this.sim.mods.moodBonus;
    c.mood += (clamp(target, 0, 100) - c.mood) * Math.min(1, hours * 0.6);
  }
}

export { WALK, BIKE, HOME_ONLY };
