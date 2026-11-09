// Простая система частиц на Points с мягкими круглыми спрайтами.
import * as THREE from 'three';

export type ParticleKind = 'smoke' | 'fire' | 'spark';

const VS = `
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FS = `
varying vec3 vColor;
varying float vAlpha;
uniform float uSoft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = vAlpha * smoothstep(0.5, 0.5 - uSoft, d);
  gl_FragColor = vec4(vColor, a);
}`;

export class Particles {
  points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private acc = 0;
  private next = 0;
  private geo: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  gravity = 0;

  constructor(public max: number, public kind: ParticleKind) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.baseSize = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -1000;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { uScale: { value: 600 }, uSoft: { value: kind === 'smoke' ? 0.4 : 0.25 } },
      transparent: true,
      depthWrite: false,
      blending: kind === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    if (kind === 'spark') this.gravity = -9;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number | THREE.Color, size: number, life: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
  }

  /** count — дробное число частиц */
  emit(count: number, x: number, y: number, z: number, color: number, size: number, _w?: unknown) {
    this.acc += count;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.kind === 'smoke') this.spawn(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, 1.4 + Math.random(), (Math.random() - 0.5) * 0.4, color, size, 4 + Math.random() * 3);
      else if (this.kind === 'fire') this.spawn(x + (Math.random() - 0.5) * size * 3, y, z + (Math.random() - 0.5) * size * 3, (Math.random() - 0.5) * 0.6, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 0.6, Math.random() < 0.5 ? 0xff7b00 : 0xffd000, size * (1 + Math.random()), 0.6 + Math.random() * 0.6);
      else this.spawn(x, y, z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, color, size, 1);
    }
  }

  update(dt: number, wind = 0) {
    const n = this.max;
    const wx = wind * 2.5, wz = wind * 1.2;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const i3 = i * 3;
      this.vel[i3 + 1] += this.gravity * dt;
      if (this.kind === 'spark') { this.vel[i3] *= 1 - dt * 0.8; this.vel[i3 + 2] *= 1 - dt * 0.8; this.vel[i3 + 1] *= 1 - dt * 0.6; }
      this.pos[i3] += (this.vel[i3] + (this.kind === 'smoke' ? wx * (1 - k) : 0)) * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += (this.vel[i3 + 2] + (this.kind === 'smoke' ? wz * (1 - k) : 0)) * dt;
      if (this.kind === 'smoke') { this.size[i] = this.baseSize[i] * (1 + (1 - k) * 3); this.alpha[i] = Math.min(1, (1 - k) * 4) * k * 0.55; }
      else if (this.kind === 'fire') { this.size[i] = this.baseSize[i] * k; this.alpha[i] = k; }
      else { this.size[i] = this.baseSize[i]; this.alpha[i] = Math.min(1, k * 1.5); }
      if (this.life[i] <= 0) this.pos[i3 + 1] = -1000;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  }

  setScale(viewportHeight: number) {
    this.material.uniforms.uScale.value = viewportHeight * 1.2;
  }
}
