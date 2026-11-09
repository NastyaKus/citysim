// Каталог занятий жителей. {м|ж} — род глагола для дневника.
export type Need = 'hunger' | 'energy' | 'fun' | 'social' | 'health';
export const NEEDS: Need[] = ['hunger', 'energy', 'fun', 'social', 'health'];
export const NEED_NAMES: Record<Need, string> = { hunger: 'сытость', energy: 'энергия', fun: 'досуг', social: 'общение', health: 'здоровье' };

export interface ActivityDef {
  id: string;
  label: string; // настоящее время, для карточки
  diary: string; // для дневника
  emoji: string;
  places: string[] | 'home' | 'friendHome';
  hours: [number, number][];
  days?: number[];
  dur: [number, number];
  effects: Partial<Record<Need, number>>; // изменение за час
  cost: number;
  ages: [number, number];
  tags: string[];
  base: number;
  outdoor?: boolean;
  weather?: { rain?: number; snow?: number; cold?: number; hot?: number; sunny?: number; wind?: number; dark?: number };
  requires?: 'dog' | 'bike' | 'car' | 'partner' | 'friend' | 'snowOnGround' | 'kids' | 'sick' | 'baby';
  social?: boolean;
  eventOnly?: boolean;
}

const ALLDAY: [number, number][] = [[0, 24]];

