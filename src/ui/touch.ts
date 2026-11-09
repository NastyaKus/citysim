// Сенсорное управление жителем: джойстик, обзор, кнопки, HUD, меню занятий.
import type { Player, ActivityOption } from '../game/player';
import type { Building } from '../sim/world';
import type { Sim } from '../sim/sim';
import { NEEDS, NEED_NAMES } from '../sim/content/activities';
import { fmtTime } from '../sim/params';
import { displayName } from '../sim/citizen';

export interface TouchHooks {
  exit: () => void;
  click: () => void;
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
    const exit = el('button', 'pbtn exit', '🚪<small>выйти</small>');
    btns.append(this.actBtn, this.runBtn, exit);
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

  openMenu(b: Building) {
    const opts = this.player.options(b);
    this.menuFor = b;
    this.menu.hidden = false;
    const c = this.player.c!;
    const head = b.id === c.home ? '🏠 Дома' : b.id === c.work ? `💼 ${esc(b.name)} — твоя работа` : esc(b.name);
    this.menu.innerHTML = `<div class="am-head"><b>${head}</b><span>💰 ${Math.round(c.money)}₽</span><button class="am-close">✕</button></div>
      <div class="am-list">${opts.length ? opts.map((o, i) => `<button class="am-item${o.disabled ? ' off' : ''}" data-i="${i}"><span class="em">${o.act.emoji}</span><span class="tx">${esc(o.act.label)}<small>${o.disabled ? esc(o.disabled) : `~${o.dur >= 90 ? `${Math.round(o.dur / 60 * 10) / 10} ч` : `${o.dur} мин`}${o.price ? ` · ${o.price}₽` : ''}`}</small></span></button>`).join('') : '<div class="hint">Здесь сейчас нечем заняться.</div>'}</div>`;
    this.menu.querySelector<HTMLElement>('.am-close')!.onclick = () => { this.hooks.click(); this.closeMenu(); };
    this.menu.querySelectorAll<HTMLElement>('.am-item').forEach((it) => {
      it.onclick = () => {
        const o: ActivityOption = opts[Number(it.dataset.i)];
        if (o.disabled) return;
        this.hooks.click();
        this.player.start(b, o);
        this.closeMenu();
      };
    });
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
