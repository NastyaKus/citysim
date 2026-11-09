// Модели зданий по стилям. Локальные координаты: фасад смотрит в +Z (на дорогу), участок W×D с центром в 0.
import * as THREE from 'three';
import { BuildCtx } from './buildCtx';
import { P } from './palette';
import { GB, shadeColor, mixColor } from './lowpoly';
import { FLOOR_H } from '../sim/world';

type StyleFn = (c: BuildCtx) => void;

const pickCol = (c: BuildCtx) => c.rng.pick(c.b.def.colors);
const ROOFS = [P.roofRed, P.roofBrown, P.roofGrey, P.roofGreen, P.roofBlue];

function flatRoof(c: BuildCtx, w: number, d: number, x: number, y: number, z: number, col = P.roofFlat) {
  c.gb.box(w + 0.4, 0.4, d + 0.4, shadeColor(col, 0.9), x, y, z);
  c.gb.box(w - 0.6, 0.15, d - 0.6, col, x, y + 0.4, z);
  c.snowFlat(w, d, x, y + 0.4, z);
}

function yardTrees(c: BuildCtx, n: number, margin = 1.5, avoid = 0) {
  const { W, D, rng } = c;
  for (let i = 0; i < n; i++) {
    const side = rng.int(0, 3);
    let x = 0, z = 0;
    if (side === 0) { x = rng.range(-W / 2 + margin, W / 2 - margin); z = -D / 2 + margin; }
    else if (side === 1) { x = -W / 2 + margin; z = rng.range(-D / 2 + margin, D / 2 - margin - avoid); }
    else if (side === 2) { x = W / 2 - margin; z = rng.range(-D / 2 + margin, D / 2 - margin - avoid); }
    else { x = rng.range(-W / 2 + margin, W / 2 - margin); z = -D / 2 + margin + 1; }
    c.tree(x, z, rng.pick(['round', 'round', 'birch', 'pine', 'poplar', 'bush']), rng.range(0.8, 1.15));
  }
}

function frontPath(c: BuildCtx, w = 2.2, len = 3, color = P.plaza) {
  c.paved(w, len, color, 0, c.D / 2 - len / 2);
}

// ——— ЖИЛЬЁ
const panel: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.lawn();
  const bw = W - 3, bd = Math.min(8, D - 6), h = b.floors * FLOOR_H;
  const z0 = D / 2 - 2.5 - bd / 2;
  const col = pickCol(c);
  c.gb.box(bw, 0.6, bd, shadeColor(col, 0.7), 0, 0, z0);
  c.gb.box(bw, h - 0.6, bd, col, 0, 0.6, z0, { shade: 0.12 });
  // швы панелей
  for (let f = 1; f < b.floors; f++) c.gb.box(bw + 0.08, 0.12, bd + 0.08, shadeColor(col, 0.85), 0, f * FLOOR_H, z0);
  // вертикальная акцентная полоса
  const accent = rng.pick([0xe07a5f, 0x3d85c6, 0x81b29a, 0xf2cc8f, 0xb56576]);
  if (rng.chance(0.6)) c.gb.box(1.2, h - 1, 0.1, accent, rng.pick([-bw / 4, bw / 4, 0]), 1, z0 + bd / 2 + 0.03);
  c.facade(0, z0, bw, bd, 0.6, b.floors, FLOOR_H, { sp: 2.6 });
  // балконы на фасаде
  const nb = Math.floor(bw / 5);
  for (let f = 1; f < b.floors; f++)
    for (let i = 0; i < nb; i++) {
      if (rng.chance(0.25)) continue;
      const x = -bw / 2 + (bw / nb) * (i + 0.5);
      c.gb.box(2.2, 0.9, 1, rng.chance(0.3) ? accent : shadeColor(col, 0.92), x, f * FLOOR_H, z0 + bd / 2 + 0.5);
    }
  flatRoof(c, bw, bd, 0, h, z0);
  c.gb.box(2.5, 2, 2.5, shadeColor(col, 0.8), rng.range(-bw / 3, bw / 3), h + 0.4, z0);
  if (rng.chance(0.5)) c.gb.cyl(0.05, 0.05, 3, 4, 0x666666, bw / 3, h + 0.4, z0 - 1);
  // подъезды
  const ent = Math.max(1, Math.floor(bw / 6));
  for (let i = 0; i < ent; i++) {
    const x = -bw / 2 + (bw / ent) * (i + 0.5);
    c.door(x, z0 + bd / 2 + 0.05, 0x6b4f3a);
    c.canopy(x, 2.6, z0 + bd / 2, 2.4, 0x8d99a6);
    c.gb.box(2.2, 0.3, 1.6, P.concrete, x, 0, z0 + bd / 2 + 0.8);
  }
  c.paved(W - 2, 2.6, P.plaza, 0, D / 2 - 1.3);
  c.bench(-W / 2 + 2.5, -D / 2 + 3, Math.PI / 2);
  yardTrees(c, rng.int(2, 4), 1.4, 4);
  c.lamp(W / 2 - 1.2, D / 2 - 1.2);
};

const khrush: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.lawn();
  const bw = W - 3.5, bd = 7.5, h = b.floors * 3;
  const z0 = D / 2 - 3 - bd / 2;
  const col = pickCol(c);
  c.gb.box(bw, h, bd, col, 0, 0, z0, { shade: 0.15 });
  for (let f = 1; f < b.floors; f++) c.gb.box(bw + 0.06, 0.1, bd + 0.06, shadeColor(col, 0.88), 0, f * 3, z0);
  c.facade(0, z0, bw, bd, 0, b.floors, 3, { sp: 2.4 });
  // низкая скатная крыша
  c.gb.gable(bw + 0.6, 1.6, bd + 0.8, P.roofGrey, 0, h, z0);
  c.snowGable(bw + 0.6, 1.6, bd + 0.8, 0, h, z0);
  for (const x of [-bw / 4, bw / 4]) {
    c.door(x, z0 + bd / 2 + 0.05, 0x4a6670);
    c.canopy(x, 2.4, z0 + bd / 2, 2, 0x9aa0a6);
  }
  c.gb.box(0.6, 1.4, 0.6, 0x8b4c39, -bw / 3, h + 0.6, z0);
  c.paved(W - 3, 2.2, P.plaza, 0, D / 2 - 1.1);
  // сушилка для белья / лавочка
  if (rng.chance(0.5)) {
    c.gb.box(0.08, 1.8, 0.08, 0x666666, -2, 0, -D / 2 + 2);
    c.gb.box(0.08, 1.8, 0.08, 0x666666, 2, 0, -D / 2 + 2);
    c.gb.box(4, 0.04, 0.04, 0xeeeeee, 0, 1.75, -D / 2 + 2);
    for (let i = 0; i < 4; i++) c.gb.box(0.5, 0.6, 0.03, rng.pick([0xff99c8, 0x80ed99, 0xffffff, 0x457b9d]), -1.5 + i, 1.15, -D / 2 + 2);
  }
  c.bench(W / 2 - 2, -D / 2 + 3, -Math.PI / 2);
  yardTrees(c, rng.int(2, 4), 1.4, 4);
  c.lamp(-W / 2 + 1.2, D / 2 - 1.2);
};

const townhouse: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.lawn();
  const units = 3;
  const uw = (W - 2) / units, bd = 7, h = b.floors * 3;
  const z0 = D / 2 - 4.5 - bd / 2;
  for (let i = 0; i < units; i++) {
    const x = -W / 2 + 1 + uw * (i + 0.5);
    const col = rng.pick(b.def.colors);
    c.gb.box(uw - 0.1, h, bd, col, x, 0, z0, { shade: 0.1 });
    const roof = rng.pick(ROOFS);
    c.gb.gable(bd + 0.6, 2.4, uw + 0.1, roof, x, h, z0, { ry: Math.PI / 2 });
    c.snowGable(bd + 0.6, 2.4, uw + 0.1, x, h, z0);
    c.facade(x, z0, uw - 0.1, bd, 0, b.floors, 3, { sp: 2.2, sides: false });
    c.door(x, z0 + bd / 2 + 0.05, rng.pick([0xc0392b, 0x2e86de, 0x27ae60, 0xf39c12, 0x8e44ad]), 1.2, 2.2);
    c.gb.box(1.6, 0.25, 1.2, P.concrete, x, 0, z0 + bd / 2 + 0.6);
    c.fence(x - uw / 2 + 0.2, D / 2 - 0.3, x + uw / 2 - 0.2, D / 2 - 0.3, 0xf5f5f0, 0.8, 0.5);
    if (rng.chance(0.6)) c.tree(x + uw / 3, D / 2 - 2, 'bush', 0.8);
  }
  yardTrees(c, 2, 1.4, 6);
};

const house: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.lawn();
  const bw = rng.range(6.5, 8), bd = rng.range(6, 7), h = b.floors * 3;
  const z0 = rng.range(-1, 1);
  const x0 = rng.range(-1.5, 1.5);
  const col = pickCol(c);
  c.gb.box(bw, 0.5, bd, P.concrete, x0, 0, z0);
  c.gb.box(bw, h - 0.5, bd, col, x0, 0.5, z0, { shade: 0.1 });
  const roof = rng.pick(ROOFS);
  if (rng.chance(0.7)) {
    c.gb.gable(bw + 0.8, 2.6, bd + 0.8, roof, x0, h, z0);
    c.snowGable(bw + 0.8, 2.6, bd + 0.8, x0, h, z0);
  } else {
    c.gb.hip(bw + 0.8, 2.2, bd + 0.8, roof, x0, h, z0);
    c.snow.hip(bw + 1, 2.3, bd + 1, 0xffffff, x0, h + 0.05, z0);
  }
  c.gb.box(0.7, 2, 0.7, 0x8b4c39, x0 + bw / 3, h + 0.6, z0 - 1);
  c.facade(x0, z0, bw, bd, 0.5, b.floors, 3, { sp: 2.6 });
  c.door(x0, z0 + bd / 2 + 0.05, rng.pick([0x8b5a2b, 0xc0392b, 0x2e86de]), 1.2, 2.2);
  // крыльцо
  c.gb.box(2.4, 0.3, 1.6, P.wood, x0, 0, z0 + bd / 2 + 0.8);
  c.gb.box(2.6, 0.15, 1.8, roof, x0, 2.6, z0 + bd / 2 + 0.8);
  c.gb.box(0.12, 2.3, 0.12, P.white, x0 - 1.1, 0.3, z0 + bd / 2 + 1.5);
  c.gb.box(0.12, 2.3, 0.12, P.white, x0 + 1.1, 0.3, z0 + bd / 2 + 1.5);
  // дорожка, забор, сад
  c.paved(1.4, D / 2 - z0 - bd / 2 - 1.6, P.path, x0, (D / 2 + z0 + bd / 2 + 1.6) / 2);
  const fc = rng.pick([0xf5f5f0, 0xa97c50, 0x6b8e4e]);
  c.fence(-W / 2 + 0.4, D / 2 - 0.4, W / 2 - 0.4, D / 2 - 0.4, fc, 0.9, (x0 + W / 2 - 0.4) / (W - 0.8));
  c.fence(-W / 2 + 0.4, -D / 2 + 0.4, W / 2 - 0.4, -D / 2 + 0.4, fc, 0.9);
  c.fence(-W / 2 + 0.4, -D / 2 + 0.4, -W / 2 + 0.4, D / 2 - 0.4, fc, 0.9);
  c.fence(W / 2 - 0.4, -D / 2 + 0.4, W / 2 - 0.4, D / 2 - 0.4, fc, 0.9);
  c.gb.box(0.3, 0.4, 0.25, 0x2e86de, x0 + 1.6, 1, D / 2 - 0.5);
  c.gb.box(0.08, 1, 0.08, 0x555555, x0 + 1.6, 0, D / 2 - 0.5);
  // грядки
  if (rng.chance(0.6)) for (let i = 0; i < 3; i++) c.gb.box(3, 0.3, 0.7, 0x6b4226, -W / 2 + 3, 0, -D / 2 + 2 + i * 1.2);
  if (rng.chance(0.4)) c.flower(W / 2 - 2.2, D / 2 - 2, 2, 1);
  for (let i = 0; i < rng.int(2, 4); i++) c.tree(rng.chance(0.5) ? -W / 2 + 1.8 : W / 2 - 1.8, rng.range(-D / 2 + 1.8, 0), rng.pick(['round', 'round', 'pine', 'birch']), 0.9);
  // качели / батут
  if (rng.chance(0.3)) {
    c.gb.box(0.1, 2, 0.1, 0x555555, W / 2 - 4, 0, -D / 2 + 2);
    c.gb.box(0.1, 2, 0.1, 0x555555, W / 2 - 2, 0, -D / 2 + 2);
    c.gb.box(2.2, 0.1, 0.1, 0x555555, W / 2 - 3, 2, -D / 2 + 2);
    c.gb.box(0.6, 0.06, 0.3, 0xe63946, W / 2 - 3, 0.6, -D / 2 + 2);
  }
};

