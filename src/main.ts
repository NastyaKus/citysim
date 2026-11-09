import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './styles.css';
import { Sim } from './sim/sim';
import { buildCity, CityMeshes } from './render/city';
import { Environment } from './render/environment';
import { Props } from './render/props';
import { Agents } from './render/agents';
import { FxRenderer } from './render/fx';
import { UI, Selection } from './ui/ui';
import { HALF_CITY, ROAD_HALF } from './sim/world';
import { P } from './render/palette';
import { displayName } from './sim/citizen';
import { Player } from './game/player';
import { InteriorView, poseGroup } from './render/interior';
import { DecorRenderer } from './render/decor';
import { Editor } from './game/editor';
import { PaperView } from './ui/paper';
import { Album } from './ui/album';
import { TouchControls } from './ui/touch';
import { Sound } from './audio/sound';
import { isTouch, canFullscreen, toggleFullscreen, lockLandscape, setupRotateHint, isStandalone } from './ui/mobile';
import type { Params } from './sim/params';
import { fmtTime } from './sim/params';

const SAVE_KEYS = ['volume', 'ambVolume', 'fxVolume', 'muted', 'quality', 'renderScale', 'shadows', 'shadowRes', 'precipDensity', 'fpsLimit', 'showFps', 'treeSway', 'maxVisible', 'drawDistance'] as const;
function loadPrefs(): Partial<Params> {
  try {
    const raw = localStorage.getItem('citysim-prefs');
    return raw ? (JSON.parse(raw) as Partial<Params>) : {};
  } catch {
    return {};
  }
}
function savePrefs(p: Params) {
  try {
    const o: Record<string, unknown> = {};
    for (const k of SAVE_KEYS) o[k] = p[k];
    localStorage.setItem('citysim-prefs', JSON.stringify(o));
  } catch {
    /* хранилище недоступно */
  }
}

const GRASS: Record<string, number> = { spring: 0x9fd16a, summer: 0x84bd4f, autumn: 0xb4a650, winter: 0xb9c4b0 };

