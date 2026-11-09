// Отношения, память, сплетни, знакомства, пары, репутация, знаменитости.
import type { Sim } from './sim';
import type { Citizen } from './citizen';
import { displayName, hasTrait } from './citizen';
import { RNG, clamp } from './rng';

export interface Memory { t: number; who: number; text: string; d: number }

export const FRIEND_AT = 25;
export const UNFRIEND_AT = 5;

export function aff(a: Citizen, b: Citizen | number): number {
  const id = typeof b === 'number' ? b : b.id;
  return a.rel?.[id] ?? 0;
}

export function knows(a: Citizen, b: Citizen): boolean {
  return a.rel?.[b.id] !== undefined;
}

/** отношение словами */
export function relWord(v: number): string {
  if (v >= 80) return 'очень близки';
  if (v >= 50) return 'дружат';
  if (v >= 25) return 'приятели';
  if (v >= 5) return 'знакомые';
  if (v > -20) return 'прохладно';
  if (v > -50) return 'недолюбливает';
  return 'враждуют';
}

export class Social {
  rng = new RNG(5150);
  celebrities: number[] = [];
  /** счётчики для газеты */
  week = { friendships: 0, quarrels: 0, couples: 0, breakups: 0, gossip: 0, introductions: 0 };

  constructor(private sim: Sim) {}

  init() {
    for (const c of this.sim.citizens) {
      c.rel = c.rel ?? {};
      c.memories = c.memories ?? [];
      for (const f of c.friends) c.rel[f] = c.rel[f] ?? this.rng.range(35, 70);
      for (const h of c.household) c.rel[h] = Math.max(c.rel[h] ?? 0, this.rng.range(50, 80));
      if (c.partner >= 0) c.rel[c.partner] = this.rng.range(65, 90);
    }
  }

  remember(c: Citizen, who: number, text: string, d: number) {
    c.memories = c.memories ?? [];
    c.memories.unshift({ t: this.sim.clock.total, who, text, d });
    if (c.memories.length > 25) c.memories.length = 25;
  }

  /** изменить отношение a → b; mutual — b → a тоже (с коэффициентом) */
  add(a: Citizen, b: Citizen, delta: number, why?: string, mutual = 0) {
    if (!a.alive || !b.alive || a === b) return;
    a.rel = a.rel ?? {};
    const before = a.rel[b.id] ?? 0;
    const after = clamp(before + delta, -100, 100);
    a.rel[b.id] = after;
    if (why && Math.abs(delta) >= 5) this.remember(a, b.id, why, delta);
    // дружба следует за отношением
    if (after >= FRIEND_AT && !a.friends.includes(b.id) && aff(b, a) >= FRIEND_AT - 10) {
      a.friends.push(b.id);
      if (!b.friends.includes(a.id)) b.friends.push(a.id);
      this.week.friendships++;
      this.sim.brain.log(a, `теперь ${b.female ? 'подруга' : 'друг'}: ${b.first}`);
      this.sim.brain.log(b, `теперь ${a.female ? 'подруга' : 'друг'}: ${a.first}`);
    } else if (after < UNFRIEND_AT && a.friends.includes(b.id)) {
      a.friends = a.friends.filter((x) => x !== b.id);
      b.friends = b.friends.filter((x) => x !== a.id);
      this.sim.brain.log(a, `дружба остыла: ${b.first}`);
    }
    if (mutual) this.add(b, a, delta * mutual, why, 0);
  }

  /** репутация: среднее отношение знакомых */
  reputation(c: Citizen): number {
    let s = 0, n = 0;
    for (const o of this.sim.citizens) {
      if (!o.alive || o === c || o.rel?.[c.id] === undefined) continue;
      s += o.rel[c.id];
      n++;
    }
    return n ? s / n : 0;
  }

  acquaintances(c: Citizen): number {
    return Object.keys(c.rel ?? {}).length;
  }

  /** два жителя в одном месте пересеклись */
  meet(a: Citizen, b: Citizen, placeName: string) {
    const sim = this.sim;
    const known = knows(a, b);
    let p = 0.45;
    if (hasTrait(a, 'social') || hasTrait(b, 'social')) p += 0.25;
    if (hasTrait(a, 'introvert') && hasTrait(b, 'introvert')) p -= 0.25;
    if (Math.abs(a.age - b.age) > 20) p -= 0.2;
    if (a.mood < 35 || b.mood < 35) p -= 0.15;
    if (!known) {
      if (!this.rng.chance(p * 0.3)) return;
      const d = this.rng.range(8, 18);
      this.add(a, b, d, `познакомились — ${placeName}`, 1);
      sim.brain.log(a, `новое знакомство: ${b.first} — ${placeName}`);
      sim.brain.log(b, `новое знакомство: ${a.first} — ${placeName}`);
      return;
    }
    // ссора
    const tension = (a.mood < 40 ? 0.08 : 0) + (b.mood < 40 ? 0.08 : 0) + (hasTrait(a, 'party') && hasTrait(b, 'homebody') ? 0.04 : 0) + 0.015;
    if (this.rng.chance(tension)) {
      const topic = this.rng.pick(['деньги', 'политику', 'футбол', 'парковку', 'громкую музыку', 'старый долг', 'чей кот']);
      this.add(a, b, -this.rng.range(10, 22), `поссорились из-за ${topic}`, 1);
      sim.brain.log(a, `ссора: ${b.first} — из-за ${topic}`);
      sim.brain.log(b, `ссора: ${a.first} — из-за ${topic}`);
      this.week.quarrels++;
      return;
    }
    this.add(a, b, this.rng.range(0.8, 3), undefined, 1);
    // сплетни о третьем
    if (aff(a, b) > 20 && this.rng.chance(0.35)) this.gossip(a, b);
    // знакомство с другом
    if (aff(a, b) > 40 && this.rng.chance(0.04)) this.introduce(a, b);
  }

