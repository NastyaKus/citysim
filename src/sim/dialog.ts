// Реплики жителей: собираются из характера, настроения, работы, погоды, событий и сплетен.
import type { Sim } from './sim';
import type { Citizen } from './citizen';
import { hasTrait, jobName } from './citizen';
import { aff, knows } from './social';
import { RNG } from './rng';

const rng = new RNG(2718);
const pick = <T>(a: T[]) => rng.pick(a);
const g = (c: Citizen, m: string, f: string) => (c.female ? f : m);

export type DialogChoice = 'howareyou' | 'news' | 'compliment' | 'treat' | 'invite_walk' | 'invite_cafe' | 'invite_bar' | 'introduce' | 'rude' | 'date' | 'bye' | 'help';

export interface Reply { text: string; delta: number; ok?: boolean }

/** первая реплика при встрече */
export function opener(sim: Sim, npc: Citizen, me: Citizen): string {
  const a = aff(npc, me);
  const name = me.first;
  if (a < -40) return pick(['…', 'Опять ты. Мне некогда.', 'Не хочу сейчас разговаривать.', `А, ${name}. Чего тебе?`]);
  if (a < -10) return pick([`Ну… привет, ${name}.`, 'Да?', 'Я тороплюсь вообще-то.']);
  if (!knows(npc, me)) {
    if (hasTrait(npc, 'introvert')) return pick(['Эм… здравствуйте?', 'Да? Мы знакомы?', '…привет.']);
    if (hasTrait(npc, 'social')) return pick(['О, привет! Я тебя тут раньше не видел' + g(npc, '', 'а') + '. Я ' + npc.first + '!', `Привет-привет! Меня зовут ${npc.first}, а тебя?`]);
    return pick([`Здравствуйте! Я ${npc.first}.`, 'Добрый день!', `Привет. Я ${npc.first}, живу тут неподалёку.`]);
  }
  if (npc.partner === me.id) return pick([`Привет, ${name} 💕`, 'О, это ты! Я как раз о тебе думал' + g(npc, '', 'а') + '.', 'Соскучил' + g(npc, 'ся', 'ась') + '!']);
  if (a > 50) return pick([`${name}! Как я рад${g(npc, '', 'а')} тебя видеть!`, `О, ${name}! Сто лет не виделись!`, 'Привет, дружище!']);
  return pick([`Привет, ${name}.`, 'О, привет!', `${name}, привет! ${moodLine(sim, npc)}`]);
}

function moodLine(sim: Sim, c: Citizen): string {
  if (c.needs.hunger < 25) return pick(['Умираю с голоду, кстати.', 'Пойду перекушу скоро, живот урчит.']);
  if (c.needs.energy < 25) return pick(['Еле на ногах стою…', 'Я так устал' + g(c, '', 'а') + ', ты не представляешь.']);
  if (c.mood > 75) return pick(['Отличный день, правда?', 'У меня сегодня прекрасное настроение!']);
  if (c.mood < 40) return pick(['Не лучший у меня день, если честно.', 'Эх, всё как-то не так сегодня.']);
  return weatherLine(sim, c);
}

function weatherLine(sim: Sim, c: Citizen): string {
  const w = sim.weather;
  if (w.raining) return pick(['Опять этот дождь…', 'Промок' + g(c, '', 'ла') + ' до нитки, пока шёл' + g(c, '', 'а') + '.', hasTrait(c, 'meteo') ? 'От дождя голова раскалывается.' : 'Дождь — это уютно, если сидеть дома.']);
  if (w.def.precip === 'snow') return pick(['Снег! Как в детстве.', 'Опять всё замело.', 'Может, слепим снеговика?']);
  if (w.temp > 28) return pick(['Жара невыносимая.', 'Мороженого бы…']);
  if (w.temp < -10) return pick(['Мороз-то какой!', 'Нос отмерзает.']);
  if (w.def.lightning) return 'Гроза! Лучше бы под крышу.';
  if (w.cloud < 0.3) return pick(['Погода — чудо.', 'Солнышко!']);
  return pick(['Хмуро сегодня.', 'Обычный денёк.']);
}

