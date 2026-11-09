// Черты характера. Влияют на выбор занятий (теги), транспорт, сон и потребности.
export type Mode = 'walk' | 'bike' | 'car' | 'bus' | 'taxi';

export interface TraitDef {
  id: string;
  name: string;
  emoji: string;
  /** множители для тегов занятий */
  tags?: Record<string, number>;
  modes?: Partial<Record<Mode, number>>; // >1 — предпочитает
  wake?: number; // сдвиг подъёма в часах
  sleep?: number; // сдвиг отбоя в часах
  needs?: Partial<Record<'hunger' | 'energy' | 'fun' | 'social', number>>; // множитель скорости падения
  weatherSens?: number; // множитель влияния погоды на настроение
  late?: number; // вероятность опоздать
  spend?: number; // множитель трат
  excludes?: string[];
}

export const TRAITS: TraitDef[] = [
  { id: 'lark', name: 'жаворонок', emoji: '🌅', wake: -1.5, sleep: -1.5, tags: { morning: 1.6, night: 0.4 }, excludes: ['owl'] },
  { id: 'owl', name: 'сова', emoji: '🦉', wake: 1.8, sleep: 2.2, tags: { night: 2, morning: 0.4, party: 1.3 }, excludes: ['lark'] },
  { id: 'homebody', name: 'домосед', emoji: '🛋️', tags: { home: 2.2, party: 0.3, outdoor: 0.6 }, needs: { social: 0.6 }, excludes: ['party'] },
  { id: 'party', name: 'тусовщик', emoji: '🪩', tags: { party: 2.6, night: 1.5, home: 0.6, social: 1.4 }, needs: { social: 1.3, fun: 1.3 }, spend: 1.3, excludes: ['homebody'] },
  { id: 'sporty', name: 'спортсмен', emoji: '🏃', tags: { sport: 3, outdoor: 1.3 }, modes: { bike: 1.8, walk: 1.3, car: 0.8 }, needs: { energy: 0.8, hunger: 1.2 } },
  { id: 'workaholic', name: 'трудоголик', emoji: '💼', tags: { work: 2.5, party: 0.6 }, late: -0.05, needs: { fun: 0.7 } },
  { id: 'lazy', name: 'лентяй', emoji: '😴', tags: { home: 1.5, sport: 0.3, rest: 1.8 }, modes: { walk: 0.7, bike: 0.4, taxi: 1.5, car: 1.3 }, late: 0.15, needs: { energy: 1.2 } },
  { id: 'coffee', name: 'кофеман', emoji: '☕', tags: { coffee: 4 } },
  { id: 'gourmet', name: 'гурман', emoji: '🍝', tags: { food: 1.6, luxury: 1.8, cheap: 0.6 }, spend: 1.4, needs: { hunger: 1.2 } },
  { id: 'frugal', name: 'экономный', emoji: '🪙', tags: { luxury: 0.3, cheap: 1.8, home: 1.2 }, modes: { taxi: 0.2, car: 0.8, bus: 1.2 }, spend: 0.6, excludes: ['spender'] },
  { id: 'spender', name: 'транжира', emoji: '💸', tags: { luxury: 2, shopping: 2 }, modes: { taxi: 2 }, spend: 1.7, excludes: ['frugal'] },
  { id: 'eco', name: 'эколог', emoji: '🌱', tags: { nature: 1.8 }, modes: { car: 0.05, taxi: 0.3, bike: 2, bus: 1.4, walk: 1.3 }, excludes: ['carlover'] },
  { id: 'carlover', name: 'автолюбитель', emoji: '🚗', modes: { car: 3, bus: 0.5, bike: 0.4, walk: 0.7 }, tags: { car: 2 }, excludes: ['eco'] },
  { id: 'bookworm', name: 'книжный червь', emoji: '📚', tags: { reading: 3.5, culture: 1.8, party: 0.5 } },
  { id: 'music', name: 'меломан', emoji: '🎧', tags: { music: 3, party: 1.3 } },
  { id: 'dogperson', name: 'собачник', emoji: '🐕', tags: { dog: 3, nature: 1.3 } },
  { id: 'meteo', name: 'метеозависимый', emoji: '🌧️', weatherSens: 2.2, tags: { outdoor: 0.8 } },
  { id: 'punctual', name: 'пунктуальный', emoji: '⏰', late: -0.08, excludes: ['late'] },
  { id: 'late', name: 'вечно опаздывает', emoji: '🐌', late: 0.35, excludes: ['punctual'] },
  { id: 'social', name: 'общительный', emoji: '🗣️', tags: { social: 2.2, party: 1.3 }, needs: { social: 1.4 }, excludes: ['introvert'] },
  { id: 'introvert', name: 'интроверт', emoji: '🎮', tags: { social: 0.4, home: 1.5, games: 2, party: 0.4 }, needs: { social: 0.5 }, excludes: ['social'] },
  { id: 'romantic', name: 'романтик', emoji: '💘', tags: { romance: 2.5, nature: 1.3 } },
  { id: 'gamer', name: 'геймер', emoji: '🕹️', tags: { games: 3.5, sport: 0.6 }, sleep: 1 },
  { id: 'foodie', name: 'любит фастфуд', emoji: '🌯', tags: { cheap: 1.5, fastfood: 3 } },
  { id: 'believer', name: 'верующий', emoji: '⛪', tags: { church: 4 } },
  { id: 'cinephile', name: 'киноман', emoji: '🎬', tags: { cinema: 3.5 } },
];

export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));
