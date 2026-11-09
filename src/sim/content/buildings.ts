// Каталог типов зданий. Всё описано данными — модели строятся по полю style.
export type BuildingCat =
  | 'home' | 'office' | 'civic' | 'shop' | 'food' | 'leisure' | 'edu' | 'health'
  | 'industry' | 'transport' | 'outdoor' | 'construction';

export type Zone = 'center' | 'mid' | 'outer' | 'industry';
export type LotSize = 'lot' | 'wide' | 'block';

export interface BuildingDef {
  id: string;
  name: string;
  cat: BuildingCat;
  size: LotSize;
  floors: [number, number];
  /** часы работы [от, до], до может быть > 24 (работает за полночь); null — всегда */
  open: [number, number] | null;
  /** дни недели 0=пн..6=вс, по умолчанию все */
  days?: number[];
  capacity: number;
  residentsPerFloor?: number;
  outdoor?: boolean;
  zones: Zone[];
  weight: number;
  min?: number; // минимум таких зданий в городе
  max?: number;
  colors: number[];
  signColor?: number;
  prefix?: string; // для генерации имени
}

export const BUILDINGS: BuildingDef[] = [
  // ——— жильё
  { id: 'panel', name: 'Панельный дом', cat: 'home', size: 'lot', floors: [5, 9], open: null, capacity: 0, residentsPerFloor: 3.2, zones: ['mid', 'outer'], weight: 6, min: 6, colors: [0xd9d2c3, 0xc9d6df, 0xe6d3b3, 0xd6c2c2, 0xbfd1c0], prefix: 'Дом' },
  { id: 'khrush', name: 'Хрущёвка', cat: 'home', size: 'lot', floors: [4, 5], open: null, capacity: 0, residentsPerFloor: 2.4, zones: ['mid', 'outer'], weight: 5, min: 4, colors: [0xc98b6b, 0xb87660, 0xd9a07c, 0xe0c4a0], prefix: 'Дом' },
  { id: 'townhouse', name: 'Таунхаусы', cat: 'home', size: 'lot', floors: [2, 3], open: null, capacity: 0, residentsPerFloor: 1.6, zones: ['outer'], weight: 4, colors: [0xf2e3c6, 0xe8c8b0, 0xcfe0d8, 0xf0d0d8], prefix: 'Таунхаус' },
  { id: 'house', name: 'Частный дом', cat: 'home', size: 'lot', floors: [1, 2], open: null, capacity: 0, residentsPerFloor: 1.4, zones: ['outer'], weight: 5, min: 4, colors: [0xf6e7c1, 0xe7b98f, 0xb9d4e8, 0xd9e8b9, 0xf2c4b8, 0xffffff], prefix: 'Дом' },
  { id: 'tower', name: 'Жилая высотка', cat: 'home', size: 'lot', floors: [12, 18], open: null, capacity: 0, residentsPerFloor: 3.5, zones: ['center', 'mid'], weight: 2.5, min: 2, colors: [0xe8e4dc, 0xd0d8e0, 0xf0e0c8], prefix: 'ЖК' },
  { id: 'dorm', name: 'Общежитие', cat: 'home', size: 'lot', floors: [4, 6], open: null, capacity: 0, residentsPerFloor: 4, zones: ['mid'], weight: 1, max: 1, min: 1, colors: [0xe0c890], prefix: 'Общага' },

  // ——— офисы и учреждения
  { id: 'office', name: 'Офис', cat: 'office', size: 'lot', floors: [4, 8], open: [8, 19], days: [0, 1, 2, 3, 4], capacity: 30, zones: ['center', 'mid'], weight: 3, min: 3, colors: [0xa9c4d6, 0xc2c8cc, 0x9fb4a8], prefix: 'Офис' },
  { id: 'bizcenter', name: 'Бизнес-центр', cat: 'office', size: 'lot', floors: [10, 16], open: [8, 20], days: [0, 1, 2, 3, 4], capacity: 60, zones: ['center'], weight: 2, min: 2, max: 3, colors: [0x7fa8c9, 0x8fb8c0, 0x9aa6c8], prefix: 'БЦ' },
  { id: 'itoffice', name: 'IT-компания', cat: 'office', size: 'lot', floors: [3, 5], open: [10, 21], days: [0, 1, 2, 3, 4], capacity: 25, zones: ['center', 'mid'], weight: 1, min: 1, max: 2, colors: [0x2e3440, 0x5e81ac], signColor: 0x88c0d0, prefix: 'IT' },
  { id: 'cowork', name: 'Коворкинг', cat: 'office', size: 'lot', floors: [2, 3], open: [8, 23], capacity: 20, zones: ['center', 'mid'], weight: 1, max: 1, min: 1, colors: [0xe9c46a, 0xf4a261], signColor: 0x264653, prefix: 'Коворкинг' },
  { id: 'cityhall', name: 'Мэрия', cat: 'civic', size: 'lot', floors: [3, 4], open: [9, 18], days: [0, 1, 2, 3, 4], capacity: 40, zones: ['center'], weight: 0, min: 1, max: 1, colors: [0xf0e6d2], prefix: 'Мэрия' },
  { id: 'police', name: 'Полиция', cat: 'civic', size: 'lot', floors: [2, 3], open: null, capacity: 10, zones: ['center', 'mid'], weight: 0, min: 1, max: 1, colors: [0xdfe6ee], signColor: 0x2b59c3, prefix: 'Полиция' },
  { id: 'firestation', name: 'Пожарная часть', cat: 'civic', size: 'lot', floors: [2, 2], open: null, capacity: 10, zones: ['mid'], weight: 0, min: 1, max: 1, colors: [0xc94f4f], prefix: 'Пожарная часть' },
  { id: 'post', name: 'Почта', cat: 'civic', size: 'lot', floors: [1, 2], open: [8, 20], days: [0, 1, 2, 3, 4, 5], capacity: 12, zones: ['center', 'mid'], weight: 0, min: 1, max: 1, colors: [0xe8eef6], signColor: 0x1f5fbf, prefix: 'Почта' },
  { id: 'bank', name: 'Банк', cat: 'civic', size: 'lot', floors: [3, 4], open: [9, 19], days: [0, 1, 2, 3, 4, 5], capacity: 15, zones: ['center'], weight: 0, min: 1, max: 1, colors: [0xd8d0c0], signColor: 0x2a9d8f, prefix: 'Банк' },

  // ——— магазины
  { id: 'grocery', name: 'Продуктовый', cat: 'shop', size: 'lot', floors: [1, 2], open: [7, 23], capacity: 15, zones: ['mid', 'outer', 'center'], weight: 2, min: 3, colors: [0xf4e1c1, 0xdde8c8], signColor: 0xe76f51, prefix: 'Продукты' },
  { id: 'supermarket', name: 'Супермаркет', cat: 'shop', size: 'wide', floors: [1, 1], open: [8, 23], capacity: 50, zones: ['mid'], weight: 0, min: 1, max: 1, colors: [0xf1f1f1], signColor: 0xd62828, prefix: 'Гипермаркет' },
  { id: 'kiosk', name: 'Круглосуточный ларёк', cat: 'shop', size: 'lot', floors: [1, 1], open: null, capacity: 4, zones: ['mid', 'outer', 'center'], weight: 1, min: 2, max: 4, colors: [0x6a994e, 0x386641, 0xbc4749], signColor: 0xf2e8cf, prefix: 'Ларёк' },
  { id: 'pharmacy', name: 'Аптека', cat: 'health', size: 'lot', floors: [1, 2], open: [8, 22], capacity: 8, zones: ['center', 'mid', 'outer'], weight: 1, min: 2, max: 3, colors: [0xf7fbf7], signColor: 0x2a9d4f, prefix: 'Аптека' },
  { id: 'market', name: 'Рынок', cat: 'shop', size: 'wide', floors: [1, 1], open: [8, 17], days: [1, 2, 3, 4, 5, 6], capacity: 60, outdoor: true, zones: ['mid'], weight: 0, min: 1, max: 1, colors: [0xe63946, 0xf1faee, 0x457b9d], prefix: 'Рынок' },
  { id: 'bakery', name: 'Пекарня', cat: 'food', size: 'lot', floors: [1, 2], open: [7, 20], capacity: 10, zones: ['mid', 'center', 'outer'], weight: 0.5, min: 1, max: 2, colors: [0xf3d9b1, 0xe9c48a], signColor: 0x8b5a2b, prefix: 'Пекарня' },

  // ——— еда
  { id: 'coffee', name: 'Кофейня', cat: 'food', size: 'lot', floors: [1, 2], open: [7, 22], capacity: 14, zones: ['center', 'mid'], weight: 2, min: 3, max: 5, colors: [0x6f4e37, 0xc8a27a, 0x2f2f2f], signColor: 0xf5deb3, prefix: 'Кофейня' },
  { id: 'cafe', name: 'Кафе', cat: 'food', size: 'lot', floors: [1, 2], open: [10, 23], capacity: 20, zones: ['center', 'mid', 'outer'], weight: 1.5, min: 2, max: 4, colors: [0xf4a261, 0xe9c46a, 0xa8dadc], signColor: 0x264653, prefix: 'Кафе' },
  { id: 'shawarma', name: 'Шаурмичная', cat: 'food', size: 'lot', floors: [1, 1], open: [10, 27], capacity: 8, zones: ['mid', 'outer', 'center'], weight: 1, min: 1, max: 3, colors: [0xffd166, 0xef476f], signColor: 0x073b4c, prefix: 'Шаурма' },
  { id: 'pizzeria', name: 'Пиццерия', cat: 'food', size: 'lot', floors: [1, 2], open: [11, 24], capacity: 18, zones: ['center', 'mid'], weight: 0.6, min: 1, max: 2, colors: [0xe76f51, 0xfefae0], signColor: 0x2a9d8f, prefix: 'Пиццерия' },
  { id: 'restaurant', name: 'Ресторан', cat: 'food', size: 'lot', floors: [2, 3], open: [12, 24], capacity: 30, zones: ['center'], weight: 0.6, min: 1, max: 2, colors: [0x3d405b, 0x81b29a, 0xf2cc8f], signColor: 0xf4f1de, prefix: 'Ресторан' },
  { id: 'bar', name: 'Бар', cat: 'food', size: 'lot', floors: [1, 3], open: [17, 26], capacity: 25, zones: ['center', 'mid'], weight: 1, min: 2, max: 3, colors: [0x5c3d2e, 0x2d2424, 0x7b2d26], signColor: 0xffb703, prefix: 'Бар' },

  // ——— досуг
  { id: 'club', name: 'Ночной клуб', cat: 'leisure', size: 'lot', floors: [2, 3], open: [22, 30], capacity: 60, zones: ['center', 'mid'], weight: 0, min: 1, max: 1, colors: [0x1b1b2f, 0x162447], signColor: 0xe94560, prefix: 'Клуб' },
  { id: 'cinema', name: 'Кинотеатр', cat: 'leisure', size: 'lot', floors: [2, 3], open: [10, 25], capacity: 60, zones: ['center'], weight: 0, min: 1, max: 1, colors: [0x8d0801, 0x2b2d42], signColor: 0xffd60a, prefix: 'Кинотеатр' },
  { id: 'library', name: 'Библиотека', cat: 'leisure', size: 'lot', floors: [2, 3], open: [10, 20], days: [0, 1, 2, 3, 4, 5], capacity: 25, zones: ['center', 'mid'], weight: 0, min: 1, max: 1, colors: [0xcbb994, 0xa98467], prefix: 'Библиотека' },
  { id: 'museum', name: 'Музей', cat: 'leisure', size: 'lot', floors: [2, 3], open: [10, 19], days: [1, 2, 3, 4, 5, 6], capacity: 35, zones: ['center'], weight: 0, min: 1, max: 1, colors: [0xede0d4], prefix: 'Музей' },
  { id: 'gym', name: 'Спортзал', cat: 'leisure', size: 'lot', floors: [2, 3], open: [6, 23], capacity: 25, zones: ['mid', 'center', 'outer'], weight: 0.5, min: 1, max: 2, colors: [0x343a40, 0xff6b35], signColor: 0xff6b35, prefix: 'Фитнес' },
  { id: 'pool', name: 'Бассейн', cat: 'leisure', size: 'lot', floors: [2, 2], open: [7, 22], capacity: 30, zones: ['mid'], weight: 0, min: 1, max: 1, colors: [0xd8f3ff, 0x48cae4], prefix: 'Бассейн' },
  { id: 'church', name: 'Храм', cat: 'civic', size: 'lot', floors: [2, 2], open: [7, 20], capacity: 40, zones: ['mid', 'outer'], weight: 0, min: 1, max: 1, colors: [0xf8f4e3], prefix: 'Храм' },
  { id: 'stadium', name: 'Стадион', cat: 'leisure', size: 'block', floors: [1, 1], open: [8, 23], capacity: 200, outdoor: true, zones: [], weight: 0, colors: [0x3a86ff, 0xffffff], prefix: 'Стадион' },

  // ——— образование и здоровье
  { id: 'kindergarten', name: 'Детский сад', cat: 'edu', size: 'lot', floors: [2, 2], open: [7, 19], days: [0, 1, 2, 3, 4], capacity: 40, zones: ['mid', 'outer'], weight: 0, min: 1, max: 1, colors: [0xffd6a5, 0xcaffbf, 0x9bf6ff], prefix: 'Детсад' },
  { id: 'school', name: 'Школа', cat: 'edu', size: 'block', floors: [3, 3], open: [8, 17], days: [0, 1, 2, 3, 4], capacity: 150, zones: [], weight: 0, colors: [0xe9a178, 0xf4e3c3], prefix: 'Школа' },
  { id: 'university', name: 'Университет', cat: 'edu', size: 'block', floors: [4, 5], open: [8, 20], days: [0, 1, 2, 3, 4, 5], capacity: 150, zones: [], weight: 0, colors: [0xd4c8b0, 0x8a7f6a], prefix: 'Университет' },
  { id: 'hospital', name: 'Больница', cat: 'health', size: 'block', floors: [5, 6], open: null, capacity: 80, zones: [], weight: 0, colors: [0xf5f7fa], signColor: 0xe63946, prefix: 'Больница' },

  // ——— промзона и транспорт
  { id: 'factory', name: 'Завод', cat: 'industry', size: 'wide', floors: [2, 3], open: [6, 22], days: [0, 1, 2, 3, 4, 5], capacity: 60, zones: ['industry'], weight: 0, min: 1, max: 1, colors: [0x9a8c98, 0x6c757d], prefix: 'Завод' },
  { id: 'warehouse', name: 'Склад', cat: 'industry', size: 'lot', floors: [1, 2], open: [6, 22], capacity: 20, zones: ['industry'], weight: 1, min: 1, colors: [0xb5a28c, 0x8d99ae], prefix: 'Склад' },
  { id: 'autoservice', name: 'Автосервис', cat: 'industry', size: 'lot', floors: [1, 1], open: [8, 20], capacity: 8, zones: ['industry', 'outer'], weight: 0, min: 1, max: 1, colors: [0x6c757d, 0xffbe0b], signColor: 0xffbe0b, prefix: 'Автосервис' },
  { id: 'gasstation', name: 'Заправка', cat: 'transport', size: 'lot', floors: [1, 1], open: null, capacity: 6, zones: ['industry', 'outer'], weight: 0, min: 1, max: 1, colors: [0xffffff, 0x2a9d8f], signColor: 0xe76f51, prefix: 'АЗС' },
  { id: 'depot', name: 'Автобусное депо', cat: 'transport', size: 'lot', floors: [1, 1], open: null, capacity: 15, zones: ['industry'], weight: 0, min: 1, max: 1, colors: [0xadb5bd, 0x495057], prefix: 'Депо' },
  { id: 'construction', name: 'Стройка', cat: 'construction', size: 'lot', floors: [1, 12], open: [7, 19], days: [0, 1, 2, 3, 4, 5], capacity: 15, zones: ['mid', 'outer', 'center'], weight: 0, min: 1, max: 1, colors: [0xffb703], prefix: 'Стройка' },

  // ——— открытые пространства
  { id: 'park', name: 'Парк', cat: 'outdoor', size: 'block', floors: [0, 0], open: null, capacity: 150, outdoor: true, zones: [], weight: 0, colors: [0x7cb518], prefix: 'Парк' },
  { id: 'square', name: 'Сквер', cat: 'outdoor', size: 'lot', floors: [0, 0], open: null, capacity: 30, outdoor: true, zones: ['center', 'mid', 'outer'], weight: 0.7, min: 2, max: 4, colors: [0x90be6d], prefix: 'Сквер' },
  { id: 'pond', name: 'Пруд', cat: 'outdoor', size: 'block', floors: [0, 0], open: null, capacity: 80, outdoor: true, zones: [], weight: 0, colors: [0x4ea8de], prefix: 'Пруд' },
  { id: 'nook', name: 'Уголок отдыха', cat: 'outdoor', size: 'lot', floors: [0, 0], open: null, capacity: 6, outdoor: true, zones: [], weight: 0, colors: [0x90be6d], prefix: 'Лавочка' },
  { id: 'playground', name: 'Детская площадка', cat: 'outdoor', size: 'lot', floors: [0, 0], open: null, capacity: 20, outdoor: true, zones: ['mid', 'outer'], weight: 0.6, min: 1, max: 3, colors: [0xf94144, 0xf9c74f, 0x43aa8b], prefix: 'Площадка' },
];

export const BUILDING_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
