// Интерьеры зданий: low-poly комнаты по шаблонам, места для занятий и жители внутри.
import * as THREE from 'three';
import { GB, lowpolyMaterial } from './lowpoly';
import type { Sim } from '../sim/sim';
import type { Building } from '../sim/world';
import type { Citizen } from '../sim/citizen';
import { Collision } from '../game/collision';
import { RNG } from '../sim/rng';

export type Pose = 'sit' | 'stand' | 'lie';
export interface Spot { id: number; x: number; z: number; ry: number; pose: Pose; acts: string[]; label: string; npc?: number }

export type Template = 'apartment' | 'cafe' | 'bar' | 'shop' | 'library' | 'office' | 'gym' | 'cinema' | 'school' | 'church' | 'hospital' | 'workshop';

export function templateFor(b: Building): Template {
  const t = b.type, c = b.def.cat;
  if (c === 'home') return 'apartment';
  if (['coffee', 'cafe', 'restaurant', 'pizzeria', 'shawarma', 'bakery'].includes(t)) return 'cafe';
  if (['bar', 'club'].includes(t)) return 'bar';
  if (['grocery', 'supermarket', 'kiosk', 'pharmacy', 'post'].includes(t)) return 'shop';
  if (['library', 'museum'].includes(t)) return 'library';
  if (['gym', 'pool'].includes(t)) return 'gym';
  if (t === 'cinema') return 'cinema';
  if (['school', 'university', 'kindergarten'].includes(t)) return 'school';
  if (t === 'church') return 'church';
  if (t === 'hospital') return 'hospital';
  if (['office', 'bizcenter', 'itoffice', 'cowork', 'cityhall', 'bank', 'police'].includes(t)) return 'office';
  return 'workshop';
}

const WALLS: Record<Template, [number, number]> = {
  apartment: [0xf2e6d0, 0xb98b5e], cafe: [0xf4d9b8, 0x8b5e3c], bar: [0x3a2a2a, 0x2b1d1d], shop: [0xf1f1f1, 0xcfcfcf], library: [0xe8dcc4, 0x7a5232],
  office: [0xe4e8ee, 0x9aa0a6], gym: [0xdedede, 0x555b66], cinema: [0x3b1d2b, 0x2a1520], school: [0xf0e6c8, 0xa98467], church: [0xf8f1df, 0xbfa77a],
  hospital: [0xf5f9fb, 0xbcd4dc], workshop: [0xc9c3b6, 0x6c757d],
};
const SIZES: Record<Template, [number, number]> = {
  apartment: [13, 10], cafe: [14, 11], bar: [14, 11], shop: [14, 11], library: [14, 11], office: [14, 11], gym: [14, 11], cinema: [14, 13], school: [14, 11], church: [12, 14], hospital: [14, 11], workshop: [15, 12],
};

const PERSON_PARTS: [string, number, number, number, number, number, number][] = [
  // имя, w, h, d, x, y, z
  ['legL', 0.16, 0.8, 0.18, 0.11, 0.42, 0], ['legR', 0.16, 0.8, 0.18, -0.11, 0.42, 0],
  ['torso', 0.48, 0.62, 0.3, 0, 1.13, 0], ['armL', 0.11, 0.6, 0.13, 0.31, 1.12, 0], ['armR', 0.11, 0.6, 0.13, -0.31, 1.12, 0],
];

/** простая модель человека для интерьера */
export function makePerson(c: Citizen): THREE.Group {
  const g = new THREE.Group();
  const lam = (col: number) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
  for (const [name, w, h, d, x, y, z] of PERSON_PARTS) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (name.startsWith('leg') || name.startsWith('arm')) geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, lam(name.startsWith('leg') ? c.look.pants : c.look.shirt));
    m.name = name;
    m.position.set(x, name.startsWith('leg') ? 0.82 : name.startsWith('arm') ? 1.42 : y, z);
    m.castShadow = true;
    g.add(m);
  }
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), lam(c.look.skin));
  head.position.y = 1.62;
  g.add(head);
  if (c.look.hairStyle !== 4) {
    const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.215, 0), lam(c.look.hair));
    hair.scale.set(1, 0.6, 1.05);
    hair.position.set(0, 1.71, -0.02);
    g.add(hair);
  }
  if (c.look.hairStyle === 2 || c.look.hairStyle === 3) {
    const lh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.1), lam(c.look.hair));
    lh.position.set(0, 1.5, -0.16);
    g.add(lh);
  }
  g.scale.setScalar(c.look.height);
  g.userData.citizen = c.id;
  return g;
}

