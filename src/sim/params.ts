import type { Season } from './content/weather';

export interface Params {
  timeSpeed: number; // игровых минут в реальную секунду
  paused: boolean;
  population: number;
  carOwnership: number;
  bikeOwnership: number;
  dogOwnership: number;
  busCount: number; // на маршрут
  ticketPrice: number;
  fuelPrice: number;
  taxiPrice: number;
  speedLimit: number;
  lightCycle: number; // зелёная фаза, игровых минут
  throughTraffic: number;
  wageLevel: number;
  priceLevel: number;
  rent: number;
  unemployment: number;
  weatherAuto: boolean;
  weather: string;
  tempOffset: number;
  season: Season;
  seasonAuto: boolean;
  eventsAuto: boolean;
  eventRate: number;
  sickness: number;
  // вид
  shadows: boolean;
  showRoutes: boolean;
  heatmap: boolean;
  labels: boolean;
  quality: 'low' | 'medium' | 'high';
  // симуляция
  birthRate: number;
  migration: number;
  loveRate: number;
  yearDays: number;
  sociability: number;
  oversleep: number;
  accidentRate: number;
  fireRate: number;
  // графика
  renderScale: number;
  shadowRes: 'low' | 'high';
  precipDensity: number;
  fpsLimit: number;
  showFps: boolean;
  treeSway: boolean;
  maxVisible: number;
  drawDistance: number;
  volume: number;
  ambVolume: number;
  fxVolume: number;
  muted: boolean;
}

export const DEFAULT_PARAMS: Params = {
  timeSpeed: 1,
  paused: false,
  population: 420,
  carOwnership: 0.45,
  bikeOwnership: 0.35,
  dogOwnership: 0.18,
  busCount: 3,
  ticketPrice: 3,
  fuelPrice: 5,
  taxiPrice: 1,
  speedLimit: 1,
  lightCycle: 1.4,
  throughTraffic: 0.6,
  wageLevel: 1,
  priceLevel: 1,
  rent: 1,
  unemployment: 0.06,
  weatherAuto: true,
  weather: 'clear',
  tempOffset: 0,
  season: 'autumn',
  seasonAuto: false,
  eventsAuto: true,
  eventRate: 1,
  sickness: 1,
  shadows: true,
  showRoutes: false,
  heatmap: false,
  labels: true,
  quality: 'high',
  birthRate: 1,
  migration: 1,
  loveRate: 1,
  yearDays: 30,
  sociability: 1,
  oversleep: 1,
  accidentRate: 1,
  fireRate: 1,
  renderScale: 1,
  shadowRes: 'high',
  precipDensity: 1,
  fpsLimit: 0,
  showFps: false,
  treeSway: true,
  maxVisible: 1400,
  drawDistance: 1,
  volume: 0.8,
  ambVolume: 0.8,
  fxVolume: 0.9,
  muted: false,
};

export const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function fmtTime(min: number): string {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