const tower: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.paved(W, D, P.plaza);
  const bw = 10, bd = 10, h = b.floors * FLOOR_H;
  const col = pickCol(c);
  c.gb.box(bw + 2, 4, bd + 2, shadeColor(col, 0.8), 0, 0, -0.5);
  c.gb.box(bw, h - 4, bd, col, 0, 4, -0.5, { shade: 0.15 });
  for (const [x, z] of [[-bw / 2, bd / 2], [bw / 2, bd / 2], [-bw / 2, -bd / 2], [bw / 2, -bd / 2]]) c.gb.box(0.8, h - 4, 0.8, shadeColor(col, 0.75), x, 4, z - 0.5);
  c.facade(0, -0.5, bw, bd, 4, b.floors - 1, FLOOR_H, { sp: 2.2 });
  c.facade(0, -0.5, bw + 2, bd + 2, 0.2, 1, 3.8, { sp: 3.5, sx: 2, sy: 1.6 });
  c.gb.box(bw - 2, 2.5, bd - 2, shadeColor(col, 0.85), 0, h, -0.5);
  flatRoof(c, bw - 2, bd - 2, 0, h + 2.5, -0.5);
  c.gb.cyl(0.08, 0.08, 6, 4, 0xcccccc, 2, h + 2.9, -1);
  c.neon.ico(0.25, 0xff3333, 2, h + 9, -1);
  c.door(0, bd / 2 + 0.5, 0x333333, 3, 2.8);
  c.canopy(0, 3.2, bd / 2 + 0.5, 4.5, 0x555b66);
  c.tree(-W / 2 + 1.5, D / 2 - 1.5, 'round');
  c.tree(W / 2 - 1.5, D / 2 - 1.5, 'round');
  c.flower(-4, D / 2 - 1.3, 3, 1);
  c.flower(4, D / 2 - 1.3, 3, 1);
  c.lamp(W / 2 - 1, D / 2 - 3);
  void rng;
};

const dorm: StyleFn = (c) => {
  panel(c);
  const bd = Math.min(8, c.D - 6);
  const z0 = c.D / 2 - 2.5 - bd / 2;
  c.sign(0, c.b.floors * FLOOR_H - 1.6, z0 + bd / 2 + 0.1, 7, 1.2, 0xf4d35e, false);
};

// ——— ОФИСЫ И УЧРЕЖДЕНИЯ
const office: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.paved(W, D, P.plaza);
  const bw = W - 3, bd = D - 5, h = b.floors * FLOOR_H;
  const col = pickCol(c);
  const z0 = -1;
  c.gb.box(bw, h, bd, col, 0, 0, z0, { shade: 0.1 });
  // ленточное остекление
  for (let f = 0; f < b.floors; f++) c.gb.box(bw + 0.1, 0.5, bd + 0.1, shadeColor(col, 0.75), 0, f * FLOOR_H, z0);
  c.facade(0, z0, bw, bd, 0.3, b.floors, FLOOR_H, { sp: 2.1, sx: 1.7, sy: 1.15 });
  flatRoof(c, bw, bd, 0, h, z0, P.roofGrey);
  for (let i = 0; i < rng.int(2, 4); i++) c.ac(rng.range(-bw / 3, bw / 3), h + 0.4, rng.range(-bd / 3, bd / 3) + z0);
  c.door(0, z0 + bd / 2 + 0.05, 0x2b2d42, 2.6, 2.6);
  c.canopy(0, 3, z0 + bd / 2, 4, 0x3d405b);
  c.sign(0, h - 1.4, z0 + bd / 2 + 0.05, Math.min(8, bw - 2), 1.1, b.def.signColor ?? 0xffffff, true);
  c.tree(-W / 2 + 1.3, D / 2 - 1.3, 'poplar');
  c.tree(W / 2 - 1.3, D / 2 - 1.3, 'poplar');
  c.lamp(-W / 2 + 1.2, D / 2 - 3.5);
};

const bizcenter: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.paved(W, D, P.plazaDark);
  const col = pickCol(c);
  const h = b.floors * FLOOR_H;
  const steps = 3;
  let bw = W - 3, bd = D - 4, y = 0;
  for (let s = 0; s < steps; s++) {
    const sh = (s === 0 ? 0.5 : s === 1 ? 0.35 : 0.15) * h;
    c.gb.box(bw, sh, bd, s % 2 ? shadeColor(col, 1.08) : col, 0, y, -0.5, { shade: 0.08 });
    const fl = Math.max(1, Math.round(sh / FLOOR_H));
    c.facade(0, -0.5, bw, bd, y, fl, sh / fl, { sp: 1.9, sx: 1.5, sy: 1.25 });
    for (let k = 0; k < fl; k++) c.gb.box(bw + 0.06, 0.3, bd + 0.06, shadeColor(col, 0.7), 0, y + k * (sh / fl), -0.5);
    y += sh;
    c.snowFlat(bw, bd, 0, y, -0.5);
    bw -= 2.5; bd -= 2.5;
  }
  c.gb.box(bw, 0.5, bd, P.roofGrey, 0, y, -0.5);
  c.gb.cyl(0.1, 0.1, 8, 4, 0xdddddd, 0, y, -0.5);
  c.neon.ico(0.3, 0xff2222, 0, y + 8, -0.5);
  c.neon.box(4, 1, 0.1, b.def.signColor ?? 0xbde0fe, 0, y - 2.4, (D - 4 - 2.5 * 2) / 2 - 0.4);
  c.door(0, (D - 4) / 2 - 0.4, 0x222222, 4, 3.2);
  c.gb.box(6, 0.2, 2.4, P.darkMetal, 0, 3.4, (D - 4) / 2 + 0.6);
  c.tree(-W / 2 + 1.3, D / 2 - 1, 'poplar');
  c.tree(W / 2 - 1.3, D / 2 - 1, 'poplar');
  c.lamp(W / 2 - 1.2, D / 2 - 3);
  void rng;
};

const itoffice: StyleFn = (c) => {
  const { b, W, D } = c;
  c.paved(W, D, 0xd9d9d9);
  const bw = W - 3, bd = D - 5, h = b.floors * FLOOR_H;
  c.gb.box(bw, h, bd, 0x2e3440, 0, 0, -1);
  c.facade(0, -1, bw, bd, 0.3, b.floors, FLOOR_H, { sp: 1.8, sx: 1.4, sy: 1.3 });
  for (let f = 1; f <= b.floors; f++) c.neon.box(bw + 0.12, 0.15, bd + 0.12, b.def.signColor ?? 0x88c0d0, 0, f * FLOOR_H - 0.3, -1);
  flatRoof(c, bw, bd, 0, h, -1, 0x3b4252);
  // терраса на крыше
  for (let i = 0; i < 4; i++) c.tree(-bw / 2 + 1.5 + i * 2.5, -1 - bd / 2 + 1.5, 'bush', 0.6);
  c.trees.slice(-4).forEach((t) => (t.y = h + 0.5));
  c.sign(0, h - 1.5, -1 + bd / 2 + 0.05, 5, 1, 0x88c0d0);
  c.door(0, -1 + bd / 2 + 0.05, 0x111111, 2.5, 2.6);
  c.bench(-4, D / 2 - 1.5);
  // самокаты
  for (let i = 0; i < 3; i++) { c.gb.box(0.2, 1, 0.08, 0x2ecc71, 3 + i * 0.8, 0, D / 2 - 1.2); c.gb.box(0.25, 0.08, 1, 0x2ecc71, 3 + i * 0.8, 0.1, D / 2 - 1.2); }
};

const cowork: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.paved(W, D, 0xcbb994);
  const bw = W - 3, bd = D - 5, h = b.floors * 3.6;
  c.gb.box(bw, h, bd, 0xa0522d, 0, 0, -1, { shade: 0.15 });
  c.facade(0, -1, bw, bd, 0.3, b.floors, 3.6, { sp: 2.6, sx: 1.6, sy: 1.7 });
  flatRoof(c, bw, bd, 0, h, -1, 0x5d4037);
  c.gb.box(1.2, 4, 1.2, 0x6d4c41, bw / 2 - 1.5, h, -1 - bd / 2 + 1.5);
  c.sign(0, h - 1.4, -1 + bd / 2 + 0.05, 6, 1.1, b.def.signColor ?? 0x264653, false);
  c.door(0, -1 + bd / 2 + 0.05, 0x264653, 2.2, 2.6);
  // гирлянда
  for (let i = 0; i < 10; i++) c.neon.ico(0.12, rng.pick([0xffe066, 0xff8fab, 0x9bf6ff]), -W / 2 + 1.5 + i * ((W - 3) / 9), 3 + Math.sin(i) * 0.2, D / 2 - 1.5);
  c.umbrellaTable(-4, D / 2 - 2, 0xe9c46a);
  c.umbrellaTable(4, D / 2 - 2, 0xf4a261);
};

