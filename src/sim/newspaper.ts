// Еженедельная газета «Наш город» — из реальных событий недели.
import type { Sim } from './sim';
import type { Citizen } from './citizen';
import { displayName, jobName } from './citizen';
import { aboutSelf, gossipLine } from './dialog';
import { WEEKDAYS } from './params';
import { WEATHER_BY_ID, SEASON_NAMES } from './content/weather';
import { RNG } from './rng';

/** ссылка на жителя внутри текста: [[id|Имя]] */
export const link = (c: Citizen) => `[[${c.id}|${displayName(c)}]]`;

export interface Article { section: string; title: string; body: string; big?: boolean }
export interface Issue {
  no: number;
  day: number;
  title: string;
  headline: Article;
  articles: Article[];
  numbers: [string, string][];
  ads: string[];
}

interface WeekBase {
  start: number;
  unemployed: number;
  money: number;
  births: number;
  departures: number;
  population: number;
  weather: Record<string, number>;
  accidents: number;
  fires: number;
  congestion: number[];
  newcomers: number;
  weddings: number[];
}

export class Newspaper {
  issues: Issue[] = [];
  rng = new RNG(1917);
  week!: WeekBase;
  unread = false;

  constructor(private sim: Sim) {
    this.resetWeek();
  }

  resetWeek() {
    const sim = this.sim;
    const alive = sim.citizens.filter((c) => c.alive);
    this.week = {
      start: sim.clock.total,
      unemployed: alive.filter((c) => c.job.id === 'unemployed').length,
      money: alive.length ? alive.reduce((a, c) => a + c.money, 0) / alive.length : 0,
      births: sim.stats.births,
      departures: sim.stats.departures,
      population: alive.length,
      weather: {},
      accidents: 0,
      fires: 0,
      congestion: [],
      newcomers: 0,
      weddings: [],
    };
    sim.social?.resetWeek();
    sim.goals && (sim.goals.week = { achieved: 0, cars: 0, bikes: 0, moves: 0, jobs: 0 });
    sim.dynamics?.resetWeek();
  }

  /** отметки в течение недели */
  noteEvent(id: string, citizen?: number) {
    const w = this.week;
    if (id === 'accident') w.accidents++;
    if (id === 'fire') w.fires++;
    if (id === 'newcomer') w.newcomers++;
    if (id === 'wedding' && citizen !== undefined) w.weddings.push(citizen);
  }

  daily() {
    const sim = this.sim;
    this.week.weather[sim.weather.def.id] = (this.week.weather[sim.weather.def.id] ?? 0) + 1;
    this.week.congestion.push(sim.stats.current.congestion);
    if (sim.clock.total - this.week.start >= 7 * 1440 - 60) this.publish();
  }