const JOB_LINES: Record<string, string[]> = {
  programmer: ['Опять баг на проде, всё утро чинил$.', 'Пишу код, пью кофе, повторить.'],
  teacher: ['Дети сегодня были неуправляемые.', 'Проверяю тетради до ночи.'],
  doctor: ['В больнице аншлаг — все чихают.', 'Смена была тяжёлая.'],
  nurse: ['Ночные смены выматывают.', 'Сегодня всю ночь на ногах.'],
  barista: ['Сделал$ сегодня сто капучино.', 'Если хочешь вкусный кофе — заходи к нам.'],
  cook: ['На кухне жарко, как в аду.', 'Сегодня у нас новое блюдо!'],
  busdriver: ['На маршруте опять пробки.', 'Пассажиры сегодня добрые.'],
  taxidriver: ['Возил$ сегодня весь город.', 'Таксую до ночи.'],
  police: ['На районе тихо, и это хорошо.', 'Охраняю порядок!'],
  firefighter: ['Надеюсь, сегодня без пожаров.', 'Сегодня снимали кота с дерева, представляешь?'],
  builder: ['Скоро сдаём этаж.', 'Кран сегодня барахлил.'],
  worker: ['На заводе план горит.', 'Смена у станка — не шутки.'],
  seller: ['Покупателей сегодня много.', 'Привезли свежие овощи.'],
  janitor: ['Двор чистый — моя заслуга.', 'Опять листья, листья…'],
  artist: ['Рисую новую картину — про наш город.', 'Вдохновение пришло!'],
  musician: ['Вечером играю в баре, приходи!', 'Пишу новую песню.'],
  baker: ['Встал$ в четыре утра, пёк хлеб.', 'Сегодня круассаны удались.'],
  courier: ['Сегодня развёз$ тридцать посылок.', 'Ноги гудят от доставок.'],
  student: ['Сессия скоро, страшно.', 'Пары, пары, пары…'],
  pupil: ['У нас контрольная завтра.', 'В школе скукотища.'],
  retiree: ['На пенсии хорошо — гуляю, читаю.', 'Внуки звонили, радость.'],
  unemployed: ['Ищу работу, пока безуспешно.', 'Хожу на биржу, может, повезёт.'],
};

/** рассказ о себе */
export function aboutSelf(sim: Sim, c: Citizen): string {
  const parts: string[] = [];
  const lines = JOB_LINES[c.job.id];
  if (lines) parts.push(pick(lines).replace(/\$/g, g(c, '', 'а')));
  else if (c.work >= 0) parts.push(`Работаю: ${jobName(c)}, место — ${sim.world.buildings[c.work].name}.`);
  // недавние события из дневника
  const recent = c.diary.find((d) => sim.clock.total - d.t < 1440 && /опоздал|не дождал|проспал|ссора|знакомств|купил|нашёл|нашла|выздоровел|выиграл|день рождения|стал|переехал|потерял|пара/.test(d.text));
  if (recent) {
    const t = recent.text;
    if (/не дождал/.test(t)) parts.push('Кстати, автобуса сегодня ждал' + g(c, '', 'а') + ' целую вечность!');
    else if (/опоздал|проспал/.test(t)) parts.push('Сегодня ' + t + ', начальник был недоволен.');
    else parts.push('А у меня новость: ' + t + '!');
  }
  if (c.goal) {
    const left = Math.max(0, Math.round(c.goal.target - c.money));
    parts.push(['car', 'bike', 'move', 'savings'].includes(c.goal.kind) ? `Коплю, хочу ${c.goal.text.replace(/^накопить на /, 'купить ').replace(/^купить /, 'купить ')}${left > 0 ? ` — осталось ${left}₽` : ' — почти получилось'}.` : `Мечтаю ${c.goal.text}.`);
  }
  if (c.hasDog) parts.push(pick([`Мой ${c.dogName} сегодня опять сгрыз тапок.`, `Гуляли утром с ${c.dogName}.`]));
  if (c.partner >= 0 && rng.chance(0.4)) parts.push(`${sim.citizens[c.partner].first} передаёт привет.`);
  if (hasTrait(c, 'coffee') && rng.chance(0.5)) parts.push('Без кофе я вообще не человек.');
  if (hasTrait(c, 'bookworm') && rng.chance(0.5)) parts.push('Дочитываю отличную книгу, потом дам почитать.');
  if (hasTrait(c, 'gamer') && rng.chance(0.5)) parts.push('Вчера до трёх ночи играл' + g(c, '', 'а') + ', не мог' + g(c, '', 'ла') + ' оторваться.');
  if (!parts.length) parts.push(moodLine(sim, c));
  return parts.slice(0, 3).join(' ');
}