  gossip(teller: Citizen, listener: Citizen) {
    const sim = this.sim;
    const ids = Object.keys(teller.rel ?? {}).map(Number).filter((id) => id !== listener.id && sim.citizens[id]?.alive);
    if (!ids.length) return;
    const tid = this.rng.pick(ids);
    const target = sim.citizens[tid];
    const opinion = aff(teller, target);
    if (Math.abs(opinion) < 15) return;
    const d = Math.sign(opinion) * this.rng.range(2, 6);
    if (knows(listener, target)) this.add(listener, target, d, opinion > 0 ? `${teller.first} хорошо отзывается` : `${teller.first} рассказал${teller.female ? 'а' : ''} гадости`);
    else if (opinion < 0) { listener.rel![target.id] = d; }
    const fact = target.diary.find((x) => !x.text.startsWith('пош') && !x.text.startsWith('поехал') && !x.text.startsWith('лег') && !x.text.startsWith('лёг'))?.text;
    if (fact) sim.brain.log(listener, `сплетня от ${teller.first}: ${target.first} — ${fact}`);
    this.week.gossip++;
  }

  introduce(a: Citizen, b: Citizen) {
    const sim = this.sim;
    const cand = a.friends.map((id) => sim.citizens[id]).filter((f) => f && f.alive && f !== b && !knows(b, f));
    if (!cand.length) return;
    const f = this.rng.pick(cand);
    this.add(b, f, this.rng.range(10, 20), `${a.first} познакомил${a.female ? 'а' : ''}`, 1);
    sim.brain.log(b, `${a.first} познакомил${a.female ? 'а' : ''} с друзьями — новый знакомый: ${f.first}`);
    this.week.introductions++;
  }

  /** каждый час: встречи в общих местах */
  hourly() {
    const sim = this.sim;
    for (const b of sim.world.buildings) {
      if (b.inside.size < 2 || b.def.cat === 'home' && b.inside.size > 6) continue;
      const people = [...b.inside].map((id) => sim.citizens[id]).filter((c) => c && c.alive && !c.trip && c.act && c.act.id !== 'sleep' && c.age >= 6 && !c.controlled);
      if (people.length < 2) continue;
      const pairs = Math.min(2, Math.floor(people.length / 3) + 1);
      for (let i = 0; i < pairs; i++) {
        const a = this.rng.pick(people), c = this.rng.pick(people);
        if (a === c) continue;
        if (Math.abs(a.age - c.age) > 30 && !knows(a, c)) continue;
        this.meet(a, c, b.name);
      }
    }
  }

  /** каждый день: пары, остывание, знаменитости */
  daily() {
    const sim = this.sim;
    for (const c of sim.citizens) {
      if (!c.alive) continue;
      // без общения отношения немного остывают
      for (const k of Object.keys(c.rel ?? {})) {
        const id = Number(k);
        const v = c.rel![id];
        if (v > 30 && !c.household.includes(id) && c.partner !== id) c.rel![id] = v - 0.4;
      }
      // пары: если отношения испортились — расставание
      if (c.partner > c.id) {
        const p = sim.citizens[c.partner];
        if (p?.alive && (aff(c, p) < 12 || aff(p, c) < 12) && c.children.length === 0 && this.rng.chance(0.5)) {
          c.partner = -1; p.partner = -1;
          sim.brain.log(c, `расставание: ${p.first}`);
          sim.brain.log(p, `расставание: ${c.first}`);
          sim.news.push('💔', `${displayName(c)} и ${displayName(p)} расстались — отношения не сложились`, 'people', { citizen: c.id });
          this.week.breakups++;
        }
      }
      // взаимная симпатия → пара
      if (c.partner < 0 && c.age >= 18 && this.rng.chance(0.15 * sim.params.loveRate)) {
        for (const k of Object.keys(c.rel ?? {})) {
          const o = sim.citizens[Number(k)];
          if (!o?.alive || o.partner >= 0 || o.age < 18 || o.female === c.female || Math.abs(o.age - c.age) > 12 || c.household.includes(o.id)) continue;
          if (aff(c, o) > 55 && aff(o, c) > 55) {
            c.partner = o.id; o.partner = c.id;
            this.add(c, o, 15, 'начали встречаться', 1);
            sim.brain.log(c, `теперь мы пара: ${o.first} 💕`);
            sim.brain.log(o, `теперь мы пара: ${c.first} 💕`);
            sim.news.push('💕', `${displayName(c)} и ${displayName(o)} теперь пара`, 'people', { citizen: c.id });
            this.week.couples++;
            break;
          }
        }
      }
    }
    // местные знаменитости — у кого больше всего знакомых и хорошая репутация
    const scored = sim.citizens.filter((c) => c.alive && c.age >= 16).map((c) => ({ c, s: this.acquaintances(c) + this.reputation(c) * 0.3 }));
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, 3).filter((x) => x.s > 10).map((x) => x.c.id);
    for (const id of top) if (!this.celebrities.includes(id)) {
      const c = sim.citizens[id];
      sim.news.push('⭐', `${displayName(c)} — местная знаменитость: ${this.acquaintances(c)} знакомых по всему городу`, 'people', { citizen: id }, 0);
    }
    this.celebrities = top;
  }

  resetWeek() {
    this.week = { friendships: 0, quarrels: 0, couples: 0, breakups: 0, gossip: 0, introductions: 0 };
  }
}