const cityhall: StyleFn = (c) => {
  const { b, W, D } = c;
  c.paved(W, D, 0xe0d5c0);
  const bw = W - 2, bd = D - 6, h = b.floors * 3.6;
  const z0 = -1.5;
  c.gb.box(bw, h, bd, 0xf0e6d2, 0, 0.8, z0, { shade: 0.08 });
  c.gb.box(bw + 1, 0.8, bd + 1, 0xc8bca8, 0, 0, z0);
  c.facade(0, z0, bw, bd, 0.8, b.floors, 3.6, { sp: 2.4, sy: 1.4 });
  // портик
  const pz = z0 + bd / 2 + 1.8;
  for (let i = 0; i < 6; i++) c.gb.cyl(0.4, 0.45, h - 1, 8, 0xfaf3e3, -5 + i * 2, 0.8, pz);
  c.gb.box(12.5, 0.8, 3.2, 0xe8dcc4, 0, h - 0.2, pz - 0.5);
  c.gb.gable(12.5, 2.2, 3.2, 0xe8dcc4, 0, h + 0.6, pz - 0.5, { ry: 0 });
  c.gb.box(12, 0.3, 3.5, 0xd9cdb5, 0, 0.5, pz - 0.2);
  c.gb.box(10, 0.3, 1.2, 0xd9cdb5, 0, 0.2, pz + 1.6);
  flatRoof(c, bw, bd, 0, h + 0.8, z0, 0x8a9a5b);
  // башня с часами
  c.gb.box(4, 6, 4, 0xf0e6d2, 0, h + 0.8, z0);
  c.gb.cyl(1.2, 1.2, 0.2, 12, 0xffffff, 0, h + 4.5, z0 + 2.05, { rx: Math.PI / 2 });
  c.gb.box(0.12, 0.9, 0.1, 0x222222, 0, h + 4.5, z0 + 2.2);
  c.gb.box(0.7, 0.12, 0.1, 0x222222, 0.3, h + 4.5, z0 + 2.2);
  c.gb.hip(4.4, 2.5, 4.4, 0x4f7d5c, 0, h + 6.8, z0);
  // флаг
  c.gb.cyl(0.08, 0.08, 5, 4, 0xcccccc, 0, h + 9.3, z0);
  c.dyn.push({ kind: 'flag', x: 0.9, y: h + 13.4, z: z0, ry: 0, b: b.id });
  c.door(0, z0 + bd / 2 + 0.05, 0x6b4f3a, 2.4, 3.2);
  c.flower(-W / 2 + 2.5, D / 2 - 1.3, 3, 1.2);
  c.flower(W / 2 - 2.5, D / 2 - 1.3, 3, 1.2);
  c.lamp(-W / 2 + 1, D / 2 - 1);
  c.lamp(W / 2 - 1, D / 2 - 1);
};

const police: StyleFn = (c) => {
  const { b, W, D } = c;
  c.paved(W, D, 0xb0b6be);
  const bw = W - 3, bd = D - 6, h = b.floors * 3.4;
  c.gb.box(bw, h, bd, 0xdfe6ee, 0, 0, -1.5, { shade: 0.1 });
  c.gb.box(bw + 0.1, 0.8, bd + 0.1, 0x2b59c3, 0, h - 1.2, -1.5);
  c.facade(0, -1.5, bw, bd, 0, b.floors, 3.4, { sp: 2.4 });
  flatRoof(c, bw, bd, 0, h, -1.5, P.roofGrey);
  c.gb.cyl(0.05, 0.05, 4, 4, 0x999999, bw / 3, h + 0.4, -2);
  c.sign(0, h - 2.6, -1.5 + bd / 2 + 0.05, 5, 1, 0x2b59c3);
  c.door(0, -1.5 + bd / 2 + 0.05, 0x1d3557, 2, 2.5);
  // служебная машина на парковке
  const car = new GB();
  car.box(4.2, 0.9, 1.9, 0xffffff, 0, 0.35, 0);
  car.box(2.4, 0.7, 1.7, 0x9ec9e2, -0.2, 1.25, 0);
  car.box(4.25, 0.25, 1.95, 0x2b59c3, 0, 0.8, 0);
  car.box(0.8, 0.2, 1.2, 0xe63946, -0.2, 1.95, 0);
  c.gb.merge(car, -W / 2 + 3.5, 0, D / 2 - 2.2, 0);
  c.lamp(W / 2 - 1, D / 2 - 1);
};

const firestation: StyleFn = (c) => {
  const { b, W, D } = c;
  c.paved(W, D, 0xb0a99f);
  const bw = W - 4, bd = D - 6, h = 7;
  c.gb.box(bw, h, bd, 0xc94f4f, 0, 0, -1.5, { shade: 0.12 });
  for (let i = 0; i < 3; i++) {
    const x = -bw / 2 + (bw / 3) * (i + 0.5);
    c.gb.box(3, 4, 0.2, 0xf1f1f1, x, 0, -1.5 + bd / 2 + 0.05);
    for (let k = 0; k < 4; k++) c.gb.box(3, 0.08, 0.25, 0xcccccc, x, 0.9 + k, -1.5 + bd / 2 + 0.06);
  }
  c.facade(0, -1.5, bw, bd, 4.2, 1, 2.8, { sp: 2.2, skipFront: 1 });
  flatRoof(c, bw, bd, 0, h, -1.5, 0x7a2e2e);
  // каланча
  c.gb.box(3, 14, 3, 0xb03a3a, bw / 2 + 0.5, 0, -D / 2 + 3);
  c.gb.box(3.6, 1.6, 3.6, 0x8c2f2f, bw / 2 + 0.5, 14, -D / 2 + 3);
  c.gb.hip(3.8, 1.8, 3.8, 0x5a1e1e, bw / 2 + 0.5, 15.6, -D / 2 + 3);
  c.sign(0, h - 1.4, -1.5 + bd / 2 + 0.06, 7, 1, 0xffd60a, false);
  c.hydrant(W / 2 - 1, D / 2 - 1);
};

const post: StyleFn = (c) => {
  const { b, W, D } = c;
  c.lawn();
  c.paved(W - 2, 4, P.plaza, 0, D / 2 - 2);
  const bw = W - 4, bd = D - 7, h = b.floors * 3.4;
  c.gb.box(bw, h, bd, 0xe8eef6, 0, 0, -1.5, { shade: 0.1 });
  c.gb.box(bw + 0.1, 0.9, bd + 0.1, 0x1f5fbf, 0, h - 1, -1.5);
  c.facade(0, -1.5, bw, bd, 0, b.floors, 3.4, { sp: 2.6, sy: 1.3 });
  flatRoof(c, bw, bd, 0, h, -1.5, 0x5e6e82);
  c.door(0, -1.5 + bd / 2 + 0.05, 0x1f5fbf, 2, 2.5);
  c.gb.box(0.6, 1, 0.5, 0x1f5fbf, 2.5, 0, D / 2 - 3.5);
  c.gb.box(0.7, 0.2, 0.6, 0x1f5fbf, 2.5, 1, D / 2 - 3.5);
  c.tree(-W / 2 + 1.5, -D / 2 + 1.5, 'round');
};

const bank: StyleFn = (c) => {
  const { b, W, D } = c;
  c.paved(W, D, 0xd8d0c0);
  const bw = W - 3, bd = D - 6, h = b.floors * 3.6;
  c.gb.box(bw, h, bd, 0xd8d0c0, 0, 0.6, -1.5, { shade: 0.1 });
  c.gb.box(bw + 0.8, 0.6, bd + 0.8, 0xbfb5a2, 0, 0, -1.5);
  c.facade(0, -1.5, bw, bd, 0.6, b.floors, 3.6, { sp: 2.6, sy: 1.5 });
  for (let i = 0; i < 4; i++) c.gb.box(0.8, h - 0.5, 0.8, 0xece5d6, -4.5 + i * 3, 0.6, -1.5 + bd / 2 + 0.6);
  c.gb.box(bw + 0.6, 1, bd + 1.6, 0xc9bfaa, 0, h + 0.1, -1);
  c.snowFlat(bw + 0.6, bd + 1.6, 0, h + 1.1, -1);
  c.neon.box(5, 0.9, 0.1, b.def.signColor ?? 0x2a9d8f, 0, h - 1.2, -1.5 + bd / 2 + 1.05);
  c.gb.box(8, 0.3, 1.5, 0xc9bfaa, 0, 0, -1.5 + bd / 2 + 1.8);
  c.door(0, -1.5 + bd / 2 + 0.05, 0x3d2b1f, 2.2, 3);
  c.gb.box(1, 2, 0.4, 0x2a9d8f, W / 2 - 1.5, 0, D / 2 - 1);
  c.neon.box(0.7, 0.4, 0.05, 0x9be7ff, W / 2 - 1.5, 1.4, D / 2 - 0.78);
};

// ——— МАГАЗИНЫ И ЕДА
function shopBase(c: BuildCtx, o: { col?: number; floors?: number; awning?: [number, number]; signText?: number; bw?: number; bd?: number; roof?: 'flat' | 'gable' } = {}) {
  const { b, rng, W, D } = c;
  const floors = o.floors ?? b.floors;
  const bw = o.bw ?? W - 3.5, bd = o.bd ?? D - 7, h = floors * 3.4;
  const z0 = D / 2 - 3.5 - bd / 2;
  const col = o.col ?? pickCol(c);
  c.gb.box(bw, h, bd, col, 0, 0, z0, { shade: 0.1 });
  // витрина
  c.gb.box(bw - 1.2, 2.4, 0.1, 0x9ec9e2, 0, 0.4, z0 + bd / 2 + 0.03);
  c.win(-bw / 4, 1.6, z0 + bd / 2 + 0.1, 0, (bw - 3) / 2.2, 1.4);
  c.win(bw / 4, 1.6, z0 + bd / 2 + 0.1, 0, (bw - 3) / 2.2, 1.4);
  if (floors > 1) c.facade(0, z0, bw, bd, 3.4, floors - 1, 3.4, { sp: 2.6 });
  c.facade(0, z0, bw, bd, 0, 1, 3.4, { sp: 3, back: false, sides: true, skipFront: 1 });
  if (o.roof === 'gable') { c.gb.gable(bw + 0.6, 2.2, bd + 0.6, rng.pick(ROOFS), 0, h, z0); c.snowGable(bw + 0.6, 2.2, bd + 0.6, 0, h, z0); }
  else flatRoof(c, bw, bd, 0, h, z0, P.roofGrey);
  if (o.awning) c.awning(0, 2.9, z0 + bd / 2, bw - 0.6, o.awning[0], o.awning[1]);
  c.sign(0, 3.25, z0 + bd / 2 + 0.06, Math.min(bw - 1, 7), 1, o.signText ?? b.def.signColor ?? 0xffffff);
  c.door(bw / 2 - 1.4, z0 + bd / 2 + 0.06, 0x333333, 1.4, 2.4);
  c.paved(W, D / 2 - z0 - bd / 2 + 0.5, P.plaza, 0, (D / 2 + z0 + bd / 2) / 2);
  return { bw, bd, h, z0 };
}

