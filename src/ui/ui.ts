// Интерфейс: панели управления, показатели, лента новостей, карточки.
import type { Sim } from '../sim/sim';
import { Params, WEEKDAYS, fmtTime } from '../sim/params';
import { WEATHERS, SEASON_NAMES, Season } from '../sim/content/weather';
import { NEEDS, NEED_NAMES } from '../sim/content/activities';
import { displayName, jobName, Citizen } from '../sim/citizen';
import { isOpen, DISTRICT_NAMES } from '../sim/world';
import { VEHICLE_INFO } from '../sim/transport';
import { EVENTS, EventCat } from '../sim/events';
import { sparkline } from './charts';

export type Selection = { kind: 'citizen' | 'building' | 'vehicle'; id: number } | null;

export interface UIHooks {
  focus: (x: number, z: number) => void;
  select: (s: Selection) => void;
  follow: (on: boolean) => void;
  regenerate: () => void;
  skipTo: (hour: number) => void;
  play: (id?: number) => void;
  fullscreen: () => void;
  canFullscreen: () => boolean;
  quality: (q: Params['quality']) => void;
  graphics: () => void;
  sound: () => void;
  click: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const SPEEDS: [string, number][] = [['⏸', 0], ['×30', 0.5], ['×60', 1], ['×300', 5], ['×1200', 20], ['×3600', 60]];
const ACT_COLORS = { sleeping: '#6c7bd8', working: '#ffb86b', travelling: '#7dd3fc', leisure: '#7ee08a', home: '#c39bd3' };
const MODE_COLORS = { walk: '#7ee08a', bike: '#ffd166', car: '#ff7b7b', bus: '#7dd3fc', taxi: '#f4d35e' };
const MODE_NAMES = { walk: 'пешком', bike: 'велосипед', car: 'машина', bus: 'автобус', taxi: 'такси' };

export class UI {
  selection: Selection = null;
  following = false;
  private top!: HTMLElement;
  private controls!: HTMLElement;
  private stats!: HTMLElement;
  private news!: HTMLElement;
  private inspector!: HTMLElement;
  tooltip!: HTMLElement;
  label!: HTMLElement;
  skipping!: HTMLElement;
  private lastNews = -1;
  private bindings: (() => void)[] = [];
  private speedBtns: HTMLButtonElement[] = [];
  private weatherChips = new Map<string, HTMLElement>();
  private seasonChips = new Map<string, HTMLElement>();

  constructor(private sim: Sim, private hooks: UIHooks) {
    this.build();
  }

  get p(): Params { return this.sim.params; }

  private build() {
    const app = document.getElementById('app')!;
    this.top = el('div', { id: 'topbar', class: 'panel' });
    this.controls = el('div', { id: 'controls', class: 'panel' });
    this.stats = el('div', { id: 'stats', class: 'panel' });
    this.news = el('div', { id: 'news', class: 'panel' });
    this.inspector = el('div', { id: 'inspector', class: 'panel' });
    this.tooltip = el('div', { id: 'tooltip' });
    this.label = el('div', { id: 'label' });
    this.skipping = el('div', { id: 'skipping', class: 'panel' }, '⏩ перематываем время…');
    const bl = el('button', { class: 'collapse-btn', style: 'left:12px' }, '☰');
    const br = el('button', { class: 'collapse-btn', style: 'right:12px' }, '📊');
    bl.onclick = () => { this.hooks.click(); this.stats.classList.remove('open'); this.controls.classList.toggle('open'); };
    br.onclick = () => { this.hooks.click(); this.controls.classList.remove('open'); this.stats.classList.toggle('open'); };
    app.append(this.top, this.controls, this.stats, this.news, this.inspector, this.tooltip, this.label, this.skipping, bl, br);
    this.buildTop();
    this.buildControls();
    this.buildStats();
    this.news.innerHTML = '<h4>📰 Новости города <span class="news-more">▴</span></h4><div class="list"></div>';
    this.news.querySelector('h4')!.addEventListener('click', () => this.news.classList.toggle('expanded'));
  }

  private buildTop() {
    this.top.innerHTML = `<span class="brand">🏙️ Городок</span><span class="sep"></span>
      <div><div class="clock" id="tb-clock">06:30</div></div><div class="day" id="tb-day"></div><span class="sep"></span>
      <div class="weather" id="tb-weather"></div><span class="sep"></span><div class="speeds" id="tb-speeds"></div>
      <div class="tb-tools"><button id="tb-play" title="Играть за жителя">🎮</button><button id="tb-sound" title="Звук">🔊</button><button id="tb-fs" title="Полный экран">⛶</button></div>`;
    this.q<HTMLButtonElement>('#tb-play', this.top).onclick = () => { this.hooks.click(); this.hooks.play(this.selection?.kind === 'citizen' ? this.selection.id : undefined); };
    this.q<HTMLButtonElement>('#tb-sound', this.top).onclick = () => { this.p.muted = !this.p.muted; this.hooks.sound(); this.syncAll(); this.hooks.click(); };
    const fs = this.q<HTMLButtonElement>('#tb-fs', this.top);
    fs.onclick = () => { this.hooks.click(); this.hooks.fullscreen(); };
    if (!this.hooks.canFullscreen()) fs.hidden = true;
    const sp = this.top.querySelector('#tb-speeds')!;
    for (const [label, v] of SPEEDS) {
      const b = el('button', { title: v ? `${v * 60} игровых секунд за секунду` : 'пауза' }, label);
      b.onclick = () => {
        this.hooks.click();
        if (v === 0) this.p.paused = !this.p.paused;
        else { this.p.paused = false; this.p.timeSpeed = v; }
        this.refreshSpeeds();
      };
      sp.append(b);
      this.speedBtns.push(b);
    }
    this.refreshSpeeds();
  }