/** новости и сплетни */
export function gossipLine(sim: Sim, c: Citizen): string {
  const ids = Object.keys(c.rel ?? {}).map(Number).filter((id) => sim.citizens[id]?.alive);
  rng.shuffle(ids);
  for (const id of ids.slice(0, 6)) {
    const o = sim.citizens[id];
    const fact = o.diary.find((d) => sim.clock.total - d.t < 2880 && /знакомств|ссора|купил|стал|переехал|выиграл|расставан|пара|потерял|нашёл|нашла|получил/.test(d.text));
    if (fact) {
      const op = aff(c, o);
      return `Кстати, ${o.first}… Слышал${g(c, '', 'а')}? У не${o.female ? 'ё' : 'го'} новости: ${fact.text}. ${op > 30 ? 'Я за не' + (o.female ? 'ё' : 'го') + ' рад' + g(c, '', 'а') + '.' : op < -10 ? 'Ну, это на ' + (o.female ? 'неё' : 'него') + ' похоже.' : ''}`;
    }
  }
  const n = sim.news.items.find((x) => sim.clock.total - x.time < 720 && x.kind !== 'economy');
  if (n) return `Говорят, ${n.text.charAt(0).toLowerCase() + n.text.slice(1)}`;
  return weatherLine(sim, c) + ' А так — ничего нового.';
}