const grocery: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.lawn();
  const { bw, bd, z0 } = shopBase(c, { awning: [0xe76f51, 0xffffff] });
  for (let i = 0; i < 3; i++) {
    c.gb.box(0.9, 0.5, 0.6, P.wood, -bw / 2 + 1 + i * 1.1, 0, z0 + bd / 2 + 1.2);
    for (let k = 0; k < 4; k++) c.gb.ico(0.16, rng.pick([0xff595e, 0xffca3a, 0x8ac926, 0xff924c]), -bw / 2 + 0.75 + i * 1.1 + (k % 2) * 0.4, 0.6, z0 + bd / 2 + 1.05 + Math.floor(k / 2) * 0.3);
  }
  c.trash(W / 2 - 1, D / 2 - 1);
  c.tree(-W / 2 + 1.5, -D / 2 + 1.5, 'round');
};

const supermarket: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  const bw = W - 4, bd = 9, h = 6;
  const z0 = -D / 2 + 1.5 + bd / 2;
  c.paved(W, D, 0x6b6f78);
  c.gb.box(bw, h, bd, 0xf1f1f1, 0, 0, z0, { shade: 0.08 });
  c.gb.box(bw + 0.1, 1.2, bd + 0.1, b.def.signColor ?? 0xd62828, 0, h - 1.4, z0);
  c.gb.box(bw - 6, 3, 0.1, 0x9ec9e2, 0, 0.3, z0 + bd / 2 + 0.03);
  c.win(-bw / 4, 1.8, z0 + bd / 2 + 0.1, 0, (bw - 8) / 2.2, 1.7);
  c.win(bw / 4, 1.8, z0 + bd / 2 + 0.1, 0, (bw - 8) / 2.2, 1.7);
  flatRoof(c, bw, bd, 0, h, z0, 0xbfc5cc);
  for (let i = 0; i < 4; i++) c.ac(-bw / 2 + 4 + i * 6, h + 0.4, z0);
  c.neon.box(10, 1.2, 0.1, 0xffffff, 0, h - 1.3, z0 + bd / 2 + 0.12);
  // разметка парковки
  for (let i = 0; i < 9; i++) c.gb.box(0.15, 0.02, 3.5, 0xffffff, -W / 2 + 3 + i * 3.2, 0.05, D / 2 - 2.5);
  // тележки
  for (let i = 0; i < 4; i++) c.gb.box(0.8, 0.8, 0.5, 0x999999, bw / 2 - 2 - i * 0.6, 0, z0 + bd / 2 + 1);
  // припаркованные машины
  for (let i = 0; i < 4; i++) {
    if (rng.chance(0.3)) continue;
    const car = new GB();
    const cc = rng.pick([0xe63946, 0x1d3557, 0xf1faee, 0x8d99ae, 0x2a9d8f]);
    car.box(1.8, 0.8, 4, cc, 0, 0.3, 0);
    car.box(1.6, 0.7, 2.2, 0x9ec9e2, 0, 1.1, -0.2);
    c.gb.merge(car, -W / 2 + 4.6 + i * 6.4, 0, D / 2 - 2.5, 0);
  }
  c.lamp(-W / 2 + 1, D / 2 - 1);
  c.lamp(W / 2 - 1, D / 2 - 1);
};

const kiosk: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.lawn();
  c.paved(W - 2, 7, P.plaza, 0, D / 2 - 3.5);
  const col = pickCol(c);
  c.gb.box(4, 2.8, 3, col, 0, 0, D / 2 - 4.5);
  c.gb.box(4.4, 0.25, 3.4, shadeColor(col, 0.7), 0, 2.8, D / 2 - 4.5);
  c.gb.box(2.8, 1, 0.1, 0x9ec9e2, 0, 1.1, D / 2 - 2.98);
  c.win(0, 1.6, D / 2 - 2.9, 0, 2.2, 0.7);
  c.neon.box(3.6, 0.5, 0.1, b.def.signColor ?? 0xf2e8cf, 0, 2.2, D / 2 - 2.9);
  c.trash(2.8, D / 2 - 3);
  c.bench(-3.5, D / 2 - 2.5);
  c.gb.box(0.8, 1.6, 0.6, 0xd62828, 2.6, 0, D / 2 - 5.6);
  c.neon.box(0.6, 1.1, 0.05, 0xffffff, 2.6, 0.3, D / 2 - 5.28);
  for (let i = 0; i < 3; i++) c.tree(rng.range(-W / 2 + 2, W / 2 - 2), rng.range(-D / 2 + 2, -1), rng.pick(['round', 'birch', 'pine']));
  c.lamp(-W / 2 + 1.5, D / 2 - 1.5);
};

const pharmacy: StyleFn = (c) => {
  const { b, W, D } = c;
  c.lawn();
  const { bw, bd, h, z0 } = shopBase(c, { col: 0xf7fbf7, awning: undefined });
  c.neon.box(1.6, 0.5, 0.15, b.def.signColor ?? 0x2a9d4f, bw / 2 - 0.4, h - 1.2, z0 + bd / 2 + 0.5);
  c.neon.box(0.5, 1.6, 0.15, b.def.signColor ?? 0x2a9d4f, bw / 2 - 0.4, h - 1.75, z0 + bd / 2 + 0.5);
  c.gb.box(0.1, 0.1, 0.6, 0x666666, bw / 2 - 0.4, h - 1, z0 + bd / 2 + 0.2);
  c.tree(-W / 2 + 1.4, -D / 2 + 1.4, 'birch');
  c.flower(-W / 2 + 2, D / 2 - 1, 2.4, 0.8);
};

const bakery: StyleFn = (c) => {
  const { W, D } = c;
  c.lawn();
  const { bw, bd, h, z0 } = shopBase(c, { awning: [0x8b5a2b, 0xf3e9dc], roof: 'gable' });
  c.gb.box(0.8, 2.5, 0.8, 0x8b4c39, bw / 3, h + 0.4, z0);
  c.dyn.push({ kind: 'chimney', x: bw / 3, y: h + 3.4, z: z0, ry: 0, b: c.b.id, s: 0.4 });
  // вывеска-крендель
  c.gb.torus(0.5, 0.18, 0xd4a373, -bw / 2 + 0.6, 3.6, z0 + bd / 2 + 0.6, { ry: 0 });
  c.umbrellaTable(-3, D / 2 - 1.6, 0xd4a373);
  c.tree(W / 2 - 1.5, -D / 2 + 1.5, 'round');
};

const coffee: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.lawn();
  const col = pickCol(c);
  const { bw, bd, z0 } = shopBase(c, { col, awning: [0x2f2f2f, 0x6f4e37], floors: 1 });
  c.gb.box(1.4, 1.4, 0.2, 0xf5deb3, -bw / 2 + 0.6, 3.4, z0 + bd / 2 + 0.6);
  c.gb.cyl(0.35, 0.3, 0.5, 8, 0x6f4e37, -bw / 2 + 0.6, 3.85, z0 + bd / 2 + 0.75);
  for (let i = 0; i < 3; i++) c.umbrellaTable(-W / 2 + 2.5 + i * 3.5, D / 2 - 1.5, rng.pick([0x6f4e37, 0xc8a27a, 0xf5deb3]));
  c.flower(W / 2 - 1.5, D / 2 - 3.5, 1.5, 0.6);
};

const cafe: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.lawn();
  const { bw, bd, z0 } = shopBase(c, { awning: [rng.pick([0xe63946, 0x2a9d8f, 0xf4a261]), 0xffffff] });
  for (let i = 0; i < 3; i++) c.umbrellaTable(-W / 2 + 2.5 + i * 3.4, D / 2 - 1.6, rng.pick([0xe9c46a, 0xe76f51, 0x2a9d8f]));
  // гирлянда над террасой
  for (let i = 0; i < 9; i++) c.neon.ico(0.11, rng.pick([0xffe066, 0xfff3b0]), -bw / 2 + i * (bw / 8), 2.9 - Math.sin((i / 8) * Math.PI) * 0.4, z0 + bd / 2 + 2.5);
  c.tree(-W / 2 + 1.4, -D / 2 + 1.4, 'round');
  c.tree(W / 2 - 1.4, -D / 2 + 1.4, 'round');
};

const shawarma: StyleFn = (c) => {
  const { W, D } = c;
  c.lawn();
  c.paved(W - 2, 8, P.plaza, 0, D / 2 - 4);
  const col = pickCol(c);
  c.gb.box(6, 3, 4, col, 0, 0, D / 2 - 5);
  c.gb.box(6.4, 0.3, 4.4, 0x073b4c, 0, 3, D / 2 - 5);
  c.gb.box(4, 1.3, 0.1, 0x9ec9e2, 0, 1, D / 2 - 2.97);
  c.win(0, 1.6, D / 2 - 2.9, 0, 3.2, 0.8);
  c.neon.box(5, 0.7, 0.12, 0xffd166, 0, 3.4, D / 2 - 3);
  // вертел
  c.gb.cyl(0.35, 0.25, 1, 8, 0xb5651d, -1.5, 1, D / 2 - 3.2);
  for (const x of [-3, 3]) { c.gb.cyl(0.08, 0.08, 1.1, 4, 0x555555, x, 0, D / 2 - 1.5); c.gb.cyl(0.45, 0.45, 0.06, 8, 0xdddddd, x, 1.1, D / 2 - 1.5); }
  c.trash(W / 2 - 1.5, D / 2 - 1);
  c.tree(-W / 2 + 1.6, -D / 2 + 1.6, 'poplar');
  c.tree(W / 2 - 1.6, -D / 2 + 1.6, 'poplar');
};

const pizzeria: StyleFn = (c) => {
  const { W, D } = c;
  c.lawn();
  const { bw, h, z0 } = shopBase(c, { col: 0xb5543c, awning: [0xe63946, 0xffffff] });
  c.gb.cyl(0.6, 0.7, 3, 8, 0x8b4c39, -bw / 3, h, z0 - 1);
  c.dyn.push({ kind: 'chimney', x: -bw / 3, y: h + 3, z: z0 - 1, ry: 0, b: c.b.id, s: 0.5 });
  c.umbrellaTable(-3, D / 2 - 1.5, 0xe63946);
  c.umbrellaTable(3, D / 2 - 1.5, 0x2a9d8f);
  c.tree(W / 2 - 1.4, -D / 2 + 1.4, 'round');
};