  refreshSpeeds() {
    this.speedBtns.forEach((b, i) => {
      const v = SPEEDS[i][1];
      b.classList.toggle('on', v === 0 ? this.p.paused : !this.p.paused && Math.abs(this.p.timeSpeed - v) < 1e-6);
    });
  }

  private section(title: string, open = false): HTMLElement {
    const d = el('details', { class: 'sec' });
    if (open) d.open = true;
    d.append(el('summary', {}, title));
    const body = el('div', { class: 'sec-body' });
    d.append(body);
    this.controls.append(d);
    return body;
  }

  private slider(parent: HTMLElement, label: string, key: keyof Params, min: number, max: number, step: number, fmt: (v: number) => string, onChange?: (v: number) => void, hint?: string) {
    const row = el('div', { class: 'row' });
    const lbl = el('div', { class: 'lbl' }, `<span>${label}</span><b></b>`);
    const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    const b = lbl.querySelector('b')!;
    const sync = () => { input.value = String(this.p[key] as number); b.textContent = fmt(this.p[key] as number); };
    input.oninput = () => {
      (this.p as unknown as Record<string, number>)[key] = parseFloat(input.value);
      b.textContent = fmt(this.p[key] as number);
      onChange?.(parseFloat(input.value));
    };
    row.append(lbl, input);
    if (hint) row.append(el('div', { class: 'hint' }, hint));
    parent.append(row);
    this.bindings.push(sync);
    sync();
  }

  private toggle(parent: HTMLElement, label: string, key: keyof Params, onChange?: (v: boolean) => void) {
    const t = el('label', { class: 'toggle' }, `<span>${label}</span>`);
    const input = el('input', { type: 'checkbox' });
    input.onchange = () => { (this.p as unknown as Record<string, boolean>)[key] = input.checked; onChange?.(input.checked); };
    t.append(input);
    parent.append(t);
    this.bindings.push(() => (input.checked = this.p[key] as boolean));
    input.checked = this.p[key] as boolean;
  }

