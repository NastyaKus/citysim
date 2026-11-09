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
};

export const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function fmtTime(min: number): string {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