const restaurant: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.paved(W, D, P.plazaDark);
  const { bw, bd, z0 } = shopBase(c, { col: rng.pick(c.b.def.colors), awning: [0x3d405b, 0x81b29a] });
  // терраса с перилами и растениями
  c.gb.box(bw, 0.3, 3, P.wood, 0, 0, z0 + bd / 2 + 1.5);
  for (let i = 0; i < 5; i++) c.gb.cyl(0.4, 0.3, 0.6, 6, 0x6b4f3a, -bw / 2 + 1 + i * (bw - 2) / 4, 0.3, z0 + bd / 2 + 2.9);
  for (let i = 0; i < 5; i++) c.tree(-bw / 2 + 1 + i * (bw - 2) / 4, z0 + bd / 2 + 2.9, 'bush', 0.5);
  c.trees.slice(-5).forEach((t) => (t.y = 0.8));
  for (let i = 0; i < 6; i++) c.neon.ico(0.12, 0xffe8a8, -bw / 2 + 0.5 + i * (bw - 1) / 5, 2.7, z0 + bd / 2 + 1.5);
  c.lamp(W / 2 - 1, D / 2 - 1);
};

const bar: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.paved(W, D, 0x8a817c);
  const { bw, bd, z0 } = shopBase(c, { col: rng.pick(b.def.colors), awning: [0x2d2424, 0x7b2d26] });
  c.neon.box(3, 0.8, 0.1, b.def.signColor ?? 0xffb703, -bw / 2 + 2, 4.5, z0 + bd / 2 + 0.1);
  for (let i = 0; i < 3; i++) c.gb.cyl(0.45, 0.45, 1, 8, 0x6b4226, -W / 2 + 1.5 + i * 1.2, 0, D / 2 - 1.2);
  c.gb.box(2, 1, 0.2, 0x111111, W / 2 - 2.2, 0, D / 2 - 1.2);
  c.lamp(W / 2 - 1, D / 2 - 2.5);
};

const club: StyleFn = (c) => {
  const { b, W, D } = c;
  c.paved(W, D, 0x2b2d42);
  const bw = W - 3, bd = D - 6, h = b.floors * 4;
  c.gb.box(bw, h, bd, 0x1b1b2f, 0, 0, -1.5);
  for (let i = 0; i < 4; i++) c.neon.box(bw + 0.15, 0.2, bd + 0.15, [0xe94560, 0x0f3460, 0x00d1ff, 0xe94560][i], 0, 1 + i * (h - 2) / 3, -1.5);
  flatRoof(c, bw, bd, 0, h, -1.5, 0x111111);
  c.neon.box(6, 1.4, 0.12, b.def.signColor ?? 0xe94560, 0, h - 2.2, -1.5 + bd / 2 + 0.1);
  c.door(0, -1.5 + bd / 2 + 0.06, 0x000000, 2.4, 2.6);
  for (let i = 0; i < 5; i++) c.gb.cyl(0.06, 0.06, 1, 4, 0xd4af37, -3 + i * 1.5, 0, D / 2 - 2);
  c.gb.box(6, 0.08, 0.08, 0xb5179e, 0, 0.8, D / 2 - 2);
};

const cinema: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.paved(W, D, P.plazaDark);
  const bw = W - 2.5, bd = D - 6, h = b.floors * 4;
  c.gb.box(bw, h, bd, 0x8d0801, 0, 0, -1.5, { shade: 0.12 });
  c.gb.box(bw + 0.8, 2.2, 2.6, 0x2b2d42, 0, 3, -1.5 + bd / 2 + 1);
  c.neon.box(bw - 1, 1.2, 0.1, b.def.signColor ?? 0xffd60a, 0, 3.5, -1.5 + bd / 2 + 2.32);
  for (let i = 0; i < 12; i++) c.neon.ico(0.12, 0xfff3b0, -bw / 2 + i * (bw / 11), 5.2, -1.5 + bd / 2 + 2.3);
  for (let i = 0; i < 3; i++) {
    c.gb.box(1.8, 2.6, 0.15, 0x111111, -bw / 2 + 2 + i * 2.8, 0.3, -1.5 + bd / 2 + 0.06);
    c.neon.box(1.5, 2.2, 0.05, rng.pick([0xff6b6b, 0x4ecdc4, 0xffe66d, 0xa29bfe]), -bw / 2 + 2 + i * 2.8, 0.5, -1.5 + bd / 2 + 0.15);
  }
  c.door(bw / 4, -1.5 + bd / 2 + 0.06, 0x111111, 3, 2.6);
  flatRoof(c, bw, bd, 0, h, -1.5, 0x3d3d3d);
  c.lamp(-W / 2 + 1, D / 2 - 1);
  c.lamp(W / 2 - 1, D / 2 - 1);
};

const library: StyleFn = (c) => {
  const { b, W, D } = c;
  c.lawn();
  c.paved(W - 2, 4, P.plaza, 0, D / 2 - 2);
  const bw = W - 3, bd = D - 7, h = b.floors * 3.6;
  c.gb.box(bw, h, bd, 0xcbb994, 0, 0.5, -1.5, { shade: 0.1 });
  c.gb.box(bw + 0.6, 0.5, bd + 0.6, 0xa98467, 0, 0, -1.5);
  c.facade(0, -1.5, bw, bd, 0.5, b.floors, 3.6, { sp: 2.2, sy: 1.6 });
  c.gb.gable(bw + 0.6, 2.4, bd + 0.6, 0x6b4f3a, 0, h + 0.5, -1.5);
  c.snowGable(bw + 0.6, 2.4, bd + 0.6, 0, h + 0.5, -1.5);
  for (let i = 0; i < 4; i++) c.gb.cyl(0.35, 0.35, h - 0.5, 8, 0xede0d4, -3 + i * 2, 0.5, -1.5 + bd / 2 + 0.8);
  c.gb.box(8, 0.5, 1.6, 0xd8c3a5, 0, h - 0.1, -1.5 + bd / 2 + 0.8);
  c.door(0, -1.5 + bd / 2 + 0.05, 0x5c3a21, 1.8, 2.8);
  c.bench(-4, D / 2 - 1);
  c.bench(4, D / 2 - 1);
  c.tree(-W / 2 + 1.4, -D / 2 + 1.4, 'round');
  c.tree(W / 2 - 1.4, -D / 2 + 1.4, 'pine');
};

const museum: StyleFn = (c) => {
  const { b, W, D } = c;
  c.paved(W, D, 0xe0d5c0);
  const bw = W - 2, bd = D - 7, h = b.floors * 4;
  c.gb.box(bw, h, bd, 0xede0d4, 0, 1, -2, { shade: 0.08 });
  c.gb.box(bw + 1, 1, bd + 1, 0xd6ccc2, 0, 0, -2);
  for (let i = 0; i < 6; i++) c.gb.cyl(0.45, 0.5, h - 0.6, 10, 0xf5ebe0, -5.5 + i * 2.2, 1, -2 + bd / 2 + 1.5);
  c.gb.box(14, 0.8, 3, 0xe3d5ca, 0, h + 0.4, -2 + bd / 2 + 1.3);
  c.gb.gable(14, 2, 3, 0xe3d5ca, 0, h + 1.2, -2 + bd / 2 + 1.3);
  for (let k = 0; k < 3; k++) c.gb.box(12 - k * 0.6, 0.35, 1.2, 0xd6ccc2, 0, k * 0.35, -2 + bd / 2 + 3.4 - k * 0.5);
  flatRoof(c, bw, bd, 0, h + 1, -2, 0xb7b7a4);
  // купол
  c.gb.cyl(3, 3, 1.5, 12, 0xede0d4, 0, h + 1.4, -3);
  c.gb.dome(3, 0x9fb8ad, 0, h + 2.9, -3);
  c.snow.dome(3.1, 0xffffff, 0, h + 3.0, -3);
  c.gb.cyl(0.08, 0.08, 1.5, 4, 0xd4af37, 0, h + 5.8, -3);
  c.sign(0, h - 0.8, -2 + bd / 2 + 2.85, 6, 0.9, 0x6d597a, false);
  c.tree(-W / 2 + 1.2, D / 2 - 1.2, 'pine');
  c.tree(W / 2 - 1.2, D / 2 - 1.2, 'pine');
  // скульптура
  c.gb.box(1.2, 1.2, 1.2, 0xbfb5a2, -W / 2 + 2.5, 0, D / 2 - 3);
  c.gb.ico(0.6, 0x8a9a9a, -W / 2 + 2.5, 1.9, D / 2 - 3, { jitter: 0.3 });
};

const gym: StyleFn = (c) => {
  const { b, W, D } = c;
  c.paved(W, D, 0x9a9a9a);
  const bw = W - 3, bd = D - 6, h = b.floors * 3.8;
  c.gb.box(bw, h, bd, 0x343a40, 0, 0, -1.5);
  c.gb.box(bw + 0.1, 0.6, bd + 0.1, b.def.signColor ?? 0xff6b35, 0, h - 1, -1.5);
  c.facade(0, -1.5, bw, bd, 0.2, b.floors, 3.8, { sp: 2.2, sx: 1.8, sy: 1.8 });
  flatRoof(c, bw, bd, 0, h, -1.5, 0x212529);
  c.neon.box(5, 1, 0.1, b.def.signColor ?? 0xff6b35, 0, h - 2.3, -1.5 + bd / 2 + 0.1);
  c.door(0, -1.5 + bd / 2 + 0.05, 0x111111, 2.2, 2.6);
  // уличные тренажёры
  c.gb.box(0.1, 2.2, 0.1, 0x555555, -W / 2 + 2, 0, D / 2 - 2);
  c.gb.box(0.1, 2.2, 0.1, 0x555555, -W / 2 + 4, 0, D / 2 - 2);
  c.gb.box(2.1, 0.1, 0.1, 0x777777, -W / 2 + 3, 2.2, D / 2 - 2);
};

const pool: StyleFn = (c) => {
  const { W, D } = c;
  c.lawn();
  const bw = W - 2.5, bd = D - 5, h = 5;
  c.gb.box(bw, h, bd, 0xd8f3ff, 0, 0, -1);
  c.facade(0, -1, bw, bd, 0.5, 1, 4, { sp: 2, sx: 1.7, sy: 2.2 });
  // стеклянная полукруглая крыша
  c.gb.add(halfCyl(bd / 2, bw), 0x8fd3f5, 0, h, -1, {});
  c.snow.add(halfCyl(bd / 2 + 0.1, bw + 0.1), 0xffffff, 0, h + 0.05, -1, {});
  c.water.quad(bw - 4, 3, 0xffffff, 0, 0.1, D / 2 - 1.8);
  c.gb.box(bw - 3.4, 0.2, 3.6, 0xffffff, 0, 0, D / 2 - 1.8);
  c.door(0, -1 + bd / 2 + 0.05, 0x0077b6, 2.2, 2.6);
  c.sign(0, h - 1.4, -1 + bd / 2 + 0.06, 5, 0.9, 0x0077b6, false);
};