  private buildControls() {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const x = (v: number) => `×${v.toFixed(2)}`;
    const rub = (v: number) => `${v.toFixed(1)}₽`;

    // время
    const t = this.section('⏱ Время', true);
    const jumps = el('div', { class: 'chips' });
    for (const [label, h] of [['🌅 утро', 7], ['☀️ полдень', 12], ['🌆 вечер', 18.5], ['🌙 ночь', 23]] as [string, number][]) {
      const c = el('span', { class: 'chip' }, label);
      c.onclick = () => this.hooks.skipTo(h);
      jumps.append(c);
    }
    t.append(el('div', { class: 'hint' }, 'Перемотать к:'), jumps);
    this.slider(t, 'Скорость времени', 'timeSpeed', 0.25, 60, 0.25, (v) => `×${Math.round(v * 60)}`, () => this.refreshSpeeds());

    // погода
    const w = this.section('🌦 Погода и сезон', true);
    this.toggle(w, 'Погода меняется сама', 'weatherAuto');
    const wc = el('div', { class: 'chips' });
    for (const wd of WEATHERS) {
      const c = el('span', { class: 'chip', title: wd.name }, `${wd.emoji} ${wd.name}`);
      c.onclick = () => { this.p.weatherAuto = false; this.p.weather = wd.id; this.sim.weather.set(wd.id); this.syncAll(); };
      wc.append(c);
      this.weatherChips.set(wd.id, c);
    }
    w.append(wc);
    this.slider(w, 'Температура (поправка)', 'tempOffset', -20, 20, 1, (v) => `${v > 0 ? '+' : ''}${v}°`);
    const sc = el('div', { class: 'chips' });
    for (const s of ['spring', 'summer', 'autumn', 'winter'] as Season[]) {
      const em = { spring: '🌸', summer: '🌞', autumn: '🍂', winter: '❄️' }[s];
      const c = el('span', { class: 'chip' }, `${em} ${SEASON_NAMES[s]}`);
      c.onclick = () => { this.p.season = s; if (s === 'winter' && this.p.weatherAuto) { this.p.weather = 'snow'; this.sim.weather.set('snow'); } this.syncAll(); };
      sc.append(c);
      this.seasonChips.set(s, c);
    }
    w.append(sc);
    this.toggle(w, 'Сезоны сменяются каждую неделю', 'seasonAuto');
    const snowBtn = el('button', { class: 'btn ghost' }, '☃️ Насыпать снега');
    snowBtn.onclick = () => { this.sim.weather.snowCover = 1; if (this.sim.weather.temp > 0) this.p.tempOffset = Math.min(this.p.tempOffset, -8); this.syncAll(); };
    w.append(snowBtn);

    // население
    const pop = this.section('👥 Население');
    this.slider(pop, 'Жителей', 'population', 100, 900, 10, (v) => String(v), undefined, 'Применяется кнопкой ниже — город заселяется заново.');
    const regen = el('button', { class: 'btn' }, '🔄 Заселить заново');
    regen.onclick = () => this.hooks.regenerate();
    pop.append(regen);
    this.slider(pop, 'Своя машина', 'carOwnership', 0, 1, 0.01, pct, undefined, 'Доля семей с автомобилем (при заселении).');
    this.slider(pop, 'Велосипеды', 'bikeOwnership', 0, 1, 0.01, pct);
    this.slider(pop, 'Собаки', 'dogOwnership', 0, 1, 0.01, pct);

    // транспорт
    const tr = this.section('🚌 Транспорт');
    this.slider(tr, 'Автобусов на маршрут', 'busCount', 0, 10, 1, (v) => String(v));
    this.slider(tr, 'Цена билета', 'ticketPrice', 0, 20, 0.5, rub, undefined, 'Дорогой билет — люди пересаживаются на машины и такси.');
    this.slider(tr, 'Цена бензина', 'fuelPrice', 0, 25, 0.5, rub, undefined, 'Дешёвый бензин — больше машин и пробок.');
    this.slider(tr, 'Тарифы такси', 'taxiPrice', 0.2, 4, 0.1, x);
    this.slider(tr, 'Ограничение скорости', 'speedLimit', 0.4, 1.6, 0.05, x);
    this.slider(tr, 'Зелёный свет светофора', 'lightCycle', 0.4, 5, 0.1, (v) => `${(v * 60).toFixed(0)} с`);
    this.slider(tr, 'Транзитный трафик', 'throughTraffic', 0, 2.5, 0.05, x);

    // экономика
    const ec = this.section('💰 Экономика');
    this.slider(ec, 'Уровень зарплат', 'wageLevel', 0.2, 3, 0.05, x);
    this.slider(ec, 'Уровень цен', 'priceLevel', 0.3, 3, 0.05, x, undefined, 'Цены в кафе, магазинах, такси. Дорого — люди сидят дома.');
    this.slider(ec, 'Аренда жилья', 'rent', 0, 3, 0.05, x);
    this.slider(ec, 'Цель по безработице', 'unemployment', 0, 0.6, 0.01, pct, undefined, 'Каждое утро рабочего дня кого-то нанимают или увольняют.');

    // симуляция
    const si = this.section('⚙️ Симуляция');
    const x2 = (v: number) => (v === 0 ? 'выкл' : `×${v.toFixed(1)}`);
    this.slider(si, '👶 Рождаемость', 'birthRate', 0, 5, 0.1, x2, undefined, 'Пары рожают детей; малыши растут: садик → школа → вуз или работа.');
    this.slider(si, '📅 Один «год» длится', 'yearDays', 5, 120, 1, (v) => `${v} дн.`, undefined, 'Как часто дни рождения — и как быстро взрослеют дети.');
    this.slider(si, '🧳 Переезды в город и из города', 'migration', 0, 5, 0.1, x2);
    this.slider(si, '💘 Влюблённости', 'loveRate', 0, 5, 0.1, x2);
    this.slider(si, '🗣️ Общительность горожан', 'sociability', 0.3, 3, 0.05, x, undefined, 'Выше — чаще гуляют, ходят в кафе и в гости; ниже — сидят дома.');
    this.slider(si, '⏰ Шанс проспать будильник', 'oversleep', 0, 4, 0.1, x2);
    this.slider(si, '💥 Аварийность на дорогах', 'accidentRate', 0, 5, 0.1, x2);
    this.slider(si, '🔥 Пожары', 'fireRate', 0, 5, 0.1, x2);
    this.slider(si, '🤒 Заболеваемость', 'sickness', 0, 4, 0.1, x2);

    // события
    const ev = this.section('🎲 События', true);
    this.toggle(ev, 'Случайные события', 'eventsAuto');
    this.slider(ev, 'Частота событий', 'eventRate', 0, 5, 0.1, x);
    const cats: EventCat[] = ['праздник', 'происшествие', 'транспорт', 'экономика', 'люди', 'природа'];
    const catNames: Record<EventCat, string> = { праздник: '🎉 Праздники', происшествие: '🚨 Происшествия', транспорт: '🚦 Транспорт', экономика: '💹 Экономика', люди: '🧑‍🤝‍🧑 Люди', природа: '🌿 Природа' };
    for (const cat of cats) {
      const list = EVENTS.filter((e) => e.cat === cat && e.manual);
      if (!list.length) continue;
      ev.append(el('div', { class: 'evcat' }, catNames[cat]));
      const chips = el('div', { class: 'chips' });
      for (const e of list) {
        const c = el('span', { class: 'chip', title: e.name }, `${e.emoji} ${e.name}`);
        c.onclick = () => { this.sim.events.trigger(e.id, true); this.renderNews(true); };
        chips.append(c);
      }
      ev.append(chips);
    }

    // вид
    const v = this.section('👁 Вид');
    this.toggle(v, 'Подписи над выбранным', 'labels');
    this.toggle(v, 'Тепловая карта пробок', 'heatmap');
    this.toggle(v, 'Маршруты автобусов', 'showRoutes');
    const gr = this.section('🖥 Графика');
    gr.append(el('div', { class: 'hint' }, 'Готовые наборы (на телефоне — среднее или низкое):'));
    const qc = el('div', { class: 'chips' });
    for (const [q, name] of [['low', '🔋 низкое'], ['medium', '⚖️ среднее'], ['high', '✨ высокое']] as const) {
      const c = el('span', { class: 'chip' }, name);
      c.onclick = () => { this.hooks.click(); this.hooks.quality(q); this.syncAll(); };
      qc.append(c);
      this.bindings.push(() => c.classList.toggle('on', this.p.quality === q));
    }
    gr.append(qc);
    const g = () => this.hooks.graphics();
    this.slider(gr, 'Разрешение', 'renderScale', 0.4, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`, g, 'Ниже — быстрее и меньше греется телефон.');
    this.toggle(gr, 'Тени', 'shadows', g);
    const sr = el('div', { class: 'chips' });
    for (const [r, name] of [['low', 'тени: мягкие (быстрее)'], ['high', 'тени: чёткие']] as const) {
      const c = el('span', { class: 'chip' }, name);
      c.onclick = () => { this.hooks.click(); this.p.shadowRes = r; g(); this.syncAll(); };
      sr.append(c);
      this.bindings.push(() => c.classList.toggle('on', this.p.shadowRes === r));
    }
    gr.append(sr);
    this.slider(gr, 'Дождь, снег и облака', 'precipDensity', 0.1, 1, 0.05, (v) => `${Math.round(v * 100)}%`, g);
    this.slider(gr, 'Дальность видимости', 'drawDistance', 0.4, 1.6, 0.05, x, g);
    this.slider(gr, 'Людей на экране, максимум', 'maxVisible', 100, 1400, 50, (v) => String(v), g);
    const fl = el('div', { class: 'chips' });
    for (const [f, name] of [[30, '30 кадров/с (экономно)'], [60, '60'], [0, 'без ограничения']] as const) {
      const c = el('span', { class: 'chip' }, name);
      c.onclick = () => { this.hooks.click(); this.p.fpsLimit = f; g(); this.syncAll(); };
      fl.append(c);
      this.bindings.push(() => c.classList.toggle('on', this.p.fpsLimit === f));
    }
    gr.append(el('div', { class: 'hint' }, 'Частота кадров:'), fl);
    this.toggle(gr, 'Деревья качаются на ветру', 'treeSway', g);
    this.toggle(gr, 'Показывать FPS', 'showFps', g);

    const snd = this.section('🔊 Звук');
    this.toggle(snd, 'Без звука', 'muted', () => this.hooks.sound());
    this.slider(snd, 'Общая громкость', 'volume', 0, 1, 0.01, (x) => `${Math.round(x * 100)}%`, () => this.hooks.sound());
    this.slider(snd, 'Город и погода', 'ambVolume', 0, 1, 0.01, (x) => `${Math.round(x * 100)}%`, () => this.hooks.sound());
    this.slider(snd, 'Эффекты', 'fxVolume', 0, 1, 0.01, (x) => `${Math.round(x * 100)}%`, () => this.hooks.sound());
    snd.append(el('div', { class: 'hint' }, 'Все звуки синтезируются прямо в браузере: дождь, ветер, гром, птицы, сирены, колокол, шаги. Звук включается после первого касания.'));
    v.append(el('div', { class: 'hint' }, 'Телефон: один палец — двигать карту, два — крутить и приближать. Мышь: левая — вращать, правая — двигать, колесо — зум. WASD/стрелки — двигаться. Клик по человеку, машине или зданию — подробности.'));
  }

  syncAll() {
    for (const b of this.bindings) b();
    const sb = this.top.querySelector('#tb-sound');
    if (sb) sb.textContent = this.p.muted ? '🔇' : '🔊';
    for (const [id, c] of this.weatherChips) c.classList.toggle('on', this.sim.weather.def.id === id);
    for (const [id, c] of this.seasonChips) c.classList.toggle('on', this.p.season === id);
    this.refreshSpeeds();
  }

  private buildStats() {
    this.stats.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="v" id="k-pop"></div><div class="k">жителей</div></div>
        <div class="kpi"><div class="v" id="k-mood"></div><div class="k">настроение</div></div>
        <div class="kpi"><div class="v" id="k-money"></div><div class="k">средний бюджет</div></div>
        <div class="kpi"><div class="v" id="k-trip"></div><div class="k">дорога на работу</div></div>
        <div class="kpi"><div class="v" id="k-unemp"></div><div class="k">безработных</div></div>
        <div class="kpi"><div class="v" id="k-sick"></div><div class="k">болеют</div></div>
      </div>
      <div class="stat-title"><span>Чем заняты люди</span></div>
      <div class="bar" id="b-act"></div><div class="legend" id="l-act"></div>
      <div class="stat-title"><span>Как добираются (за последние часы)</span></div>
      <div class="bar" id="b-mode"></div><div class="legend" id="l-mode"></div>
      <div class="stat-title"><span>Пробки</span><b id="t-cong"></b></div>
      <div class="meter"><div id="m-cong"></div></div>
      <div class="stat-title"><span>Загрузка автобусов</span><b id="t-bus"></b></div>
      <div class="meter"><div id="m-bus"></div></div>
      <div class="stat-title"><span>Загрязнение воздуха</span><b id="t-poll"></b></div>
      <div class="meter"><div id="m-poll"></div></div>
      <div class="stat-title"><span>Настроение за сутки</span></div><canvas class="spark" id="c-mood"></canvas>
      <div class="stat-title"><span>В пути за сутки</span></div><canvas class="spark" id="c-trav"></canvas>
      <div class="stat-title"><span>Машин на дорогах</span></div><canvas class="spark" id="c-cars"></canvas>
      <div class="stat-title"><span>Сейчас в городе</span></div><div id="active-ev"></div>
      <div class="stat-title"><span>Экономика дня</span></div><div class="kv" id="econ"></div>`;
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string, root: HTMLElement = document.body) {
    return root.querySelector(sel) as T;
  }

  update() {
    const sim = this.sim;
    const c = sim.clock;
    this.q('#tb-clock').textContent = fmtTime(c.total);
    this.q('#tb-day').innerHTML = `${WEEKDAYS[c.weekday]}<br>день ${c.day + 1} · ${SEASON_NAMES[sim.params.season]}`;
    const t = Math.round(sim.weather.temp);
    const [sr, ss] = sim.weather.sunTimes();
    const isNight = c.hour < sr || c.hour > ss;
    const em = isNight && sim.weather.def.id === 'clear' ? '🌙' : isNight && sim.weather.def.id === 'partly' ? '☁️' : sim.weather.def.emoji;
    this.q('#tb-weather').innerHTML = `<span class="em">${em}</span><span>${sim.weather.def.name}<br><b>${t > 0 ? '+' : ''}${t}°C</b>${sim.weather.snowCover > 0.2 ? ' · сугробы' : sim.weather.wetness > 0.4 ? ' · лужи' : ''}</span>`;
    for (const [id, ch] of this.weatherChips) ch.classList.toggle('on', sim.weather.def.id === id);
    for (const [id, ch] of this.seasonChips) ch.classList.toggle('on', this.p.season === id);

    const s = sim.stats.current;
    const alive = sim.citizens.filter((x) => x.alive).length;
    this.q('#k-pop').textContent = String(alive);
    this.q('#k-mood').textContent = `${Math.round(s.mood)}%`;
    this.q('#k-mood').style.color = s.mood > 65 ? 'var(--good)' : s.mood < 45 ? 'var(--bad)' : '';
    this.q('#k-money').textContent = `${Math.round(s.money)}₽`;
    this.q('#k-trip').textContent = `${Math.round(sim.stats.avgTrip)} мин`;
    this.q('#k-unemp').textContent = String(s.unemployed);
    this.q('#k-sick').textContent = String(s.sick);
    const total = Math.max(1, s.sleeping + s.working + s.travelling + s.leisure + s.home);
    const act = { sleeping: s.sleeping, working: s.working, travelling: s.travelling, leisure: s.leisure, home: s.home };
    const actNames = { sleeping: 'спят', working: 'работа/учёба', travelling: 'в пути', leisure: 'досуг', home: 'дома' };
    this.q('#b-act').innerHTML = Object.entries(act).map(([k, v]) => `<div style="width:${(v / total) * 100}%;background:${ACT_COLORS[k as keyof typeof ACT_COLORS]}"></div>`).join('');
    this.q('#l-act').innerHTML = Object.entries(act).map(([k, v]) => `<span><i style="background:${ACT_COLORS[k as keyof typeof ACT_COLORS]}"></i>${actNames[k as keyof typeof actNames]} ${v}</span>`).join('');
    const mt = sim.stats.modeTrips;
    const mtot = Math.max(0.001, Object.values(mt).reduce((a, b) => a + b, 0));
    this.q('#b-mode').innerHTML = Object.entries(mt).map(([k, v]) => `<div style="width:${(v / mtot) * 100}%;background:${MODE_COLORS[k as keyof typeof MODE_COLORS]}"></div>`).join('');
    this.q('#l-mode').innerHTML = Object.entries(mt).map(([k, v]) => `<span><i style="background:${MODE_COLORS[k as keyof typeof MODE_COLORS]}"></i>${MODE_NAMES[k as keyof typeof MODE_NAMES]} ${Math.round((v / mtot) * 100)}%</span>`).join('');
    const meter = (id: string, tid: string, v: number, txt: string) => {
      const m = this.q(id);
      m.style.width = `${Math.min(100, v * 100)}%`;
      m.style.background = v > 0.6 ? 'var(--bad)' : v > 0.3 ? 'var(--accent)' : 'var(--good)';
      this.q(tid).textContent = txt;
    };
    meter('#m-cong', '#t-cong', s.congestion, `${Math.round(s.congestion * 100)}% · ${s.cars} машин`);
    meter('#m-bus', '#t-bus', s.busLoad, `${Math.round(s.busLoad * 100)}% · ждут ${s.waiting}`);
    meter('#m-poll', '#t-poll', s.pollution / 100, `${Math.round(s.pollution)}`);
    const h = sim.stats.history;
    sparkline(this.q('#c-mood'), h.map((x) => x.mood), '#7ee08a', 0, 100);
    sparkline(this.q('#c-trav'), h.map((x) => x.travelling), '#7dd3fc');
    sparkline(this.q('#c-cars'), h.map((x) => x.cars), '#ff7b7b');
    const evs = sim.events.active.filter((e) => e.id > 0 && e.end - e.start > 3);
    const ae = this.q('#active-ev');
    ae.innerHTML = evs.length ? evs.map((e) => `<div class="active-ev" data-x="${e.focus?.x ?? ''}" data-z="${e.focus?.z ?? ''}">${e.def.emoji} ${esc(e.title)}<span class="t">до ${fmtTime(e.end)}</span></div>`).join('') : '<div class="hint">Всё спокойно.</div>';
    ae.querySelectorAll<HTMLElement>('.active-ev').forEach((d) => (d.onclick = () => { if (d.dataset.x) this.hooks.focus(parseFloat(d.dataset.x), parseFloat(d.dataset.z!)); }));
    this.q('#econ').innerHTML = `<span>заработано вчера</span><span>${Math.round(sim.stats.earnedToday)}₽</span><span>потрачено вчера</span><span>${Math.round(sim.stats.spentToday)}₽</span><span>сегодня заработано</span><span>${Math.round(sim.stats.earned)}₽</span><span>опозданий сегодня</span><span>${sim.stats.lateArrivals}</span><span>родилось детей</span><span>${sim.stats.births}</span><span>уехало жителей</span><span>${sim.stats.departures}</span><span>детей до 7 лет</span><span>${sim.citizens.filter((c) => c.alive && c.age < 7).length}</span>`;
    this.renderNews();
    this.renderInspector();
  }

  renderNews(force = false) {
    const items = this.sim.news.items;
    if (!force && items.length && items[0].id === this.lastNews) return;
    this.lastNews = items[0]?.id ?? -1;
    const list = this.news.querySelector('.list')!;
    list.innerHTML = items.slice(0, 40).map((n) => `<div class="news-item" data-id="${n.id}"><span class="tm">${fmtTime(n.time)}</span><span>${n.emoji} ${esc(n.text)}</span></div>`).join('');
    list.querySelectorAll<HTMLElement>('.news-item').forEach((d) => {
      d.onclick = () => {
        const n = items.find((x) => x.id === Number(d.dataset.id));
        if (!n) return;
        if (n.citizen !== undefined) { this.hooks.select({ kind: 'citizen', id: n.citizen }); this.hooks.follow(true); }
        else if (n.focus) this.hooks.focus(n.focus.x, n.focus.z);
      };
    });
  }

  show(sel: Selection) {
    this.selection = sel;
    this.inspector.classList.toggle('show', !!sel);
    this.renderInspector();
  }

  private renderInspector() {
    const sel = this.selection;
    if (!sel) return;
    const sim = this.sim;
    if (sel.kind === 'citizen') this.renderCitizen(sim.citizens[sel.id]);
    else if (sel.kind === 'building') this.renderBuilding(sel.id);
    else this.renderVehicle(sel.id);
    this.inspector.querySelector<HTMLElement>('.close')!.onclick = () => this.hooks.select(null);
    this.inspector.querySelectorAll<HTMLElement>('[data-cit]').forEach((e) => (e.onclick = () => this.hooks.select({ kind: 'citizen', id: Number(e.dataset.cit) })));
    this.inspector.querySelectorAll<HTMLElement>('[data-bld]').forEach((e) => (e.onclick = () => this.hooks.select({ kind: 'building', id: Number(e.dataset.bld) })));
    const pb = this.inspector.querySelector<HTMLElement>('.play-as');
    if (pb && sel.kind === 'citizen') pb.onclick = () => { this.hooks.click(); this.hooks.play(sel.id); };
    const fb = this.inspector.querySelector<HTMLElement>('.follow');
    if (fb) fb.onclick = () => this.hooks.follow(!this.following);
  }

  private bLink(id: number) {
    const b = this.sim.world.buildings[id];
    return b ? `<span class="link" data-bld="${id}">${esc(b.name)}</span>` : '—';
  }
  private cLink(id: number) {
    const c = this.sim.citizens[id];
    return c ? `<span class="link" data-cit="${id}">${esc(c.first)}</span>` : '';
  }

  private renderCitizen(c: Citizen) {
    if (!c) return;
    const sim = this.sim;
    const age = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'год' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'года' : 'лет'}`;
    let now = '';
    if (c.trip) {
      const dest = sim.world.buildings[c.trip.dest];
      const st: Record<string, string> = { walk: 'идёт пешком', bike: 'едет на велосипеде', toStop: 'идёт к остановке', wait: 'ждёт автобус', ride: 'едет в автобусе', fromStop: 'идёт от остановки', drive: c.trip.mode === 'taxi' ? 'едет на такси' : 'едет на машине', waitTaxi: 'ждёт такси' };
      now = `🚶 ${st[c.trip.stage] ?? 'в пути'} → ${this.bLink(dest.id)}<br><span class="hint">цель: ${c.trip.act.emoji} ${c.trip.act.label}</span>`;
    } else if (c.act) {
      const where = c.at >= 0 ? this.bLink(c.at) : '';
      const label = c.act.id === 'work' && c.remoteToday && c.at === c.home ? 'работает из дома' : c.act.label;
      now = `${c.act.emoji} ${label}${c.at !== c.home ? ` · ${where}` : ' · дома'}<br><span class="hint">до ${fmtTime(c.actEnd)}</span>`;
    }
    const needs = NEEDS.map((n) => {
      const v = c.needs[n];
      return `<span>${NEED_NAMES[n]}</span><div class="meter"><div style="width:${v}%;background:${v > 60 ? 'var(--good)' : v > 30 ? 'var(--accent)' : 'var(--bad)'}"></div></div><span>${Math.round(v)}</span>`;
    }).join('');
    const fam = [
      c.partner >= 0 ? `💞 ${this.cLink(c.partner)}` : '',
      c.children.length ? `👶 ${c.children.map((k) => this.cLink(k)).join(', ')}` : '',
      c.household.filter((x) => x !== c.partner && !c.children.includes(x)).length ? `🏠 ${c.household.filter((x) => x !== c.partner && !c.children.includes(x)).map((k) => this.cLink(k)).join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    const transport = [c.hasCar ? `🚗${c.carBroken ? ' (сломана)' : ''}` : '', c.hasBike ? '🚲' : '', c.hasDog ? `🐕 ${c.dogName}${c.dogLost ? ' (потерялся!)' : ''}` : ''].filter(Boolean).join(' ');
    const avatar = c.age < 7 ? '🧒' : c.age < 18 ? (c.female ? '👧' : '👦') : c.age > 64 ? (c.female ? '👵' : '👴') : c.female ? '👩' : '👨';
    this.inspector.innerHTML = `
      <div class="head"><div class="avatar" style="background:#${c.look.shirt.toString(16).padStart(6, '0')}55">${avatar}</div>
        <div><h3>${esc(displayName(c))}</h3><div class="sub">${age(c.age)} · ${jobName(c)}${c.work >= 0 ? ` · ${this.bLink(c.work)}` : ''}</div></div>
        <button class="close">✕</button></div>
      <div class="now">${now}</div>
      <div class="chips">${c.traits.map((t) => `<span class="chip small">${t.emoji} ${t.name}</span>`).join('')}${c.sick > 0 ? '<span class="chip small">🤒 болеет</span>' : ''}</div>
      <div class="kv"><span>настроение</span><span>${Math.round(c.mood)}% ${c.mood > 70 ? '😊' : c.mood > 45 ? '😐' : '😞'}</span><span>деньги</span><span>${Math.round(c.money)}₽</span>
        <span>дом</span><span>${this.bLink(c.home)}</span><span>режим</span><span>подъём ${fmtTime(c.wake * 60)}, отбой ${fmtTime(c.bed * 60)}</span>
        ${transport ? `<span>есть</span><span>${transport}</span>` : ''}${fam ? `<span>семья</span><span>${fam}</span>` : ''}
        ${c.friends.length ? `<span>друзья</span><span>${c.friends.slice(0, 6).map((f) => this.cLink(f)).join(', ')}</span>` : ''}</div>
      <div class="stat-title"><span>Потребности</span></div><div class="needs">${needs}</div>
      <div style="margin-top:10px;display:flex;gap:6px"><button class="btn follow">${this.following ? '⏹ Перестать следить' : '🎥 Следить'}</button><button class="btn play-as">🎮 Играть за ${esc(c.first)}</button></div>
      <div class="stat-title"><span>Дневник</span></div>
      <div class="diary">${c.diary.slice(0, 18).map((d) => `<div><span class="tm">${fmtTime(d.t)}</span><span>${esc(d.text)}</span></div>`).join('') || '<div class="hint">пока пусто</div>'}</div>`;
  }

  private renderBuilding(id: number) {
    const sim = this.sim;
    const b = sim.world.buildings[id];
    const open = isOpen(b, sim.clock.hour, sim.clock.weekday);
    const hours = b.def.open ? `${String(b.def.open[0]).padStart(2, '0')}:00–${String(b.def.open[1] % 24).padStart(2, '0')}:00` : 'круглосуточно';
    const inside = [...b.inside].map((i) => sim.citizens[i]).filter(Boolean);
    const status = b.onFire > 0 ? '🔥 горит!' : b.powerOut ? '🔌 нет света' : b.closedReason ? `⛔ закрыто (${b.closedReason})` : open ? '🟢 открыто' : '🔴 закрыто';
    const people = inside.slice(0, 14).map((c) => `<span class="link" data-cit="${c.id}">${esc(c.first)}</span>`).join(', ');
    const res = b.residents.slice(0, 16).map((i) => this.cLink(i)).join(', ');
    const work = b.workers.slice(0, 16).map((i) => this.cLink(i)).join(', ');
    this.inspector.innerHTML = `
      <div class="head"><div class="avatar" style="background:rgba(255,255,255,.08)">${emojiFor(b.type)}</div>
        <div><h3>${esc(b.name)}</h3><div class="sub">${b.def.name}${b.floors ? ` · ${b.floors} эт.` : ''} · р-н ${DISTRICT_NAMES[b.district]}</div></div><button class="close">✕</button></div>
      <div class="now">${status} · ${hours}${b.attraction > 1.2 ? ' · 🔥 популярно' : ''}${b.priceMul < 1 ? ' · скидки' : ''}${b.type === 'construction' ? ` · готовность ${Math.round(b.growth * 100)}%` : ''}</div>
      <div class="kv"><span>внутри</span><span>${inside.length}${b.def.capacity ? ` / ${b.def.capacity}` : ''}</span>
        ${b.residents.length ? `<span>жильцы (${b.residents.length})</span><span>${res}${b.residents.length > 16 ? '…' : ''}</span>` : ''}
        ${b.workers.length ? `<span>работают (${b.workers.length})</span><span>${work}${b.workers.length > 16 ? '…' : ''}</span>` : ''}
        ${inside.length ? `<span>сейчас здесь</span><span>${people}${inside.length > 14 ? '…' : ''}</span>` : ''}</div>`;
  }

  private renderVehicle(id: number) {
    const sim = this.sim;
    const v = sim.transport.vehicles.find((x) => x.id === id && !x.done);
    if (!v) { this.inspector.innerHTML = '<div class="head"><h3>Машина уехала</h3><button class="close">✕</button></div>'; return; }
    const owner = v.owner >= 0 ? sim.citizens[v.owner] : null;
    const roles: Record<string, string> = { citizen: 'личная машина', taxi: 'такси', bus: 'автобус', through: 'транзит / гости города', service: 'служебная', emergency: 'экстренная служба', wedding: 'свадебный кортеж' };
    this.inspector.innerHTML = `
      <div class="head"><div class="avatar" style="background:#${v.color.toString(16).padStart(6, '0')}55">${v.type === 'bus' ? '🚌' : v.emergency ? '🚨' : v.type === 'taxi' ? '🚕' : '🚗'}</div>
        <div><h3>${esc(v.label ?? VEHICLE_INFO[v.type].name)}</h3><div class="sub">${VEHICLE_INFO[v.type].name} · ${roles[v.role]}</div></div><button class="close">✕</button></div>
      <div class="kv"><span>скорость</span><span>${Math.round(v.v * 2.2)} км/ч (условно)</span>
        ${owner ? `<span>${v.role === 'taxi' ? 'пассажир' : 'водитель'}</span><span>${this.cLink(owner.id)}</span>` : ''}
        ${v.role === 'bus' ? `<span>пассажиров</span><span>${v.passengers.length} / 32</span>` : ''}
        ${v.frozen > sim.clock.total ? '<span>статус</span><span>💥 стоит после ДТП</span>' : ''}</div>`;
  }

  showTooltip(text: string | null, x: number, y: number) {
    if (!text) { this.tooltip.style.display = 'none'; return; }
    this.tooltip.style.display = 'block';
    this.tooltip.innerHTML = text;
    this.tooltip.style.left = `${x + 14}px`;
    this.tooltip.style.top = `${y + 12}px`;
  }
}

export function emojiFor(type: string): string {
  const m: Record<string, string> = {
    panel: '🏢', khrush: '🏢', townhouse: '🏘️', house: '🏡', tower: '🏙️', dorm: '🛏️', office: '🏢', bizcenter: '🏙️', itoffice: '💻', cowork: '☕',
    cityhall: '🏛️', police: '🚓', firestation: '🚒', post: '📮', bank: '🏦', grocery: '🛒', supermarket: '🛍️', kiosk: '🏪', pharmacy: '💊', market: '🥕',
    bakery: '🥐', coffee: '☕', cafe: '🍽️', shawarma: '🌯', pizzeria: '🍕', restaurant: '🍷', bar: '🍺', club: '🪩', cinema: '🎬', library: '📚', museum: '🖼️',
    gym: '🏋️', pool: '🏊', church: '⛪', stadium: '🏟️', kindergarten: '🧸', school: '🏫', university: '🎓', hospital: '🏥', factory: '🏭', warehouse: '📦',
    autoservice: '🔧', gasstation: '⛽', depot: '🚌', construction: '🏗️', park: '🌳', square: '⛲', pond: '🦆', playground: '🛝',
  };
  return m[type] ?? '🏠';
}
