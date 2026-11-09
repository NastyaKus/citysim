// Житель: данные и генерация населения.
import { RNG } from './rng';
import { JOBS, JobDef, SPECIAL_JOBS } from './content/jobs';
import { TRAITS, TraitDef, Mode } from './content/traits';
import { ActivityDef, Need } from './content/activities';
import { FEMALE_NAMES, MALE_NAMES, SURNAMES, DOG_NAMES, feminine } from './content/names';
import type { World, V2, Building } from './world';
import type { Params } from './params';
import type { VehicleType } from './transport';
import { CAR_COLORS } from './transport';

export type CState = 'inside' | 'outdoor' | 'walk' | 'bike' | 'car' | 'waitBus' | 'bus' | 'waitTaxi';
export type TripStage = 'walk' | 'bike' | 'toStop' | 'wait' | 'ride' | 'fromStop' | 'drive' | 'waitTaxi';

export interface Trip {
  mode: Mode;
  stage: TripStage;
  dest: number;
  act: ActivityDef;
  dur: number;
  path: V2[];
  pi: number;
  vehicle: number;
  boardStop: number;
  alightStop: number;
  routeId: number;
  waitUntil: number;
  started: number;
  shelter?: boolean;
}

export interface Look {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  hairStyle: number;
  height: number;
  hat: number; // 0 — нет
  umbrella: number;
  scarf: number;
}

export interface DiaryEntry { t: number; text: string }

export interface Citizen {
  id: number;
  first: string;
  last: string;
  female: boolean;
  age: number;
  job: JobDef;
  work: number;
  home: number;
  traits: TraitDef[];
  needs: Record<Need, number>;
  money: number;
  mood: number;
  hasCar: boolean;
  carType: VehicleType;
  carColor: number;
  carAt: number;
  fuel: number;
  carBroken: boolean;
  hasBike: boolean;
  hasDog: boolean;
  dogName: string;
  dogColor: number;
  dogLost: boolean;
  partner: number;
  friends: number[];
  household: number[];
  children: number[];
  state: CState;
  at: number;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  moving: number; // скорость для анимации
  act: ActivityDef | null;
  actStart: number;
  actEnd: number;
  actPlace: number;
  wander: { x: number; z: number; pause: number };
  trip: Trip | null;
  diary: DiaryEntry[];
  sick: number;
  workedDay: number;
  shiftDay: number;
  lateUntil: number;
  remoteDay: number;
  remoteToday: boolean;
  wake: number;
  bed: number;
  look: Look;
  nextCheck: number;
  tripCount: number;
  commuteMin: number;
  happyDays: number;
  invitedBy: number;
  alive: boolean;
  lastPlace: number;
  birthdayDay: number;
  controlled?: boolean;
  pausedUntil?: number;
  rel?: Record<number, number>;
  memories?: { t: number; who: number; text: string; d: number }[];
  goal?: import('./goals').Goal;
  favs?: Record<number, number>;
  modeBias?: Partial<Record<Mode, number>>;
  played?: number;
}

const SKINS = [0xf5d0b0, 0xe8b894, 0xd9a07a, 0xc68863, 0xa26a48, 0x8a5a3c, 0xf2c9a8];
const HAIR = [0x2b1d14, 0x4a3020, 0x7a4f2a, 0xc9a050, 0xe8d090, 0x1a1a1a, 0xa0522d, 0x5c3a21];
const SHIRTS = [0xe63946, 0x457b9d, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0x6a4c93, 0x8ac926, 0xff595e, 0x1982c4, 0xffffff, 0x333333, 0xff99c8, 0x80ed99, 0xfcbf49, 0x9d4edd, 0x06d6a0];
const PANTS = [0x22223b, 0x4a4e69, 0x264653, 0x3d405b, 0x5e503f, 0x1d3557, 0x6c757d, 0x2b2d42];
const UMBRELLAS = [0xe63946, 0x1d3557, 0xffd166, 0x06d6a0, 0x111111, 0xff99c8, 0x8338ec];
const DOGS = [0xc69c6d, 0x3b2a1a, 0xf5f5f5, 0x8b5a2b, 0x222222, 0xd2b48c];

export function displayName(c: Citizen) {
  return `${c.first} ${c.last}`;
}

export function jobName(c: Citizen) {
  return (c.female && c.job.nameF) || c.job.name;
}