const church: StyleFn = (c) => {
  const { W, D } = c;
  c.lawn();
  c.paved(4, D / 2, P.path, 0, D / 4);
  const bw = 9, bd = 10, h = 7;
  c.gb.box(bw, h, bd, 0xf8f4e3, 0, 0, -1.5, { shade: 0.08 });
  c.gb.gable(bd + 0.4, 2.6, bw + 0.4, 0x4f7d5c, 0, h, -1.5, { ry: Math.PI / 2 });
  c.snowGable(bd + 0.4, 2.6, bw + 0.4, 0, h, -1.5);
  c.facade(0, -1.5, bw, bd, 2, 1, 3.5, { sp: 2.5, sy: 2 });
  // барабан и луковка
  c.gb.cyl(1.8, 1.8, 3, 10, 0xf8f4e3, 0, h + 1.5, -1.5);
  c.gb.ico(2.1, 0xd4af37, 0, h + 5.6, -1.5, {}, 1);
  c.gb.cone(1.1, 2.2, 10, 0xd4af37, 0, h + 6.6, -1.5);
  c.gb.box(0.12, 2, 0.12, 0xd4af37, 0, h + 8.6, -1.5);
  c.gb.box(1, 0.12, 0.12, 0xd4af37, 0, h + 9.8, -1.5);
  // колокольня
  c.gb.box(3, 12, 3, 0xf8f4e3, 0, 0, -1.5 + bd / 2 + 1.5);
  c.gb.box(3.2, 2, 3.2, 0xeee6cc, 0, 9, -1.5 + bd / 2 + 1.5);
  c.gb.cone(1.8, 3.5, 8, 0x4f7d5c, 0, 12, -1.5 + bd / 2 + 1.5);
  c.gb.ico(0.4, 0xd4af37, 0, 15.7, -1.5 + bd / 2 + 1.5);
  c.door(0, -1.5 + bd / 2 + 3.05, 0x6b4f3a, 1.6, 2.6);
  for (let i = 0; i < 4; i++) c.tree(i < 2 ? -W / 2 + 1.6 : W / 2 - 1.6, i % 2 ? -D / 2 + 2 : 2, 'birch');
  c.fence(-W / 2 + 0.4, D / 2 - 0.4, W / 2 - 0.4, D / 2 - 0.4, 0x444444, 1.2, 0.5);
};

const kindergarten: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.lawn();
  const bw = W - 5, bd = 6, h = 6.4;
  const z0 = -D / 2 + 1.5 + bd / 2;
  c.gb.box(bw, h, bd, 0xffd6a5, 0, 0, z0, { shade: 0.1 });
  c.facade(0, z0, bw, bd, 0, 2, 3.2, { sp: 2.6 });
  for (let i = 0; i < 4; i++) c.gb.box(bw / 4, 0.8, bd + 0.2, [0xffadad, 0xcaffbf, 0x9bf6ff, 0xffc6ff][i], -bw / 2 + bw / 8 + i * bw / 4, h, z0);
  c.snowFlat(bw, bd, 0, h + 0.8, z0);
  c.door(0, z0 + bd / 2 + 0.05, 0xf94144, 1.6, 2.4);
  playgroundBits(c, 0, D / 2 - 5);
  c.fence(-W / 2 + 0.4, D / 2 - 0.4, W / 2 - 0.4, D / 2 - 0.4, 0x43aa8b, 1, 0.5);
  c.fence(-W / 2 + 0.4, -D / 2 + 0.4, -W / 2 + 0.4, D / 2 - 0.4, 0x43aa8b, 1);
  c.fence(W / 2 - 0.4, -D / 2 + 0.4, W / 2 - 0.4, D / 2 - 0.4, 0x43aa8b, 1);
  c.tree(-W / 2 + 1.6, D / 2 - 2, 'round');
  c.tree(W / 2 - 1.6, D / 2 - 2, 'round');
  void rng;
};

function playgroundBits(c: BuildCtx, x: number, z: number) {
  const g = c.gb;
  // горка
  g.box(1.4, 2, 1.4, 0xf9c74f, x - 3, 0, z);
  g.box(0.9, 0.12, 3, 0xf94144, x - 3, 1, z + 1.8, { rx: 0.55 });
  g.box(0.6, 2.1, 0.1, 0x577590, x - 3, 0, z - 0.8);
  // качели
  g.box(0.12, 2.4, 0.12, 0x577590, x + 1, 0, z - 0.7);
  g.box(0.12, 2.4, 0.12, 0x577590, x + 4, 0, z - 0.7);
  g.box(3.1, 0.12, 0.12, 0x577590, x + 2.5, 2.4, z - 0.7);
  g.box(0.7, 0.08, 0.35, 0xf3722c, x + 1.8, 0.7, z - 0.7);
  g.box(0.7, 0.08, 0.35, 0x90be6d, x + 3.2, 0.7, z - 0.7);
  // песочница
  g.box(2.6, 0.3, 2.6, 0xa97c50, x + 2.5, 0, z + 2.2);
  g.box(2.2, 0.32, 2.2, P.sand, x + 2.5, 0, z + 2.2);
  // карусель
  g.cyl(1.2, 1.2, 0.15, 8, 0x43aa8b, x - 0.5, 0.3, z + 2.6);
  g.cyl(0.08, 0.08, 1, 4, 0x555555, x - 0.5, 0.3, z + 2.6);
}

const playground: StyleFn = (c) => {
  const { W, D } = c;
  c.lawn();
  c.paved(W - 4, D - 4, 0xd9805f, 0, 0);
  playgroundBits(c, 0, -1);
  c.bench(-W / 2 + 2.5, D / 2 - 2.5);
  c.bench(W / 2 - 2.5, D / 2 - 2.5);
  for (let i = 0; i < 4; i++) c.tree(i % 2 ? -W / 2 + 1.4 : W / 2 - 1.4, i < 2 ? -D / 2 + 1.4 : D / 2 - 1.4, 'round');
  c.lamp(0, D / 2 - 1.2);
};

const square: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.lawn();
  c.paved(W - 2, 3, P.plaza, 0, 0);
  c.paved(3, D - 2, P.plaza, 0, 0);
  c.gb.cyl(4, 4, 0.05, 12, P.plaza, 0, 0.1, 0);
  if (rng.chance(0.5)) {
    // памятник
    c.gb.box(2, 2.4, 2, 0x8d8d8d, 0, 0, 0);
    c.gb.box(0.7, 1.4, 0.5, 0x5f7470, 0, 2.4, 0);
    c.gb.ico(0.35, 0x5f7470, 0, 4.1, 0);
    c.gb.box(1.4, 0.25, 0.25, 0x5f7470, 0.4, 3.4, 0, { rz: 0.6 });
  } else {
    c.gb.cyl(2.5, 2.7, 0.7, 12, 0xbcb8b1, 0, 0, 0);
    c.water.disc(2.2, 12, 0xffffff, 0, 0.62, 0);
    c.gb.cyl(0.3, 0.4, 1.8, 8, 0xbcb8b1, 0, 0.7, 0);
    c.dyn.push({ kind: 'fountain', x: 0, y: 2.5, z: 0, ry: 0, b: c.b.id, s: 0.7 });
  }
  for (const [x, z, r] of [[-3.5, 3.2, 0], [3.5, 3.2, 0], [-3.5, -3.2, Math.PI], [3.5, -3.2, Math.PI]] as const) c.bench(x, z, r);
  for (const [x, z] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) c.tree(x, z, rng.pick(['round', 'round', 'birch', 'poplar']));
  c.flower(-5, 1, 2, 0.8);
  c.flower(5, -1, 2, 0.8);
  c.lamp(-2.2, 2.2, 4);
  c.lamp(2.2, -2.2, 4);
};

// ——— БОЛЬШИЕ УЧАСТКИ
const park: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.lawn();
  c.paved(W, 3, P.path, 0, 0);
  c.paved(3, D, P.path, 0, 0);
  c.gb.add(ringGeo(8, 10.5, 24), P.path, 0, 0.12, 0, {});
  // фонтан
  c.gb.cyl(4, 4.2, 0.8, 16, 0xbcb8b1, 0, 0, 0);
  c.water.disc(3.7, 16, 0xffffff, 0, 0.7, 0);
  c.gb.cyl(0.5, 0.7, 2, 8, 0xbcb8b1, 0, 0.8, 0);
  c.gb.cyl(1.4, 1.4, 0.3, 10, 0xbcb8b1, 0, 2.6, 0);
  c.dyn.push({ kind: 'fountain', x: 0, y: 3, z: 0, ry: 0, b: c.b.id, s: 1.3 });
  // беседка
  const gx = 9, gz = -9;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.gb.box(0.25, 2.6, 0.25, P.white, gx + Math.cos(a) * 2.2, 0, gz + Math.sin(a) * 2.2); }
  c.gb.cyl(2.6, 2.6, 0.3, 6, P.wood, gx, 0, gz);
  c.gb.cone(3, 1.8, 6, 0x9c4f3a, gx, 2.6, gz);
  c.snow.cone(3.05, 1.85, 6, 0xffffff, gx, 2.65, gz);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    c.bench(Math.cos(a) * 11.4, Math.sin(a) * 11.4, -a - Math.PI / 2);
  }
  for (let i = 0; i < 6; i++) c.flower(rng.range(-13, -5), rng.range(5, 13), rng.range(1.2, 2.2), rng.range(0.8, 1.5));
  // деревья по четвертям
  for (let q = 0; q < 4; q++) {
    const sx = q % 2 ? 1 : -1, sz = q < 2 ? 1 : -1;
    for (let i = 0; i < 9; i++) {
      const x = sx * rng.range(3.5, W / 2 - 1.5), z = sz * rng.range(3.5, D / 2 - 1.5);
      if (Math.hypot(x, z) < 12 || (Math.abs(x - gx) < 4 && Math.abs(z - gz) < 4)) continue;
      c.tree(x, z, rng.pick(['round', 'round', 'pine', 'birch', 'willow', 'poplar']), rng.range(1, 1.4));
    }
  }
  for (const [x, z] of [[-1.8, 6], [1.8, -6], [-6, -1.8], [6, 1.8], [-1.8, 14], [1.8, -14], [14, 1.8], [-14, -1.8]]) c.lamp(x, z, 4.2);
};

const pond: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.lawn();
  const pts = 14;
  const shape = new GB();
  // песчаный берег и вода — неровный многоугольник
  const radii: number[] = [];
  for (let i = 0; i < pts; i++) radii.push(rng.range(9, 12));
  c.gb.add(blobGeo(radii, 1.18, 1.1), P.sand, 0, 0.1, -1, {});
  c.water.add(blobGeo(radii, 1, 0.95), 0xffffff, 0, 0.16, -1, {});
  void shape;
  // пирс
  c.gb.box(1.8, 0.2, 7, P.wood, 6, 0.25, 6);
  for (let i = 0; i < 4; i++) { c.gb.box(0.2, 0.8, 0.2, 0x6b4226, 5.2, -0.4, 3 + i * 2); c.gb.box(0.2, 0.8, 0.2, 0x6b4226, 6.8, -0.4, 3 + i * 2); }
  // камыш
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(9, 11);
    c.gb.cone(0.12, rng.range(1.2, 2), 3, 0x7a8b3a, Math.cos(a) * r, 0, Math.sin(a) * r - 1);
  }
  // ивы и лавки
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng.range(-0.2, 0.2);
    c.tree(Math.cos(a) * 14.2, Math.sin(a) * 13.5 - 1, rng.pick(['willow', 'willow', 'round', 'birch']), 1.2);
  }
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; c.bench(Math.cos(a) * 12.6, Math.sin(a) * 12 - 1, -a - Math.PI / 2); }
  c.dyn.push({ kind: 'ducks', x: 0, y: 0.15, z: -1, ry: 0, b: c.b.id, s: 8 });
  c.lamp(-W / 2 + 2, D / 2 - 2);
  c.lamp(W / 2 - 2, -D / 2 + 2);
};

