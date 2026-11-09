// Сенсорное управление жителем: джойстик, обзор, кнопки, HUD, меню занятий.
import type { Player, ActivityOption, Special } from '../game/player';
import type { Citizen } from '../sim/citizen';
import { opener, respond, DialogChoice } from '../sim/dialog';
import { aff, relWord } from '../sim/social';
import { jobName } from '../sim/citizen';
import { isOpen } from '../sim/world';
import { ACTIVITY_BY_ID } from '../sim/content/activities';
import type { Building } from '../sim/world';
import type { Sim } from '../sim/sim';
import { NEEDS, NEED_NAMES } from '../sim/content/activities';
import { fmtTime } from '../sim/params';
import { displayName } from '../sim/citizen';

export interface TouchHooks {
  exit: () => void;
  click: () => void;
  wait: (minutes: number) => void;
  photo: () => void;
  openCard: (id: number) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class TouchControls {
  root: HTMLElement;
  private zone: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private hud: HTMLElement;
  private actBtn: HTMLButtonElement;
  private runBtn: HTMLButtonElement;
  private inside: HTMLElement;
  private menu: HTMLElement;
  private toasts: HTMLElement;
  private stickId = -1;
  private stickOrigin = { x: 0, y: 0 };
  private looks = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private runLatched = false;
  private hudAt = 0;
  private menuFor: Building | null = null;
  private lastAct = '';
  private menuBtn!: HTMLButtonElement;
  private dialogEl!: HTMLElement;
  dialogOpen = false;
  private lastInside = '';

  constructor(private sim: Sim, private player: Player, private hooks: TouchHooks) {
    this.root = el('div', 'play-layer');
    this.root.hidden = true;
    this.zone = el('div', 'play-zone');
    this.stick = el('div', 'stick');
    this.knob = el('div', 'knob');
    this.stick.append(this.knob);
    this.stick.hidden = true;
    this.hud = el('div', 'play-hud');
    this.toasts = el('div', 'toasts');
    const btns = el('div', 'play-btns');
    this.runBtn = el('button', 'pbtn run', '🏃<small>бег</small>');
    this.actBtn = el('button', 'pbtn act', '✋<small>действие</small>');
    const exit = el('button', 'pbtn exit', '🎮<small>отпустить</small>');
    btns.append(this.actBtn, this.runBtn, exit);
    const tools = el('div', 'play-tools');
    const waitBtn = el('button', 'tbtn', '⏳');
    const photoBtn = el('button', 'tbtn', '📷');
    const menuBtn = el('button', 'tbtn', '📋');
    const cardBtn = el('button', 'tbtn', '📖');
    waitBtn.title = 'Подождать'; photoBtn.title = 'Снимок'; menuBtn.title = 'Все занятия здесь'; cardBtn.title = 'Моя история';
    tools.append(waitBtn, photoBtn, menuBtn, cardBtn);
    this.menuBtn = menuBtn;
    for (const b of [waitBtn, photoBtn, menuBtn, cardBtn]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    waitBtn.onclick = () => { this.hooks.click(); this.openWait(); };
    photoBtn.onclick = () => this.hooks.photo();
    menuBtn.onclick = () => { this.hooks.click(); const b = this.player.room?.building; if (b) this.openMenu(b); };
    cardBtn.onclick = () => { this.hooks.click(); if (this.player.c) this.hooks.openCard(this.player.c.id); };
    this.dialogEl = el('div', 'dialog');
    this.dialogEl.hidden = true;
    this.root.append(tools, this.dialogEl);
    this.inside = el('div', 'inside-bar');
    this.inside.hidden = true;
    this.menu = el('div', 'act-menu');
    this.menu.hidden = true;
    this.root.append(this.zone, this.stick, this.hud, btns, this.inside, this.menu);
    document.getElementById('app')!.append(this.root, this.toasts);

    // кнопки
    const stop = (e: Event) => e.stopPropagation();
    for (const b of [this.runBtn, this.actBtn, exit]) b.addEventListener('pointerdown', stop);
    this.runBtn.addEventListener('pointerdown', () => { this.player.input.run = true; this.runBtn.classList.add('on'); });
    const runUp = () => { if (!this.runLatched) { this.player.input.run = false; this.runBtn.classList.remove('on'); } };
    this.runBtn.addEventListener('pointerup', runUp);
    this.runBtn.addEventListener('pointercancel', runUp);
    this.runBtn.addEventListener('dblclick', () => { this.runLatched = !this.runLatched; this.player.input.run = this.runLatched; this.runBtn.classList.toggle('on', this.runLatched); });
    this.actBtn.addEventListener('click', () => this.doAct());
    exit.addEventListener('click', () => { this.hooks.click(); this.hooks.exit(); });

    // зоны: левая половина — джойстик, правая — обзор
    const z = this.zone;
    z.addEventListener('pointerdown', (e) => this.down(e));
    z.addEventListener('pointermove', (e) => this.move(e));
    z.addEventListener('pointerup', (e) => this.up(e));
    z.addEventListener('pointercancel', (e) => this.up(e));
    z.addEventListener('wheel', (e) => { this.player.dist = Math.max(4, Math.min(18, this.player.dist * (1 + Math.sign(e.deltaY) * 0.1))); e.preventDefault(); }, { passive: false });
    z.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  show(on: boolean) {
    this.root.hidden = !on;
    document.body.classList.toggle('play-mode', on);
    if (!on) { this.closeMenu(); this.stick.hidden = true; this.stickId = -1; this.looks.clear(); this.player.input.x = this.player.input.z = 0; }
  }

  private down(e: PointerEvent) {
    this.zone.setPointerCapture(e.pointerId);
    const leftSide = e.clientX < window.innerWidth * 0.45 && e.pointerType !== 'mouse';
    if (leftSide && this.stickId < 0) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stick.hidden = false;
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.knob.style.transform = 'translate(-50%, -50%)';
      return;
    }
    this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.looks.size === 2) this.pinchDist = this.pinch();
  }

  private pinch() {
    const p = [...this.looks.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  private move(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      const R = 56;
      let dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.player.input.x = dx / R;
      this.player.input.z = dy / R;
      return;
    }
    const prev = this.looks.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    this.looks.set(e.pointerId, cur);
    if (this.looks.size >= 2) {
      const d = this.pinch();
      if (this.pinchDist > 0) this.player.dist = Math.max(4, Math.min(18, this.player.dist * (this.pinchDist / d)));
      this.pinchDist = d;
      return;
    }
    const k = e.pointerType === 'mouse' ? 0.006 : 0.008;
    this.player.yaw -= (cur.x - prev.x) * k;
    this.player.pitch = Math.max(0.05, Math.min(1.25, this.player.pitch + (cur.y - prev.y) * k));
  }

  private up(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.stick.hidden = true;
      this.player.input.x = this.player.input.z = 0;
    }
    this.looks.delete(e.pointerId);
    this.pinchDist = 0;
  }

  doAct() {
    const p = this.player;
    if (!p.c || p.c.act) return;
    this.hooks.click();
    const b = p.act();
    if (b) this.openMenu(b);
  }

  openMenu(b: Building, list?: Special[], title?: string) {
    const p = this.player;
    const c = p.c!;
    let opts = list ? [] : p.options(b);
    const sp = p.pendingSpot;
    if (!list && sp) opts = opts.filter((o) => sp.acts.includes(o.act.id));
    const specials = list ?? (sp ? [] : p.specials(b));
    this.menuFor = b;
    this.menu.hidden = false;
    const head = title ?? (b.id === c.home ? '🏠 Дома' : b.id === c.work ? `💼 ${esc(b.name)} — твоя работа` : esc(b.name));
    const actItems = opts.map((o, i) => `<button class="am-item${o.disabled ? ' off' : ''}" data-i="${i}"><span class="em">${o.act.emoji}</span><span class="tx">${esc(o.act.label)}<small>${o.disabled ? esc(o.disabled) : `~${o.dur >= 90 ? `${Math.round(o.dur / 60 * 10) / 10} ч` : `${o.dur} мин`}${o.price ? ` · ${o.price}₽` : ''}`}</small></span></button>`).join('');
    const spItems = specials.map((s, i) => `<button class="am-item special${s.disabled ? ' off' : ''}" data-s="${i}"><span class="em">${s.emoji}</span><span class="tx">${esc(s.label)}<small>${esc(s.disabled ?? s.sub)}</small></span></button>`).join('');
    this.menu.innerHTML = `<div class="am-head"><b>${head}</b><span>💰 ${Math.round(c.money)}₽</span><button class="am-close">✕</button></div>
      <div class="am-list">${actItems}${spItems}${!actItems && !spItems ? '<div class="hint">Здесь сейчас нечем заняться.</div>' : ''}</div>`;
    this.menu.querySelector<HTMLElement>('.am-close')!.onclick = () => { this.hooks.click(); this.closeMenu(); };
    this.menu.querySelectorAll<HTMLElement>('[data-i]').forEach((it) => {
      it.onclick = () => {
        const o: ActivityOption = opts[Number(it.dataset.i)];
        if (o.disabled) return;
        this.hooks.click();
        if (p.room) p.startAtSpot(sp ?? null, o);
        else p.start(b, o);
        this.closeMenu();
      };
    });
    this.menu.querySelectorAll<HTMLElement>('[data-s]').forEach((it) => {
      it.onclick = () => {
        const s = specials[Number(it.dataset.s)];
        if (s.disabled) return;
        this.hooks.click();
        if (s.submenu) { this.openMenu(b, s.submenu(), s.label); return; }
        s.run();
        this.closeMenu();
      };
    });
  }

  openWait() {
    const sim = this.sim;
    this.menu.hidden = false;
    const h = sim.clock.hour;
    const untilMorning = Math.round(((((7 - h) % 24) + 24) % 24) * 60);
    const items: [string, number][] = [['30 минут', 30], ['1 час', 60], ['3 часа', 180], [`до утра (07:00)`, untilMorning]];
    this.menu.innerHTML = `<div class="am-head"><b>⏳ Подождать</b><span>${fmtTime(sim.clock.total)}</span><button class="am-close">✕</button></div>
      <div class="am-list">${items.map(([l, m], i) => `<button class="am-item" data-w="${i}"><span class="em">⏩</span><span class="tx">${l}<small>время пролетит, город продолжит жить</small></span></button>`).join('')}</div>`;
    this.menu.querySelector<HTMLElement>('.am-close')!.onclick = () => this.closeMenu();
    this.menu.querySelectorAll<HTMLElement>('[data-w]').forEach((it) => (it.onclick = () => { this.hooks.click(); this.hooks.wait(items[Number(it.dataset.w)][1]); this.closeMenu(); }));
  }

  // ——— диалог
  openDialog(npc: Citizen) {
    const p = this.player;
    const me = p.c!;
    const sim = this.sim;
    this.dialogOpen = true;
    this.dialogEl.hidden = false;
    const used = new Set<DialogChoice>();
    let talked = 0;
    const render = (line: string) => {
      const a = aff(npc, me);
      const known = npc.rel?.[me.id] !== undefined;
      const adult = npc.age >= 18 && me.age >= 18;
      const choices: [DialogChoice, string][] = [
        ['howareyou', '🙂 Как дела?'], ['news', '📰 Что нового?'], ['compliment', '🌸 Комплимент'], ['treat', '☕ Угостить (10₽)'],
        ['invite_walk', '🌳 Позвать гулять'], ['invite_cafe', '🍰 Позвать в кафе'],
      ];
      if (adult) choices.push(['invite_bar', '🍺 Позвать в бар']);
      if (a >= 30) choices.push(['introduce', '🤝 Познакомь с друзьями']);
      if (adult && a >= 40 && npc.partner !== me.id && npc.female !== me.female) choices.push(['date', '💘 Предложить встречаться']);
      choices.push(['rude', '😠 Нагрубить'], ['bye', '👋 Пока']);
      const barW = Math.round((a + 100) / 2);
      this.dialogEl.innerHTML = `<div class="dl-head"><span class="dl-av">${npc.age < 7 ? '🧒' : npc.age < 18 ? (npc.female ? '👧' : '👦') : npc.age > 64 ? (npc.female ? '👵' : '👴') : npc.female ? '👩' : '👨'}</span>
        <div class="dl-who"><b class="dl-name">${esc(npc.first)} ${esc(npc.last)}</b><small>${npc.age} · ${esc(jobName(npc))}${npc.act ? ` · ${npc.act.emoji} ${esc(npc.act.label)}` : ''}</small>
        <div class="dl-rel"><i style="width:${barW}%;background:${a > 25 ? 'var(--good)' : a < -10 ? 'var(--bad)' : 'var(--accent)'}"></i><span>${known ? `${relWord(a)} · ${Math.round(a)}` : 'не знакомы'}</span></div></div>
        <button class="am-close dl-x">✕</button></div>
        <div class="dl-line">«${esc(line)}»</div>
        <div class="dl-choices">${choices.map(([k, l]) => `<button class="dl-c${used.has(k) && k !== 'bye' ? ' used' : ''}" data-c="${k}">${l}</button>`).join('')}</div>`;
      this.dialogEl.querySelector<HTMLElement>('.dl-x')!.onclick = () => this.closeDialog();
      this.dialogEl.querySelector<HTMLElement>('.dl-name')!.onclick = () => this.hooks.openCard(npc.id);
      this.dialogEl.querySelectorAll<HTMLElement>('[data-c]').forEach((btn) => {
        btn.onclick = () => {
          const k = btn.dataset.c as DialogChoice;
          this.hooks.click();
          if (k === 'bye') { const r = respond(sim, npc, me, k); render(r.text); setTimeout(() => this.closeDialog(), 900); return; }
          const r = respond(sim, npc, me, k);
          const repeat = used.has(k);
          used.add(k);
          const delta = repeat ? Math.min(0, r.delta) : r.delta;
          const mem: Record<string, string> = { howareyou: 'поболтали', news: 'обсудили новости', compliment: 'сделал(а) комплимент', treat: 'угостил(а)', invite_walk: 'позвал(а) гулять', invite_cafe: 'позвал(а) в кафе', invite_bar: 'позвал(а) в бар', introduce: 'познакомились ближе', rude: 'нагрубил(а)', date: 'предложил(а) встречаться', help: 'помог(ла)' };
          sim.social.add(npc, me, delta, `${me.first}: ${mem[k] ?? 'разговор'}`);
          sim.social.add(me, npc, delta * 0.6, undefined);
          if (talked < 3 && k !== 'rude') { me.needs.social = Math.min(100, me.needs.social + 8); npc.needs.social = Math.min(100, npc.needs.social + 6); talked++; }
          npc.pausedUntil = sim.clock.total + 2;
          if (k === 'treat' && r.ok) { me.money -= 10; npc.needs.hunger = Math.min(100, npc.needs.hunger + 15); npc.needs.fun = Math.min(100, npc.needs.fun + 5); }
          if (k === 'rude') { npc.mood = Math.max(0, npc.mood - 12); sim.brain.log(npc, `${me.first} нагрубил${me.female ? 'а' : ''} — неприятно`); }
          if ((k === 'invite_walk' || k === 'invite_cafe' || k === 'invite_bar') && r.ok) this.invite(npc, k);
          if (k === 'date' && r.ok) {
            if (me.partner >= 0) { const old = sim.citizens[me.partner]; if (old) old.partner = -1; }
            me.partner = npc.id; npc.partner = me.id;
            sim.brain.log(me, `теперь мы пара: ${npc.first} 💕`);
            sim.brain.log(npc, `теперь мы пара: ${me.first} 💕`);
            sim.news.push('💕', `${me.first} ${me.last} и ${npc.first} ${npc.last} теперь пара`, 'people', { citizen: me.id });
            p.hooks_heart(npc);
          }
          render(r.text);
        };
      });
    };
    render(opener(sim, npc, me));
  }

  private invite(npc: Citizen, k: DialogChoice) {
    const sim = this.sim;
    const p = this.player;
    const me = p.c!;
    const types = k === 'invite_walk' ? ['park', 'square', 'pond'] : k === 'invite_cafe' ? ['cafe', 'coffee', 'pizzeria', 'bakery'] : ['bar'];
    const act = ACTIVITY_BY_ID[k === 'invite_walk' ? 'park_walk' : k === 'invite_cafe' ? 'coffee_sit' : 'bar'];
    const h = sim.clock.hour, wd = sim.clock.weekday;
    const b = sim.world.nearestBuilding(types, { x: me.x, z: me.z }, (x) => isOpen(x, h, wd) && !x.closedReason);
    if (!b) { this.toast('Рядом всё закрыто — давай в другой раз'); return; }
    sim.force(npc, act, b, 120);
    p.meeting = { npc: npc.id, b: b.id, until: sim.clock.total + 150 };
    this.toast(`Договорились: ${npc.first} ждёт тебя — ${b.name}`);
  }

  closeDialog() {
    this.dialogOpen = false;
    this.dialogEl.hidden = true;
  }

  closeMenu() {
    this.menu.hidden = true;
    this.menuFor = null;
  }

  toast(text: string) {
    const t = el('div', 'toast', esc(text));
    this.toasts.prepend(t);
    while (this.toasts.children.length > 3) this.toasts.lastElementChild!.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  update(dt: number) {
    const p = this.player;
    const c = p.c;
    if (!c) return;
    this.menuBtn.hidden = !p.room;
    // кнопка действия
    const label = p.target?.label;
    const busy = !!c.act;
    const actHtml = label && !busy ? `✋<small>${esc(label)}</small>` : '✋<small>подойди к чему-нибудь</small>';
    if (actHtml !== this.lastAct) {
      this.lastAct = actHtml;
      this.actBtn.disabled = !label || busy;
      this.actBtn.innerHTML = actHtml;
      this.actBtn.classList.toggle('ready', !!label && !busy);
    }
    // занятие
    if (c.act) {
      this.inside.hidden = false;
      const outside = c.state === 'outdoor';
      const html = `<span>${c.act.emoji} ${esc(c.act.label)} · до ${fmtTime(c.actEnd)}${outside ? ' · двинь джойстик, чтобы встать' : ''}</span>
        <button class="ib ff${p.fastForward ? ' on' : ''}">⏩ ${p.fastForward ? 'обычная скорость' : 'промотать'}</button><button class="ib lv">🚶 ${outside ? 'встать' : 'выйти'}</button>`;
      if (html === this.lastInside) return this.updateHud(dt);
      this.lastInside = html;
      this.inside.innerHTML = html;
      this.inside.querySelector<HTMLElement>('.ff')!.onclick = () => { this.hooks.click(); p.toggleFastForward(); };
      this.inside.querySelector<HTMLElement>('.lv')!.onclick = () => { this.hooks.click(); p.leave(); };
    } else { this.inside.hidden = true; this.lastInside = ''; }
    this.updateHud(dt);
  }

  private updateHud(dt: number) {
    const c = this.player.c!;
    this.hudAt -= dt;
    if (this.hudAt > 0) return;
    this.hudAt = 0.3;
    const sim = this.sim;
    const bars = NEEDS.map((n) => {
      const v = c.needs[n];
      return `<div class="nb" title="${NEED_NAMES[n]}"><i style="width:${v}%;background:${v > 60 ? 'var(--good)' : v > 30 ? 'var(--accent)' : 'var(--bad)'}"></i><span>${NEED_NAMES[n]}</span></div>`;
    }).join('');
    this.hud.innerHTML = `<div class="ph-top"><b>${esc(displayName(c))}</b><span>${fmtTime(sim.clock.total)} · ${sim.weather.def.emoji} ${Math.round(sim.weather.temp)}° · 💰 ${Math.round(c.money)}₽ · ${c.mood > 70 ? '😊' : c.mood > 45 ? '😐' : '😞'} ${Math.round(c.mood)}%</span></div><div class="ph-bars">${bars}</div>`;
  }
}