let nextId = 0;
export function resetIds() { nextId = 0; }

export function makeCitizen(rng: RNG, age: number, female: boolean, last: string, home: number, world: World): Citizen {
  const first = rng.pick(female ? FEMALE_NAMES : MALE_NAMES);
  const traits: TraitDef[] = [];
  const nTraits = age < 6 ? 1 : rng.int(2, 3);
  let guard = 0;
  while (traits.length < nTraits && guard++ < 30) {
    const t = rng.pick(TRAITS);
    if (traits.includes(t) || traits.some((x) => x.excludes?.includes(t.id) || t.excludes?.includes(x.id))) continue;
    if (age < 16 && ['party', 'workaholic', 'carlover', 'believer', 'spender', 'frugal'].includes(t.id)) continue;
    traits.push(t);
  }
  const hb = world.buildings[home];
  const look: Look = {
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    skin: rng.pick(SKINS),
    hair: age > 62 ? rng.pick([0xd8d8d8, 0xbfbfbf, 0xeeeeee, 0x9a9a9a]) : rng.pick(HAIR),
    hairStyle: female ? rng.pick([1, 2, 3]) : rng.pick([0, 0, 1, 4]),
    height: age < 4 ? 0.45 : age < 8 ? 0.6 : age < 13 ? 0.75 : age < 16 ? 0.9 : rng.range(0.94, 1.08),
    hat: rng.chance(0.25) ? rng.pick(SHIRTS) : 0,
    umbrella: rng.pick(UMBRELLAS),
    scarf: rng.pick(SHIRTS),
  };
  return {
    id: nextId++, first, last: female ? feminine(last) : last, female, age, job: SPECIAL_JOBS.unemployed, work: -1, home, traits,
    needs: { hunger: rng.range(50, 90), energy: rng.range(60, 95), fun: rng.range(40, 90), social: rng.range(40, 90), health: rng.range(80, 100) },
    money: rng.range(80, 400), mood: 70, hasCar: false, carType: 'sedan', carColor: rng.pick(CAR_COLORS), carAt: home, fuel: rng.range(0.3, 1), carBroken: false,
    hasBike: false, hasDog: false, dogName: rng.pick(DOG_NAMES), dogColor: rng.pick(DOGS), dogLost: false, partner: -1, friends: [], household: [], children: [],
    state: 'inside', at: home, x: hb.entrance.pos.x, z: hb.entrance.pos.z, dirX: 1, dirZ: 0, moving: 0,
    act: null, actStart: 0, actEnd: 0, actPlace: home, wander: { x: 0, z: 0, pause: 0 }, trip: null, diary: [], sick: 0,
    workedDay: -1, shiftDay: -1, lateUntil: 0, remoteDay: -1, remoteToday: false, wake: 7, bed: 23, look, nextCheck: rng.range(0, 10), tripCount: 0, commuteMin: 0, happyDays: 0,
    invitedBy: -1, alive: true, lastPlace: home, birthdayDay: rng.int(0, 60),
  };
}

export function hasTrait(c: Citizen, id: string) {
  return c.traits.some((t) => t.id === id);
}

/** Расчёт режима сна с учётом работы и характера */
export function computeSleep(c: Citizen, rng: RNG) {
  let wake = 7, bed = 23;
  if (c.age < 7) { wake = 7.5; bed = 21; }
  else if (c.age < 13) { wake = 7; bed = 21.5; }
  else if (c.age < 18) { wake = 7; bed = 23.5; }
  else if (c.age > 62) { wake = 6.3; bed = 22.2; }
  for (const t of c.traits) { wake += t.wake ?? 0; bed += t.sleep ?? 0; }
  const j = c.job;
  if (j.shift[1] > j.shift[0]) {
    if (j.shift[1] > 26) {
      // ночная смена — спим после работы
      bed = (j.shift[1] % 24) + 0.7;
      wake = bed + 7.5;
    } else if (j.shift[1] > 24) {
      bed = (j.shift[1] % 24) + 0.5;
      wake = Math.max(wake, bed + 7);
    } else {
      wake = Math.min(wake, j.shift[0] - 1.1);
    }
  }
  wake += rng.range(-0.4, 0.4);
  bed += rng.range(-0.5, 0.5);
  c.wake = ((wake % 24) + 24) % 24;
  c.bed = ((bed % 24) + 24) % 24;
}

