// Редактор города: лавочки, деревья, клумбы, фонари, остановки, пешеходные улицы, перестройка участков.
import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import type { CityMeshes } from '../render/city';
import type { Building } from '../sim/world';
import { HALF_CITY, ROAD_HALF } from '../sim/world';
import { BUILDINGS, BuildingDef } from '../sim/content/buildings';

export type Tool = 'none' | 'bench' | 'tree' | 'flowers' | 'lamp' | 'stop' | 'pedestrian' | 'rebuild' | 'remove';

const TOOLS: [Tool, string, string][] = [
  ['none', '✋', 'смотреть'], ['bench', '🪑', 'лавочка'], ['tree', '🌳', 'дерево'], ['flowers', '🌷', 'клумба'], ['lamp', '💡', 'фонарь'],
  ['stop', '🚏', 'остановка'], ['pedestrian', '🚶', 'пешеходная улица'], ['rebuild', '🏗', 'перестроить'], ['remove', '🗑', 'убрать'],
];

const HINTS: Record<Tool, string> = {
  none: 'Выбери инструмент и коснись карты.',
  bench: 'Лавочку поставь во дворе или на тротуаре — жители будут на ней отдыхать и выгуливать собак.',
  tree: 'Деревья радуют соседей и дают тень.',
  flowers: 'Клумбы поднимают настроение жильцам рядом.',
  lamp: 'Фонарь светит ночью.',
  stop: 'Коснись дороги, по которой ходит автобус (видно в «Вид → маршруты»).',
  pedestrian: 'Коснись улицы: машины перестанут по ней ездить, появится плитка и клумбы. Ещё раз — вернуть дорогу.',
  rebuild: 'Коснись здания, чтобы построить на его месте что-то другое.',
  remove: 'Коснись своей лавочки, дерева, клумбы или фонаря, чтобы убрать.',
};

export interface EditorHooks {
  toast: (t: string) => void;
  click: () => void;
  sound: () => void;
}

export class Editor {
  active = false;
  tool: Tool = 'none';
  bar: HTMLElement;
  sheet: HTMLElement;
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  marker: THREE.Mesh;

  constructor(private sim: Sim, private city: CityMeshes, private camera: THREE.Camera, private hooks: EditorHooks) {
    this.bar = document.createElement('div');
    this.bar.className = 'editor-bar';
    this.bar.hidden = true;
    this.sheet = document.createElement('div');
    this.sheet.className = 'act-menu editor-sheet';
    this.sheet.hidden = true;
    document.getElementById('app')!.append(this.bar, this.sheet);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7ee08a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.marker.visible = false;
    this.render();
  }

  toggle(on = !this.active) {
    this.active = on;
    this.bar.hidden = !on;
    this.sheet.hidden = true;
    document.body.classList.toggle('edit-mode', on);
    this.marker.visible = false;
  }

  private render() {
    this.bar.innerHTML = `<div class="eb-tools">${TOOLS.map(([t, e, l]) => `<button class="eb-t${this.tool === t ? ' on' : ''}" data-t="${t}"><span>${e}</span><small>${l}</small></button>`).join('')}<button class="eb-t" data-close="1"><span>✅</span><small>готово</small></button></div><div class="eb-hint">${HINTS[this.tool]}</div>`;
    this.bar.querySelectorAll<HTMLElement>('[data-t]').forEach((b) => (b.onclick = () => { this.hooks.click(); this.tool = b.dataset.t as Tool; this.render(); }));
    this.bar.querySelector<HTMLElement>('[data-close]')!.onclick = () => { this.hooks.click(); this.toggle(false); };
  }