export function poseGroup(g: THREE.Group, pose: Pose, walkPhase: number, moving: boolean) {
  const legL = g.getObjectByName('legL'), legR = g.getObjectByName('legR'), armL = g.getObjectByName('armL'), armR = g.getObjectByName('armR');
  if (!legL || !legR || !armL || !armR) return;
  g.rotation.x = 0;
  if (pose === 'sit') {
    legL.rotation.x = legR.rotation.x = -1.45;
    armL.rotation.x = armR.rotation.x = -0.5;
    g.position.y = -0.38 * g.scale.y;
  } else if (pose === 'lie') {
    legL.rotation.x = legR.rotation.x = 0;
    armL.rotation.x = armR.rotation.x = 0;
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.75;
  } else {
    const s = moving ? Math.sin(walkPhase) * 0.6 : 0;
    legL.rotation.x = s; legR.rotation.x = -s;
    armL.rotation.x = -s * 0.8; armR.rotation.x = s * 0.8;
    g.position.y = 0;
  }
}

export class InteriorView {
  scene = new THREE.Scene();
  room = new THREE.Group();
  collision = new Collision();
  spots: Spot[] = [];
  npcs: { c: Citizen; g: THREE.Group; spot: Spot | null; phase: number }[] = [];
  building: Building | null = null;
  template: Template = 'apartment';
  w = 12;
  d = 10;
  door = { x: 0, z: 5 };
  private hemi = new THREE.HemisphereLight(0xfff4e0, 0x6b5a4a, 1.2);
  private lights: THREE.PointLight[] = [];
  private winMat = new THREE.MeshBasicMaterial({ color: 0x9fd3ff });
  private screens: THREE.MeshBasicMaterial[] = [];
  private discoTiles: THREE.Mesh[] = [];
  private lastSync = 0;
  playerModel: THREE.Group | null = null;

