// Погода: смена, температура, снег на земле, лужи, гололёд, радуга.
import { WEATHERS, WEATHER_BY_ID, WeatherDef, SEASON_TEMP, SEASON_SUN, Season } from './content/weather';
import { RNG, clamp, lerp } from './rng';
import type { Sim } from './sim';

export class WeatherSystem {
  def: WeatherDef = WEATHER_BY_ID.clear;
  // плавные визуальные величины
  cloud = 0.1;
  intensity = 0;
  fog = 0;
  wind = 0.1;
  temp = 10;
  snowCover = 0;
  wetness = 0;
  rainbow = 0;
  lightningAt = -1;
  nextChange = 180;
  private rng = new RNG(4242);
  private prevPrecip = false;
  private lastDef = 'clear';

  constructor(private sim: Sim) {}

  get season(): Season {
    return this.sim.params.season;
  }

  get icy(): boolean {
    return !!this.def.icy || (this.temp < -0.5 && this.wetness > 0.35);
  }

  get raining(): boolean {
    return (this.def.precip === 'rain' || this.def.precip === 'sleet') && this.intensity > 0.1;
  }

  get snowing(): boolean {
    return this.def.precip === 'snow' && this.intensity > 0.1;
  }

  /** насколько неприятно на улице (0 — прекрасно, 1+ — ужасно) */
  discomfort(): number {
    let d = 0;
    if (this.def.precip !== 'none') d += this.intensity * (this.def.precip === 'snow' ? 0.5 : this.def.precip === 'hail' ? 1.4 : 1);
    if (this.temp < -5) d += (-5 - this.temp) / 20;
    if (this.temp > 28) d += (this.temp - 28) / 10;
    d += this.wind * 0.3;
    if (this.def.lightning) d += 0.5;
    return d;
  }

  driveFactor(): number {
    let f = this.def.drive;
    f *= 1 - this.snowCover * 0.25;
    if (this.icy) f = Math.min(f, 0.6);
    return f;
  }

  sunTimes(): [number, number] {
    return SEASON_SUN[this.season];
  }

  set(id: string) {
    const d = WEATHER_BY_ID[id];
    if (!d || d.id === this.def.id) return;
    const was = this.def;
    this.def = d;
    this.sim.onWeatherChange(was, d);
  }

  update(dt: number) {
    const sim = this.sim;
    const p = sim.params;
    // ручной выбор
    if (!p.weatherAuto && p.weather !== this.def.id) this.set(p.weather);
    if (p.weatherAuto) {
      this.nextChange -= dt;
      if (this.nextChange <= 0) {
        this.nextChange = this.rng.range(120, 480);
        const cur = this.def;
        const cand = WEATHERS.filter((w) => w.seasons.includes(this.season));
        const next = this.rng.weighted(cand, (w) => w.weight * (1 / (0.3 + Math.abs(w.cloud - cur.cloud))) * (w.id === cur.id ? 2 : 1))!;
        this.set(next.id);
        p.weather = next.id;
      }
    }
    // плавные переходы
    const k = 1 - Math.exp(-dt / 25);
    this.cloud = lerp(this.cloud, this.def.cloud, k);
    this.intensity = lerp(this.intensity, this.def.intensity, k);
    this.fog = lerp(this.fog, this.def.fog, k);
    this.wind = lerp(this.wind, this.def.wind, k);
    // температура
    const [lo, hi] = SEASON_TEMP[this.season];
    const hour = sim.clock.hour;
    let t = (lo + hi) / 2 + ((hi - lo) / 2) * Math.sin(((hour - 9) / 24) * Math.PI * 2);
    t -= this.def.cloud * 2;
    const [wl, wh] = this.def.temp;
    if (t < wl) t = lerp(t, wl, 0.8);
    if (t > wh) t = lerp(t, wh, 0.8);
    t += p.tempOffset;
    this.temp = lerp(this.temp, t, 1 - Math.exp(-dt / 40));
    // снег на земле
    if (this.def.precip === 'snow' && this.temp < 1.5) this.snowCover = clamp(this.snowCover + dt * 0.004 * this.intensity * 2);
    else if (this.def.precip === 'sleet') this.snowCover = clamp(this.snowCover + dt * (this.temp < 0 ? 0.001 : -0.002));
    else if (this.temp > 1) this.snowCover = clamp(this.snowCover - dt * 0.0006 * (this.temp + 1) * (1 - this.cloud * 0.5));
    // мокрый асфальт
    if (this.raining || this.def.precip === 'hail') this.wetness = clamp(this.wetness + dt * 0.02 * this.intensity);
    else this.wetness = clamp(this.wetness - dt * 0.0025 * (1 + Math.max(0, this.temp) / 10) * (1.2 - this.cloud));
    // радуга после дождя, если светит солнце
    const precip = this.raining;
    const [sr, ss] = this.sunTimes();
    if (this.prevPrecip && !precip && hour > sr + 1 && hour < ss - 1) {
      this.rainbow = 1;
      sim.news.push('🌈', 'После дождя над городом встала радуга', 'weather');
    }
    this.prevPrecip = precip;
    this.rainbow = Math.max(0, this.rainbow - dt / 50);
    if (this.cloud > 0.8) this.rainbow = Math.max(0, this.rainbow - dt / 10);
    // молнии
    if (this.def.lightning && this.rng.chance(dt * 0.6)) this.lightningAt = sim.clock.total;
    this.lastDef = this.def.id;
  }
}
