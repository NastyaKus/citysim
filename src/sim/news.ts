export type NewsKind = 'event' | 'weather' | 'people' | 'traffic' | 'economy' | 'city';

export interface NewsItem {
  id: number;
  time: number;
  emoji: string;
  text: string;
  kind: NewsKind;
  focus?: { x: number; z: number };
  citizen?: number;
}

export class News {
  items: NewsItem[] = [];
  private id = 1;
  private recent = new Map<string, number>();
  constructor(private now: () => number) {}

  push(emoji: string, text: string, kind: NewsKind = 'city', extra: Partial<NewsItem> = {}, cooldown = 0) {
    const t = this.now();
    if (cooldown > 0) {
      const last = this.recent.get(text);
      if (last !== undefined && t - last < cooldown) return;
      this.recent.set(text, t);
    }
    this.items.unshift({ id: this.id++, time: t, emoji, text, kind, ...extra });
    if (this.items.length > 120) this.items.length = 120;
  }
}

export class Clock {
  total = 7 * 60 + 40; // старт: понедельник 07:40
  get day() { return Math.floor(this.total / 1440); }
  get minuteOfDay() { return this.total - this.day * 1440; }
  get hour() { return this.minuteOfDay / 60; }
  get weekday() { return this.day % 7; }
  get isWeekend() { return this.weekday >= 5; }
}