/** реакция на выбор игрока */
export function respond(sim: Sim, npc: Citizen, me: Citizen, choice: DialogChoice): Reply {
  const a = aff(npc, me);
  const hostile = a < -30;
  switch (choice) {
    case 'howareyou':
      if (hostile) return { text: 'Нормально. Тебя это не касается.', delta: 1 };
      return { text: aboutSelf(sim, npc), delta: rng.range(2, 5) };
    case 'news':
      if (hostile) return { text: 'Не до новостей мне.', delta: 0 };
      return { text: gossipLine(sim, npc), delta: rng.range(1, 4) };
    case 'compliment': {
      if (hostile) return { text: 'Ой, да брось.', delta: 3 };
      const awkward = rng.chance(hasTrait(npc, 'introvert') ? 0.35 : 0.12);
      if (awkward) return { text: pick(['Э-э… спасибо, наверное.', 'Это было неловко, но ладно 😅']), delta: 1 };
      const romantic = hasTrait(npc, 'romantic') && npc.partner < 0 && npc.female !== me.female;
      return { text: pick(['Ой, спасибо! Приятно 😊', 'Ты очень мил' + g(me, '', 'а') + '!', 'Вот это ты поднял' + g(me, '', 'а') + ' мне настроение!']), delta: romantic ? 14 : hasTrait(npc, 'introvert') ? 5 : 9 };
    }
    case 'treat':
      if (me.money < 10) return { text: 'Спасибо, но у тебя самого не густо, оставь.', delta: 3 };
      return { text: pick(['Ого, спасибо! Вкусно!', 'Как приятно, спасибо большое!', 'Ты лучш' + g(me, 'ий', 'ая') + '!']), delta: hostile ? 12 : 10, ok: true };
    case 'invite_walk': case 'invite_cafe': case 'invite_bar': {
      const busy = npc.act && ['work', 'school', 'study', 'kinder', 'sleep'].includes(npc.act.id);
      const where = choice === 'invite_walk' ? 'прогуляться' : choice === 'invite_cafe' ? 'в кафе' : 'в бар';
      if (choice === 'invite_bar' && npc.age < 18) return { text: 'Мне ещё нельзя в бар 😅', delta: 0 };
      if (busy) return { text: 'Сейчас не могу, у меня дела. Давай в другой раз!', delta: 1 };
      let p = 0.25 + a / 120 + (hasTrait(npc, 'social') ? 0.2 : 0) - (hasTrait(npc, 'introvert') ? 0.15 : 0) + (npc.needs.social < 40 ? 0.2 : 0);
      if (choice === 'invite_bar' && hasTrait(npc, 'party')) p += 0.25;
      if (choice === 'invite_walk' && hasTrait(npc, 'homebody')) p -= 0.2;
      if (rng.chance(Math.max(0.05, Math.min(0.95, p)))) return { text: pick([`С удовольствием! Пойдём ${where}.`, `Давай! Встретимся там.`, `Отличная идея, я как раз хотел${g(npc, '', 'а')} ${where}.`]), delta: 4, ok: true };
      return { text: pick(['Ой, нет, извини, не сегодня.', 'Я, пожалуй, откажусь.', 'Как-нибудь потом, ладно?']), delta: -1 };
    }
    case 'introduce': {
      if (a < 30) return { text: 'Мы не настолько близки, чтобы я тебя с друзьями знакомил' + g(npc, '', 'а') + '.', delta: 0 };
      const cand = npc.friends.map((id) => sim.citizens[id]).filter((f) => f && f.alive && f !== me && !knows(me, f));
      if (!cand.length) return { text: 'Да ты, кажется, и так всех моих друзей знаешь!', delta: 2 };
      const f = rng.pick(cand);
      sim.social.add(me, f, 15, `${npc.first} познакомил${g(npc, '', 'а')}`, 1);
      return { text: `Конечно! Знакомься — это ${f.first}, ${jobName(f)}. Вы друг другу понравитесь.`, delta: 5, ok: true };
    }
    case 'rude':
      return { text: pick(['Что?! Ну ты и хам' + g(me, '', 'ка') + '.', 'Сам' + g(me, '', 'а') + ' такой. Больше со мной не разговаривай.', 'Ну знаешь ли…', 'Я это запомню.']), delta: -25 };
    case 'date': {
      if (npc.partner >= 0 && npc.partner !== me.id) return { text: `Ты что, у меня есть ${sim.citizens[npc.partner].first}!`, delta: -6 };
      if (me.partner >= 0 && me.partner !== npc.id) return { text: 'А как же твоя вторая половинка? Нет уж.', delta: -10 };
      if (npc.age < 18 || me.age < 18 || Math.abs(npc.age - me.age) > 15) return { text: 'Давай останемся друзьями.', delta: 0 };
      if (a > 55 && aff(me, npc) > 30) return { text: pick(['Я… я давно надеял' + g(npc, 'ся', 'ась') + ', что ты спросишь. Да! 💕', 'Да! Конечно да!']), delta: 15, ok: true };
      return { text: pick(['Ой… мне нужно подумать. Давай пока просто общаться.', 'Мы же почти не знаем друг друга!']), delta: -2 };
    }
    case 'help':
      return { text: pick(['Спасибо огромное, выручил' + g(me, '', 'а') + '!', 'Ты настоящий друг!']), delta: 12, ok: true };
    case 'bye':
    default:
      return { text: pick(['Пока!', 'Ещё увидимся!', 'Счастливо!', 'Бывай!']), delta: 0 };
  }
}
