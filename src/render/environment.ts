// Небо, свет, облака, туман и осадки.
import * as THREE from 'three';
import { GB } from './lowpoly';
import type { Sim } from '../sim/sim';
import { clamp, lerp, smooth } from '../sim/rng';

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;
const SKY_FS = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunGlow;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, clamp(-h * 4.0, 0.0, 1.0));
  float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 12.0) * 0.45 + pow(s, 400.0) * 1.5) * uSunGlow;
  gl_FragColor = vec4(col, 1.0);
}`;

const C = (h: number) => new THREE.Color(h);
const NIGHT = { top: C(0x0a1030), hor: C(0x1f2b4d) };
const DUSK = { top: C(0x40507e), hor: C(0xf08a5d) };
const DAY = { top: C(0x3f8fdc), hor: C(0xc4e6f7) };
const OVER = { top: C(0x8c96a0), hor: C(0xbdc4ca) };
const STORM = { top: C(0x3c4248), hor: C(0x6b737a) };

export class Environment {
  scene: THREE.Scene;
  sun = new THREE.DirectionalLight(0xffffff, 2);
  moon = new THREE.DirectionalLight(0x9db4ff, 0.2);
  hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b8f4e, 0.6);
  ambient = new THREE.AmbientLight(0x404a6a, 0.15);
  private skyMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private sunMesh: THREE.Mesh;
  private moonMesh: THREE.Mesh;
  private stars: THREE.Points;
  private clouds: THREE.InstancedMesh;
  private cloudData: { x: number; y: number; z: number; s: number; ry: number }[] = [];
  private cloudMat: THREE.MeshLambertMaterial;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private snow: THREE.Points;
  private snowPos: Float32Array;
  private hail: THREE.Points;
  private hailPos: Float32Array;
  private rainbow: THREE.Mesh;
  private bolt: THREE.Line;
  private boltUntil = 0;
  private lastLightning = -1;
  private flash = 0;
  night = 0;
  /** множитель плотности осадков и облаков (качество) */
  scale = 1;
  /** множитель плотности тумана (дальность прорисовки) */
  fogMul = 1;
  daylight = 1;
  horizon = new THREE.Color();
  sunDir = new THREE.Vector3();
  private RAIN_N = 7000;
  private SNOW_N = 7000;
  private HAIL_N = 2500;
  private box = { w: 300, h: 130 };
  private center = new THREE.Vector3();

  constructor(scene: THREE.Scene, private sim: Sim) {
    this.scene = scene;
    scene.fog = new THREE.FogExp2(0xc4e6f7, 0.0015);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color(0x6b8f4e) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.8, 0.5) }, uSunGlow: { value: 1 } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -230; sc.right = 230; sc.top = 230; sc.bottom = -230; sc.near = 10; sc.far = 900;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.hemi, this.ambient);

    this.sunMesh = new THREE.Mesh(new THREE.CircleGeometry(40, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
    this.moonMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(24, 1), new THREE.MeshBasicMaterial({ color: 0xe8ecf5, fog: false }));
    scene.add(this.sunMesh, this.moonMesh);

    // звёзды
    const sp: number[] = [];
    for (let i = 0; i < 1500; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.48 * Math.PI;
      sp.push(Math.cos(u) * Math.cos(v) * 1300, Math.sin(v) * 1300 + 30, Math.sin(u) * Math.cos(v) * 1300);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // облака
    const cg = new GB();
    cg.ico(14, 0xffffff, 0, 0, 0, { jitter: 4, seed: 1 });
    cg.ico(11, 0xffffff, 14, -3, 3, { jitter: 3, seed: 2 });
    cg.ico(10, 0xffffff, -13, -4, -2, { jitter: 3, seed: 3 });
    cg.ico(8, 0xffffff, 5, 6, -4, { jitter: 2, seed: 4 });
    const geo = cg.build();
    geo.scale(1, 0.55, 1);
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.95, fog: false });
    this.clouds = new THREE.InstancedMesh(geo, this.cloudMat, 70);
    for (let i = 0; i < 70; i++) this.cloudData.push({ x: (Math.random() - 0.5) * 1400, y: 120 + Math.random() * 70, z: (Math.random() - 0.5) * 1400, s: 0.8 + Math.random() * 1.4, ry: Math.random() * 6 });
    this.clouds.castShadow = false;
    scene.add(this.clouds);

    // дождь
    this.rainPos = new Float32Array(this.RAIN_N * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaec6d8, transparent: true, opacity: 0.55, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    for (let i = 0; i < this.RAIN_N; i++) this.resetDrop(i, true);

    // снег
    this.snowPos = new Float32Array(this.SNOW_N * 3);
    const sng = new THREE.BufferGeometry();
    sng.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(sng, new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, map: dotTexture(), transparent: true, depthWrite: false, alphaTest: 0.05 }));
    this.snow.frustumCulled = false;
    scene.add(this.snow);
    for (let i = 0; i < this.SNOW_N; i++) { this.snowPos[i * 3] = (Math.random() - 0.5) * this.box.w; this.snowPos[i * 3 + 1] = Math.random() * this.box.h; this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * this.box.w; }

    // град
    this.hailPos = new Float32Array(this.HAIL_N * 3);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(this.hailPos, 3));
    this.hail = new THREE.Points(hg, new THREE.PointsMaterial({ color: 0xf0f8ff, size: 0.45, map: dotTexture(), transparent: true, depthWrite: false, alphaTest: 0.05 }));
    this.hail.frustumCulled = false;
    scene.add(this.hail);
    for (let i = 0; i < this.HAIL_N; i++) { this.hailPos[i * 3] = (Math.random() - 0.5) * this.box.w; this.hailPos[i * 3 + 1] = Math.random() * this.box.h; this.hailPos[i * 3 + 2] = (Math.random() - 0.5) * this.box.w; }

    // радуга
    const rb = new THREE.RingGeometry(260, 300, 64, 7, 0, Math.PI);
    const rc: number[] = [];
    const bands = [0x9400d3, 0x4b0082, 0x0000ff, 0x00ff00, 0xffff00, 0xff7f00, 0xff0000];
    const pa = rb.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const r = Math.hypot(pa.getX(i), pa.getY(i));
      const k = Math.min(6, Math.max(0, Math.floor(((r - 260) / 40) * 7)));
      const c = new THREE.Color(bands[k]);
      rc.push(c.r, c.g, c.b);
    }
    rb.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    this.rainbow = new THREE.Mesh(rb, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    scene.add(this.rainbow);

    // молния
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(24 * 3), 3));
    this.bolt = new THREE.Line(bg, new THREE.LineBasicMaterial({ color: 0xeef4ff, fog: false }));
    this.bolt.visible = false;
    scene.add(this.bolt);
  }

  private resetDrop(i: number, randomY = false) {
    const x = this.center.x + (Math.random() - 0.5) * this.box.w;
    const z = this.center.z + (Math.random() - 0.5) * this.box.w;
    const y = randomY ? Math.random() * this.box.h : this.box.h;
    const p = this.rainPos;
    p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
    p[i * 6 + 3] = x; p[i * 6 + 4] = y + 1.6; p[i * 6 + 5] = z;
  }

  update(dt: number, camera: THREE.Camera, target: THREE.Vector3, time: number) {
    const sim = this.sim;
    const w = sim.weather;
    const h = sim.clock.hour;
    const [sr, ss] = w.sunTimes();
    this.center.copy(target);

    // солнце и луна
    const dayLen = ss - sr;
    const season = sim.params.season;
    const maxElev = season === 'summer' ? 1.05 : season === 'winter' ? 0.42 : 0.75;
    let f = (h - sr) / dayLen;
    const sunUp = f > -0.08 && f < 1.08;
    const ang = Math.PI * f;
    const sunY = Math.sin(ang) * maxElev;
    this.sunDir.set(Math.cos(ang), sunY, -0.45).normalize();
    let nf = (h - ss) / (24 - dayLen);
    if (nf < 0) nf += 24 / (24 - dayLen);
    const mang = Math.PI * nf;
    const moonDir = new THREE.Vector3(Math.cos(mang), Math.sin(mang) * 0.8, 0.35).normalize();

    this.daylight = smooth(clamp((sunY + 0.1) / 0.35));
    this.night = 1 - this.daylight;
    const twilight = sunUp ? clamp(1 - Math.abs(sunY - 0.02) / 0.22) : 0;
    const cloud = w.cloud;
    const stormy = w.def.lightning || w.def.id === 'downpour' || w.def.id === 'hail' || w.def.id === 'blizzard' ? Math.min(1, cloud) : 0;

    // цвет неба
    const top = new THREE.Color().copy(NIGHT.top).lerp(DAY.top, this.daylight);
    const hor = new THREE.Color().copy(NIGHT.hor).lerp(DAY.hor, this.daylight);
    top.lerp(DUSK.top, twilight * 0.6 * (1 - cloud * 0.7));
    hor.lerp(DUSK.hor, twilight * 0.8 * (1 - cloud * 0.7));
    const over = new THREE.Color().copy(OVER.top).lerp(STORM.top, stormy).multiplyScalar(0.25 + 0.75 * this.daylight);
    const overH = new THREE.Color().copy(OVER.hor).lerp(STORM.hor, stormy).multiplyScalar(0.25 + 0.75 * this.daylight);
    top.lerp(over, clamp(cloud * 1.05 - 0.15));
    hor.lerp(overH, clamp(cloud * 1.05 - 0.15));
    if (w.fog > 0.05) hor.lerp(new THREE.Color(0xc9cfd4).multiplyScalar(0.3 + 0.7 * this.daylight), w.fog * 0.8);
    // вспышка молнии
    if (w.lightningAt !== this.lastLightning) {
      this.lastLightning = w.lightningAt;
      this.flash = 1;
      this.boltUntil = time + 0.18;
      this.makeBolt(target);
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.bolt.visible = time < this.boltUntil;
    top.lerp(new THREE.Color(0xdde6ff), this.flash * 0.6);
    hor.lerp(new THREE.Color(0xdde6ff), this.flash * 0.6);
    (this.skyMat.uniforms.uTop.value as THREE.Color).copy(top);
    (this.skyMat.uniforms.uHorizon.value as THREE.Color).copy(hor);
    (this.skyMat.uniforms.uBottom.value as THREE.Color).copy(hor).multiplyScalar(0.8);
    (this.skyMat.uniforms.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    this.skyMat.uniforms.uSunGlow.value = (1 - cloud * 0.9) * clamp(sunY * 3 + 0.4);
    (this.skyMat.uniforms.uSunColor.value as THREE.Color).set(0xffd9a0).lerp(new THREE.Color(0xff7a3a), twilight);
    this.horizon.copy(hor);
    this.sky.position.copy(camera.position);

    // свет
    const sunI = clamp(sunY * 4) * (1.9 - cloud * 1.3);
    this.sun.intensity = Math.max(0, sunI);
    this.sun.color.set(0xfff1dc).lerp(new THREE.Color(0xff9d5c), twilight * 0.8);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 400);
    this.sun.target.position.copy(target);
    this.sun.castShadow = sim.params.shadows && sunI > 0.05;
    this.moon.intensity = this.night * 0.35 * (1 - cloud * 0.6);
    this.moon.position.copy(target).addScaledVector(moonDir, 400);
    this.moon.target.position.copy(target);
    this.hemi.intensity = 0.35 + 0.75 * this.daylight * (1 - cloud * 0.25) + this.flash * 2.5;
    this.hemi.color.copy(top).lerp(new THREE.Color(0xffffff), 0.5);
    this.hemi.groundColor.set(0x5a6b45).multiplyScalar(0.4 + 0.6 * this.daylight);
    this.ambient.intensity = 0.25 * this.night + 0.08;

    this.sunMesh.position.copy(camera.position).addScaledVector(this.sunDir, 1300);
    this.sunMesh.lookAt(camera.position);
    this.sunMesh.visible = sunY > -0.05 && cloud < 0.85;
    (this.sunMesh.material as THREE.MeshBasicMaterial).color.set(0xfff3c4).lerp(new THREE.Color(0xff8c42), twilight);
    this.moonMesh.position.copy(camera.position).addScaledVector(moonDir, 1250);
    this.moonMesh.visible = this.night > 0.3 && cloud < 0.85 && moonDir.y > 0;
    this.stars.position.copy(camera.position);
    (this.stars.material as THREE.PointsMaterial).opacity = this.night * (1 - cloud) * 0.95;

    // туман
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(hor);
    fog.density = (0.0011 + w.fog * 0.011 + w.intensity * 0.0025 + (w.def.id === 'blizzard' ? 0.006 : 0)) * this.fogMul;

    // облака
    const nClouds = Math.round((clamp(cloud) * 68 + 2) * (0.5 + 0.5 * this.scale));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const drift = (2 + w.wind * 14) * dt;
    for (let i = 0; i < 70; i++) {
      const c = this.cloudData[i];
      c.x += drift;
      c.z += drift * 0.35;
      if (c.x > 700) c.x -= 1400;
      if (c.z > 700) c.z -= 1400;
      q.setFromAxisAngle(up, c.ry);
      const s = c.s * (1 + cloud * 0.5);
      m.compose(new THREE.Vector3(c.x, c.y - cloud * 25, c.z), q, new THREE.Vector3(s, s * (0.8 + cloud * 0.5), s));
      this.clouds.setMatrixAt(i, m);
    }
    this.clouds.count = nClouds;
    this.clouds.instanceMatrix.needsUpdate = true;
    const cc = new THREE.Color(0xffffff).lerp(new THREE.Color(0x6c757d), stormy * 0.8 + cloud * 0.2).multiplyScalar(0.25 + 0.75 * this.daylight);
    cc.lerp(new THREE.Color(0xffa07a), twilight * 0.5 * (1 - cloud));
    this.cloudMat.color.copy(cc);

    // осадки
    const precip = w.def.precip;
    const I = w.intensity;
    const windX = w.wind * 22, windZ = w.wind * 9;
    const rainOn = (precip === 'rain' || precip === 'sleet') ? I : 0;
    const nRain = Math.floor(this.RAIN_N * rainOn * (precip === 'sleet' ? 0.5 : 1) * this.scale);
    this.rain.visible = nRain > 0;
    if (nRain > 0) {
      const p = this.rainPos;
      const vy = -70 * dt;
      for (let i = 0; i < nRain; i++) {
        const k = i * 6;
        p[k] += windX * dt; p[k + 3] = p[k] - windX * 0.025;
        p[k + 1] += vy; p[k + 4] = p[k + 1] + 1.8;
        p[k + 2] += windZ * dt; p[k + 5] = p[k + 2] - windZ * 0.025;
        if (p[k + 1] < 0 || Math.abs(p[k] - target.x) > this.box.w / 2 || Math.abs(p[k + 2] - target.z) > this.box.w / 2) this.resetDrop(i);
      }
      this.rain.geometry.setDrawRange(0, nRain * 2);
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.35 + 0.3 * this.daylight;
    }
    const snowOn = precip === 'snow' ? I : precip === 'sleet' ? I * 0.5 : 0;
    const nSnow = Math.floor(this.SNOW_N * snowOn * this.scale);
    this.snow.visible = nSnow > 0;
    if (nSnow > 0) {
      const p = this.snowPos;
      const bw = this.box.w;
      for (let i = 0; i < nSnow; i++) {
        const k = i * 3;
        p[k] += (windX * 0.6 + Math.sin(time + i) * 1.2) * dt;
        p[k + 1] -= (4 + (i % 5) + w.wind * 4) * dt;
        p[k + 2] += (windZ * 0.6 + Math.cos(time * 0.8 + i) * 1.2) * dt;
        if (p[k + 1] < 0) { p[k + 1] = this.box.h; }
        if (p[k] - target.x > bw / 2) p[k] -= bw; else if (p[k] - target.x < -bw / 2) p[k] += bw;
        if (p[k + 2] - target.z > bw / 2) p[k + 2] -= bw; else if (p[k + 2] - target.z < -bw / 2) p[k + 2] += bw;
      }
      this.snow.geometry.setDrawRange(0, nSnow);
      (this.snow.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.snow.material as THREE.PointsMaterial).size = w.def.id === 'blizzard' ? 0.7 : 0.55;
    }
    const nHail = precip === 'hail' ? Math.floor(this.HAIL_N * I * this.scale) : 0;
    this.hail.visible = nHail > 0;
    if (nHail > 0) {
      const p = this.hailPos;
      const bw = this.box.w;
      for (let i = 0; i < nHail; i++) {
        const k = i * 3;
        p[k + 1] -= 45 * dt;
        p[k] += windX * 0.5 * dt;
        if (p[k + 1] < 0) { p[k + 1] = this.box.h; p[k] = target.x + (Math.random() - 0.5) * bw; p[k + 2] = target.z + (Math.random() - 0.5) * bw; }
      }
      this.hail.geometry.setDrawRange(0, nHail);
      (this.hail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // радуга — напротив солнца
    const rbOp = w.rainbow * 0.4 * this.daylight;
    this.rainbow.visible = rbOp > 0.01;
    if (this.rainbow.visible) {
      const opp = new THREE.Vector3(-this.sunDir.x, 0, -this.sunDir.z).normalize();
      this.rainbow.position.set(target.x + opp.x * 600, -60, target.z + opp.z * 600);
      this.rainbow.lookAt(target.x, -60, target.z);
      (this.rainbow.material as THREE.MeshBasicMaterial).opacity = rbOp;
    }
    void lerp;
  }

  private makeBolt(target: THREE.Vector3) {
    const pos = this.bolt.geometry.attributes.position as THREE.BufferAttribute;
    let x = target.x + (Math.random() - 0.5) * 300, z = target.z + (Math.random() - 0.5) * 300, y = 150;
    for (let i = 0; i < 24; i++) {
      pos.setXYZ(i, x, y, z);
      y -= 150 / 23;
      x += (Math.random() - 0.5) * 12;
      z += (Math.random() - 0.5) * 12;
    }
    pos.needsUpdate = true;
  }
}

let _dot: THREE.Texture | null = null;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}
