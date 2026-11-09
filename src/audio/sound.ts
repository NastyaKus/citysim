// Процедурный звук на Web Audio: окружение, погода, город, игрок. Без аудиофайлов.
import type { Sim } from '../sim/sim';

export type SfxKind = 'door' | 'talk' | 'bark' | 'beep' | 'step' | 'click' | 'chime' | 'heart';

interface Loop { gain: GainNode; target: number }

export interface Listener { x: number; z: number; rx: number; rz: number; height: number }

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private amb!: GainNode;
  private fx!: GainNode;
  private noise!: AudioBuffer;
  private loops: Record<string, Loop> = {};
  private windFilter!: BiquadFilterNode;
  private sirenOsc!: OscillatorNode;
  private sirenOsc2!: OscillatorNode;
  private sirenPan!: StereoPannerNode;
  private crowdPan!: StereoPannerNode;
  private firePan!: StereoPannerNode;
  private timers: Record<string, number> = {};
  private lastLightning = -1;
  private lastHour = -1;
  private busDwell = new Map<number, boolean>();
  private lastHorn = 0;
  private beatAt = 0;
  private listener: Listener = { x: 0, z: 0, rx: 1, rz: 0, height: 100 };
  private t = 0;

  constructor(private sim: Sim) {}

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** вызывать из обработчика жеста пользователя */
  unlock() {
    try {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
    } catch (e) {
      console.warn('audio unavailable', e);
    }
  }

  suspend(on: boolean) {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend(); else void this.ctx.resume();
  }

  private init() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.amb = ctx.createGain();
    this.fx = ctx.createGain();
    this.amb.connect(this.master);
    this.fx.connect(this.master);
    // буфер шума
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      // слегка «розовый» шум
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    this.applyVolumes();
    // фоновые петли
    this.loops.hum = this.noiseLoop([['lowpass', 260, 0.7], ['lowpass', 420, 0.7]]);
    this.loops.rain = this.noiseLoop([['highpass', 800, 0.5], ['lowpass', 7000, 0.5]]);
    this.loops.rainHeavy = this.noiseLoop([['bandpass', 450, 0.6]]);
    const wind = this.noiseLoop([['bandpass', 500, 1.4]]);
    this.loops.wind = wind;
    // ветер «гуляет»
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    this.windFilter = (wind as Loop & { filters: BiquadFilterNode[] }).filters[0];
    lfoGain.connect(this.windFilter.frequency);
    lfo.start();
    // толпа
    this.crowdPan = ctx.createStereoPanner();
    this.loops.crowd = this.noiseLoop([['bandpass', 650, 0.9], ['lowpass', 1800, 0.7]], this.crowdPan);
    // огонь (гул)
    this.firePan = ctx.createStereoPanner();
    this.loops.fire = this.noiseLoop([['lowpass', 380, 0.6]], this.firePan);
    // сирена
    this.sirenPan = ctx.createStereoPanner();
    const sg = ctx.createGain();
    sg.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc2 = ctx.createOscillator();
    this.sirenOsc2.type = 'sawtooth';
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.sirenOsc.connect(lp);
    this.sirenOsc2.connect(g2).connect(lp);
    lp.connect(sg).connect(this.sirenPan).connect(this.fx);
    this.sirenOsc.start();
    this.sirenOsc2.start();
    this.loops.siren = { gain: sg, target: 0 };
  }

  private noiseLoop(filters: [BiquadFilterType, number, number][], pan?: StereoPannerNode): Loop {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    let node: AudioNode = src;
    const fs: BiquadFilterNode[] = [];
    for (const [type, f, q] of filters) {
      const bq = ctx.createBiquadFilter();
      bq.type = type;
      bq.frequency.value = f;
      bq.Q.value = q;
      node.connect(bq);
      node = bq;
      fs.push(bq);
    }
    const g = ctx.createGain();
    g.gain.value = 0;
    node.connect(g);
    if (pan) g.connect(pan).connect(this.amb); else g.connect(this.amb);
    src.start(0, Math.random() * 1.5);
    const loop = { gain: g, target: 0, filters: fs } as Loop & { filters: BiquadFilterNode[] };
    return loop;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const p = this.sim.params;
    const m = p.muted ? 0 : p.volume;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(m, now, 0.05);
    this.amb.gain.setTargetAtTime(p.ambVolume, now, 0.05);
    this.fx.gain.setTargetAtTime(p.fxVolume, now, 0.05);
  }

  // ——— пространственность
  private spatial(x: number | undefined, z: number | undefined, range = 26): { g: number; pan: number } {
    if (x === undefined || z === undefined) return { g: 1, pan: 0 };
    const L = this.listener;
    const dx = x - L.x, dz = z - L.z;
    const d = Math.hypot(dx, dz);
    const hk = 1 / (1 + Math.max(0, L.height - 30) / 90);
    const g = hk / (1 + (d / range) ** 2);
    const pan = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * L.rx + dz * L.rz) / d)) : 0;
    return { g, pan };
  }

  private out(pan: number): AudioNode {
    const p = this.ctx!.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.fx);
    return p;
  }

  private tone(freq: number, type: OscillatorType, dur: number, vol: number, pan = 0, freqEnd?: number, delay = 0, attack = 0.005) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.out(pan));
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private burst(dur: number, type: BiquadFilterType, freq: number, vol: number, pan = 0, delay = 0, q = 0.7, attack = 0.004) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.out(pan));
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  // ——— разовые звуки
  play(kind: SfxKind, x?: number, z?: number) {
    if (!this.ready) return;
    const s = this.spatial(x, z, 14);
    if (s.g < 0.01) return;
    const w = this.sim.weather;
    switch (kind) {
      case 'step': {
        const snow = w.snowCover > 0.3;
        const wet = w.wetness > 0.4 && !snow;
        this.burst(snow ? 0.16 : 0.07, 'lowpass', snow ? 500 : 900, 0.35 * s.g, s.pan, 0, 0.8);
        if (wet) this.burst(0.09, 'bandpass', 2400, 0.18 * s.g, s.pan, 0.01, 2);
        break;
      }
      case 'door':
        this.tone(988, 'sine', 0.35, 0.18 * s.g, s.pan);
        this.tone(740, 'sine', 0.5, 0.15 * s.g, s.pan, undefined, 0.16);
        break;
      case 'talk':
        for (let i = 0; i < 5; i++) this.tone(260 + Math.random() * 260, 'triangle', 0.09, 0.12 * s.g, s.pan, 200 + Math.random() * 300, i * 0.11);
        break;
      case 'bark':
        for (let i = 0; i < 2; i++) {
          this.tone(520, 'square', 0.12, 0.12 * s.g, s.pan, 300, i * 0.22);
          this.burst(0.1, 'bandpass', 900, 0.25 * s.g, s.pan, i * 0.22, 1.5);
        }
        break;
      case 'heart':
        this.tone(1320, 'sine', 0.25, 0.08, 0);
        this.tone(1760, 'sine', 0.3, 0.06, 0, undefined, 0.09);
        break;
      case 'beep':
        this.tone(1040, 'sine', 0.1, 0.1);
        break;
      case 'click':
        this.tone(1900, 'sine', 0.035, 0.04);
        break;
      case 'chime':
        this.tone(660, 'sine', 0.4, 0.07);
        this.tone(880, 'sine', 0.6, 0.06, 0, undefined, 0.12);
        break;
    }
  }

  firework(x: number, z: number) {
    if (!this.ready) return;
    const s = this.spatial(x, z, 90);
    const delay = Math.min(1.2, Math.hypot(x - this.listener.x, z - this.listener.z) / 340);
    this.burst(1.1, 'lowpass', 180, 0.9 * s.g, s.pan, delay, 0.7, 0.003);
    for (let i = 0; i < 9; i++) this.burst(0.05, 'highpass', 3000, 0.12 * s.g, s.pan + (Math.random() - 0.5) * 0.4, delay + 0.25 + Math.random() * 0.8, 0.7);
  }

  private thunder() {
    const pan = (Math.random() - 0.5) * 1.2;
    const d = 0.3 + Math.random() * 2;
    this.burst(0.25, 'highpass', 1200, 0.25, pan, d, 0.7);
    this.burst(3.8, 'lowpass', 160, 1.0, pan, d + 0.05, 0.6, 0.08);
    this.burst(2.5, 'lowpass', 90, 0.8, pan, d + 0.4, 0.6, 0.3);
  }

  private bell(x: number, z: number, strikes: number) {
    const s = this.spatial(x, z, 120);
    for (let k = 0; k < strikes; k++) {
      const delay = k * 1.9;
      for (const [r, v] of [[1, 0.3], [2.01, 0.14], [2.42, 0.1], [3.0, 0.08], [4.16, 0.05]] as const) this.tone(196 * r, 'sine', 3.4, v * s.g, s.pan, undefined, delay, 0.01);
    }
  }

  private horn(x: number, z: number) {
    const s = this.spatial(x, z, 40);
    if (s.g < 0.03) return;
    const dur = 0.2 + Math.random() * 0.35;
    this.tone(415, 'square', dur, 0.07 * s.g, s.pan, undefined, 0, 0.02);
    this.tone(523, 'square', dur, 0.06 * s.g, s.pan, undefined, 0, 0.02);
    if (Math.random() < 0.4) { this.tone(415, 'square', 0.18, 0.07 * s.g, s.pan, undefined, dur + 0.12); this.tone(523, 'square', 0.18, 0.06 * s.g, s.pan, undefined, dur + 0.12); }
  }

  private bird(pan: number, vol: number) {
    const base = 2200 + Math.random() * 2400;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(base * (0.9 + Math.random() * 0.25), 'sine', 0.07, vol, pan, base * (1.3 + Math.random() * 0.4), i * (0.09 + Math.random() * 0.05), 0.01);
  }

  private set(loop: string, v: number, pan?: number, panNode?: StereoPannerNode) {
    const l = this.loops[loop];
    if (!l || !this.ctx) return;
    l.target = v;
    l.gain.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.4);
    if (panNode && pan !== undefined) panNode.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.2);
  }

  private every(name: string, dt: number, rate: number): boolean {
    // пуассоновский таймер: rate — событий в секунду
    this.timers[name] = (this.timers[name] ?? 0) - dt;
    if (this.timers[name] > 0) return false;
    this.timers[name] = rate > 0 ? -Math.log(1 - Math.random()) / rate : 1;
    return rate > 0;
  }

  update(dt: number, L: Listener, daylight: number) {
    if (!this.ready) return;
    this.listener = L;
    this.t += dt;
    const sim = this.sim;
    const w = sim.weather;
    const paused = sim.params.paused;
    const hk = 1 / (1 + Math.max(0, L.height - 30) / 120);
    const season = sim.params.season;
    const quiet = paused ? 0.35 : 1;
    const congestion = sim.stats.current.congestion;
    const cars = sim.stats.current.cars;
    // город
    this.set('hum', (0.08 + 0.18 * daylight + cars * 0.003 + congestion * 0.12) * (0.6 + 0.4 * hk) * quiet);
    // осадки и ветер
    const rain = (w.def.precip === 'rain' || w.def.precip === 'sleet') ? w.intensity : 0;
    this.set('rain', rain * 0.9 * quiet);
    this.set('rainHeavy', Math.max(0, rain - 0.5) * 0.7 * quiet);
    this.set('wind', (w.wind ** 1.6) * 0.5 * (w.def.id === 'blizzard' ? 1.6 : 1) * quiet);
    if (this.windFilter && this.ctx) this.windFilter.frequency.setTargetAtTime(380 + w.wind * 500, this.ctx.currentTime, 1);
    if (w.def.precip === 'hail' && this.every('hail', dt, 25 * w.intensity)) this.burst(0.03, 'highpass', 2500 + Math.random() * 3000, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 1.6, 0, 1);
    // молния → гром
    if (w.lightningAt !== this.lastLightning) {
      if (this.lastLightning >= 0) this.thunder();
      this.lastLightning = w.lightningAt;
    }
    // природа
    const goodOut = !w.raining && w.def.precip !== 'hail' && w.def.id !== 'blizzard';
    const birdRate = daylight > 0.5 && goodOut ? (season === 'spring' ? 1.2 : season === 'summer' ? 0.9 : season === 'autumn' ? 0.25 : 0.05) * hk : 0;
    if (this.every('bird', dt, birdRate)) this.bird((Math.random() - 0.5) * 1.6, 0.04 + Math.random() * 0.04);
    const cricketRate = daylight < 0.3 && goodOut && w.temp > 12 && (season === 'summer' || season === 'spring') ? 1.8 * hk : 0;
    if (this.every('cricket', dt, cricketRate)) {
      const pan = (Math.random() - 0.5) * 1.6;
      for (let i = 0; i < 3; i++) this.tone(4600 + Math.random() * 300, 'sine', 0.035, 0.03, pan, undefined, i * 0.06, 0.003);
    }
    const crowRate = daylight > 0.4 && (season === 'autumn' || season === 'winter') ? 0.06 * hk : 0;
    if (this.every('crow', dt, crowRate)) {
      const pan = (Math.random() - 0.5) * 1.6;
      for (let i = 0; i < 2; i++) { this.tone(620, 'sawtooth', 0.22, 0.04, pan, 420, i * 0.35, 0.02); }
    }
    // утки у пруда
    const pond = sim.world.byType.get('pond')?.[0];
    if (pond && w.temp > -3) {
      const s = this.spatial(pond.x, pond.z, 30);
      if (s.g > 0.05 && this.every('duck', dt, 0.25)) for (let i = 0; i < 2; i++) this.tone(330, 'sawtooth', 0.12, 0.05 * s.g, s.pan, 260, i * 0.16, 0.01);
    }
    // колокол
    const h = Math.floor(sim.clock.hour);
    if (h !== this.lastHour) {
      if (this.lastHour >= 0 && h >= 8 && h <= 20) {
        const ch = sim.world.byType.get('church')?.[0];
        if (ch) this.bell(ch.x, ch.z, h % 3 === 0 ? 3 : 1);
      }
      this.lastHour = h;
    }
    // транспорт: сирена, гудки, двери автобусов
    let sirenBest = 0, sirenPan = 0;
    let honkCand: { x: number; z: number } | null = null;
    for (const v of sim.transport.vehicles) {
      if (v.done) continue;
      if (v.siren) {
        const s = this.spatial(v.x, v.z, 60);
        if (s.g > sirenBest) { sirenBest = s.g; sirenPan = s.pan; }
      }
      if (v.role === 'bus') {
        const dw = v.dwell > 0;
        if (dw && !this.busDwell.get(v.id)) {
          const s = this.spatial(v.x, v.z, 25);
          if (s.g > 0.04) { this.burst(0.45, 'highpass', 2200, 0.22 * s.g, s.pan, 0, 0.6, 0.02); this.burst(0.5, 'highpass', 2000, 0.18 * s.g, s.pan, 2.2, 0.6, 0.02); }
        }
        this.busDwell.set(v.id, dw);
      }
      if ((v.blocked || v.stuck > 2.5) && !v.emergency && !honkCand) honkCand = { x: v.x, z: v.z };
    }
    this.set('siren', sirenBest * 0.16 * quiet);
    if (this.ctx && sirenBest > 0.005) {
      const f = 720 + 230 * Math.sin(this.t * Math.PI * 2 * 0.55);
      this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
      this.sirenOsc2.frequency.setTargetAtTime(f * 1.5, this.ctx.currentTime, 0.05);
      this.sirenPan.pan.setTargetAtTime(sirenPan, this.ctx.currentTime, 0.1);
    }
    if (honkCand && this.t - this.lastHorn > 1.6 && Math.random() < dt * 1.2) { this.lastHorn = this.t; this.horn(honkCand.x, honkCand.z); }
    // события: толпа, музыка, огонь
    let crowd = 0, crowdPan = 0, beat = 0, beatPan = 0, fire = 0, firePan = 0;
    for (const f of sim.fx) {
      if (f.kind === 'crowd' || f.kind === 'stage' || f.kind === 'stalls' || f.kind === 'tent' || f.kind === 'circus') {
        const s = this.spatial(f.x, f.z, 45);
        if (s.g > crowd) { crowd = s.g; crowdPan = s.pan; }
      }
      if (f.kind === 'stage' || f.kind === 'rave') {
        const s = this.spatial(f.x, f.z, 50);
        if (s.g > beat) { beat = s.g; beatPan = s.pan; }
      }
      if (f.kind === 'fire') {
        const b = f.building !== undefined ? sim.world.buildings[f.building] : null;
        const s = this.spatial(f.x, f.z, 35);
        const k = b ? b.onFire : 0.3;
        if (s.g * k > fire) { fire = s.g * k; firePan = s.pan; }
      }
    }
    this.set('crowd', crowd * 0.35 * quiet, crowdPan, this.crowdPan);
    this.set('fire', fire * 0.5 * quiet, firePan, this.firePan);
    if (fire > 0.03 && this.every('crackle', dt, 14 * fire)) this.burst(0.03, 'highpass', 1800 + Math.random() * 2500, 0.15 * fire, firePan, 0, 1.5);
    if (beat > 0.02 && !paused) {
      this.beatAt -= dt;
      if (this.beatAt <= 0) {
        this.beatAt += 0.48;
        this.tone(110, 'sine', 0.22, 0.4 * beat, beatPan, 45, 0, 0.003);
        this.burst(0.04, 'highpass', 7000, 0.08 * beat, beatPan, 0.24, 0.7);
      }
    }
  }
}
