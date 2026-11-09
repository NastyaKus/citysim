// Типы погоды и их влияние.
export type Precip = 'none' | 'rain' | 'snow' | 'hail' | 'sleet';

export interface WeatherDef {
  id: string;
  name: string;
  emoji: string;
  cloud: number; // 0..1
  precip: Precip;
  intensity: number; // 0..1
  fog: number; // 0..1
  wind: number; // 0..1
  lightning?: boolean;
  temp: [number, number]; // типичный диапазон °C
  mood: number; // влияние на настроение в час
  drive: number; // множитель скорости машин
  icy?: boolean;
  seasons: Season[];
  weight: number;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_NAMES: Record<Season, string> = { spring: 'весна', summer: 'лето', autumn: 'осень', winter: 'зима' };
export const SEASON_TEMP: Record<Season, [number, number]> = { spring: [2, 16], summer: [16, 30], autumn: [-2, 12], winter: [-18, 0] };
/** долгота дня: восход, закат */
export const SEASON_SUN: Record<Season, [number, number]> = { spring: [6, 20], summer: [4.5, 22], autumn: [7.5, 17.5], winter: [9, 16] };

export const WEATHERS: WeatherDef[] = [
  { id: 'clear', name: 'Ясно', emoji: '☀️', cloud: 0.05, precip: 'none', intensity: 0, fog: 0, wind: 0.15, temp: [-20, 30], mood: 1.2, drive: 1, seasons: ['spring', 'summer', 'autumn', 'winter'], weight: 4 },
  { id: 'partly', name: 'Переменная облачность', emoji: '⛅', cloud: 0.4, precip: 'none', intensity: 0, fog: 0, wind: 0.3, temp: [-20, 28], mood: 0.6, drive: 1, seasons: ['spring', 'summer', 'autumn', 'winter'], weight: 4 },
  { id: 'overcast', name: 'Пасмурно', emoji: '☁️', cloud: 0.85, precip: 'none', intensity: 0, fog: 0.08, wind: 0.3, temp: [-15, 22], mood: -0.4, drive: 1, seasons: ['spring', 'summer', 'autumn', 'winter'], weight: 3 },
  { id: 'drizzle', name: 'Морось', emoji: '🌦️', cloud: 0.8, precip: 'rain', intensity: 0.25, fog: 0.15, wind: 0.2, temp: [2, 18], mood: -0.8, drive: 0.95, seasons: ['spring', 'autumn', 'summer'], weight: 2 },
  { id: 'rain', name: 'Дождь', emoji: '🌧️', cloud: 0.9, precip: 'rain', intensity: 0.6, fog: 0.12, wind: 0.4, temp: [3, 24], mood: -1.2, drive: 0.88, seasons: ['spring', 'summer', 'autumn'], weight: 2.5 },
  { id: 'downpour', name: 'Ливень', emoji: '🌊', cloud: 1, precip: 'rain', intensity: 1, fog: 0.25, wind: 0.6, temp: [10, 28], mood: -1.8, drive: 0.75, seasons: ['summer', 'autumn'], weight: 1 },
  { id: 'storm', name: 'Гроза', emoji: '⛈️', cloud: 1, precip: 'rain', intensity: 0.85, fog: 0.15, wind: 0.85, lightning: true, temp: [14, 30], mood: -1.6, drive: 0.78, seasons: ['summer', 'spring'], weight: 1 },
  { id: 'hail', name: 'Град', emoji: '🧊', cloud: 1, precip: 'hail', intensity: 0.7, fog: 0.05, wind: 0.6, temp: [8, 22], mood: -2.2, drive: 0.7, seasons: ['summer', 'spring'], weight: 0.4 },
  { id: 'fog', name: 'Туман', emoji: '🌫️', cloud: 0.6, precip: 'none', intensity: 0, fog: 1, wind: 0.02, temp: [-5, 15], mood: -0.5, drive: 0.7, seasons: ['spring', 'autumn', 'winter'], weight: 1.2 },
  { id: 'sleet', name: 'Мокрый снег', emoji: '🌨️', cloud: 0.95, precip: 'sleet', intensity: 0.6, fog: 0.15, wind: 0.5, temp: [-2, 3], mood: -1.8, drive: 0.75, seasons: ['autumn', 'spring', 'winter'], weight: 1 },
  { id: 'snow', name: 'Снегопад', emoji: '🌨️', cloud: 0.9, precip: 'snow', intensity: 0.55, fog: 0.2, wind: 0.25, temp: [-15, 1], mood: 0.3, drive: 0.75, seasons: ['winter', 'autumn'], weight: 3 },
  { id: 'blizzard', name: 'Метель', emoji: '❄️', cloud: 1, precip: 'snow', intensity: 1, fog: 0.55, wind: 1, temp: [-25, -3], mood: -1.5, drive: 0.5, seasons: ['winter'], weight: 1 },
  { id: 'ice', name: 'Гололёд', emoji: '⛸️', cloud: 0.6, precip: 'none', intensity: 0, fog: 0.05, wind: 0.2, temp: [-6, 0], mood: -0.8, drive: 0.55, icy: true, seasons: ['winter', 'autumn', 'spring'], weight: 1 },
  { id: 'heat', name: 'Жара', emoji: '🔥', cloud: 0, precip: 'none', intensity: 0, fog: 0.04, wind: 0.05, temp: [29, 38], mood: -0.6, drive: 1, seasons: ['summer'], weight: 1.5 },
  { id: 'windy', name: 'Сильный ветер', emoji: '💨', cloud: 0.5, precip: 'none', intensity: 0, fog: 0, wind: 1, temp: [-10, 22], mood: -0.7, drive: 0.92, seasons: ['spring', 'autumn', 'winter', 'summer'], weight: 1.2 },
];

export const WEATHER_BY_ID: Record<string, WeatherDef> = Object.fromEntries(WEATHERS.map((w) => [w.id, w]));
