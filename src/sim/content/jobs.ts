// Профессии: где работают, когда, сколько получают.
export interface JobDef {
  id: string;
  name: string;
  /** женская форма, если отличается */
  nameF?: string;
  places: string[]; // id типов зданий
  shift: [number, number]; // часы; конец может быть > 24
  days: number[]; // 0=пн
  salary: number; // в день
  ages: [number, number];
  weight: number;
  remote?: number; // вероятность удалёнки в конкретный день
  outdoorWork?: boolean; // работает на улице (дворник, строитель)
  driver?: 'bus' | 'taxi' | 'courier';
  kind?: 'work' | 'school' | 'study' | 'kinder' | 'none';
}

const WEEK = [0, 1, 2, 3, 4];
const ALL = [0, 1, 2, 3, 4, 5, 6];

export const JOBS: JobDef[] = [
  { id: 'programmer', name: 'программист', nameF: 'программистка', places: ['itoffice', 'office', 'cowork'], shift: [10, 19], days: WEEK, salary: 260, ages: [20, 55], weight: 4, remote: 0.35 },
  { id: 'manager', name: 'менеджер', places: ['office', 'bizcenter'], shift: [9, 18], days: WEEK, salary: 200, ages: [22, 60], weight: 5, remote: 0.1 },
  { id: 'accountant', name: 'бухгалтер', places: ['office', 'bizcenter', 'bank', 'factory'], shift: [9, 18], days: WEEK, salary: 180, ages: [23, 64], weight: 3 },
  { id: 'banker', name: 'банковский служащий', nameF: 'банковская служащая', places: ['bank'], shift: [9, 19], days: [0, 1, 2, 3, 4, 5], salary: 210, ages: [22, 60], weight: 1 },
  { id: 'official', name: 'чиновник', nameF: 'чиновница', places: ['cityhall'], shift: [9, 18], days: WEEK, salary: 190, ages: [25, 64], weight: 1.5 },
  { id: 'teacher', name: 'учитель', nameF: 'учительница', places: ['school', 'university'], shift: [8, 16], days: WEEK, salary: 150, ages: [23, 66], weight: 3 },
  { id: 'nanny', name: 'воспитатель', nameF: 'воспитательница', places: ['kindergarten'], shift: [7, 18], days: WEEK, salary: 120, ages: [22, 62], weight: 1 },
  { id: 'doctor', name: 'врач', places: ['hospital'], shift: [8, 17], days: WEEK, salary: 230, ages: [26, 68], weight: 2 },
  { id: 'nurse', name: 'медбрат', nameF: 'медсестра', places: ['hospital'], shift: [20, 32], days: [0, 2, 4, 6], salary: 150, ages: [20, 62], weight: 2 },
  { id: 'pharmacist', name: 'фармацевт', places: ['pharmacy'], shift: [8, 20], days: [0, 1, 2, 4, 5], salary: 140, ages: [22, 62], weight: 1 },
  { id: 'barista', name: 'бариста', places: ['coffee'], shift: [7, 16], days: [0, 1, 3, 4, 5, 6], salary: 110, ages: [18, 35], weight: 2 },
  { id: 'cook', name: 'повар', places: ['cafe', 'restaurant', 'pizzeria', 'shawarma'], shift: [10, 22], days: [1, 2, 3, 4, 5, 6], salary: 140, ages: [19, 60], weight: 2.5 },
  { id: 'waiter', name: 'официант', nameF: 'официантка', places: ['cafe', 'restaurant', 'pizzeria'], shift: [11, 23], days: [2, 3, 4, 5, 6], salary: 120, ages: [18, 40], weight: 2 },
  { id: 'bartender', name: 'бармен', nameF: 'барменша', places: ['bar', 'club'], shift: [18, 27], days: [2, 3, 4, 5, 6], salary: 140, ages: [20, 40], weight: 1.5 },
  { id: 'dj', name: 'диджей', places: ['club'], shift: [22, 30], days: [3, 4, 5], salary: 200, ages: [20, 40], weight: 0.4 },
  { id: 'baker', name: 'пекарь', places: ['bakery'], shift: [4, 12], days: [0, 1, 2, 3, 4, 5], salary: 130, ages: [20, 62], weight: 0.8 },
  { id: 'seller', name: 'продавец', nameF: 'продавщица', places: ['grocery', 'supermarket', 'kiosk', 'market'], shift: [8, 20], days: [0, 2, 3, 4, 5, 6], salary: 115, ages: [18, 65], weight: 4 },
  { id: 'cashier', name: 'кассир', places: ['supermarket', 'cinema', 'pool'], shift: [9, 21], days: [0, 1, 3, 4, 5, 6], salary: 110, ages: [18, 60], weight: 1.5 },
  { id: 'worker', name: 'рабочий', nameF: 'рабочая', places: ['factory'], shift: [7, 16], days: [0, 1, 2, 3, 4, 5], salary: 160, ages: [19, 62], weight: 4 },
  { id: 'storekeeper', name: 'кладовщик', nameF: 'кладовщица', places: ['warehouse'], shift: [7, 17], days: WEEK, salary: 130, ages: [19, 62], weight: 1.5 },
  { id: 'builder', name: 'строитель', places: ['construction'], shift: [7, 17], days: [0, 1, 2, 3, 4, 5], salary: 170, ages: [19, 60], weight: 2, outdoorWork: true },
  { id: 'mechanic', name: 'автомеханик', places: ['autoservice', 'depot'], shift: [8, 18], days: [0, 1, 2, 3, 4, 5], salary: 150, ages: [19, 62], weight: 1 },
  { id: 'fuelman', name: 'заправщик', nameF: 'заправщица', places: ['gasstation'], shift: [8, 20], days: [0, 1, 2, 4, 6], salary: 110, ages: [18, 60], weight: 0.5 },
  { id: 'busdriver', name: 'водитель автобуса', places: ['depot'], shift: [6, 15], days: [0, 1, 2, 3, 4, 5], salary: 160, ages: [23, 62], weight: 1.5, driver: 'bus' },
  { id: 'taxidriver', name: 'таксист', nameF: 'таксистка', places: ['depot'], shift: [14, 24], days: [0, 1, 3, 4, 5, 6], salary: 150, ages: [21, 65], weight: 1, driver: 'taxi' },
  { id: 'courier', name: 'курьер', places: ['warehouse', 'post'], shift: [10, 20], days: [0, 1, 2, 4, 5, 6], salary: 120, ages: [18, 45], weight: 1.5, driver: 'courier' },
  { id: 'postman', name: 'почтальон', places: ['post'], shift: [8, 17], days: [0, 1, 2, 3, 4, 5], salary: 110, ages: [20, 64], weight: 0.7 },
  { id: 'police', name: 'полицейский', nameF: 'полицейская', places: ['police'], shift: [8, 20], days: [0, 1, 3, 4, 6], salary: 170, ages: [22, 55], weight: 1.5 },
  { id: 'firefighter', name: 'пожарный', places: ['firestation'], shift: [8, 32], days: [0, 3, 6], salary: 170, ages: [22, 50], weight: 1 },
  { id: 'janitor', name: 'дворник', places: ['cityhall'], shift: [6, 14], days: [0, 1, 2, 3, 4, 5], salary: 90, ages: [25, 70], weight: 1, outdoorWork: true },
  { id: 'librarian', name: 'библиотекарь', places: ['library'], shift: [10, 20], days: [0, 1, 2, 3, 4, 5], salary: 100, ages: [25, 70], weight: 0.6 },
  { id: 'curator', name: 'смотритель музея', nameF: 'смотрительница музея', places: ['museum'], shift: [10, 19], days: [1, 2, 3, 4, 5, 6], salary: 100, ages: [25, 72], weight: 0.6 },
  { id: 'trainer', name: 'фитнес-тренер', places: ['gym', 'pool', 'stadium'], shift: [8, 21], days: [0, 1, 2, 3, 4, 5], salary: 150, ages: [20, 45], weight: 1 },
  { id: 'priest', name: 'священник', places: ['church'], shift: [7, 19], days: ALL, salary: 100, ages: [28, 75], weight: 0.25 },
  { id: 'gardener', name: 'садовник', nameF: 'садовница', places: ['park', 'square', 'pond'], shift: [7, 16], days: [0, 1, 2, 3, 4, 5], salary: 100, ages: [20, 68], weight: 1, outdoorWork: true },
  { id: 'freelancer', name: 'фрилансер', nameF: 'фрилансерша', places: ['cowork'], shift: [11, 18], days: ALL, salary: 170, ages: [19, 50], weight: 1.5, remote: 0.6 },
  { id: 'artist', name: 'художник', nameF: 'художница', places: ['museum', 'cowork'], shift: [12, 19], days: [0, 2, 4, 5], salary: 120, ages: [18, 70], weight: 0.6, remote: 0.5 },
  { id: 'musician', name: 'музыкант', places: ['bar', 'club', 'square'], shift: [19, 24], days: [3, 4, 5, 6], salary: 130, ages: [18, 60], weight: 0.6 },
  { id: 'scientist', name: 'учёный', nameF: 'учёная', places: ['university'], shift: [9, 18], days: WEEK, salary: 190, ages: [24, 72], weight: 1 },
  { id: 'projectionist', name: 'киномеханик', places: ['cinema'], shift: [14, 25], days: [0, 2, 3, 4, 5, 6], salary: 110, ages: [20, 65], weight: 0.4 },
];

