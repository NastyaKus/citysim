// Процедурный звук на Web Audio: окружение, погода, город, игрок. Без аудиофайлов.
import type { Sim } from '../sim/sim';

export type SfxKind = 'door' | 'talk' | 'bark' | 'beep' | 'step' | 'click' | 'chime' | 'heart' | 'shutter' | 'build';

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
  /** игрок внутри здания — улицу почти не слышно */
  indoor = false;
  private scanAt = 0;
  private scan = { traffic: 0, trafficPan: 0, idle: 0, peds: 0, pedPan: 0, kids: 0, kidsPan: 0, build: 0, buildPan: 0, cafe: 0, cafePan: 0, bar: 0, barPan: 0, dogs: 0, dogPan: 0, square: 0, squarePan: 0, park: 0, parkPan: 0, pond: 0, pondPan: 0, tick: 0, tickPan: 0, music: 0, musicPan: 0 };
  private whooshed = new Map<number, number>();
  private engine1!: OscillatorNode;
  private barBeatAt = 0;
  private melodyAt = 0;
  private melodyStep = 0;
  private planeAt = 120 + Math.random() * 200;

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
    // поток машин (шорох шин) и моторы на светофорах
    this.loops.traffic = this.noiseLoop([['bandpass', 650, 0.6], ['lowpass', 2600, 0.7]]);
    const eg = ctx.createGain();
    eg.gain.value = 0;
    const elp = ctx.createBiquadFilter();
    elp.type = 'lowpass';
    elp.frequency.value = 170;
    this.engine1 = ctx.createOscillator();
    this.engine1.type = 'sawtooth';
    this.engine1.frequency.value = 48;
    const e2 = ctx.createOscillator();
    e2.type = 'square';
    e2.frequency.value = 73;
    const e2g = ctx.createGain();
    e2g.gain.value = 0.35;
    this.engine1.connect(elp);
    e2.connect(e2g).connect(elp);
    elp.connect(eg).connect(this.amb);
    this.engine1.start();
    e2.start();
    this.loops.engine = { gain: eg, target: 0 };
    // гул голосов
    const mur = this.noiseLoop([['bandpass', 420, 1.3], ['lowpass', 1200, 0.7]]) as Loop & { filters: BiquadFilterNode[] };
    const ml = ctx.createOscillator();
    ml.frequency.value = 0.7;
    const mlg = ctx.createGain();
    mlg.gain.value = 140;
    ml.connect(mlg).connect(mur.filters[0].frequency);
    ml.start();
    this.loops.murmur = mur;
  }

  /** колокольчик на двери магазина */
  shopBell(x: number, z: number) {
    if (!this.ready) return;
    const s = this.spatial(x, z, 12);
    if (s.g < 0.05) return;
    this.tone(2637, 'sine', 0.5, 0.06 * s.g, s.pan, undefined, 0, 0.003);
    this.tone(3520, 'sine', 0.4, 0.04 * s.g, s.pan, undefined, 0.07, 0.003);
  }

  private whoosh(pan0: number, vol: number, heavy: boolean) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const dur = heavy ? 1.3 : 0.9;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(heavy ? 300 : 500, t0);
    f.frequency.linearRampToValueAtTime(heavy ? 700 : 1300, t0 + dur * 0.45);
    f.frequency.linearRampToValueAtTime(heavy ? 250 : 450, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan0, t0);
    p.pan.linearRampToValueAtTime(-pan0, t0 + dur);
    src.connect(f).connect(g).connect(p).connect(this.fx);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  private airplane() {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const dur = 16;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(250, t0);
    f.frequency.linearRampToValueAtTime(520, t0 + dur * 0.5);
    f.frequency.linearRampToValueAtTime(200, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner();
    const side = Math.random() < 0.5 ? -1 : 1;
    p.pan.setValueAtTime(side * 0.8, t0);
    p.pan.linearRampToValueAtTime(-side * 0.8, t0 + dur);
    src.connect(f).connect(g).connect(p).connect(this.amb);
    src.start(t0);
    src.stop(t0 + dur + 0.1);
  }

  /** обзор окрестностей слушателя для городских звуков */
  private doScan() {
    const sim = this.sim;
    const S = this.scan;
    for (const k of Object.keys(S) as (keyof typeof S)[]) S[k] = 0;
    const L = this.listener;
    const best = (g: number, pan: number, key: keyof typeof S, panKey: keyof typeof S) => { if (g > S[key]) { S[key] = g; S[panKey] = pan; } };
    // машины
    let tr = 0, trPan = 0;
    for (const v of sim.transport.vehicles) {
      if (v.done) continue;
      const s = this.spatial(v.x, v.z, 20);
      if (s.g < 0.01) continue;
      const moving = Math.min(1, v.v / 18);
      tr += s.g * (0.25 + moving) * (v.type === 'bus' || v.type === 'truck' || v.type === 'garbage' || v.type === 'firetruck' ? 1.8 : 1);
      trPan += s.pan * s.g;
      if (v.v < 2) S.idle += s.g * (v.type === 'bus' || v.type === 'truck' ? 1.6 : 1);
      // проезжает рядом — шорох
      const d = Math.hypot(v.x - L.x, v.z - L.z);
      if (d < 10 && v.v > 9 && L.height < 60) {
        const last = this.whooshed.get(v.id) ?? -9;
        if (this.t - last > 3) { this.whooshed.set(v.id, this.t); this.whoosh(Math.sign(s.pan || 0.3) * 0.7, 0.22 * Math.max(0.3, 1 - d / 10), v.len > 6); }
      }
      if (v.type === 'garbage' && v.dwell > 0 && s.g > 0.05 && Math.random() < 0.3) for (let i = 0; i < 3; i++) this.tone(1050, 'square', 0.18, 0.03 * s.g, s.pan, undefined, i * 0.45);
    }
    S.traffic = tr;
    S.trafficPan = tr > 0 ? trPan / Math.max(0.0001, tr) : 0;
    if (this.whooshed.size > 300) this.whooshed.clear();
    // люди на улице
    let pc = 0, pPan = 0;
    for (const c of sim.citizens) {
      if (!c.alive || !(c.state === 'walk' || c.state === 'outdoor' || c.state === 'waitBus' || c.state === 'waitTaxi')) continue;
      const s = this.spatial(c.x, c.z, 14);
      if (s.g < 0.02) continue;
      pc += s.g;
      pPan += s.pan * s.g;
      if (c.hasDog && (c.act?.id === 'dogwalk' || c.trip?.act.id === 'dogwalk')) best(s.g, s.pan, 'dogs', 'dogPan');
      if (c.act?.id === 'street_music' || (c.job.id === 'musician' && c.act?.id === 'work' && c.state === 'outdoor')) best(s.g, s.pan, 'music', 'musicPan');
    }
    S.peds = pc;
    S.pedPan = pc > 0 ? pPan / pc : 0;
    // места
    const h = sim.clock.hour;
    for (const b of sim.world.buildings) {
      const s = this.spatial(b.x, b.z, 26);
      if (s.g < 0.02) continue;
      const n = b.inside.size;
      switch (b.type) {
        case 'playground': case 'school': case 'kindergarten':
          if (h > 8 && h < 19 && n > 0) {
            const kidsOut = [...b.inside].filter((id) => { const k = sim.citizens[id]; return k && k.age < 14; }).length;
            if (kidsOut) best(s.g * Math.min(1, kidsOut / 6), s.pan, 'kids', 'kidsPan');
          }
          break;
        case 'construction':
          if (n > 0 && b.growth < 1 && h > 7 && h < 19) best(s.g, s.pan, 'build', 'buildPan');
          break;
        case 'cafe': case 'coffee': case 'restaurant': case 'pizzeria': case 'bakery':
          if (n > 0) best(s.g * Math.min(1, n / 4), s.pan, 'cafe', 'cafePan');
          break;
        case 'bar': case 'club':
          if (n > 2 && (h > 19 || h < 4)) best(s.g * Math.min(1, n / 8), s.pan, 'bar', 'barPan');
          break;
        case 'square':
          best(s.g, s.pan, 'square', 'squarePan');
          if (n > 3) best(s.g * 0.6, s.pan, 'music', 'musicPan');
          break;
        case 'park':
          best(s.g, s.pan, 'park', 'parkPan');
          break;
        case 'pond':
          best(s.g, s.pan, 'pond', 'pondPan');
          break;
      }
    }
    // пешеходный светофор рядом
    if (L.height < 40) for (const nd of sim.world.nodes) {
      if (!nd.hasLight) continue;
      const s = this.spatial(nd.x, nd.z, 8);
      if (s.g > S.tick) { S.tick = s.g; S.tickPan = s.pan; }
    }
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
      case 'shutter':
        this.burst(0.05, 'highpass', 3000, 0.25, 0, 0, 0.7);
        this.burst(0.08, 'bandpass', 1400, 0.2, 0, 0.07, 2);
        break;
      case 'build':
        for (let i = 0; i < 3; i++) this.burst(0.07, 'bandpass', 700, 0.3, 0, i * 0.18, 2.5);
        this.tone(880, 'sine', 0.3, 0.06, 0, undefined, 0.6);
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
    const quiet = (paused ? 0.35 : 1) * (this.indoor ? 0.22 : 1);
    const congestion = sim.stats.current.congestion;
    const cars = sim.stats.current.cars;
    // город
    this.set('hum', (0.08 + 0.18 * daylight + cars * 0.003 + congestion * 0.12) * (0.6 + 0.4 * hk) * quiet);
    // городской слой
    this.scanAt -= dt;
    if (this.scanAt <= 0) { this.scanAt = 0.25; this.doScan(); }
    const S = this.scan;
    const nightK = 1 - daylight;
    this.set('traffic', Math.min(0.5, S.traffic * 0.18) * quiet);
    this.set('engine', Math.min(0.35, S.idle * 0.12) * quiet);
    if (this.ctx && S.idle > 0.01) this.engine1.frequency.setTargetAtTime(44 + Math.sin(this.t * 1.7) * 3, this.ctx.currentTime, 0.2);
    this.set('murmur', Math.min(0.4, S.peds * 0.05) * quiet * (paused ? 0.5 : 1));
    if (S.peds > 0.6 && this.every('voice', dt, Math.min(2.5, S.peds * 0.25))) {
      const pan = S.pedPan + (Math.random() - 0.5) * 0.8;
      const f0 = Math.random() < 0.5 ? 170 + Math.random() * 60 : 230 + Math.random() * 90;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.tone(f0 * (0.85 + Math.random() * 0.35), 'triangle', 0.1 + Math.random() * 0.08, 0.025, pan, f0 * (0.8 + Math.random() * 0.3), i * 0.13, 0.02);
      if (Math.random() < 0.08) for (let i = 0; i < 4; i++) this.tone(f0 * 1.6, 'triangle', 0.08, 0.03, pan, f0 * 1.3, i * 0.11, 0.01); // смех
    }
    // дети на площадке и у школы
    if (S.kids > 0.03 && this.every('kids', dt, 2.2 * S.kids + 0.3)) {
      const f0 = 420 + Math.random() * 380;
      const pan = S.kidsPan + (Math.random() - 0.5) * 0.6;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.tone(f0 * (0.9 + Math.random() * 0.5), 'triangle', 0.12, 0.05 * S.kids, pan, f0 * (1.1 + Math.random() * 0.6), i * 0.12, 0.01);
    }
    // стройка: молоток и дрель
    if (S.build > 0.03) {
      if (this.every('hammer', dt, 1.6)) for (let i = 0; i < 3; i++) this.burst(0.06, 'bandpass', 900 + Math.random() * 300, 0.4 * S.build, S.buildPan, i * 0.32, 2.5, 0.002);
      if (this.every('drill', dt, 0.12)) {
        const dur = 1 + Math.random() * 1.5;
        this.tone(190, 'sawtooth', dur, 0.05 * S.build, S.buildPan, 230, 0, 0.08);
        this.tone(380, 'square', dur, 0.015 * S.build, S.buildPan, 460, 0, 0.08);
      }
    }
    // звон чашек у кафе
    if (S.cafe > 0.04 && this.every('clink', dt, 1.3 * S.cafe)) this.tone(2600 + Math.random() * 1400, 'sine', 0.25, 0.06 * S.cafe, S.cafePan, undefined, 0, 0.002);
    // басы из бара ночью (приглушённо)
    if (S.bar > 0.03 && !paused) {
      this.barBeatAt -= dt;
      if (this.barBeatAt <= 0) {
        this.barBeatAt += 0.5;
        this.tone(75, 'sine', 0.25, 0.22 * S.bar, S.barPan, 40, 0, 0.004);
      }
    }
    // уличный музыкант: пентатоника
    if (S.music > 0.05 && !paused && daylight > 0.2) {
      this.melodyAt -= dt;
      if (this.melodyAt <= 0) {
        const scale = [0, 2, 4, 7, 9, 12, 14, 16];
        this.melodyAt = 0.32 + (this.melodyStep % 4 === 3 ? 0.3 : 0);
        this.melodyStep = (this.melodyStep + 1 + Math.floor(Math.random() * 3)) % 64;
        const note = 262 * Math.pow(2, scale[(this.melodyStep * 3 + (this.melodyStep >> 2)) % scale.length] / 12);
        this.tone(note, 'triangle', 0.6, 0.07 * S.music, S.musicPan, undefined, 0, 0.004);
        if (this.melodyStep % 4 === 0) this.tone(note / 2, 'sine', 0.8, 0.05 * S.music, S.musicPan);
      }
    }
    // собаки иногда лают
    if (S.dogs > 0.05 && this.every('dogbark', dt, 0.08)) { const p = S.dogPan; for (let i = 0; i < 2; i++) { this.tone(480, 'square', 0.1, 0.05 * S.dogs, p, 300, i * 0.2); this.burst(0.08, 'bandpass', 900, 0.12 * S.dogs, p, i * 0.2, 1.5); } }
    // голуби в сквере днём
    if (S.square > 0.05 && daylight > 0.5 && this.every('coo', dt, 0.35 * S.square)) for (let i = 0; i < 2; i++) this.tone(330, 'sine', 0.35, 0.04 * S.square, S.squarePan, 260, i * 0.4, 0.05);
    // сова в парке ночью
    if (S.park > 0.05 && nightK > 0.7 && this.every('owl', dt, 0.05 * S.park)) { this.tone(420, 'sine', 0.45, 0.06 * S.park, S.parkPan, 380, 0, 0.08); this.tone(400, 'sine', 0.7, 0.05 * S.park, S.parkPan, 350, 0.6, 0.08); }
    // лягушки у пруда тёплыми вечерами
    if (S.pond > 0.05 && nightK > 0.4 && w.temp > 12 && this.every('frog', dt, 1.2 * S.pond)) for (let i = 0; i < 3; i++) this.tone(180 + Math.random() * 40, 'square', 0.06, 0.025 * S.pond, S.pondPan + (Math.random() - 0.5) * 0.5, 140, i * 0.08, 0.005);
    // тиканье пешеходного светофора
    if (S.tick > 0.1 && this.every('tick', dt, 1.6)) this.tone(1500, 'square', 0.025, 0.025 * S.tick, S.tickPan, undefined, 0, 0.002);
    // самолёт пролетает
    this.planeAt -= dt;
    if (this.planeAt <= 0) {
      this.planeAt = 180 + Math.random() * 300;
      if (!w.raining) this.airplane();
    }

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