  constructor(private sim: Sim) {
    this.scene.add(this.hemi, this.room);
    this.scene.background = new THREE.Color(0x111318);
    const amb = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(amb);
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffe2b0, 30, 22, 1.4);
      l.castShadow = i === 0;
      l.shadow.mapSize.set(512, 512);
      this.lights.push(l);
      this.scene.add(l);
    }
  }

  build(b: Building, player: Citizen) {
    this.clear();
    this.building = b;
    const t = templateFor(b);
    this.template = t;
    const [w, d] = SIZES[t];
    this.w = w; this.d = d;
    this.door = { x: 0, z: d / 2 - 0.8 };
    const rng = new RNG(b.seed);
    const g = new GB();
    const [wallC, floorC] = WALLS[t];
    const H = 4;
    // пол, стены, плинтус
    g.box(w, 0.2, d, floorC, 0, -0.2, 0);
    if (t === 'apartment' || t === 'library') for (let i = 0; i < w; i += 1) g.box(0.96, 0.02, d - 0.1, i % 2 ? floorC : new THREE.Color(floorC).multiplyScalar(0.9), -w / 2 + i + 0.5, 0, 0);
    g.box(w, H, 0.3, wallC, 0, 0, -d / 2);
    g.box(0.3, H, d, wallC, -w / 2, 0, 0);
    g.box(0.3, H, d, wallC, w / 2, 0, 0);
    // передняя стена с дверью
    g.box((w - 2.2) / 2, H, 0.3, wallC, -(w + 2.2) / 4, 0, d / 2);
    g.box((w - 2.2) / 2, H, 0.3, wallC, (w + 2.2) / 4, 0, d / 2);
    g.box(2.2, H - 2.6, 0.3, wallC, 0, 2.6, d / 2);
    g.box(1.9, 2.5, 0.08, 0x6b4f3a, 0, 0, d / 2 + 0.1);
    g.box(w, 0.15, 0.32, new THREE.Color(wallC).multiplyScalar(0.8), 0, 0, -d / 2 + 0.01);
    this.room.add(new THREE.Mesh(g.build(), lowpolyMaterial()));
    const solid = (x: number, z: number, sw: number, sd: number, h = 1.2) => this.collision.addBox({ x0: x - sw / 2, x1: x + sw / 2, z0: z - sd / 2, z1: z + sd / 2, h });
    // стены как коллизии
    solid(0, -d / 2 - 0.2, w + 2, 0.6, 5);
    solid(-w / 2 - 0.2, 0, 0.6, d + 2, 5);
    solid(w / 2 + 0.2, 0, 0.6, d + 2, 5);
    solid(-(w + 2.2) / 4 - 0.3, d / 2 + 0.2, (w - 2.2) / 2 + 0.6, 0.6, 5);
    solid((w + 2.2) / 4 + 0.3, d / 2 + 0.2, (w - 2.2) / 2 + 0.6, 0.6, 5);
    solid(0, d / 2 + 1.2, 3, 0.6, 5);
    // окна на задней стене
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), this.winMat);
    for (const x of t === 'cinema' || t === 'bar' ? [] : [-w / 4, w / 4]) { const m = win.clone(); m.position.set(x, 2.2, -d / 2 + 0.17); this.room.add(m); }
    const f = new GB();
    let sid = 0;
    const spot = (x: number, z: number, ry: number, pose: Pose, acts: string[], label: string) => this.spots.push({ id: sid++, x, z, ry, pose, acts, label });
    const chair = (x: number, z: number, ry: number, col = 0x8b5a2b) => {
      const c = new GB();
      c.box(0.5, 0.08, 0.5, col, 0, 0.45, 0);
      c.box(0.5, 0.55, 0.08, col, 0, 0.5, -0.22);
      for (const [px, pz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) c.box(0.06, 0.45, 0.06, 0x333333, px, 0, pz);
      f.merge(c, x, 0, z, ry);
    };
    const table = (x: number, z: number, tw = 1.1, td = 1.1, col = 0x7a5232) => { f.box(tw, 0.08, td, col, x, 0.75, z); f.box(0.1, 0.75, 0.1, 0x333333, x, 0, z); solid(x, z, tw * 0.8, td * 0.8, 0.8); };
    const plant = (x: number, z: number) => { f.cyl(0.25, 0.2, 0.45, 6, 0xa0522d, x, 0, z); f.ico(0.45, 0x5a9e45, x, 0.85, z, { jitter: 0.15 }); solid(x, z, 0.5, 0.5); };
    const shelf = (x: number, z: number, ry: number, items: number[], sw = 2.4) => {
      const s = new GB();
      s.box(sw, 2.2, 0.5, 0x8b6b4a, 0, 0, 0);
      for (let r = 0; r < 4; r++) for (let i = 0; i < 8; i++) s.box(sw / 9, 0.32, 0.3, rng.pick(items), -sw / 2 + (i + 0.6) * (sw / 8.2), 0.2 + r * 0.5, 0.12);
      f.merge(s, x, 0, z, ry);
      const along = Math.abs(Math.sin(ry)) > 0.5;
      solid(x, z, along ? 0.6 : sw, along ? sw : 0.6, 2.2);
    };
    const books = [0xc0392b, 0x2e86de, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085, 0xd35400];
    const goods = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xffffff, 0xf4a261];
    const counter = (x: number, z: number, cw: number, col = 0x6f4e37) => { f.box(cw, 1.05, 0.7, col, x, 0, z); f.box(cw + 0.1, 0.06, 0.8, 0xdddddd, x, 1.05, z); solid(x, z, cw, 0.8, 1.1); };
    switch (t) {
      case 'apartment': {
        // диван и телевизор
        f.box(2.6, 0.45, 0.9, 0x5c7aa8, -w / 2 + 2.4, 0, -1, { shade: 0.2 });
        f.box(2.6, 0.7, 0.25, 0x5c7aa8, -w / 2 + 2.4, 0.45, -1.4);
        solid(-w / 2 + 2.4, -1.05, 2.6, 0.9, 0.9);
        f.box(1.8, 1, 0.1, 0x111111, -w / 2 + 2.4, 1.1, -d / 2 + 0.3);
        f.box(2, 0.5, 0.45, 0x6b4f3a, -w / 2 + 2.4, 0, -d / 2 + 0.5);
        const tv = new THREE.MeshBasicMaterial({ color: 0x223344 });
        this.screens.push(tv);
        const tvm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.85), tv);
        tvm.position.set(-w / 2 + 2.4, 1.6, -d / 2 + 0.36);
        this.room.add(tvm);
        spot(-w / 2 + 1.8, -0.75, Math.PI, 'sit', ['tv', 'games', 'call', 'music_home', 'read_home'], 'диван');
        spot(-w / 2 + 3, -0.75, Math.PI, 'sit', ['tv', 'games', 'call', 'music_home'], 'диван');
        // ковёр
        f.box(3, 0.02, 2, 0xc77d58, -w / 2 + 2.4, 0.01, 0.6);
        // кухня
        counter(w / 2 - 2.2, -d / 2 + 0.6, 3.4, 0xf1f1f1);
        f.box(0.8, 1.9, 0.7, 0xdfe6ee, w / 2 - 0.6, 0, -d / 2 + 0.6);
        solid(w / 2 - 0.6, -d / 2 + 0.6, 0.8, 0.7, 2);
        spot(w / 2 - 2.2, -d / 2 + 1.4, Math.PI, 'stand', ['cook', 'breakfast', 'eat_home'], 'кухня');
        // стол
        table(w / 2 - 2.5, 0.8, 1.4, 1);
        chair(w / 2 - 2.5, 0, 0); chair(w / 2 - 2.5, 1.6, Math.PI);
        spot(w / 2 - 2.5, 0, 0, 'sit', ['eat_home', 'breakfast', 'call'], 'стол');
        spot(w / 2 - 2.5, 1.6, Math.PI, 'sit', ['eat_home', 'breakfast'], 'стол');
        // кровать
        f.box(1.8, 0.45, 2.4, 0x8b6b4a, -w / 2 + 1.2, 0, d / 2 - 2);
        f.box(1.7, 0.2, 2.3, 0xf5f5f5, -w / 2 + 1.2, 0.45, d / 2 - 2);
        f.box(1.7, 0.15, 1.5, rng.pick([0xe07a5f, 0x81b29a, 0x3d405b]), -w / 2 + 1.2, 0.62, d / 2 - 1.6);
        f.box(0.6, 0.15, 0.4, 0xffffff, -w / 2 + 1.2, 0.65, d / 2 - 2.9);
        solid(-w / 2 + 1.2, d / 2 - 2, 1.8, 2.4, 0.7);
        spot(-w / 2 + 1.2, d / 2 - 2.1, 0, 'lie', ['sleep', 'nap'], 'кровать');
        shelf(w / 2 - 0.4, 2.8, -Math.PI / 2, books, 2);
        spot(w / 2 - 1.3, 2.8, -Math.PI / 2, 'stand', ['read_home', 'cleaning'], 'книжная полка');
        plant(-w / 2 + 0.6, -d / 2 + 0.6);
        break;
      }
      case 'cafe': {
        counter(-w / 2 + 3, -d / 2 + 1.6, 4.5);
        f.box(0.6, 0.6, 0.5, 0x333333, -w / 2 + 2, 1.1, -d / 2 + 1.6);
        f.box(1.6, 1, 0.08, 0x2b2b2b, -w / 2 + 3, 2.3, -d / 2 + 0.2);
        f.box(1.4, 0.8, 0.02, 0xf5deb3, -w / 2 + 3, 2.4, -d / 2 + 0.25);
        spot(-w / 2 + 3, -d / 2 + 2.5, Math.PI, 'stand', ['coffee', 'bakery', 'shawarma', 'kiosk', 'icecream', 'pizza', 'work'], 'стойка');
        const tables: [number, number][] = [[1, -1.5], [4, -1.5], [1, 1.8], [4, 1.8], [-3, 2]];
        for (const [x, z] of tables) {
          table(x, z, 1, 1, 0xd9b38c);
          chair(x - 0.85, z, Math.PI / 2); chair(x + 0.85, z, -Math.PI / 2);
          spot(x - 0.85, z, Math.PI / 2, 'sit', ['lunch', 'coffee_sit', 'dinner_out', 'pizza', 'date', 'meet_friends', 'coffee', 'shawarma', 'bakery', 'wedding'], 'столик');
          spot(x + 0.85, z, -Math.PI / 2, 'sit', ['lunch', 'coffee_sit', 'dinner_out', 'pizza', 'date', 'meet_friends', 'wedding'], 'столик');
        }
        plant(w / 2 - 0.6, -d / 2 + 0.6); plant(-w / 2 + 0.6, d / 2 - 0.8);
        break;
      }
      case 'bar': {
        counter(0, -d / 2 + 1.4, 7, 0x4a2c20);
        for (let i = 0; i < 6; i++) f.box(0.2, 0.25, 0.2, rng.pick([0x2a9d8f, 0xe9c46a, 0xe76f51, 0x8ab17d]), -2.5 + i, 1.1, -d / 2 + 1.3);
        shelf(0, -d / 2 + 0.3, 0, [0x2a9d8f, 0xe9c46a, 0xe76f51, 0x8ab17d, 0x264653], 6);
        for (let i = 0; i < 5; i++) {
          f.cyl(0.25, 0.25, 0.08, 8, 0xaa3333, -2.4 + i * 1.2, 0.75, -d / 2 + 2.3);
          f.cyl(0.05, 0.05, 0.75, 4, 0x333333, -2.4 + i * 1.2, 0, -d / 2 + 2.3);
          spot(-2.4 + i * 1.2, -d / 2 + 2.3, Math.PI, 'sit', ['bar', 'meet_friends', 'date', 'work'], 'барная стойка');
        }
        // танцпол
        for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
          const tile = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 1.1), new THREE.MeshBasicMaterial({ color: 0x333333 }));
          tile.position.set(-1.8 + i * 1.2, 0.02, 1 + k * 1.2);
          this.discoTiles.push(tile);
          this.room.add(tile);
          if ((i + k) % 2 === 0) spot(-1.8 + i * 1.2, 1 + k * 1.2, rng.range(0, 6), 'stand', ['club', 'rave', 'bar', 'party'], 'танцпол');
        }
        f.box(2, 1.1, 0.8, 0x111111, w / 2 - 1.5, 0, 2);
        solid(w / 2 - 1.5, 2, 2, 0.8, 1.2);
        f.box(2.6, 0.45, 0.9, 0x6a0572, -w / 2 + 1.6, 0, 2.5);
        solid(-w / 2 + 1.6, 2.5, 2.6, 0.9, 0.9);
        spot(-w / 2 + 1.3, 2.3, Math.PI / 2, 'sit', ['bar', 'meet_friends', 'date'], 'диван');
        break;
      }
      case 'shop': {
        for (let r = 0; r < 3; r++) shelf(-3 + r * 3, -0.5, Math.PI / 2, goods, 3.4);
        for (let r = 0; r < 3; r++) spot(-3 + r * 3 + 1, -0.5, -Math.PI / 2, 'stand', ['groceries', 'pharmacy', 'post', 'queue', 'kiosk'], 'полки');
        shelf(0, -d / 2 + 0.4, 0, goods, 6);
        counter(w / 2 - 2, d / 2 - 2, 2.4, 0xe9ecef);
        f.box(0.5, 0.3, 0.4, 0x333333, w / 2 - 2, 1.1, d / 2 - 2);
        spot(w / 2 - 2, d / 2 - 2.9, 0, 'stand', ['kiosk', 'pharmacy', 'post', 'groceries', 'queue', 'work'], 'касса');
        f.box(1.2, 2, 0.8, 0xbde0fe, -w / 2 + 0.8, 0, d / 2 - 2);
        solid(-w / 2 + 0.8, d / 2 - 2, 1.2, 0.8, 2);
        break;
      }
      case 'library': {
        for (let r = 0; r < 3; r++) shelf(-w / 2 + 2 + r * 2.6, -d / 2 + 0.4, 0, books, 2.4);
        for (let r = 0; r < 2; r++) shelf(w / 2 - 0.4, -2 + r * 2.8, -Math.PI / 2, books, 2.4);
        for (const [x, z] of [[-2.5, 0.8], [1.5, 0.8], [-2.5, 3]]) {
          table(x, z, 2, 1, 0x8b5a2b);
          for (const dx of [-0.5, 0.5]) { chair(x + dx, z - 0.8, 0); spot(x + dx, z - 0.8, 0, 'sit', ['library', 'museum', 'read_home', 'coffee_sit', 'work', 'study'], 'читальный стол'); }
        }
        for (let i = 0; i < 3; i++) {
          f.box(1.3, 1, 0.05, rng.pick([0xe07a5f, 0x3d405b, 0x81b29a, 0xf2cc8f]), -w / 2 + 0.2, 1.6, -1 + i * 1.8, { ry: Math.PI / 2 });
          spot(-w / 2 + 1.2, -1 + i * 1.8, -Math.PI / 2, 'stand', ['museum', 'library'], 'картина');
        }
        break;
      }
      case 'office': {
        for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) {
          const x = -3.5 + i * 3.2, z = -2 + r * 2.8;
          table(x, z, 1.6, 0.8, 0xe9ecef);
          f.box(0.7, 0.45, 0.05, 0x222222, x, 0.85, z - 0.25);
          chair(x, z + 0.7, Math.PI, 0x333333);
          spot(x, z + 0.7, Math.PI, 'sit', ['work', 'coffee_sit', 'job_search', 'interview', 'study'], 'рабочее место');
        }
        counter(w / 2 - 2.5, d / 2 - 2, 3, 0xdee2e6);
        spot(w / 2 - 2.5, d / 2 - 1.2, Math.PI, 'stand', ['bank', 'post', 'job_search', 'interview'], 'приёмная');
        f.cyl(0.25, 0.25, 1.3, 8, 0xd8f3ff, -w / 2 + 0.6, 0, d / 2 - 1);
        plant(-w / 2 + 0.6, -d / 2 + 0.6); plant(w / 2 - 0.6, -d / 2 + 0.6);
        break;
      }
      case 'gym': {
        if (b.type === 'pool') {
          f.box(w - 4, 0.1, d - 5, 0x48cae4, 0, 0.02, -0.5);
          for (let i = 0; i < 4; i++) spot(-3 + i * 2, -0.5, 0, 'stand', ['swim'], 'бассейн');
        } else {
          for (let i = 0; i < 4; i++) {
            f.box(0.8, 0.25, 1.8, 0x333333, -4 + i * 2, 0, -d / 2 + 1.5);
            f.box(0.8, 1.2, 0.1, 0x555555, -4 + i * 2, 0.25, -d / 2 + 0.7);
            solid(-4 + i * 2, -d / 2 + 1.5, 0.8, 1.8, 0.4);
            spot(-4 + i * 2, -d / 2 + 1.8, Math.PI, 'stand', ['gym', 'jog', 'work'], 'беговая дорожка');
          }
          for (let i = 0; i < 3; i++) { f.box(1.6, 0.05, 0.8, 0x2a9d8f, -3 + i * 2.5, 0, 2.2); spot(-3 + i * 2.5, 2.2, rng.range(0, 6), 'stand', ['gym', 'swim'], 'коврик'); }
          f.box(2, 0.1, 0.1, 0x999999, w / 2 - 2, 1.3, 0);
          for (const s of [-1, 1]) f.cyl(0.35, 0.35, 0.1, 8, 0x111111, w / 2 - 2 + s, 1.3, 0, { rz: Math.PI / 2 });
        }
        break;
      }
      case 'cinema': {
        const scr = new THREE.MeshBasicMaterial({ color: 0x8ecae6 });
        this.screens.push(scr);
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(w - 3, 3.2), scr);
        sm.position.set(0, 2.2, -d / 2 + 0.2);
        this.room.add(sm);
        for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
          const x = -3.75 + i * 1.5, z = -1.5 + r * 1.6;
          f.box(1, 0.45, 0.8, 0x8d0801, x, r * 0.15, z);
          f.box(1, 0.7, 0.15, 0x8d0801, x, 0.45 + r * 0.15, z + 0.35);
          solid(x, z, 0.9, 0.7, 0.6);
          spot(x, z, 0, 'sit', ['cinema', 'date'], 'кресло');
        }
        counter(w / 2 - 1.5, d / 2 - 2, 2, 0xffd60a);
        spot(w / 2 - 1.5, d / 2 - 1.2, Math.PI, 'stand', ['cinema', 'work'], 'попкорн');
        break;
      }
      case 'school': {
        f.box(5, 1.6, 0.08, 0x2d6a4f, 0, 1.2, -d / 2 + 0.2);
        table(0, -d / 2 + 1.8, 1.8, 0.8, 0x8b5a2b);
        chair(0, -d / 2 + 1.1, 0);
        spot(0, -d / 2 + 1.1, 0, 'sit', ['work'], 'учительский стол');
        for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
          const x = -4 + i * 2.6, z = -0.5 + r * 1.9;
          table(x, z, 1.4, 0.6, 0xd9b38c);
          chair(x, z + 0.6, Math.PI, 0x457b9d);
          spot(x, z + 0.6, Math.PI, 'sit', ['school', 'study', 'kinder', 'vote', 'work'], 'парта');
        }
        break;
      }
      case 'church': {
        f.box(3, 1.2, 1, 0xd4af37, 0, 0, -d / 2 + 1.2);
        solid(0, -d / 2 + 1.2, 3, 1, 1.2);
        for (let i = 0; i < 6; i++) f.box(0.8, 1.4, 0.05, rng.pick([0xd4af37, 0x8d0801, 0x1d3557]), -3 + i * 1.2, 1.5, -d / 2 + 0.2);
        for (let r = 0; r < 4; r++) for (const s of [-1, 1]) {
          f.box(3.4, 0.45, 0.6, 0x8b5a2b, s * 2.6, 0, -2 + r * 1.8);
          solid(s * 2.6, -2 + r * 1.8, 3.4, 0.6, 0.6);
          spot(s * 2.6, -1.6 + r * 1.8, Math.PI, 'sit', ['church', 'wedding'], 'скамья');
        }
        for (let i = 0; i < 8; i++) f.box(0.08, 0.3, 0.08, 0xfff3c4, -1.4 + i * 0.4, 1.2, -d / 2 + 1.2);
        break;
      }
      case 'hospital': {
        for (let i = 0; i < 3; i++) {
          f.box(1.2, 0.6, 2.2, 0xf1f1f1, -w / 2 + 1.2 + i * 2.2, 0, -d / 2 + 1.5);
          f.box(1.1, 0.12, 1.4, 0x9ad1d4, -w / 2 + 1.2 + i * 2.2, 0.6, -d / 2 + 1.8);
          solid(-w / 2 + 1.2 + i * 2.2, -d / 2 + 1.5, 1.2, 2.2, 0.7);
          spot(-w / 2 + 1.2 + i * 2.2, -d / 2 + 1.6, 0, 'lie', ['hospitalized', 'maternity', 'sick_home'], 'кровать');
        }
        counter(w / 2 - 2.5, 0, 3, 0xdee2e6);
        f.box(1.4, 0.4, 0.05, 0xe63946, w / 2 - 2.5, 1.4, -0.36);
        spot(w / 2 - 2.5, 0.8, Math.PI, 'stand', ['doctor', 'pharmacy', 'queue', 'work'], 'регистратура');
        for (let i = 0; i < 4; i++) { chair(-3 + i * 1.2, d / 2 - 1.8, Math.PI, 0x457b9d); spot(-3 + i * 1.2, d / 2 - 1.8, Math.PI, 'sit', ['doctor', 'queue', 'maternity'], 'зал ожидания'); }
        break;
      }
      default: {
        for (let i = 0; i < 3; i++) {
          f.box(1.8, 1.4, 1.4, rng.pick([0x6c757d, 0xe9c46a, 0x457b9d]), -4 + i * 3.5, 0, -d / 2 + 1.5);
          f.cyl(0.3, 0.3, 0.6, 8, 0x333333, -4 + i * 3.5, 1.4, -d / 2 + 1.5);
          solid(-4 + i * 3.5, -d / 2 + 1.5, 1.8, 1.4, 1.6);
          spot(-4 + i * 3.5, -d / 2 + 2.6, Math.PI, 'stand', ['work', 'carservice', 'refuel'], 'станок');
        }
        for (let i = 0; i < 6; i++) { f.box(1, 1, 1, 0xa97c50, w / 2 - 1 - (i % 2) * 1.1, Math.floor(i / 2) * 1, d / 2 - 1.5); }
        solid(w / 2 - 1.5, d / 2 - 1.5, 2.2, 1.2, 3);
        shelf(-w / 2 + 0.4, 1.5, Math.PI / 2, [0x6c757d, 0xffbe0b, 0xe63946, 0x264653], 3);
        spot(-w / 2 + 1.3, 1.5, Math.PI / 2, 'stand', ['work', 'carservice'], 'инструменты');
      }
    }
    const fm = new THREE.Mesh(f.build(), lowpolyMaterial());
    fm.castShadow = true;
    fm.receiveShadow = true;
    this.room.add(fm);
    // выход
    spot(0, d / 2 - 1, 0, 'stand', ['__exit'], 'дверь');
    // свет
    this.lights[0].position.set(-w / 4, 3.4, 0);
    this.lights[1].position.set(w / 4, 3.4, 1);
    const warm = t === 'bar' || t === 'cinema' ? 0xff9e6b : t === 'hospital' || t === 'office' || t === 'shop' ? 0xf4f8ff : 0xffe2b0;
    for (const l of this.lights) { l.color.set(warm); l.intensity = t === 'bar' || t === 'cinema' ? 16 : 30; }
    this.syncNpcs(player, true);
    // модель игрока
    this.playerModel = makePerson(player);
    this.room.add(this.playerModel);
  }

  clear() {
    for (const c of [...this.room.children]) {
      this.room.remove(c);
      c.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    }
    this.collision.clear();
    this.spots = [];
    this.npcs = [];
    this.screens = [];
    this.discoTiles = [];
    this.building = null;
    this.playerModel = null;
  }

  /** кто сейчас внутри — рассадить по местам */
  syncNpcs(player: Citizen, force = false) {
    const b = this.building;
    if (!b) return;
    const now = this.sim.clock.total;
    if (!force && now - this.lastSync < 2) return;
    this.lastSync = now;
    const inside = [...b.inside].map((id) => this.sim.citizens[id]).filter((c) => c && c.alive && c !== player && c.state === 'inside').slice(0, 14);
    const ids = new Set(inside.map((c) => c.id));
    // убрать ушедших
    this.npcs = this.npcs.filter((n) => {
      if (ids.has(n.c.id)) return true;
      this.room.remove(n.g);
      if (n.spot) n.spot.npc = undefined;
      return false;
    });
    for (const c of inside) {
      if (this.npcs.some((n) => n.c === c)) continue;
      const act = c.act?.id ?? '';
      let sp = this.spots.find((s) => s.npc === undefined && s.acts.includes(act) && !s.acts.includes('__exit'));
      if (!sp) sp = this.spots.find((s) => s.npc === undefined && !s.acts.includes('__exit') && s.pose !== 'lie');
      const g = makePerson(c);
      if (sp) {
        sp.npc = c.id;
        g.position.set(sp.x, 0, sp.z);
        g.rotation.y = sp.ry;
      } else {
        g.position.set((Math.random() - 0.5) * (this.w - 3), 0, (Math.random() - 0.5) * (this.d - 4));
        g.rotation.y = Math.random() * 6;
      }
      poseGroup(g, sp?.pose ?? 'stand', 0, false);
      this.room.add(g);
      this.npcs.push({ c, g, spot: sp ?? null, phase: Math.random() * 6 });
    }
  }

  update(dt: number, time: number, daylight: number, player: Citizen) {
    this.syncNpcs(player);
    this.winMat.color.set(0x16213e).lerp(new THREE.Color(0x9fd3ff), daylight);
    for (const s of this.screens) s.color.setHSL((time * 0.05) % 1, 0.5, 0.45 + Math.sin(time * 3) * 0.05);
    this.discoTiles.forEach((t, i) => (t.material as THREE.MeshBasicMaterial).color.setHSL((time * 0.4 + i * 0.13) % 1, 0.9, Math.sin(time * 4 + i) > 0 ? 0.5 : 0.15));
    for (const n of this.npcs) {
      n.phase += dt;
      const pose = n.spot?.pose ?? 'stand';
      poseGroup(n.g, pose, 0, false);
      if (pose === 'stand' && (n.c.act?.id === 'club' || n.c.act?.id === 'rave')) n.g.position.y = Math.abs(Math.sin(time * 6 + n.phase)) * 0.2;
      if (pose === 'sit') n.g.rotation.y = (n.spot?.ry ?? 0) + Math.sin(time * 0.5 + n.phase) * 0.1;
    }
  }

  /** ближайшее место или житель */
  nearest(x: number, z: number): { spot?: Spot; npc?: Citizen; d: number } | null {
    let best: { spot?: Spot; npc?: Citizen; d: number } | null = null;
    for (const s of this.spots) {
      if (s.npc !== undefined) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < 1.5 && (!best || d < best.d)) best = { spot: s, d };
    }
    for (const n of this.npcs) {
      const d = Math.hypot(n.g.position.x - x, n.g.position.z - z);
      if (d < 1.8 && (!best || d < best.d - 0.3)) best = { npc: n.c, d };
    }
    return best;
  }
}