async function main() {
  const loadingText = document.getElementById('loading-text')!;
  await new Promise((r) => setTimeout(r, 30));
  const prefs = loadPrefs();
  const sim = new Sim({ population: isTouch ? 300 : 420, quality: isTouch ? 'medium' : 'high', ...prefs });
  (window as unknown as { sim: Sim }).sim = sim;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, sim.params.quality === 'high' ? 1.75 : sim.params.quality === 'medium' ? 1.25 : 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.getElementById('viewport')!.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 3500);
  camera.position.set(170, 190, 230);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 10);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.42;
  controls.minDistance = 12;
  controls.maxDistance = 650;
  controls.screenSpacePanning = false;
  if (isTouch) controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  (window as unknown as { __view: unknown }).__view = { camera, controls };

  loadingText.textContent = 'строим дома и дороги…';
  await new Promise((r) => setTimeout(r, 30));
  const city: CityMeshes = buildCity(sim.world, sim.transport);
  scene.add(city.group);
  const env = new Environment(scene, sim);
  const props = new Props(sim, city);
  scene.add(props.group);
  const agents = new Agents(sim);
  scene.add(agents.group);
  const fx = new FxRenderer(sim);
  scene.add(fx.group);
  const decor = new DecorRenderer(sim, city);
  scene.add(decor.group);
  decor.rebuild();
  city.onRebuild = () => { props.rebuildStatic(); decor.rebuild(); };
  sim.dynamics.onChanged = (b) => { city.rebuildBuilding(b); sound.play('build'); };
  const interior = new InteriorView(sim);
  const sound = new Sound(sim);
  sim.onEnter = (b) => { if (['shop', 'food', 'health'].includes(b.def.cat) || b.type === 'post' || b.type === 'bank') sound.shopBell(b.entrance.pos.x, b.entrance.pos.z); };
  fx.onBurst = (x, z) => sound.firework(x, z);

  // ——— качество графики
  const PRESETS: Record<Params['quality'], Partial<Params>> = {
    low: { renderScale: 0.75, shadows: false, shadowRes: 'low', precipDensity: 0.3, fpsLimit: 30, treeSway: false, maxVisible: 300, drawDistance: 0.75 },
    medium: { renderScale: 1, shadows: true, shadowRes: 'low', precipDensity: 0.55, fpsLimit: 0, treeSway: true, maxVisible: 700, drawDistance: 1 },
    high: { renderScale: 1, shadows: true, shadowRes: 'high', precipDensity: 1, fpsLimit: 0, treeSway: true, maxVisible: 1400, drawDistance: 1 },
  };
  function applyGraphics() {
    const p = sim.params;
    const base = Math.min(window.devicePixelRatio, p.quality === 'high' ? 1.75 : 1.25);
    renderer.setPixelRatio(Math.max(0.4, base * p.renderScale));
    renderer.setSize(window.innerWidth, window.innerHeight);
    const size = p.shadowRes === 'high' ? 2048 : 1024;
    if (env.sun.shadow.mapSize.x !== size) {
      env.sun.shadow.mapSize.set(size, size);
      env.sun.shadow.map?.dispose();
      (env.sun.shadow as unknown as { map: null }).map = null;
    }
    env.scale = p.precipDensity;
    env.fogMul = 1 / Math.max(0.3, p.drawDistance);
    fpsEl.hidden = !p.showFps;
    savePrefs(p);
  }
  function applyQuality(q: Params['quality']) {
    sim.params.quality = q;
    Object.assign(sim.params, PRESETS[q]);
    applyGraphics();
  }
  const fpsEl = document.createElement('div');
  fpsEl.id = 'fps';
  document.getElementById('app')!.append(fpsEl);
  if (!prefs.renderScale) Object.assign(sim.params, PRESETS[sim.params.quality]);
  applyGraphics();

  // тепловая карта пробок
  const heat = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), sim.world.edges.length);
  sim.world.edges.forEach((e, i) => {
    const A = sim.world.nodes[e.a], B = sim.world.nodes[e.b];
    const m = new THREE.Matrix4().compose(new THREE.Vector3((A.x + B.x) / 2, 0.25, (A.z + B.z) / 2), new THREE.Quaternion(), new THREE.Vector3(e.axis === 'x' ? e.len - 10 : ROAD_HALF * 2, 1, e.axis === 'x' ? ROAD_HALF * 2 : e.len - 10));
    heat.setMatrixAt(i, m);
    heat.setColorAt(i, new THREE.Color(0x00ff00));
  });
  heat.renderOrder = 4;
  scene.add(heat);
  // линии маршрутов
  const routes = new THREE.Group();
  for (const r of sim.transport.routes) {
    const pts = r.segs.map((s) => new THREE.Vector3(s.ax, 0.4, s.az));
    pts.push(pts[0].clone());
    routes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: r.color })));
  }
  scene.add(routes);
  // путь выбранного жителя
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffb86b, dashSize: 1.2, gapSize: 0.8 }));
  pathLine.frustumCulled = false;
  scene.add(pathLine);
  // маркер выбранного
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb86b, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.visible = false;
  ring.renderOrder = 5;
  scene.add(ring);

  // ——— UI
  let followPos: THREE.Vector3 | null = null;
  const ui: UI = new UI(sim, {
    focus: (x, z) => { ui.following = false; flyTo(x, z); },
    select: (s) => select(s),
    follow: (on) => { ui.following = on; ui.show(ui.selection); },
    regenerate: () => { select(null); sim.regenerate(); sim.news.push('🏙️', `Город заселён заново: ${sim.citizens.length} жителей`, 'city'); },
    skipTo: (h) => skipTo(h),
    play: (id) => startPlay(id),
    fullscreen: () => { void toggleFullscreen(); },
    canFullscreen: () => canFullscreen() && !isStandalone(),
    quality: (q) => applyQuality(q),
    graphics: () => applyGraphics(),
    sound: () => { sound.unlock(); sound.applyVolumes(); savePrefs(sim.params); },
    click: () => sound.play('click'),
    paper: () => paper.open(),
    album: () => { void album.open(); },
    editor: () => { if (player.active) stopPlay(); editor.toggle(); },
    photo: () => takePhoto(),
  });
  ui.syncAll();
  (window as unknown as { __ui: unknown }).__ui = { ui, select: (s: Selection) => select(s), play: (id?: number) => startPlay(id), stop: () => stopPlay(), get player() { return player; }, get touch() { return touch; }, sound };

  // ——— режим игрока
  const player: Player = new Player(sim, city.collision, {
    toast: (t) => touch.toast(t),
    sound: (k, x, z) => sound.play(k, x, z),
    heart: (x, z) => { fx.heart(x, z); sound.play('heart'); },
    enterRoom: (b) => { interior.build(b, player.c!); sound.indoor = true; playCamInit = false; return interior; },
    exitRoom: () => { interior.clear(); sound.indoor = false; playCamInit = false; },
    dialog: (npc) => { touch.openDialog(npc); sound.play('talk', npc.x, npc.z); },
  });
  const touch: TouchControls = new TouchControls(sim, player, {
    exit: () => stopPlay(),
    click: () => sound.play('click'),
    wait: (m) => { skipping = sim.clock.total + m; ui.skipping.style.display = 'block'; },
    photo: () => takePhoto(),
    openCard: (id) => { ui.show({ kind: 'citizen', id }); document.getElementById('inspector')!.classList.add('in-play'); },
  });
  const paper = new PaperView(sim, (id) => { select({ kind: 'citizen', id }); ui.following = true; flyToCitizen(id); }, () => sound.play('click'));
  const album = new Album(() => sound.play('click'));
  const editor = new Editor(sim, city, camera, { toast: (t) => touch.toast(t), click: () => sound.play('click'), sound: () => sound.play('build') });
  scene.add(editor.marker);
  function flyToCitizen(id: number) {
    const c = sim.citizens[id];
    if (c) flyTo(c.x, c.z);
  }

  // ——— фотоаппарат
  const flash = document.createElement('div');
  flash.className = 'flash';
  document.getElementById('app')!.append(flash);
  function takePhoto() {
    sound.unlock();
    sound.play('shutter');
    renderer.render(player.room ? interior.scene : scene, camera);
    const src = renderer.domElement;
    const w = Math.min(960, src.width), h = Math.round((src.height / src.width) * w);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d')!.drawImage(src, 0, 0, w, h);
    const data = cv.toDataURL('image/jpeg', 0.82);
    const t = controls.target;
    let place = '';
    if (player.room?.building) place = player.room.building.name;
    else {
      let bd = Infinity;
      for (const b of sim.world.buildings) { const d = Math.hypot(b.x - t.x, b.z - t.z); if (d < bd) { bd = d; place = b.name; } }
    }
    const who = player.room ? interior.npcs.slice(0, 3).map((n) => n.c.first) : sim.citizens.filter((c) => c.alive && (c.state === 'walk' || c.state === 'outdoor') && Math.hypot(c.x - t.x, c.z - t.z) < 12).slice(0, 3).map((c) => c.first);
    const me = player.c ? `${player.c.first}` : '';
    const caption = `${fmtTime(sim.clock.total)}, день ${sim.clock.day + 1} · ${sim.weather.def.emoji} · ${place}${me ? ` · ${me}` : ''}${who.length ? ` и ${who.join(', ')}` : ''}`;
    void album.save(data, caption);
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    touch.toast('📷 Снимок сохранён в альбом');
  }
  const camGoal = new THREE.Vector3();
  let playCamInit = false;

  function startPlay(id?: number) {
    let c = id !== undefined ? sim.citizens[id] : undefined;
    if (!c) {
      const cand = sim.citizens.filter((x) => x.alive && x.age >= 16 && x.act?.id !== 'sleep' && !(x.trip && (x.trip.stage === 'drive' || x.trip.stage === 'ride')));
      c = cand.length ? cand[Math.floor(Math.random() * cand.length)] : undefined;
    }
    if (!c) { touch.toast('Все спят — попробуй днём'); return; }
    const err = player.take(c);
    if (err) { touch.toast(err); return; }
    select(null);
    controls.enabled = false;
    touch.show(true);
    playCamInit = false;
    sound.unlock();
    void lockLandscape();
    touch.toast(`Ты — ${displayName(c)}. Джойстик слева, обзор справа`);
  }

  function stopPlay() {
    const c = player.c;
    player.release();
    touch.show(false);
    controls.enabled = true;
    if (c) {
      controls.target.set(c.x, 0, c.z);
      camera.position.set(c.x + 30, 35, c.z + 40);
      select({ kind: 'citizen', id: c.id });
    }
  }

  function select(s: Selection) {
    document.getElementById('inspector')?.classList.remove('in-play');
    if (!s) { ui.following = false; ring.visible = false; }
    ui.show(s);
  }

  let flyTarget: THREE.Vector3 | null = null;
  function flyTo(x: number, z: number) {
    flyTarget = new THREE.Vector3(x, 0, z);
  }

  let skipping = 0;
  function skipTo(h: number) {
    let target = sim.clock.day * 1440 + h * 60;
    if (target <= sim.clock.total + 1) target += 1440;
    skipping = target;
    ui.skipping.style.display = 'block';
  }

  // ——— клики и наведение
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let downAt = { x: 0, y: 0 };
  function pick(cx: number, cy: number): Selection {
    mouse.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    let best: { d: number; s: Selection } = { d: Infinity, s: null };
    const people = ray.intersectObjects([agents.parts.torso, agents.parts.head], false);
    for (const h of people) if (h.instanceId !== undefined && h.distance < best.d) best = { d: h.distance - 3, s: { kind: 'citizen', id: agents.pickIndex[h.instanceId] } };
    for (const h of ray.intersectObjects(agents.vehicleMeshes(), false)) {
      if (h.instanceId === undefined) continue;
      const id = agents.vehicleFromHit(h.object, h.instanceId);
      if (id !== undefined && h.distance < best.d) best = { d: h.distance - 1, s: { kind: 'vehicle', id } };
    }
    if (!best.s) for (const h of ray.intersectObjects(city.pick, false)) { if (h.distance < best.d) best = { d: h.distance, s: { kind: 'building', id: h.object.userData.building } }; break; }
    return best.s;
  }
  renderer.domElement.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (player.active) return;
    if (editor.active) {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) <= 6 && e.button === 0) editor.tap(e.clientX, e.clientY);
      return;
    }
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5 || e.button !== 0) return;
    const s = pick(e.clientX, e.clientY);
    select(s);
    if (s?.kind !== 'citizen') ui.following = false;
  });
  let hoverAt = 0;
  renderer.domElement.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (now - hoverAt < 90 || e.buttons || e.pointerType !== 'mouse' || player.active || editor.active) { if (editor.active) ui.showTooltip(null, 0, 0); return; }
    hoverAt = now;
    const s = pick(e.clientX, e.clientY);
    if (!s) return ui.showTooltip(null, 0, 0);
    let text = '';
    if (s.kind === 'citizen') { const c = sim.citizens[s.id]; text = `<b>${displayName(c)}</b> · ${c.trip ? `в пути → ${sim.world.buildings[c.trip.dest].name}` : c.act ? `${c.act.emoji} ${c.act.label}` : ''}`; }
    else if (s.kind === 'building') { const b = sim.world.buildings[s.id]; text = `<b>${b.name}</b> · внутри ${b.inside.size}`; }
    else { const v = sim.transport.vehicles.find((x) => x.id === s.id); text = v ? `${v.label ?? (v.role === 'citizen' && v.owner >= 0 ? `машина: ${displayName(sim.citizens[v.owner])}` : v.type)}` : ''; }
    ui.showTooltip(text, e.clientX, e.clientY);
  });
  renderer.domElement.addEventListener('pointerleave', () => ui.showTooltip(null, 0, 0));

  // клавиатура
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.code === 'Space') { sim.params.paused = !sim.params.paused; ui.refreshSpeeds(); e.preventDefault(); }
    if (e.code === 'Escape') { if (player.active) stopPlay(); else select(null); }
    if (e.code === 'KeyE' && player.active) touch.doAct();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => sound.suspend(document.hidden));
  setupRotateHint();
  if ('serviceWorker' in navigator && !__SINGLE__ && location.protocol.startsWith('http') && window.top === window && !import.meta.env.DEV) {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    fx.setScale(window.innerHeight);
    props.smoke.setScale(window.innerHeight);
  });
  fx.setScale(window.innerHeight);
  props.smoke.setScale(window.innerHeight);

  // ——— главный цикл
  const clock = new THREE.Clock();
  let time = 0;
  let uiAt = 0, winAt = 0;
  let keysWasMoving = false, shiftWas = false;
  let lastNewsId = -1;
  let roomPhase = 0;
  let fpsFrames = 0, fpsChecked = false;
  const col = new THREE.Color();
  const grassCol = new THREE.Color();
  document.getElementById('loading')!.classList.add('hide');

  function updateWindows() {
    const n = city.winSpecs.length;
    const day = env.daylight;
    const glassDay = new THREE.Color(0x8fb6cf).multiplyScalar(0.55 + 0.45 * day);
    const glassNight = new THREE.Color(0x1b2433);
    const glass = glassNight.clone().lerp(glassDay, day);
    const warm = [new THREE.Color(0xffd27a), new THREE.Color(0xffe2a8), new THREE.Color(0xfff4e0), new THREE.Color(0x9ad0ff)];
    for (let i = 0; i < n; i++) {
      const w = city.winSpecs[i];
      const b = sim.world.buildings[w.b];
      const r = city.winRand[i];
      if (r < b.litWindows) {
        const wc = warm[Math.floor(r * 97) % 4];
        col.copy(wc).lerp(glass, day * 0.65);
      } else col.copy(glass);
      if (b.onFire > 0 && r < 0.6) col.set(0xff6a00);
      city.windows.setColorAt(i, col);
    }
    if (city.windows.instanceColor) city.windows.instanceColor.needsUpdate = true;
  }

  let lastFrameAt = 0, fpsCount = 0, fpsAt = 0;
  function frame(now: number) {
    requestAnimationFrame(frame);
    const lim = sim.params.fpsLimit;
    if (lim > 0 && now - lastFrameAt < 1000 / lim - 2) return;
    lastFrameAt = now;
    fpsCount++;
    if (now - fpsAt > 1000) { fpsEl.textContent = `${fpsCount} FPS`; fpsCount = 0; fpsAt = now; }
    const dt = Math.min(0.1, clock.getDelta());
    time += dt;
    // перемотка
    if (skipping) {
      const t0 = performance.now();
      while (sim.clock.total < skipping && performance.now() - t0 < 40) sim.substep(0.12);
      if (sim.clock.total >= skipping) { skipping = 0; ui.skipping.style.display = 'none'; }
    } else sim.step(dt);
    const gdt = sim.params.paused ? 0 : dt * sim.params.timeSpeed;

    // игрок
    if (player.active) {
      const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const kz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      if (kx || kz) { player.input.x = kx; player.input.z = kz; } else if (keysWasMoving) { player.input.x = 0; player.input.z = 0; }
      keysWasMoving = !!(kx || kz);
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) player.input.run = true; else if (shiftWas) player.input.run = false;
      shiftWas = keys.has('ShiftLeft') || keys.has('ShiftRight');
      if (!touch.dialogOpen) player.update(dt); else { player.c!.moving = 0; player.roomMoving = 0; }
      touch.update(dt);
      const c = player.c!;
      const h = 1.45 * c.look.height + 0.2;
      const inRoom = !!player.room;
      const tx = inRoom ? player.rx : c.x, ty = h, tz = inRoom ? player.rz : c.z;
      if (inRoom) {
        interior.update(dt, time, env.daylight, c);
        const pm = interior.playerModel;
        if (pm) {
          pm.position.set(player.rx, 0, player.rz);
          pm.rotation.y = Math.atan2(player.rdirX, player.rdirZ);
          roomPhase += player.roomMoving * dt * 2.2;
          poseGroup(pm, c.act ? player.roomPose : 'stand', roomPhase, player.roomMoving > 0.2);
        }
      }
      const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
      let d = player.dist;
      const ox = Math.sin(player.yaw) * cp, oy = sp, oz = Math.cos(player.yaw) * cp;
      const free = (inRoom ? interior.collision : city.collision).rayBlock(tx, ty, tz, tx + ox * d, ty + oy * d, tz + oz * d);
      d *= free;
      camGoal.set(tx + ox * d, Math.max(0.6, ty + oy * d), tz + oz * d);
      if (!playCamInit) { camera.position.copy(camGoal); playCamInit = true; }
      else camera.position.lerp(camGoal, Math.min(1, dt * 10));
      controls.target.set(tx, ty, tz);
      camera.lookAt(tx, ty, tz);
    }
    // камера: WASD
    const pan = new THREE.Vector3();
    const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const spd = camera.position.distanceTo(controls.target) * 0.9 * dt;
    if (keys.has('KeyW') || keys.has('ArrowUp')) pan.addScaledVector(fwd, spd);
    if (keys.has('KeyS') || keys.has('ArrowDown')) pan.addScaledVector(fwd, -spd);
    if (keys.has('KeyD') || keys.has('ArrowRight')) pan.addScaledVector(right, spd);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) pan.addScaledVector(right, -spd);
    if (pan.lengthSq() > 0 && !player.active) { ui.following = false; flyTarget = null; controls.target.add(pan); camera.position.add(pan); }
    // слежение / перелёт
    const sel = ui.selection;
    followPos = null;
    if (sel?.kind === 'citizen') {
      const c = sim.citizens[sel.id];
      let x = c.x, z = c.z;
      if (c.trip && (c.trip.stage === 'drive' || c.trip.stage === 'ride')) {
        const v = sim.transport.vehicles.find((vv) => vv.id === c.trip!.vehicle && !vv.done);
        if (v) { x = v.x; z = v.z; }
      }
      followPos = new THREE.Vector3(x, 0, z);
      ring.visible = true;
      ring.position.set(x, 0.3, z);
      ring.scale.setScalar(1 + Math.sin(time * 4) * 0.1);
      // путь
      if (c.trip && c.trip.path.length && (c.trip.stage === 'walk' || c.trip.stage === 'bike' || c.trip.stage === 'toStop' || c.trip.stage === 'fromStop')) {
        const pts = [new THREE.Vector3(c.x, 0.35, c.z), ...c.trip.path.slice(c.trip.pi).map((p) => new THREE.Vector3(p.x, 0.35, p.z))];
        pathLine.geometry.dispose();
        pathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        pathLine.computeLineDistances();
        pathLine.visible = true;
      } else pathLine.visible = false;
    } else if (sel?.kind === 'vehicle') {
      const v = sim.transport.vehicles.find((vv) => vv.id === sel.id && !vv.done);
      if (v) { followPos = new THREE.Vector3(v.x, 0, v.z); ring.visible = true; ring.position.set(v.x, 0.3, v.z); ring.scale.setScalar(3); }
      pathLine.visible = false;
    } else {
      ring.visible = false;
      pathLine.visible = false;
    }
    const goal = ui.following && followPos ? followPos : flyTarget;
    if (goal) {
      const d = new THREE.Vector3().subVectors(goal, controls.target);
      const k = Math.min(1, dt * (ui.following ? 5 : 3));
      controls.target.addScaledVector(d, k);
      camera.position.addScaledVector(d, k);
      if (flyTarget && d.length() < 0.5) flyTarget = null;
    }
    controls.target.x = Math.max(-HALF_CITY - 60, Math.min(HALF_CITY + 60, controls.target.x));
    controls.target.z = Math.max(-HALF_CITY - 60, Math.min(HALF_CITY + 60, controls.target.z));
    if (!player.active) controls.update();
    // слушатель для звука
    {
      const fwd2 = new THREE.Vector3();
      camera.getWorldDirection(fwd2);
      const rx = -fwd2.z, rz = fwd2.x;
      const rl = Math.hypot(rx, rz) || 1;
      sound.update(dt, {
        x: player.active ? player.c!.x : controls.target.x,
        z: player.active ? player.c!.z : controls.target.z,
        rx: rx / rl, rz: rz / rl,
        height: player.active ? 8 : camera.position.distanceTo(controls.target),
      }, env.daylight);
      const top = sim.news.items[0];
      if (top && top.id !== lastNewsId) {
        if (lastNewsId >= 0 && (top.kind === 'event' || top.kind === 'traffic') && /🔥|💥|🚑|💧|🔌|⚠️/.test(top.emoji)) sound.play('chime');
        lastNewsId = top.id;
      }
    }
    // автоподстройка качества
    if (time > 1.5 && time < 7.5) { fpsFrames++; }
    else if (time >= 7.5 && !fpsChecked) {
      fpsChecked = true;
      const fps = fpsFrames / 6;
      if (fps < 28 && sim.params.quality !== 'low' && !prefs.quality) {
        applyQuality(sim.params.quality === 'high' ? 'medium' : 'low');
        ui.syncAll();
        sim.news.push('⚙️', `Графика упрощена для плавности (${Math.round(fps)} кадров/с). Можно поменять в разделе «Вид»`, 'city');
      }
    }

    env.update(dt, camera, controls.target, time);
    const night = env.night;
    const w = sim.weather;
    // материалы по погоде и сезону
    grassCol.set(GRASS[sim.params.season]).lerp(new THREE.Color(0xf4f7fb), Math.min(1, w.snowCover * 1.1));
    city.grassMat.color.copy(grassCol);
    city.groundMat.color.copy(grassCol);
    city.roadMat.color.setScalar(1 - w.wetness * 0.3);
    city.roadMat.roughness = 0.9 - w.wetness * 0.65;
    city.roadMat.metalness = 0.05 + w.wetness * 0.35;
    city.roadMat.emissive.setScalar(w.snowCover * 0.22 + (w.icy ? 0.05 : 0));
    city.snowMat.opacity = Math.min(1, w.snowCover * 1.3);
    city.neonMat.color.setScalar(0.5 + night * 0.65);
    city.waterMat.color.set(w.temp < -3 ? 0xd8eef7 : P.water).multiplyScalar(0.55 + 0.45 * env.daylight);
    city.waterMat.roughness = w.temp < -3 ? 0.6 : 0.15;
    heat.visible = sim.params.heatmap;
    if (heat.visible) {
      sim.world.edges.forEach((e, i) => heat.setColorAt(i, col.setHSL(0.33 * (1 - Math.min(1, e.traffic * 1.6)), 1, e.closed ? 0.2 : 0.5)));
      heat.instanceColor!.needsUpdate = true;
    }
    routes.visible = sim.params.showRoutes;

    const inRoom = !!player.room;
    if (!inRoom) {
    if (time - winAt > 0.3) { winAt = time; updateWindows(); }
    props.update(dt, time, night);
    agents.update(dt, gdt, time, night);
    fx.update(dt, time, night);
    decor.update(night);
    }

    // подпись над выбранным
    if (followPos && sim.params.labels && sel?.kind === 'citizen' && !player.active) {
      const c = sim.citizens[sel.id];
      const p = followPos.clone().setY(2.6 * c.look.height + 0.3).project(camera);
      if (p.z < 1) {
        ui.label.style.display = 'block';
        ui.label.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
        ui.label.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
        ui.label.textContent = `${c.first} · ${c.trip ? '🚶 в пути' : c.act ? `${c.act.emoji} ${c.act.label}` : ''}`;
      } else ui.label.style.display = 'none';
    } else ui.label.style.display = 'none';

    if (time - uiAt > 0.25) { uiAt = time; ui.update(); }
    renderer.render(inRoom ? interior.scene : scene, camera);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  const t = document.getElementById('loading-text');
  if (t) t.textContent = 'ошибка: ' + (e as Error).message;
});