export const ACTIVITIES: ActivityDef[] = [
  // ——— дома
  { id: 'sleep', label: 'спит', diary: '{лёг|легла} спать', emoji: '😴', places: 'home', hours: ALLDAY, dur: [360, 540], effects: { energy: 13, hunger: -2.5, fun: 0, social: 0 }, cost: 0, ages: [0, 120], tags: ['home'], base: 0, eventOnly: true },
  { id: 'nap', label: 'дремлет', diary: '{прилёг|прилегла} вздремнуть', emoji: '💤', places: 'home', hours: [[12, 18]], dur: [30, 90], effects: { energy: 10 }, cost: 0, ages: [0, 120], tags: ['home', 'rest'], base: 0.5 },
  { id: 'breakfast', label: 'завтракает дома', diary: 'позавтракал{|а} дома', emoji: '🍳', places: 'home', hours: [[5, 11]], dur: [20, 40], effects: { hunger: 80, fun: 2 }, cost: 4, ages: [3, 120], tags: ['home', 'food', 'morning'], base: 1.5 },
  { id: 'cook', label: 'готовит ужин', diary: 'приготовил{|а} ужин', emoji: '🍲', places: 'home', hours: [[17, 22]], dur: [40, 80], effects: { hunger: 70, fun: 6 }, cost: 8, ages: [14, 120], tags: ['home', 'food', 'cheap'], base: 1.4 },
  { id: 'tv', label: 'смотрит сериал', diary: 'включил{|а} сериал', emoji: '📺', places: 'home', hours: [[8, 26]], dur: [45, 150], effects: { fun: 18, energy: 2 }, cost: 0, ages: [5, 120], tags: ['home', 'rest'], base: 1 },
  { id: 'games', label: 'играет в приставку', diary: 'засел{|а} за приставку', emoji: '🎮', places: 'home', hours: [[10, 27]], dur: [60, 180], effects: { fun: 25, energy: -3, social: 2 }, cost: 0, ages: [7, 60], tags: ['home', 'games', 'night'], base: 0.8 },
  { id: 'read_home', label: 'читает книгу', diary: 'взял{|а} почитать книгу', emoji: '📖', places: 'home', hours: [[8, 25]], dur: [40, 120], effects: { fun: 14, energy: 1 }, cost: 0, ages: [8, 120], tags: ['home', 'reading', 'rest'], base: 0.6 },
  { id: 'music_home', label: 'слушает музыку в наушниках', diary: 'надел{|а} наушники и слушал{|а} альбом целиком', emoji: '🎧', places: 'home', hours: [[9, 27]], dur: [40, 100], effects: { fun: 18 }, cost: 0, ages: [10, 90], tags: ['home', 'music', 'night'], base: 0.6 },
  { id: 'cleaning', label: 'убирается дома', diary: 'затеял{|а} уборку', emoji: '🧹', places: 'home', hours: [[9, 21]], days: [5, 6], dur: [40, 90], effects: { fun: -4, health: 2 }, cost: 0, ages: [12, 120], tags: ['home'], base: 0.6 },
  { id: 'call', label: 'болтает по телефону', diary: 'полчаса болтал{|а} по телефону', emoji: '📱', places: 'home', hours: [[9, 24]], dur: [20, 60], effects: { social: 30, fun: 6 }, cost: 0, ages: [10, 120], tags: ['home', 'social'], base: 0.8 },
  { id: 'eat_home', label: 'ест дома', diary: 'перекусил{|а} дома', emoji: '🥪', places: 'home', hours: [[11, 24]], dur: [20, 35], effects: { hunger: 90 }, cost: 3, ages: [3, 120], tags: ['home', 'food', 'cheap'], base: 1.2 },
  { id: 'guests', label: 'в гостях у друга', diary: 'заглянул{|а} в гости к другу', emoji: '🏠', places: 'friendHome', hours: [[12, 23]], dur: [90, 200], effects: { social: 35, fun: 15, hunger: 15 }, cost: 3, ages: [6, 120], tags: ['social'], base: 0.8, requires: 'friend' },
  { id: 'sick_home', label: 'болеет и лежит дома', diary: 'остал{ся|ась} дома — болеет', emoji: '🤒', places: 'home', hours: ALLDAY, dur: [180, 400], effects: { health: 6, energy: 5, fun: -3 }, cost: 2, ages: [0, 120], tags: ['home'], base: 0, eventOnly: true },
  { id: 'birthday', label: 'празднует день рождения', diary: 'празднует день рождения!', emoji: '🎂', places: 'home', hours: ALLDAY, dur: [180, 240], effects: { social: 40, fun: 40, hunger: 30 }, cost: 30, ages: [0, 120], tags: ['social', 'party'], base: 0, eventOnly: true },
  { id: 'evacuated', label: 'эвакуирован(а), стоит на улице', diary: 'эвакуировал{ся|ась} из здания из-за пожара', emoji: '🚒', places: 'home', hours: ALLDAY, dur: [40, 60], effects: { fun: -10 }, cost: 0, ages: [0, 120], tags: [], base: 0, eventOnly: true, outdoor: true },

  // ——— работа/учёба (выбираются расписанием)
  { id: 'work', label: 'на работе', diary: 'приш{ёл|ла} на работу', emoji: '💼', places: [], hours: ALLDAY, dur: [60, 600], effects: { energy: -1.2, fun: -1.5, social: 4, hunger: 4 }, cost: 0, ages: [16, 99], tags: ['work'], base: 0, eventOnly: true },
  { id: 'school', label: 'на уроках', diary: 'приш{ёл|ла} в школу', emoji: '🏫', places: ['school'], hours: ALLDAY, dur: [60, 420], effects: { energy: -1, fun: -1, social: 6, hunger: 4 }, cost: 0, ages: [6, 18], tags: ['study'], base: 0, eventOnly: true },
  { id: 'kinder', label: 'в детском саду', diary: 'отправил{ся|ась} в садик', emoji: '🧸', places: ['kindergarten'], hours: ALLDAY, dur: [60, 600], effects: { energy: -2, fun: 6, social: 8, hunger: 6 }, cost: 0, ages: [2, 7], tags: ['study'], base: 0, eventOnly: true },
  { id: 'study', label: 'на парах', diary: 'приш{ёл|ла} на пары', emoji: '🎓', places: ['university'], hours: ALLDAY, dur: [60, 420], effects: { energy: -1, fun: -1, social: 5, hunger: 3 }, cost: 0, ages: [16, 30], tags: ['study'], base: 0, eventOnly: true },
  { id: 'job_search', label: 'ищет работу на бирже труда', diary: 'сходил{|а} на биржу труда', emoji: '📋', places: ['cityhall'], hours: [[9, 17]], days: [0, 1, 2, 3, 4], dur: [40, 90], effects: { fun: -6 }, cost: 0, ages: [18, 62], tags: [], base: 0, eventOnly: true },
  { id: 'interview', label: 'на собеседовании', diary: 'сходил{|а} на собеседование', emoji: '🤝', places: ['office', 'bizcenter', 'itoffice', 'factory'], hours: [[10, 17]], days: [0, 1, 2, 3, 4], dur: [40, 70], effects: { fun: -4, energy: -5 }, cost: 0, ages: [18, 62], tags: [], base: 0, eventOnly: true },

  // ——— еда вне дома
  { id: 'coffee', label: 'берёт кофе навынос', diary: 'взял{|а} капучино навынос', emoji: '☕', places: ['coffee'], hours: [[7, 21]], dur: [10, 25], effects: { energy: 25, fun: 8, social: 6 }, cost: 4, ages: [15, 120], tags: ['coffee', 'food', 'morning'], base: 0.7 },
  { id: 'coffee_sit', label: 'сидит в кофейне с ноутбуком', diary: 'засел{|а} в кофейне с ноутбуком', emoji: '💻', places: ['coffee', 'cowork'], hours: [[9, 21]], dur: [60, 150], effects: { energy: 6, fun: 12, social: 10 }, cost: 6, ages: [16, 70], tags: ['coffee'], base: 0.4 },
  { id: 'lunch', label: 'обедает в кафе', diary: 'пообедал{|а} в кафе', emoji: '🍜', places: ['cafe', 'pizzeria', 'restaurant', 'shawarma'], hours: [[11, 16]], dur: [30, 60], effects: { hunger: 80, social: 12, fun: 6 }, cost: 12, ages: [12, 120], tags: ['food'], base: 1.1, social: true },
  { id: 'dinner_out', label: 'ужинает в ресторане', diary: 'поужинал{|а} в ресторане', emoji: '🍷', places: ['restaurant'], hours: [[18, 23]], dur: [70, 130], effects: { hunger: 70, social: 25, fun: 25 }, cost: 40, ages: [18, 120], tags: ['food', 'luxury', 'romance'], base: 0.5, social: true },
  { id: 'shawarma', label: 'ест шаурму', diary: 'съел{|а} шаурму у метро... ну, у остановки', emoji: '🌯', places: ['shawarma'], hours: [[11, 27]], dur: [15, 25], effects: { hunger: 85, fun: 8 }, cost: 5, ages: [12, 90], tags: ['food', 'cheap', 'fastfood', 'night'], base: 0.7 },
  { id: 'pizza', label: 'ест пиццу', diary: 'взял{|а} пиццу с друзьями', emoji: '🍕', places: ['pizzeria'], hours: [[12, 24]], dur: [40, 70], effects: { hunger: 80, social: 20, fun: 14 }, cost: 14, ages: [6, 90], tags: ['food', 'fastfood', 'social'], base: 0.6, social: true },
  { id: 'bakery', label: 'покупает свежий хлеб', diary: 'купил{|а} тёплый багет в пекарне', emoji: '🥖', places: ['bakery'], hours: [[7, 13]], dur: [10, 20], effects: { hunger: 30, fun: 8 }, cost: 3, ages: [10, 120], tags: ['food', 'morning', 'cheap'], base: 0.6 },
  { id: 'icecream', label: 'ест мороженое', diary: 'купил{|а} мороженое', emoji: '🍦', places: ['kiosk', 'park', 'square'], hours: [[11, 21]], dur: [10, 25], effects: { fun: 18, hunger: 10 }, cost: 2, ages: [3, 120], tags: ['food', 'cheap', 'outdoor'], base: 0.2, outdoor: true, weather: { hot: 5, cold: 0.1, rain: 0.2 } },

  // ——— покупки и дела
  { id: 'groceries', label: 'закупается продуктами', diary: 'закупил{ся|ась} продуктами', emoji: '🛒', places: ['grocery', 'supermarket'], hours: [[8, 22]], dur: [20, 45], effects: { fun: -2, hunger: 10 }, cost: 18, ages: [14, 120], tags: ['shopping'], base: 0.8 },
  { id: 'kiosk', label: 'забегает в ларёк', diary: 'забежал{|а} в ларёк за газировкой', emoji: '🥤', places: ['kiosk'], hours: ALLDAY, dur: [5, 12], effects: { hunger: 15, fun: 4 }, cost: 2, ages: [8, 120], tags: ['shopping', 'cheap', 'night'], base: 0.4 },
  { id: 'market', label: 'гуляет по рынку', diary: 'сходил{|а} на рынок за овощами', emoji: '🥕', places: ['market'], hours: [[8, 16]], dur: [30, 70], effects: { fun: 10, social: 12, hunger: 10 }, cost: 12, ages: [16, 120], tags: ['shopping', 'outdoor', 'cheap'], base: 0.5, outdoor: true, weather: { rain: 0.4, snow: 0.5, sunny: 1.4 } },
  { id: 'pharmacy', label: 'стоит в очереди в аптеке', diary: '{зашёл|зашла} в аптеку', emoji: '💊', places: ['pharmacy'], hours: [[8, 22]], dur: [10, 25], effects: { health: 40 }, cost: 8, ages: [14, 120], tags: ['health'], base: 0.15 },
  { id: 'doctor', label: 'на приёме у врача', diary: 'сходил{|а} к врачу', emoji: '🩺', places: ['hospital'], hours: [[8, 18]], days: [0, 1, 2, 3, 4], dur: [40, 90], effects: { health: 55, fun: -5 }, cost: 5, ages: [0, 120], tags: ['health'], base: 0.05 },
  { id: 'bank', label: 'в банке', diary: 'решал{|а} вопросы в банке', emoji: '🏦', places: ['bank'], hours: [[9, 18]], days: [0, 1, 2, 3, 4, 5], dur: [20, 40], effects: { fun: -6 }, cost: 0, ages: [18, 120], tags: [], base: 0.15 },
  { id: 'post', label: 'получает посылку', diary: 'забрал{|а} посылку на почте', emoji: '📦', places: ['post'], hours: [[9, 19]], days: [0, 1, 2, 3, 4, 5], dur: [15, 40], effects: { fun: 6 }, cost: 0, ages: [16, 120], tags: ['shopping'], base: 0.25 },
  { id: 'carservice', label: 'чинит машину в автосервисе', diary: '{отвёз|отвезла} машину в сервис', emoji: '🔧', places: ['autoservice'], hours: [[8, 19]], dur: [60, 120], effects: { fun: -8 }, cost: 40, ages: [18, 120], tags: ['car'], base: 0.05, requires: 'car' },
  { id: 'refuel', label: 'заправляет машину', diary: 'заправил{|а} машину', emoji: '⛽', places: ['gasstation'], hours: ALLDAY, dur: [8, 15], effects: {}, cost: 25, ages: [18, 120], tags: ['car'], base: 0, eventOnly: true, requires: 'car' },

  // ——— спорт и прогулки
  { id: 'gym', label: 'качается в спортзале', diary: 'сходил{|а} в зал', emoji: '🏋️', places: ['gym'], hours: [[6, 23]], dur: [60, 100], effects: { health: 15, energy: -12, fun: 12, hunger: -15 }, cost: 6, ages: [14, 80], tags: ['sport'], base: 0.45 },
  { id: 'swim', label: 'плавает в бассейне', diary: 'проплыл{|а} километр в бассейне', emoji: '🏊', places: ['pool'], hours: [[7, 22]], dur: [50, 90], effects: { health: 18, energy: -10, fun: 15 }, cost: 6, ages: [6, 90], tags: ['sport'], base: 0.3 },
  { id: 'jog', label: 'бегает в парке', diary: '{вышел|вышла} на пробежку', emoji: '🏃', places: ['park', 'pond', 'stadium'], hours: [[6, 10], [18, 22]], dur: [30, 60], effects: { health: 20, energy: -14, fun: 14, hunger: -12 }, cost: 0, ages: [12, 75], tags: ['sport', 'outdoor', 'morning', 'nature'], base: 0.3, outdoor: true, weather: { rain: 0.25, snow: 0.3, cold: 0.6, hot: 0.4, sunny: 1.3, dark: 0.6 } },
  { id: 'dogwalk', label: 'гуляет с собакой', diary: 'вывел{|а} собаку погулять', emoji: '🐕', places: ['park', 'square', 'pond', 'playground'], hours: [[6, 10], [17, 24]], dur: [25, 50], effects: { fun: 14, social: 8, health: 6 }, cost: 0, ages: [8, 120], tags: ['dog', 'outdoor', 'nature'], base: 2.2, outdoor: true, requires: 'dog', weather: { rain: 0.8, snow: 0.9 } },
  { id: 'park_walk', label: 'гуляет в парке', diary: 'пош{ёл|ла} прогуляться по парку', emoji: '🌳', places: ['park', 'square', 'pond'], hours: [[8, 23]], dur: [40, 100], effects: { fun: 18, health: 6, social: 6 }, cost: 0, ages: [3, 120], tags: ['outdoor', 'nature', 'romance'], base: 0.8, outdoor: true, social: true, weather: { rain: 0.2, snow: 0.6, cold: 0.6, sunny: 1.6, dark: 0.5, wind: 0.6 } },
  { id: 'bench', label: 'сидит на лавочке', diary: 'посидел{|а} на лавочке, наблюдая за прохожими', emoji: '🪑', places: ['square', 'park', 'pond'], hours: [[9, 22]], dur: [20, 60], effects: { fun: 10, energy: 5, social: 4 }, cost: 0, ages: [10, 120], tags: ['outdoor', 'rest'], base: 0.5, outdoor: true, weather: { rain: 0.05, snow: 0.2, cold: 0.3, sunny: 1.6 } },
  { id: 'picnic', label: 'устраивает пикник', diary: 'устроил{|а} пикник на траве', emoji: '🧺', places: ['park', 'pond'], hours: [[11, 19]], dur: [60, 150], effects: { fun: 30, social: 30, hunger: 40 }, cost: 8, ages: [5, 90], tags: ['outdoor', 'nature', 'social', 'romance'], base: 0.25, outdoor: true, social: true, weather: { rain: 0, snow: 0, cold: 0.05, sunny: 3, hot: 1.4, wind: 0.4 } },
  { id: 'ducks', label: 'кормит уток у пруда', diary: 'покормил{|а} уток у пруда', emoji: '🦆', places: ['pond'], hours: [[9, 19]], dur: [20, 40], effects: { fun: 18 }, cost: 1, ages: [3, 120], tags: ['outdoor', 'nature'], base: 0.4, outdoor: true, weather: { rain: 0.3, snow: 0.5, sunny: 1.4 } },
  { id: 'snowman', label: 'лепит снеговика', diary: 'слепил{|а} снеговика!', emoji: '☃️', places: ['park', 'square', 'playground', 'pond'], hours: [[9, 19]], dur: [40, 80], effects: { fun: 35, social: 10, energy: -6 }, cost: 0, ages: [3, 70], tags: ['outdoor', 'winter'], base: 3, outdoor: true, requires: 'snowOnGround' },
  { id: 'snowballs', label: 'играет в снежки', diary: 'устроил{|а} битву снежками', emoji: '❄️', places: ['park', 'playground', 'square'], hours: [[10, 19]], dur: [30, 60], effects: { fun: 35, social: 20, energy: -8 }, cost: 0, ages: [5, 45], tags: ['outdoor', 'winter', 'social'], base: 2, outdoor: true, social: true, requires: 'snowOnGround' },
  { id: 'playground', label: 'на детской площадке', diary: 'побегал{|а} на площадке', emoji: '🛝', places: ['playground', 'park'], hours: [[9, 20]], dur: [40, 90], effects: { fun: 30, social: 20, energy: -8 }, cost: 0, ages: [2, 11], tags: ['outdoor', 'kids'], base: 2, outdoor: true, weather: { rain: 0.2, snow: 0.8, cold: 0.5, sunny: 1.5 } },
  { id: 'walk_kids', label: 'гуляет с ребёнком', diary: 'вывел{|а} ребёнка на площадку', emoji: '👶', places: ['playground', 'park'], hours: [[10, 19]], dur: [40, 80], effects: { fun: 10, social: 15 }, cost: 0, ages: [20, 70], tags: ['outdoor', 'kids'], base: 0.4, outdoor: true, requires: 'kids', weather: { rain: 0.2, sunny: 1.5 } },
  { id: 'stroller', label: 'гуляет с коляской', diary: 'вывез{|ла} малыша в коляске на прогулку', emoji: '👶', places: ['park', 'square', 'pond', 'playground'], hours: [[9, 20]], dur: [40, 90], effects: { fun: 12, social: 10, health: 5 }, cost: 0, ages: [18, 70], tags: ['outdoor', 'kids', 'nature'], base: 2.5, outdoor: true, requires: 'baby', weather: { rain: 0.1, snow: 0.6, cold: 0.4, sunny: 1.6, dark: 0.2 } },
  { id: 'maternity', label: 'в роддоме', diary: 'в роддоме — скоро всё случится!', emoji: '🏥', places: ['hospital'], hours: ALLDAY, dur: [240, 360], effects: { energy: -2 }, cost: 0, ages: [16, 50], tags: [], base: 0, eventOnly: true },
  { id: 'bike_ride', label: 'катается на велике', diary: 'покатался{|ась} на велике', emoji: '🚲', places: ['park', 'pond', 'stadium'], hours: [[8, 21]], dur: [40, 90], effects: { fun: 22, health: 14, energy: -10 }, cost: 0, ages: [7, 75], tags: ['sport', 'outdoor', 'nature'], base: 0.3, outdoor: true, requires: 'bike', weather: { rain: 0.1, snow: 0.05, cold: 0.4, sunny: 1.8 } },
  { id: 'football', label: 'гоняет мяч на стадионе', diary: 'погонял{|а} мяч с ребятами', emoji: '⚽', places: ['stadium', 'school'], hours: [[15, 21]], dur: [60, 120], effects: { fun: 30, health: 12, social: 25, energy: -15 }, cost: 0, ages: [8, 50], tags: ['sport', 'social', 'outdoor'], base: 0.3, outdoor: true, social: true, weather: { rain: 0.2, snow: 0.3, sunny: 1.4 } },

  // ——— культура и вечер
  { id: 'cinema', label: 'смотрит кино', diary: 'сходил{|а} в кино', emoji: '🎬', places: ['cinema'], hours: [[12, 24]], dur: [110, 150], effects: { fun: 40, social: 10 }, cost: 10, ages: [7, 120], tags: ['cinema', 'culture', 'romance'], base: 0.5, social: true, weather: { rain: 1.6 } },
  { id: 'museum', label: 'ходит по музею', diary: 'сходил{|а} на выставку в музей', emoji: '🖼️', places: ['museum'], hours: [[10, 19]], dur: [60, 120], effects: { fun: 22, social: 6 }, cost: 6, ages: [7, 120], tags: ['culture'], base: 0.3, weather: { rain: 1.5 } },
  { id: 'library', label: 'читает в библиотеке', diary: 'посидел{|а} в библиотеке', emoji: '📚', places: ['library'], hours: [[10, 20]], dur: [60, 150], effects: { fun: 15, energy: 2 }, cost: 0, ages: [8, 120], tags: ['reading', 'culture', 'cheap'], base: 0.3 },
  { id: 'church', label: 'на службе в храме', diary: 'сходил{|а} в храм', emoji: '⛪', places: ['church'], hours: [[8, 13], [17, 19]], dur: [40, 90], effects: { fun: 8, social: 15, health: 2 }, cost: 1, ages: [5, 120], tags: ['church'], base: 0.15 },
  { id: 'bar', label: 'сидит в баре', diary: 'засел{|а} в баре', emoji: '🍺', places: ['bar'], hours: [[18, 26]], dur: [80, 180], effects: { fun: 30, social: 35, energy: -5, health: -2 }, cost: 18, ages: [18, 90], tags: ['party', 'night', 'social'], base: 0.55, social: true },
  { id: 'club', label: 'танцует в клубе', diary: 'отрывал{ся|ась} в клубе до утра', emoji: '🪩', places: ['club'], hours: [[22, 29]], days: [3, 4, 5], dur: [150, 300], effects: { fun: 45, social: 35, energy: -15, health: -3 }, cost: 25, ages: [18, 45], tags: ['party', 'night', 'music'], base: 0.4, social: true },
  { id: 'meet_friends', label: 'встречается с друзьями', diary: 'встретил{ся|ась} с друзьями', emoji: '🫂', places: ['cafe', 'bar', 'pizzeria', 'square', 'coffee'], hours: [[12, 24]], dur: [60, 150], effects: { social: 45, fun: 25, hunger: 10 }, cost: 10, ages: [12, 120], tags: ['social'], base: 0.4, social: true, requires: 'friend' },
  { id: 'date', label: 'на свидании', diary: 'пош{ёл|ла} на свидание', emoji: '💕', places: ['restaurant', 'cafe', 'cinema', 'park', 'pond', 'coffee'], hours: [[17, 23]], dur: [80, 160], effects: { social: 45, fun: 35 }, cost: 20, ages: [16, 90], tags: ['romance', 'social'], base: 0.35, requires: 'partner' },
  { id: 'street_music', label: 'слушает уличного музыканта', diary: 'заслушал{ся|ась} уличным музыкантом', emoji: '🎸', places: ['square'], hours: [[12, 22]], dur: [20, 40], effects: { fun: 18, social: 6 }, cost: 1, ages: [5, 120], tags: ['music', 'outdoor'], base: 0.15, outdoor: true, weather: { rain: 0.05, snow: 0.2, sunny: 1.5 } },

  // ——— событийные (назначаются событиями)
  { id: 'festival', label: 'на фестивале в парке', diary: 'приш{ёл|ла} на фестиваль в парке', emoji: '🎪', places: ['park'], hours: ALLDAY, dur: [60, 180], effects: { fun: 45, social: 35, hunger: 10 }, cost: 8, ages: [3, 120], tags: ['party', 'social', 'outdoor', 'music'], base: 0, outdoor: true, eventOnly: true },
  { id: 'concert', label: 'на концерте', diary: 'приш{ёл|ла} на концерт', emoji: '🎤', places: ['square', 'park'], hours: ALLDAY, dur: [60, 120], effects: { fun: 50, social: 25 }, cost: 5, ages: [10, 120], tags: ['music', 'party', 'outdoor'], base: 0, outdoor: true, eventOnly: true },
  { id: 'match', label: 'болеет на матче', diary: 'пош{ёл|ла} на футбольный матч', emoji: '🏟️', places: ['stadium'], hours: ALLDAY, dur: [110, 140], effects: { fun: 45, social: 35, energy: -6 }, cost: 10, ages: [7, 120], tags: ['sport', 'social', 'outdoor'], base: 0, outdoor: true, eventOnly: true },
  { id: 'fair', label: 'гуляет по ярмарке', diary: 'пош{ёл|ла} на ярмарку', emoji: '🎡', places: ['market', 'square'], hours: ALLDAY, dur: [40, 100], effects: { fun: 30, social: 20, hunger: 20 }, cost: 12, ages: [3, 120], tags: ['shopping', 'outdoor', 'social'], base: 0, outdoor: true, eventOnly: true },
  { id: 'circus', label: 'в цирке-шапито', diary: 'сходил{|а} в цирк', emoji: '🎪', places: ['park'], hours: ALLDAY, dur: [80, 120], effects: { fun: 45, social: 15 }, cost: 12, ages: [3, 120], tags: ['culture', 'kids'], base: 0, outdoor: true, eventOnly: true },
  { id: 'rave', label: 'на ночном рейве', diary: 'попал{|а} на ночной рейв', emoji: '🔊', places: ['club', 'warehouse'], hours: ALLDAY, dur: [180, 300], effects: { fun: 55, social: 30, energy: -20, health: -4 }, cost: 15, ages: [18, 40], tags: ['party', 'music', 'night'], base: 0, eventOnly: true },
  { id: 'subbotnik', label: 'на субботнике', diary: '{вышел|вышла} на субботник', emoji: '🧤', places: ['park', 'square', 'pond'], hours: ALLDAY, dur: [60, 150], effects: { social: 25, fun: 8, energy: -10 }, cost: 0, ages: [10, 80], tags: ['social', 'outdoor', 'nature'], base: 0, outdoor: true, eventOnly: true },
  { id: 'wedding', label: 'гуляет на свадьбе', diary: 'гуляет на свадьбе!', emoji: '💒', places: ['restaurant', 'church'], hours: ALLDAY, dur: [180, 300], effects: { fun: 50, social: 50, hunger: 40 }, cost: 20, ages: [3, 120], tags: ['party', 'social', 'romance'], base: 0, eventOnly: true },
  { id: 'vote', label: 'голосует на выборах', diary: 'сходил{|а} проголосовать', emoji: '🗳️', places: ['school', 'cityhall'], hours: ALLDAY, dur: [15, 30], effects: { social: 5 }, cost: 0, ages: [18, 120], tags: [], base: 0, eventOnly: true },
  { id: 'fireworks', label: 'смотрит салют', diary: 'смотрел{|а} салют', emoji: '🎆', places: ['park', 'pond', 'square'], hours: ALLDAY, dur: [30, 50], effects: { fun: 40, social: 15 }, cost: 0, ages: [2, 120], tags: ['outdoor'], base: 0, outdoor: true, eventOnly: true },
  { id: 'search_dog', label: 'ищет потерявшуюся собаку', diary: 'бросил{|а} всё и ищет потерявшуюся собаку', emoji: '🔎', places: ['park', 'square', 'pond'], hours: ALLDAY, dur: [60, 120], effects: { fun: -10 }, cost: 0, ages: [10, 120], tags: [], base: 0, outdoor: true, eventOnly: true },
  { id: 'queue', label: 'стоит в очереди', diary: 'полчаса простоял{|а} в очереди', emoji: '🧍', places: ['pharmacy', 'hospital', 'kiosk'], hours: ALLDAY, dur: [30, 60], effects: { fun: -10, health: 20 }, cost: 6, ages: [10, 120], tags: [], base: 0, eventOnly: true },
  { id: 'shelter', label: 'пережидает непогоду под крышей', diary: 'забежал{|а} под крышу переждать непогоду', emoji: '☂️', places: ['coffee', 'cafe', 'grocery', 'kiosk', 'library', 'pharmacy', 'post'], hours: ALLDAY, dur: [15, 40], effects: { fun: 2 }, cost: 2, ages: [0, 120], tags: [], base: 0, eventOnly: true },
  { id: 'hospitalized', label: 'лежит в больнице', diary: 'попал{|а} в больницу', emoji: '🏥', places: ['hospital'], hours: ALLDAY, dur: [240, 600], effects: { health: 12, fun: -4 }, cost: 0, ages: [0, 120], tags: [], base: 0, eventOnly: true },
  { id: 'volunteer', label: 'расчищает снег во дворе', diary: '{вышел|вышла} чистить снег во дворе', emoji: '🪣', places: ['square', 'playground', 'park'], hours: ALLDAY, dur: [40, 80], effects: { social: 15, energy: -12, health: 4 }, cost: 0, ages: [14, 75], tags: ['outdoor', 'winter'], base: 0, outdoor: true, eventOnly: true },
];

export const ACTIVITY_BY_ID: Record<string, ActivityDef> = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));

/** Род: {м|ж} → вариант */
export function gender(text: string, female: boolean): string {
  return text.replace(/\{([^|}]*)\|([^}]*)\}/g, (_, m, f) => (female ? f : m));
}