const stadium: StyleFn = (c) => {
  const { W, D } = c;
  c.paved(W, D, 0xa8a29e);
  const fw = 20, fd = 13;
  c.grass.quad(fw, fd, 0xbfffbf, 0, 0.12, 0);
  // разметка
  const line = (w: number, d: number, x: number, z: number) => c.gb.box(w, 0.02, d, 0xffffff, x, 0.14, z);
  line(fw, 0.15, 0, fd / 2); line(fw, 0.15, 0, -fd / 2); line(0.15, fd, fw / 2, 0); line(0.15, fd, -fw / 2, 0); line(0.15, fd, 0, 0);
  c.gb.add(ringGeo(1.9, 2.05, 16), 0xffffff, 0, 0.15, 0, {});
  for (const s of [-1, 1]) { line(0.15, 6, s * (fw / 2 - 3), 0); line(3, 0.15, s * (fw / 2 - 1.5), 3); line(3, 0.15, s * (fw / 2 - 1.5), -3); }
  for (const s of [-1, 1]) { c.gb.box(0.12, 1.4, 3, 0xffffff, s * fw / 2, 0, 0); }
  // беговая дорожка
  c.gb.add(ringGeo(12.5, 14.5, 32, 1.25, 0.95), 0xc1440e, 0, 0.11, 0, {});
  // трибуны
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) c.gb.box(W - 6, 0.8 + k * 0.8, 1.4, k % 2 ? 0x3a86ff : 0xdee2e6, 0, 0, s * (D / 2 - 1.8 - (3 - k) * 1.3));
    c.gb.box(W - 6, 0.3, 6, 0xadb5bd, 0, 5.2, s * (D / 2 - 3.6), { rx: s * 0.12 });
  }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) c.gb.box(1.4, 0.8 + k * 0.8, D - 12, k % 2 ? 0x3a86ff : 0xdee2e6, s * (W / 2 - 1.5 - (2 - k) * 1.3), 0, 0);
  // табло
  c.gb.box(6, 3, 0.4, 0x222222, 0, 6, -D / 2 + 0.6);
  c.neon.box(5.4, 2.4, 0.1, 0x80ffdb, 0, 6.3, -D / 2 + 0.85);
  // мачты освещения
  for (const [x, z] of [[-W / 2 + 1, -D / 2 + 1], [W / 2 - 1, -D / 2 + 1], [-W / 2 + 1, D / 2 - 1], [W / 2 - 1, D / 2 - 1]]) {
    c.gb.cyl(0.25, 0.35, 14, 6, 0x999999, x, 0, z);
    c.gb.box(2.4, 1.4, 0.4, 0x666666, x, 14, z);
    c.dyn.push({ kind: 'floodlight', x, y: 14.6, z, ry: 0, b: c.b.id });
  }
};

const school: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.lawn();
  const h = b.floors * 3.4;
  // Г-образное здание
  c.gb.box(W - 4, h, 8, 0xe9a178, 0, 0, -D / 2 + 6, { shade: 0.1 });
  c.gb.box(8, h, D / 2 - 2, 0xe9a178, -W / 2 + 6, 0, -D / 2 + 10 + (D / 2 - 2) / 2 - 2);
  c.facade(0, -D / 2 + 6, W - 4, 8, 0, b.floors, 3.4, { sp: 2.4 });
  c.facade(-W / 2 + 6, -D / 2 + 8 + (D / 2 - 2) / 2, 8, D / 2 - 2, 0, b.floors, 3.4, { sp: 2.4, back: false });
  flatRoof(c, W - 4, 8, 0, h, -D / 2 + 6, 0x8d6e63);
  flatRoof(c, 8, D / 2 - 2, -W / 2 + 6, h, -D / 2 + 8 + (D / 2 - 2) / 2);
  c.gb.box(W - 3.9, 0.6, 8.1, 0xf4e3c3, 0, h - 1.4, -D / 2 + 6);
  c.door(4, -D / 2 + 10.05, 0x5c3a21, 2.4, 2.6);
  c.canopy(4, 3, -D / 2 + 10, 4, 0x8d6e63);
  // стадиончик
  c.gb.add(ringGeo(5, 6.4, 24, 1.5, 1), 0xc1440e, 6, 0.11, 7, {});
  c.grass.add(blobGeo(new Array(16).fill(5), 1.5, 1), 0xbfffbf, 6, 0.12, 7, {});
  c.gb.box(0.1, 2, 2.4, 0xffffff, -1.3, 0, 7);
  c.gb.box(0.1, 2, 2.4, 0xffffff, 13.3, 0, 7);
  // флагшток
  c.gb.cyl(0.08, 0.08, 7, 4, 0xcccccc, 0, 0, -D / 2 + 11.5);
  c.dyn.push({ kind: 'flag', x: 0.9, y: 6.5, z: -D / 2 + 11.5, ry: 0, b: b.id });
  for (let i = 0; i < 6; i++) c.tree(rng.chance(0.5) ? -W / 2 + 1.5 : W / 2 - 1.5, rng.range(-D / 2 + 2, D / 2 - 2), rng.pick(['round', 'birch', 'poplar']));
  c.fence(-W / 2 + 0.4, D / 2 - 0.4, W / 2 - 0.4, D / 2 - 0.4, 0x2d6a4f, 1.6, 0.5);
  c.lamp(-3, D / 2 - 2);
};

const university: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.lawn();
  const h = b.floors * 3.6;
  const bw = W - 6, bd = 10;
  const z0 = -D / 2 + 3 + bd / 2;
  c.gb.box(bw, h, bd, 0xd4c8b0, 0, 0.6, z0, { shade: 0.1 });
  c.gb.box(bw + 1, 0.6, bd + 1, 0x8a7f6a, 0, 0, z0);
  c.facade(0, z0, bw, bd, 0.6, b.floors, 3.6, { sp: 2.4, sy: 1.4 });
  flatRoof(c, bw, bd, 0, h + 0.6, z0, 0x6d6875);
  for (let i = 0; i < 8; i++) c.gb.cyl(0.45, 0.5, h - 1, 8, 0xece5d6, -7 + i * 2, 0.6, z0 + bd / 2 + 1.3);
  c.gb.box(17, 1, 3, 0xd4c8b0, 0, h - 0.4, z0 + bd / 2 + 1.3);
  c.gb.gable(17, 2.6, 3, 0xc9bfaa, 0, h + 0.6, z0 + bd / 2 + 1.3);
  // башня с часами
  c.gb.box(4.4, 10, 4.4, 0xd4c8b0, 0, h + 0.6, z0 - 1);
  c.gb.cyl(1.3, 1.3, 0.2, 12, 0xffffff, 0, h + 7.5, z0 + 1.25, { rx: Math.PI / 2 });
  c.gb.cone(3.4, 4, 4, 0x6d6875, 0, h + 10.6, z0 - 1, { ry: Math.PI / 4 });
  // кампус
  c.paved(4, D / 2, P.path, 0, D / 4);
  for (let i = 0; i < 10; i++) c.tree(rng.chance(0.5) ? rng.range(-W / 2 + 2, -4) : rng.range(4, W / 2 - 2), rng.range(z0 + bd / 2 + 4, D / 2 - 2), rng.pick(['round', 'pine', 'birch']));
  for (let i = 0; i < 4; i++) c.bench(-3 + (i % 2) * 6, z0 + bd / 2 + 6 + Math.floor(i / 2) * 5, i % 2 ? -Math.PI / 2 : Math.PI / 2);
  c.lamp(-3, D / 2 - 3);
  c.lamp(3, D / 2 - 8);
};

const hospital: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.paved(W, D, 0xc7ccd1);
  const h = b.floors * 3.4;
  const bw = 18, bd = 10;
  const z0 = -D / 2 + 3 + bd / 2;
  c.gb.box(bw, h, bd, 0xf5f7fa, 0, 0, z0, { shade: 0.08 });
  c.facade(0, z0, bw, bd, 0, b.floors, 3.4, { sp: 2.2 });
  for (let f = 1; f < b.floors; f++) c.gb.box(bw + 0.1, 0.25, bd + 0.1, 0x9ad1d4, 0, f * 3.4, z0);
  flatRoof(c, bw, bd, 0, h, z0, 0xb0b8c0);
  // вертолётная площадка
  c.gb.cyl(3.6, 3.6, 0.15, 12, 0x555b66, 0, h + 0.55, z0);
  c.gb.box(0.4, 0.05, 2.4, 0xffffff, -0.8, h + 0.72, z0);
  c.gb.box(0.4, 0.05, 2.4, 0xffffff, 0.8, h + 0.72, z0);
  c.gb.box(1.6, 0.05, 0.4, 0xffffff, 0, h + 0.72, z0);
  // крыло
  c.gb.box(10, 7, 9, 0xf5f7fa, -W / 2 + 6, 0, z0 + bd / 2 + 4.5);
  c.facade(-W / 2 + 6, z0 + bd / 2 + 4.5, 10, 9, 0, 2, 3.4, { sp: 2.4, back: false });
  flatRoof(c, 10, 9, -W / 2 + 6, 7, z0 + bd / 2 + 4.5);
  // красный крест
  c.neon.box(3, 0.9, 0.15, b.def.signColor ?? 0xe63946, 0, h - 2.3, z0 + bd / 2 + 0.1);
  c.neon.box(0.9, 3, 0.15, b.def.signColor ?? 0xe63946, 0, h - 3.35, z0 + bd / 2 + 0.1);
  // приёмный покой
  c.gb.box(7, 0.25, 4, 0xe63946, 6, 3.4, z0 + bd / 2 + 2);
  for (const x of [3, 9]) c.gb.box(0.25, 3.4, 0.25, 0xdddddd, x, 0, z0 + bd / 2 + 3.8);
  c.door(6, z0 + bd / 2 + 0.05, 0x9ec9e2, 3, 2.8);
  for (let i = 0; i < 6; i++) c.tree(rng.range(2, W / 2 - 2), rng.range(z0 + bd / 2 + 6, D / 2 - 2), rng.pick(['round', 'birch']));
  c.lamp(W / 2 - 2, D / 2 - 2);
  c.lamp(-2, D / 2 - 2);
};