/** псевдо-профессии для детей, студентов, пенсионеров и безработных */
export const SPECIAL_JOBS: Record<string, JobDef> = {
  toddler: { id: 'toddler', name: 'малыш', nameF: 'малышка', places: ['kindergarten'], shift: [8, 17], days: WEEK, salary: 0, ages: [2, 6], weight: 0, kind: 'kinder' },
  pupil: { id: 'pupil', name: 'школьник', nameF: 'школьница', places: ['school'], shift: [8, 14], days: WEEK, salary: 0, ages: [7, 17], weight: 0, kind: 'school' },
  student: { id: 'student', name: 'студент', nameF: 'студентка', places: ['university'], shift: [9, 16], days: [0, 1, 2, 3, 4, 5], salary: 25, ages: [17, 23], weight: 0, kind: 'study' },
  retiree: { id: 'retiree', name: 'пенсионер', nameF: 'пенсионерка', places: [], shift: [0, 0], days: [], salary: 70, ages: [63, 99], weight: 0, kind: 'none' },
  unemployed: { id: 'unemployed', name: 'безработный', nameF: 'безработная', places: [], shift: [0, 0], days: [], salary: 30, ages: [18, 62], weight: 0, kind: 'none' },
  baby: { id: 'baby', name: 'младенец', places: [], shift: [0, 0], days: [], salary: 0, ages: [0, 1], weight: 0, kind: 'none' },
};

export const JOB_BY_ID: Record<string, JobDef> = Object.fromEntries([...JOBS, ...Object.values(SPECIAL_JOBS)].map((j) => [j.id, j]));