export function assignJob(c: Citizen, job: JobDef, world: World, rng: RNG) {
  c.job = job;
  c.work = -1;
  if (job.places.length) {
    const cand: Building[] = [];
    for (const t of job.places) cand.push(...(world.byType.get(t) ?? []));
    if (cand.length) {
      const b = rng.pick(cand);
      c.work = b.id;
      b.workers.push(c.id);
    }
  }
  computeSleep(c, rng);
}

export function removeFromWork(c: Citizen, world: World) {
  if (c.work >= 0) {
    const b = world.buildings[c.work];
    b.workers = b.workers.filter((x) => x !== c.id);
  }
  c.work = -1;
}

export function pickJob(rng: RNG, age: number, world: World): JobDef {
  const cand = JOBS.filter((j) => age >= j.ages[0] && age <= j.ages[1] && j.places.some((p) => world.byType.has(p)));
  return rng.weighted(cand, (j) => j.weight) ?? SPECIAL_JOBS.unemployed;
}

/** Генерация жителей по домохозяйствам */
export function generatePopulation(world: World, params: Params, rng: RNG): Citizen[] {
  resetIds();
  for (const b of world.buildings) { b.residents = []; b.workers = []; b.inside.clear(); }
  const homes = world.buildings.filter((b) => b.def.cat === 'home');
  const free = new Map<number, number>(homes.map((h) => [h.id, h.homeCapacity]));
  const people: Citizen[] = [];
  const target = params.population;
  let guard = 0;
  while (people.length < target && guard++ < 5000) {
    const open = homes.filter((h) => (free.get(h.id) ?? 0) > 0);
    if (!open.length) break;
    const home = rng.weighted(open, (h) => free.get(h.id)!)!;
    const last = rng.pick(SURNAMES);
    const kind = home.type === 'dorm' ? 'students' : rng.weighted(['single', 'couple', 'family', 'single_parent', 'seniors', 'roommates', 'big_family'], (k) => ({ single: 3, couple: 2.5, family: 3, single_parent: 0.8, seniors: 1.6, roommates: 0.8, big_family: 0.6 } as Record<string, number>)[k])!;
    const hh: Citizen[] = [];
    const add = (age: number, female: boolean, surname = last) => {
      const c = makeCitizen(rng, Math.round(age), female, surname, home.id, world);
      hh.push(c);
      return c;
    };
    switch (kind) {
      case 'students': for (let i = 0; i < rng.int(1, 3); i++) add(rng.range(17, 23), rng.chance(0.5), rng.pick(SURNAMES)); break;
      case 'single': add(rng.range(20, 75), rng.chance(0.5)); break;
      case 'roommates': for (let i = 0; i < 2; i++) add(rng.range(19, 34), rng.chance(0.5), rng.pick(SURNAMES)); break;
      case 'couple': {
        const a = rng.range(20, 60);
        const m = add(a, false), f = add(a + rng.range(-5, 5), true);
        m.partner = f.id; f.partner = m.id;
        break;
      }
      case 'seniors': {
        const a = rng.range(63, 85);
        if (rng.chance(0.3)) { add(a, rng.chance(0.6)); break; }
        const m = add(a, false), f = add(a + rng.range(-4, 4), true);
        m.partner = f.id; f.partner = m.id;
        break;
      }
      case 'family':
      case 'big_family': {
        const a = rng.range(27, 50);
        const m = add(a, false), f = add(a + rng.range(-5, 4), true);
        m.partner = f.id; f.partner = m.id;
        const kids = kind === 'big_family' ? rng.int(3, 4) : rng.int(1, 2);
        for (let i = 0; i < kids; i++) {
          const k = add(Math.max(0, Math.min(a - 20, rng.range(0, 17))), rng.chance(0.5));
          m.children.push(k.id); f.children.push(k.id);
        }
        if (kind === 'big_family' && rng.chance(0.5)) add(rng.range(66, 85), true); // бабушка
        break;
      }
      case 'single_parent': {
        const a = rng.range(26, 48);
        const p = add(a, rng.chance(0.8));
        for (let i = 0; i < rng.int(1, 2); i++) { const k = add(rng.range(1, 16), rng.chance(0.5)); p.children.push(k.id); }
        break;
      }
    }
    free.set(home.id, (free.get(home.id) ?? 0) - hh.length);
    const ids = hh.map((c) => c.id);
    // транспорт и собаки
    const adults = hh.filter((c) => c.age >= 18);
    if (adults.length && rng.chance(params.carOwnership * (home.type === 'house' ? 1.4 : 1) * (kind === 'students' ? 0.3 : 1))) {
      const owner = rng.pick(adults);
      owner.hasCar = true;
      owner.carType = rng.weighted<VehicleType>(['sedan', 'hatch', 'suv', 'pickup', 'cabrio'], (t) => ({ sedan: 4, hatch: 4, suv: 3, pickup: home.type === 'house' ? 2 : 0.5, cabrio: 0.5 } as Record<string, number>)[t])!;
      if (adults.length > 1 && rng.chance(params.carOwnership * 0.3)) {
        const o2 = adults.find((x) => !x.hasCar);
        if (o2) o2.hasCar = true;
      }
    }
    if (rng.chance(params.dogOwnership * (home.type === 'house' ? 1.8 : 1))) {
      const walkers = hh.filter((c) => c.age >= 10);
      if (walkers.length) {
        const w = rng.pick(walkers);
        w.hasDog = true;
        if (!w.traits.some((t) => t.id === 'dogperson') && w.traits.length < 3) w.traits.push(TRAITS.find((t) => t.id === 'dogperson')!);
      }
    }
    for (const c of hh) {
      c.household = ids.filter((x) => x !== c.id);
      c.hasBike = c.age >= 7 && c.age < 76 && rng.chance(params.bikeOwnership * (c.traits.some((t) => t.id === 'sporty' || t.id === 'eco') ? 2 : 1));
      if (c.traits.some((t) => t.id === 'carlover') && c.age >= 18) c.hasCar = true;
      if (c.traits.some((t) => t.id === 'eco')) c.hasCar = false;
      home.residents.push(c.id);
      people.push(c);
    }
  }

  // гарантируем id === индекс
  const remap = new Map<number, number>();
  people.forEach((c, i) => remap.set(c.id, i));
  const rm = (id: number) => remap.get(id) ?? -1;
  for (const c of people) {
    c.id = rm(c.id);
    if (c.partner >= 0) c.partner = rm(c.partner);
    c.children = c.children.map(rm).filter((x) => x >= 0);
    c.household = c.household.map(rm).filter((x) => x >= 0);
  }
  for (const b of world.buildings) b.residents = b.residents.map(rm).filter((x) => x >= 0);

  // профессии
  for (const c of people) {
    let job: JobDef;
    if (c.age <= 1) job = SPECIAL_JOBS.baby;
    else if (c.age <= 6) job = SPECIAL_JOBS.toddler;
    else if (c.age <= 16) job = SPECIAL_JOBS.pupil;
    else if (c.age <= 23 && (rng.chance(0.65) || world.buildings[c.home].type === 'dorm')) job = SPECIAL_JOBS.student;
    else if (c.age >= 63) job = rng.chance(0.12) ? pickJob(rng, 62, world) : SPECIAL_JOBS.retiree;
    else if (rng.chance(params.unemployment)) job = SPECIAL_JOBS.unemployed;
    else job = pickJob(rng, c.age, world);
    assignJob(c, job, world, rng);
    c.money = job.salary * rng.range(1, 4) + rng.range(20, 150);
  }

  // друзья: похожий возраст, часть — коллеги и соседи
  for (const c of people) {
    if (c.age < 5) continue;
    const want = c.traits.some((t) => t.id === 'social' || t.id === 'party') ? rng.int(4, 6) : c.traits.some((t) => t.id === 'introvert') ? rng.int(1, 2) : rng.int(2, 4);
    let tries = 0;
    while (c.friends.length < want && tries++ < 40) {
      let f: Citizen;
      if (rng.chance(0.3) && c.work >= 0) {
        const ws = world.buildings[c.work].workers;
        f = people[rng.pick(ws)];
      } else f = rng.pick(people);
      if (!f || f.id === c.id || c.household.includes(f.id) || c.friends.includes(f.id) || f.age < 5) continue;
      if (Math.abs(f.age - c.age) > (c.age < 18 ? 3 : 14)) continue;
      if (f.friends.length > 7) continue;
      c.friends.push(f.id);
      f.friends.push(c.id);
    }
  }
  return people;
}