  /** выпустить номер (по расписанию или экстренный) */
  publish(extra = false): Issue {
    const sim = this.sim;
    const w = this.week;
    const R = this.rng;
    const items = sim.news.items.filter((n) => n.time >= w.start);
    const ppl = (ids: number[]) => ids.map((id) => sim.citizens[id]).filter((c) => c && c.alive);
    const listNames = (cs: Citizen[], max = 4) => cs.slice(0, max).map(link).join(', ') + (cs.length > max ? ` и ещё ${cs.length - max}` : '');
    const cands: { w: number; a: Article }[] = [];
    const articles: Article[] = [];

    // ——— люди
    const births = items.filter((n) => n.emoji === '👶' && n.citizen !== undefined);
    const babies = ppl(births.map((n) => n.citizen!));
    const couples = items.filter((n) => n.emoji === '💕' || n.emoji === '💘');
    const weddings = items.filter((n) => n.emoji === '💒');
    const goals = items.filter((n) => n.emoji === '🎯' && n.citizen !== undefined);
    const friends = sim.social.week;
    const peopleLines: string[] = [];
    if (babies.length) peopleLines.push(`В городе родил${babies.length > 1 ? 'ись' : babies[0].female ? 'ась' : 'ся'} ${babies.length} малыш${babies.length > 4 ? 'ей' : babies.length > 1 ? 'а' : ''}: ${listNames(babies)}. Поздравляем родителей!`);
    for (const n of weddings.slice(0, 2)) peopleLines.push(linkify(sim, n.text));
    for (const n of couples.slice(0, 3)) peopleLines.push(linkify(sim, n.text) + '.');
    if (friends.friendships) peopleLines.push(`За неделю завязалось ${friends.friendships} новых дружб${friends.introductions ? `, ${friends.introductions} знакомств случилось через общих друзей` : ''}.`);
    if (friends.quarrels) peopleLines.push(`Без ссор тоже не обошлось: ${friends.quarrels} раз${friends.quarrels % 10 >= 2 && friends.quarrels % 10 <= 4 ? 'а' : ''} соседи выясняли отношения.`);
    if (friends.breakups) peopleLines.push(`${friends.breakups} пар${friends.breakups > 1 ? 'ы' : 'а'} расстал${friends.breakups > 1 ? 'ись' : 'ась'}.`);
    for (const n of goals.slice(0, 3)) peopleLines.push(`🎯 ${linkify(sim, n.text)}.`);
    const departed = sim.stats.departures - w.departures;
    if (departed || w.newcomers) peopleLines.push(`Переезды: приехало ${w.newcomers} новых жителей, уехало ${departed}.`);
    if (peopleLines.length) articles.push({ section: 'Люди', title: babies.length >= 2 ? 'Бэби-бум!' : weddings.length ? 'Неделя любви' : 'Жизнь горожан', body: peopleLines.join(' ') });
    if (babies.length >= 2) cands.push({ w: 6 + babies.length, a: { section: 'Главное', title: `Бэби-бум: ${babies.length} новых горожан за неделю`, body: `Роддом работал без выходных. Родились ${listNames(babies, 6)}. Детский сад уже готовит новые кроватки.` } });
    for (const n of weddings) cands.push({ w: 9, a: { section: 'Главное', title: 'Свадьба недели', body: linkify(sim, n.text) + ' Гости гуляли до поздней ночи, а кортеж видел весь город.' } });

    // ——— город
    const dyn = sim.dynamics.week;
    const cityLines: string[] = [];
    if (dyn.opened.length) cityLines.push(`Открылись: ${dyn.opened.join(', ')}.`);
    if (dyn.closed.length) cityLines.push(`Закрылись: ${dyn.closed.join(', ')} — не хватило посетителей.`);
    if (dyn.built.length) cityLines.push(`Сданы новостройки: ${dyn.built.join(', ')}.`);
    if (dyn.favorite) cityLines.push(`Любимое место горожан этой недели — ${dyn.favorite}.`);
    if (dyn.traditions.length) cityLines.push(`Появились новые традиции: ${dyn.traditions.map((t) => `«${t}»`).join(', ')}.`);
    const rising = sim.dynamics.districts.filter((d) => d.trend > 0).map((d) => d.name);
    const falling = sim.dynamics.districts.filter((d) => d.trend < 0).map((d) => d.name);
    if (rising.length) cityLines.push(`Оживают районы: ${rising.join(', ')}.`);
    if (falling.length) cityLines.push(`Пустеют: ${falling.join(', ')}.`);
    if (sim.world.decor.length) cityLines.push(`Горожане благоустроили город: ${sim.world.decor.length} новых лавочек, деревьев и клумб.`);
    if (cityLines.length) articles.push({ section: 'Город', title: dyn.opened.length ? 'Новые вывески' : dyn.closed.length ? 'Тяжёлые времена для бизнеса' : 'Городские перемены', body: cityLines.join(' ') });
    if (dyn.opened.length) cands.push({ w: 5 + dyn.opened.length, a: { section: 'Главное', title: `Открытие недели: ${dyn.opened[0]}`, body: `Очередь у входа, скидки и воздушные шары. ${dyn.opened.length > 1 ? `А ещё открылись ${dyn.opened.slice(1).join(', ')}.` : ''}` } });
    if (dyn.closed.length >= 2) cands.push({ w: 6, a: { section: 'Главное', title: 'Бизнес закрывается один за другим', body: `За неделю закрылись ${dyn.closed.join(', ')}. Предприниматели жалуются на отток покупателей.` } });
    if (dyn.traditions.length) cands.push({ w: 7, a: { section: 'Главное', title: `Новая традиция: «${dyn.traditions[0]}»`, body: 'Горожанам так понравилось, что теперь это будет повторяться каждую неделю.' } });

    // ——— транспорт
    const cong = w.congestion.length ? Math.max(...w.congestion) : sim.stats.current.congestion;
    const waiters = sim.citizens.filter((c) => c.alive && c.diary.some((d) => d.t >= w.start && d.text.includes('не дождал')));
    const trLines: string[] = [];
    if (w.accidents) trLines.push(`На дорогах произошло ${w.accidents} ДТП.`);
    trLines.push(`Пиковая загруженность дорог — ${Math.round(cong * 100)}%.`);
    if (waiters.length) {
      const q = R.pick(waiters);
      trLines.push(`«Ждал${q.female ? 'а' : ''} автобус больше получаса и пош${q.female ? 'ла' : 'ёл'} пешком», — жалуется ${link(q)}. Таких жалоб за неделю: ${waiters.length}.`);
    }
    if (sim.goals.week.cars) trLines.push(`Горожане купили ${sim.goals.week.cars} машин${sim.goals.week.cars > 1 ? 'ы' : 'у'}${sim.goals.week.bikes ? ` и ${sim.goals.week.bikes} велосипед${sim.goals.week.bikes > 1 ? 'а' : ''}` : ''}.`);
    articles.push({ section: 'Транспорт', title: w.accidents >= 2 ? 'Аварийная неделя' : waiters.length > 5 ? 'Где автобус?!' : 'Дороги и автобусы', body: trLines.join(' ') });
    if (w.accidents >= 2) cands.push({ w: 5 + w.accidents, a: { section: 'Главное', title: `${w.accidents} ДТП за неделю`, body: 'ГАИ призывает водителей быть внимательнее, особенно в непогоду и гололёд.' } });
    if (w.fires) cands.push({ w: 8, a: { section: 'Главное', title: 'Пожар!', body: items.filter((n) => n.emoji === '🔥').map((n) => linkify(sim, n.text)).slice(0, 2).join(' ') + ' Пожарные справились, пострадавших нет.' } });

    // ——— экономика
    const alive = sim.citizens.filter((c) => c.alive);
    const unemp = alive.filter((c) => c.job.id === 'unemployed').length;
    const money = alive.reduce((a, c) => a + c.money, 0) / Math.max(1, alive.length);
    const du = unemp - w.unemployed;
    articles.push({ section: 'Экономика', title: du > 2 ? 'Безработица растёт' : du < -2 ? 'Рабочих мест стало больше' : 'Экономика стабильна', body: `Безработных: ${unemp} (${du > 0 ? '+' : ''}${du} за неделю). Средний бюджет горожанина — ${Math.round(money)}₽ (${money >= w.money ? '+' : ''}${Math.round(money - w.money)}₽). Сменили работу ${sim.goals.week.jobs} чел.` });
    if (Math.abs(du) >= 4) cands.push({ w: 6, a: { section: 'Главное', title: du > 0 ? `Безработица: +${du} за неделю` : `Город нанимает: ${-du} новых рабочих мест`, body: `Сейчас без работы ${unemp} горожан.` } });

    // ——— знаменитость: интервью
    const celeb = sim.social.celebrities.map((id) => sim.citizens[id]).find((c) => c?.alive);
    if (celeb) {
      const a: Article = { section: 'Интервью', title: `${displayName(celeb)}: «${firstSentence(aboutSelf(sim, celeb))}»`, body: `Мы поговорили с ${link(celeb)} — ${jobName(celeb)}, ${sim.social.acquaintances(celeb)} знакомых по всему городу. «${aboutSelf(sim, celeb)}» А о городе так: «${gossipLine(sim, celeb)}»` };
      articles.push(a);
      cands.push({ w: 4, a: { ...a, section: 'Главное' } });
    }

    // ——— письма читателей
    const letters: string[] = [];
    const grumpy = alive.filter((c) => c.age >= 16 && c.mood < 45);
    if (grumpy.length) {
      const c = R.pick(grumpy);
      const why = c.money < 60 ? 'Цены растут, а зарплата нет' : c.needs.social < 30 ? 'Одиноко. Не с кем даже кофе выпить' : c.needs.energy < 30 ? 'Работаю на износ, сил ни на что нет' : 'Всё как-то не так';
      letters.push(`«${why}». — ${link(c)}`);
    }
    const happy = alive.filter((c) => c.age >= 16 && c.mood > 85);
    if (happy.length) {
      const c = R.pick(happy);
      letters.push(`«Люблю наш город! ${c.partner >= 0 ? `Спасибо, ${sim.citizens[c.partner].first}, за всё 💕` : 'Тут уютно и все свои.'}» — ${link(c)}`);
    }
    if (letters.length) articles.push({ section: 'Письма читателей', title: 'Пишут горожане', body: letters.join(' ') });

    // ——— погода
    const wdays = Object.entries(w.weather).sort((a, b) => b[1] - a[1]);
    const wtxt = wdays.length ? wdays.map(([id, n]) => `${WEATHER_BY_ID[id]?.emoji ?? ''} ${WEATHER_BY_ID[id]?.name.toLowerCase() ?? id} — ${n} д.`).join(', ') : 'погода радовала';
    articles.push({ section: 'Погода', title: `${SEASON_NAMES[sim.params.season]}: итоги недели`, body: `${wtxt.replace(/\.$/, '')}. Сейчас ${Math.round(sim.weather.temp)}°C, ${sim.weather.def.name.toLowerCase()}.` });

    // ——— объявления из целей
    const ads: string[] = [];
    for (const c of R.shuffle(alive.filter((x) => x.goal)).slice(0, 5)) {
      const k = c.goal!.kind;
      const t = k === 'car' ? `Коплю на машину, рассмотрю подержанную.` : k === 'bike' ? 'Куплю велосипед недорого.' : k === 'friends' ? `Ищу друзей для прогулок и кофе. ${c.traits[0] ? `Я ${c.traits[0].name}.` : ''}` : k === 'love' ? `${c.female ? 'Девушка' : 'Молодой человек'}, ${c.age}, ищет вторую половинку.` : k === 'job' ? `Ищу работу. Опыт: ${jobName(c)}.` : k === 'move' ? 'Ищу дом с садом для семьи.' : 'Принимаю советы, как копить деньги 🙂';
      ads.push(`${t} — ${link(c)}`);
    }

    // ——— главная тема
    cands.sort((a, b) => b.w - a.w);
    const headline: Article = cands[0]?.a ?? { section: 'Главное', title: 'Спокойная неделя в нашем городе', body: `Город жил своей жизнью: ${alive.length} горожан, ${alive.filter((c) => c.act?.id === 'work').length} сейчас на работе. Ничего из ряда вон выходящего — и это тоже хорошая новость.` };
    headline.big = true;
    const numbers: [string, string][] = [
      ['жителей', String(alive.length)],
      ['родилось', String(sim.stats.births - w.births)],
      ['новых дружб', String(friends.friendships)],
      ['ссор', String(friends.quarrels)],
      ['целей достигнуто', String(sim.goals.week.achieved)],
      ['ДТП', String(w.accidents)],
    ];
    const issue: Issue = {
      no: this.issues.length + 1,
      day: sim.clock.day,
      title: `${extra ? 'Экстренный выпуск · ' : ''}${WEEKDAYS[sim.clock.weekday]}, день ${sim.clock.day + 1}`,
      headline,
      articles,
      numbers,
      ads,
    };
    this.issues.unshift(issue);
    if (this.issues.length > 20) this.issues.length = 20;
    this.unread = true;
    sim.news.push('🗞️', `Вышел ${extra ? 'экстренный выпуск' : `свежий номер №${issue.no}`} газеты «Наш город»: ${headline.title}`, 'city');
    if (!extra) this.resetWeek();
    return issue;
  }
}

function firstSentence(t: string) {
  const m = t.match(/^[^.!?]+[.!?]/);
  return (m ? m[0] : t).replace(/[.!?]$/, '');
}

/** заменить имена жителей в тексте новости ссылками */
export function linkify(sim: Sim, text: string): string {
  let out = text;
  for (const c of sim.citizens) {
    if (!c.alive) continue;
    const n = displayName(c);
    if (out.includes(n)) out = out.split(n).join(`[[${c.id}|${n}]]`);
  }
  return out;
}