  /** касание карты в режиме редактора */
  tap(cx: number, cy: number) {
    if (this.tool === 'none') return;
    const mouse = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(mouse, this.camera);
    const sim = this.sim;
    const w = sim.world;
    if (this.tool === 'rebuild') {
      const hits = this.ray.intersectObjects(this.city.pick, false);
      if (!hits.length) return this.hooks.toast('Коснись здания');
      this.openRebuild(w.buildings[hits[0].object.userData.building]);
      return;
    }
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, p)) return;
    if (Math.max(Math.abs(p.x), Math.abs(p.z)) > HALF_CITY + 5) return this.hooks.toast('Это за городом');
    this.marker.position.set(p.x, 0.25, p.z);
    this.marker.visible = true;
    const rd = w.roadDist(p.x, p.z);
    switch (this.tool) {
      case 'bench': case 'tree': case 'flowers': case 'lamp': {
        if (rd < ROAD_HALF + 0.6) return this.hooks.toast('Это проезжая часть — поставь рядом, на тротуаре или во дворе');
        if (this.city.collision.blocked(p.x, p.z, this.tool === 'tree' ? 0.6 : 0.4)) return this.hooks.toast('Здесь мешает стена или дерево');
        if (w.decor.filter((d) => Math.hypot(d.x - p.x, d.z - p.z) < 1.5).length) return this.hooks.toast('Слишком тесно');
        const near = w.placeNear(p.x, p.z);
        const ry = Math.atan2(near.pos.x - p.x, near.pos.z - p.z);
        w.addDecor(this.tool, p.x, p.z, this.tool === 'bench' ? ry : Math.random() * 6);
        this.hooks.sound();
        const names = { bench: 'Лавочка поставлена — жители скоро её найдут', tree: 'Дерево посажено 🌳', flowers: 'Клумба разбита 🌷', lamp: 'Фонарь установлен 💡' };
        this.hooks.toast(names[this.tool]);
        if (this.tool === 'bench') sim.news.push('🪑', 'Горожане поставили новую лавочку', 'city', { focus: { x: p.x, z: p.z } }, 120);
        break;
      }
      case 'stop': {
        if (rd > ROAD_HALF + 4) return this.hooks.toast('Коснись дороги или тротуара у дороги');
        const pl = w.placeNear(p.x, p.z);
        const st = sim.transport.addStop(pl.edge, pl.t);
        if (!st) return this.hooks.toast('По этой улице автобус не ходит или остановка уже рядом');
        w.version++;
        this.hooks.sound();
        sim.news.push('🚏', `Новая остановка: ${st.name} (маршрут ${sim.transport.routes[st.routeId].name})`, 'traffic', { focus: st.place.pos });
        this.hooks.toast('Остановка открыта!');
        break;
      }
      case 'pedestrian': {
        if (rd > ROAD_HALF + 1) return this.hooks.toast('Коснись самой улицы');
        const pl = w.placeNear(p.x, p.z);
        const e = w.edges[pl.edge];
        if (sim.transport.routes.some((r) => r.segs.some((s) => s.edge === e.id))) return this.hooks.toast('Здесь ходит автобус — пешеходной улица быть не может');
        e.pedestrian = !e.pedestrian;
        e.closed = e.pedestrian ? 'пешеходная' : null;
        sim.routingDirty = true;
        w.version++;
        this.hooks.sound();
        sim.news.push('🚶', e.pedestrian ? `${e.street}: участок стал пешеходным — машины в объезд` : `${e.street}: на участок вернули машины`, 'city');
        break;
      }
      case 'remove': {
        let best = -1, bd = 2.2;
        for (const d of w.decor) { const dd = Math.hypot(d.x - p.x, d.z - p.z); if (dd < bd) { bd = dd; best = d.id; } }
        if (best < 0) return this.hooks.toast('Рядом нет твоих объектов');
        w.removeDecor(best);
        this.city.onRebuild?.();
        this.hooks.toast('Убрано');
        break;
      }
    }
  }

  private openRebuild(b: Building) {
    const sim = this.sim;
    if (b.def.size === 'block' || b.type === 'construction') return this.hooks.toast(b.type === 'construction' ? 'Здесь уже идёт стройка' : 'Большие объекты (парк, школа, стадион…) перестраивать нельзя');
    const counts = new Map<string, number>();
    for (const x of sim.world.buildings) counts.set(x.type, (counts.get(x.type) ?? 0) + 1);
    const opts = BUILDINGS.filter((d) => d.size === b.def.size && d.id !== b.type && d.id !== 'construction' && d.id !== 'nook' && (d.max === undefined || (counts.get(d.id) ?? 0) < d.max) && !['cityhall', 'firestation', 'police', 'depot'].includes(d.id));
    this.sheet.hidden = false;
    this.sheet.innerHTML = `<div class="am-head"><b>🏗 Что построить вместо «${b.name}»?</b><button class="am-close">✕</button></div>
      ${b.residents.length ? `<p class="hint">Здесь живут ${b.residents.length} чел. — если построить не жильё, их переселят в другие дома.</p>` : ''}
      <div class="am-list">${opts.map((d, i) => `<button class="am-item" data-i="${i}"><span class="em">${emoji(d)}</span><span class="tx">${d.name}<small>${d.cat === 'home' ? 'жильё' : d.open ? `${d.open[0]}:00–${d.open[1] % 24}:00` : 'круглосуточно'}</small></span></button>`).join('')}</div>`;
    this.sheet.querySelector<HTMLElement>('.am-close')!.onclick = () => { this.sheet.hidden = true; };
    this.sheet.querySelectorAll<HTMLElement>('[data-i]').forEach((it) => (it.onclick = () => {
      this.hooks.click();
      const d = opts[Number(it.dataset.i)];
      this.sheet.hidden = true;
      this.rebuild(b, d);
    }));
  }

  private rebuild(b: Building, d: BuildingDef) {
    const sim = this.sim;
    // переселить жильцов
    if (b.residents.length && d.cat !== 'home') {
      const need = b.residents.length;
      const free = sim.world.buildings.filter((h) => h !== b && h.def.cat === 'home').reduce((a, h) => a + Math.max(0, h.homeCapacity - h.residents.length), 0);
      if (free < need) return this.hooks.toast('Жильцов некуда переселить — сначала построй ещё дом');
      for (const id of [...b.residents]) {
        const c = sim.citizens[id];
        if (!c?.alive || c.home !== b.id) continue;
        const nh = sim.world.buildings.find((h) => h !== b && h.def.cat === 'home' && h.homeCapacity > h.residents.length);
        if (!nh) break;
        b.residents = b.residents.filter((x) => x !== id);
        nh.residents.push(id);
        c.home = nh.id;
        if (c.at === b.id) { b.inside.delete(id); nh.inside.add(id); c.at = nh.id; }
        if (c.carAt === b.id) c.carAt = nh.id;
        sim.brain.log(c, `переселили из-за стройки — новый дом: ${nh.name}`);
      }
    }
    for (const id of [...b.inside]) { const c = sim.citizens[id]; if (c && !c.controlled) c.actEnd = sim.clock.total; }
    sim.dynamics.startConstruction(b, d.id);
    b.fast = true;
    this.hooks.sound();
    this.hooks.toast(`Стройка началась: будет ${d.name.toLowerCase()}. Строители работают днём`);
  }
}

function emoji(d: BuildingDef) {
  const m: Record<string, string> = { home: '🏠', office: '🏢', civic: '🏛', shop: '🛒', food: '🍽', leisure: '🎭', edu: '🏫', health: '💊', industry: '🏭', transport: '⛽', outdoor: '🌳', construction: '🏗' };
  return m[d.cat] ?? '🏠';
}