const factory: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.paved(W, D, 0x8d8a85);
  const bw = W - 8, bd = D - 4, h = 7;
  c.gb.box(bw, h, bd, 0x9a8c98, -2, 0, -0.5, { shade: 0.15 });
  // пилообразная крыша
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = -2 - bw / 2 + (bw / n) * (i + 0.5);
    c.gb.add(sawTooth(bw / n, 2.2, bd), 0x6c757d, x, h, -0.5, {});
    c.neon.box(0.1, 1.6, bd - 1, 0xfff3c4, x + bw / n / 2 - 0.2, h + 0.3, -0.5);
  }
  c.snowFlat(bw, bd, -2, h, -0.5);
  c.facade(-2, -0.5, bw, bd, 1, 1, 4, { sp: 3, sx: 1.6, sy: 1.6 });
  // трубы
  for (const [x, z] of [[W / 2 - 3, -3], [W / 2 - 3, 2.5]]) {
    for (let k = 0; k < 6; k++) c.gb.cyl(0.85 - k * 0.04, 0.9 - k * 0.04, 3, 10, k % 2 ? 0xffffff : 0xd62828, x, k * 3, z);
    c.dyn.push({ kind: 'chimney', x, y: 18, z, ry: 0, b: c.b.id, s: 1.2 });
  }
  // цистерны
  c.gb.cyl(1.4, 1.4, 4, 10, 0xc0c0c0, W / 2 - 3, 0, D / 2 - 2);
  c.gb.box(4, 0.4, 0.4, 0x888888, W / 2 - 5, 3, D / 2 - 2);
  c.gb.box(4, 3, 0.2, 0x555555, -2, 0, -0.5 + bd / 2 + 0.05);
  void rng;
};

const warehouse: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.paved(W, D, 0x8d8a85);
  const bw = W - 3, bd = D - 6, h = 6;
  const col = pickCol(c);
  c.gb.box(bw, h, bd, col, 0, 0, -1.5, { shade: 0.15 });
  for (let i = 0; i < 10; i++) c.gb.box(0.12, h, bd + 0.06, shadeColor(col, 0.85), -bw / 2 + i * (bw / 9), 0, -1.5);
  c.gb.gable(bw + 0.4, 1.4, bd + 0.4, 0x7d8597, 0, h, -1.5);
  c.snowGable(bw + 0.4, 1.4, bd + 0.4, 0, h, -1.5);
  for (let i = 0; i < 2; i++) c.gb.box(3.2, 3.6, 0.2, 0x495057, -3 + i * 6, 0, -1.5 + bd / 2 + 0.05);
  c.gb.box(bw, 1, 2, P.concrete, 0, 0, -1.5 + bd / 2 + 1);
  // контейнеры и поддоны
  for (let i = 0; i < 2; i++) c.gb.box(2.4, 2.5, 5.5, rng.pick([0xe63946, 0x1d3557, 0x2a9d8f, 0xf4a261]), -W / 2 + 2 + i * 2.6, 0, D / 2 - 3, { ry: 0 });
  for (let i = 0; i < 3; i++) c.gb.box(1.2, 0.8, 1.2, P.wood, W / 2 - 2 - i * 1.4, 0, D / 2 - 1.5);
};

const autoservice: StyleFn = (c) => {
  const { b, rng, W, D } = c;
  c.paved(W, D, 0x6c757d);
  const bw = W - 3, bd = D - 6, h = 5;
  c.gb.box(bw, h, bd, 0x6c757d, 0, 0, -1.5);
  for (let i = 0; i < 2; i++) c.gb.box(4, 3.6, 0.2, 0x343a40, -3.5 + i * 7, 0, -1.5 + bd / 2 + 0.05);
  flatRoof(c, bw, bd, 0, h, -1.5, 0x495057);
  c.sign(0, h - 1.1, -1.5 + bd / 2 + 0.06, 8, 1, b.def.signColor ?? 0xffbe0b);
  // шины
  for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) c.gb.cyl(0.5, 0.5, 0.35, 8, 0x1f1f1f, -W / 2 + 1.5 + i * 1.2, k * 0.36, D / 2 - 1.3);
  void rng;
};

const gasstation: StyleFn = (c) => {
  const { b, W, D } = c;
  c.paved(W, D, 0x5a5f69);
  // навес
  c.gb.box(10, 0.8, 7, 0xffffff, 0, 5, 2);
  c.neon.box(10.1, 0.35, 7.1, b.def.signColor ?? 0x2a9d8f, 0, 5, 2);
  c.snowFlat(10, 7, 0, 5.8, 2);
  for (const [x, z] of [[-3.5, 0], [3.5, 0], [-3.5, 4], [3.5, 4]]) c.gb.box(0.4, 5, 0.4, 0xdddddd, x, 0, z);
  for (const x of [-2, 2]) {
    c.gb.box(1.2, 0.3, 3, P.concrete, x, 0, 2);
    c.gb.box(0.8, 1.6, 0.6, 0xe76f51, x, 0.3, 2);
    c.neon.box(0.6, 0.4, 0.05, 0x9be7ff, x, 1.3, 2.32);
  }
  // магазинчик
  c.gb.box(7, 3.2, 4, 0xf1f1f1, 0, 0, -D / 2 + 3);
  c.gb.box(5, 1.6, 0.1, 0x9ec9e2, 0, 0.8, -D / 2 + 5.02);
  c.win(0, 1.6, -D / 2 + 5.1, 0, 4, 1.1);
  flatRoof(c, 7, 4, 0, 3.2, -D / 2 + 3, 0x2a9d8f);
  // стела с ценами
  c.gb.box(1.4, 5, 0.4, 0x264653, W / 2 - 1.2, 0, D / 2 - 1.2);
  c.neon.box(1.1, 2.2, 0.05, 0xffd166, W / 2 - 1.2, 2.3, D / 2 - 0.98);
};

const depot: StyleFn = (c) => {
  const { W, D } = c;
  c.paved(W, D, 0x6c757d);
  const bw = W - 2, bd = 8, h = 6;
  const z0 = -D / 2 + 1 + bd / 2;
  c.gb.box(bw, h, bd, 0xadb5bd, 0, 0, z0);
  for (let i = 0; i < 3; i++) c.gb.box(3.4, 4.6, 0.2, 0x495057, -bw / 2 + 2.6 + i * 4.6, 0, z0 + bd / 2 + 0.05);
  c.gb.gable(bw + 0.4, 1.4, bd + 0.4, 0x495057, 0, h, z0);
  c.snowGable(bw + 0.4, 1.4, bd + 0.4, 0, h, z0);
  // стоящие автобусы
  for (let i = 0; i < 2; i++) {
    const g = new GB();
    g.box(2.4, 2.6, 9, [0xe63946, 0x2a9d8f][i], 0, 0.4, 0);
    g.box(2.45, 0.9, 7.8, 0x2b2d42, 0, 1.5, -0.3);
    c.gb.merge(g, -3 + i * 6, 0, D / 2 - 4.2, 0);
  }
};

const construction: StyleFn = (c) => {
  const { b, W, D } = c;
  c.paved(W, D, 0xb08968);
  c.gb.box(W - 4, 0.8, D - 6, P.concrete, 0, 0, -1);
  c.dyn.push({ kind: 'construction', x: 0, y: 0.8, z: -1, ry: 0, b: b.id, s: b.def.floors[1] });
  c.dyn.push({ kind: 'crane', x: W / 2 - 2.5, y: 0, z: -D / 2 + 2.5, ry: 0, b: b.id });
  // забор
  c.fence(-W / 2 + 0.3, D / 2 - 0.3, W / 2 - 0.3, D / 2 - 0.3, 0x2a9d8f, 1.8, 0.5);
  c.fence(-W / 2 + 0.3, -D / 2 + 0.3, -W / 2 + 0.3, D / 2 - 0.3, 0x2a9d8f, 1.8);
  // кучи материалов
  c.gb.ico(1.4, P.sand, -W / 2 + 2.5, 0, D / 2 - 2.5, { jitter: 0.5 });
  for (let i = 0; i < 4; i++) c.gb.box(2.4, 0.3, 0.3, 0xa97c50, 2, i * 0.3, D / 2 - 2);
  c.gb.box(2.2, 2.4, 4.5, 0xf4d35e, -W / 2 + 2, 0, -D / 2 + 3.5);
};

const market: StyleFn = (c) => {
  const { rng, W, D } = c;
  c.paved(W, D, 0xd9c7a7);
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 6; i++) {
      const x = -W / 2 + 3 + i * ((W - 6) / 5), z = row ? 3 : -3;
      const col = rng.pick([0xe63946, 0x457b9d, 0x2a9d8f, 0xf4a261, 0x8338ec]);
      c.gb.box(3.2, 1, 2, P.wood, x, 0, z);
      for (const sx of [-1.5, 1.5]) for (const sz of [-0.9, 0.9]) c.gb.box(0.1, 2.4, 0.1, 0x666666, x + sx, 0, z + sz);
      c.awning(x, 2.3, z - 1.1, 3.4, col, 0xffffff, 2.2);
      for (let k = 0; k < 6; k++) c.gb.ico(0.2, rng.pick([0xff595e, 0xffca3a, 0x8ac926, 0xff924c, 0x6a4c93]), x - 1.2 + k * 0.48, 1.15, z + rng.range(-0.5, 0.5));
    }
  c.lamp(-W / 2 + 1, 0);
  c.lamp(W / 2 - 1, 0);
};

function halfCyl(r: number, len: number) {
  const g = new THREE.CylinderGeometry(r, r, len, 10, 1, false, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

function ringGeo(r0: number, r1: number, seg: number, sx = 1, sz = 1) {
  const g = new THREE.RingGeometry(r0, r1, seg);
  g.rotateX(-Math.PI / 2);
  g.scale(sx, 1, sz);
  return g;
}

function blobGeo(radii: number[], scale: number, sz: number) {
  const shape = new THREE.Shape();
  radii.forEach((r, i) => {
    const a = (i / radii.length) * Math.PI * 2;
    const x = Math.cos(a) * r * scale, y = Math.sin(a) * r * scale * sz;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  });
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  return g;
}

function sawTooth(w: number, h: number, d: number) {
  const g = new THREE.BufferGeometry();
  const hw = w / 2, hd = d / 2;
  const v = [
    -hw, 0, -hd, hw, 0, -hd, hw, h, -hd,
    -hw, 0, hd, hw, h, hd, hw, 0, hd,
    -hw, 0, hd, -hw, 0, -hd, hw, h, -hd,
    -hw, 0, hd, hw, h, -hd, hw, h, hd,
    hw, 0, -hd, hw, 0, hd, hw, h, hd,
    hw, 0, -hd, hw, h, hd, hw, h, -hd,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

export const STYLES: Record<string, StyleFn> = {
  panel, khrush, townhouse, house, tower, dorm, office, bizcenter, itoffice, cowork, cityhall, police, firestation, post, bank,
  grocery, supermarket, kiosk, pharmacy, market, bakery, coffee, cafe, shawarma, pizzeria, restaurant, bar, club, cinema,
  library, museum, gym, pool, church, stadium, kindergarten, school, university, hospital, factory, warehouse, autoservice,
  gasstation, depot, construction, park, square, pond, playground,
};

export { mixColor };
