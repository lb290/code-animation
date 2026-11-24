// main.js — CIELO renderer: HDR forward pass, painted sky, bloom, grade.
import { createGL, program, mesh, quad, makeRT, makeDepthRT, freeRT, drawMesh, setUniforms } from './gl.js';
import * as S from './shaders.js';
import { m4, clamp, norm, mulberry32, TAU, sub, add, scale as vs, len } from './math.js';
import { Camera } from './camera.js';
import { buildWorld } from './world.js';
import { LOOK } from './palette.js';
import { rgb } from './geo.js';
import { InstActor, INST_FLOATS } from './actor.js';
import { Billboards, staticBillboards } from './fx.js';
import { Ambience } from './audio.js';
import { DayNight } from './daynight.js';
import { buildNightLights } from './night-lights.js';
import { makeFireworks } from './fireworks.js';
import { createGuide } from './guide.js';
import { detectTouch, createTouch } from './touch.js';
import { createPostcard } from './postcard.js';

const canvas = document.getElementById('c');
const gl = createGL(canvas);
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- url params
const FREEZE = params.has('freeze') ? Number(params.get('freeze')) : -1;
const START_T = params.has('t') ? Number(params.get('t')) : 0;
const NOUI = params.has('noui');
const PERF = params.has('perf');
const OFF = new Set((params.get('no') || '').split(',').filter(Boolean));
const NO_ACTOR = new Set((params.get('noactor') || '').split(',').filter(Boolean));
const NO_BB = new Set((params.get('nobb') || '').split(',').filter(Boolean));
const GLCHECK = params.has('glcheck');
const glCheck = (label) => {
  if (!GLCHECK) return;
  const e = gl.getError();
  if (e !== gl.NO_ERROR) console.warn('[gl] error 0x' + e.toString(16) + ' after ' + label);
};
const VIEW0 = params.has('view') ? Number(params.get('view')) : 0;
const DBG_CAM = params.has('cam') ? params.get('cam').split(',').map(Number) : null;
const DBG_LOOK = params.has('look') ? params.get('look').split(',').map(Number) : null;
const DBG_FOV = params.has('fov') ? Number(params.get('fov')) : 55;
// round 6 · ?tod=day|dusk|night jumps straight to a time of day (stills use it),
// ?fw=N pre-loads N fireworks shells, ?fw=0 disables them entirely.
const TOD = params.has('tod') ? String(params.get('tod')).toLowerCase() : 'day';
const FW = params.has('fw') ? Number(params.get('fw')) : null;

// ---------------------------------------------------------------- round 11: touch + quality
// 触屏设备默认低画质档（关阴影 + 降分辨率），桌面保持高画质；?touch=0/1 可强制，
// ?q=low|mid|high 可手动指定（对比画质与性能时用）。
const FORCED_TOUCH = params.has('touch') ? params.get('touch') !== '0' : null;
const TOUCH = FORCED_TOUCH !== null ? FORCED_TOUCH : detectTouch();
const TIERS = {
  high: { shadow: true,  scale: 1.00, min: 0.55, max: 1.00, adaptMs: 27, fxaa: 1, lights: 12 },
  mid:  { shadow: false, scale: 0.80, min: 0.50, max: 0.85, adaptMs: 30, fxaa: 1, lights: 10 },
  low:  { shadow: false, scale: 0.60, min: 0.40, max: 0.68, adaptMs: 34, fxaa: 0, lights: 8 },
};
const TIER_CN = { high: '高', mid: '中', low: '流畅' };
let QNAME = String(params.get('q') || (TOUCH ? 'low' : 'high')).toLowerCase();
if (!TIERS[QNAME]) QNAME = 'high';
let Q = TIERS[QNAME];
if (TOUCH) document.documentElement.classList.add('touch');
document.documentElement.dataset.q = QNAME;

// ---------------------------------------------------------------- programs
const P = {
  lit: program(gl, S.LIT_VS, S.LIT_FS, 'lit'),
  whale: program(gl, S.LIT_VS, S.WHALE_FS, 'whale'),
  inst: program(gl, S.INST_VS, S.INST_FS, 'inst'),
  bill: program(gl, S.BILL_VS, S.BILL_FS, 'bill'),
  add: program(gl, S.ADD_VS, S.ADD_FS, 'add'),
  sky: program(gl, S.SKY_VS, S.SKY_FS, 'sky'),
  bright: program(gl, S.POST_VS, S.BRIGHT_FS, 'bright'),
  blur: program(gl, S.POST_VS, S.BLUR_FS, 'blur'),
  comp: program(gl, S.POST_VS, S.COMPOSITE_FS, 'comp'),
  depth: program(gl, S.DEPTH_VS, S.DEPTH_FS, 'depth'),
};

// ---------------------------------------------------------------- world
const t0 = performance.now();
const world = buildWorld(gl);
const ctx = world.ctx;
const buildMs = performance.now() - t0;

// ---------------------------------------------------------------- round 6: night
const dn = new DayNight({ tod: TOD, freeze: FREEZE >= 0 });
let curLook = dn.state;
let nightLights = null;
try {
  nightLights = buildNightLights(gl);
  if (nightLights && nightLights.mesh) {
    // one static additive mesh, drawn through the add pass with uAddMode=1;
    // uNightGlow is 0 in daylight, so the layer contributes exactly nothing then.
    ctx.dyn.push({
      name: 'nightWindows',
      kind: 'model',
      prog: 'add',
      mesh: nightLights.mesh,
      uniforms: () => ({ uAddMode: 1, uNightGlow: curLook.glow }),
    });
    const st = nightLights.stats;
    console.log('[main] night windows: ' + st.windows + ' lit / ' + st.collected + ' collected, ' +
      st.tris + ' tris, ' + st.lamps + ' street lamps, stride ' + st.stride);
  }
} catch (e) {
  console.warn('[main] night windows off', e);
}
const fireworks = makeFireworks({ fw: FW, seed: 9151, auto: true });
// two systems: additive sparks + normal-alpha soft smoke
for (const sys of fireworks.systems) ctx.bbDyn.push(sys);
console.log('[main] fireworks systems: ' + fireworks.systems.map((s) => s.name + (s.additive ? ' (additive)' : ' (alpha)')).join(', '));

// ---- sun shadow map -------------------------------------------------------
const SHADOW = { size: 2048, rt: null, proj: null, view: null, vp: new Float32Array(16), on: !OFF.has('shadow') };
try { SHADOW.rt = makeDepthRT(gl, SHADOW.size); } catch (e) { SHADOW.on = false; console.warn('shadow off', e); }
// 移动质量档：阴影是 2M tri 的第二次整场景绘制，中/低档直接关掉（本轮最大的帧时间来源）。
if (!Q.shadow) SHADOW.on = false;
{
  const center = [0, 6, -50];
  const lightDir = norm(LOOK.sunDir);            // points toward the sun
  const eye = add(center, vs(lightDir, 1100));
  const view = m4.lookAt(eye, center, [0, 1, 0]);
  const proj = m4.ortho(-560, 560, -560, 560, 1, 2600);
  SHADOW.view = view;
  SHADOW.proj = proj;
  SHADOW.vp.set(m4.mul(proj, view));
}

// static billboards (cloud sea, petals baked into the world)
{
  // diagnostic: report suspicious big / odd-coloured static sprites once
  const arr = ctx.lanterns || [];
  let big = 0;
  for (const it of arr) {
    if (it.size > 420) {
      big++;
      if (big <= 3) console.warn('[main] big static lantern: size=' + it.size.toFixed(0) + ' shape=' + it.shape +
        ' pos=' + it.p.map((v) => v.toFixed(0)).join(',') + ' col=' + it.col.map((v) => v.toFixed(2)).join(','));
    }
  }
  console.log('[main] static billboards: ' + arr.length + ', >420px: ' + big);
}
// a soft sun glare sprite far away in the sun direction (cheap lens bloom).
// It lives in its own one-sprite batch so the sun can fade out at night without
// touching the cloud/lantern batch: it is still drawn immediately after it, in
// the same order as before, and uAlphaMul=1 at day keeps the pixels identical.
const glareItems = (() => {
  const d = norm(LOOK.sunDir);
  const dist = 2600;
  return [{ p: [d[0] * dist, d[1] * dist, d[2] * dist], size: 900, rot: 0, alpha: 0.55, shape: 1, col: rgb('#fff0cf') }];
})();
const staticBB = staticBillboards(gl, ctx.lanterns || []);
const glareBB = staticBillboards(gl, glareItems);
const dynBB = new Billboards(gl, 4000);   // dynamic billboards filled every frame

// dynamic mesh actors -> InstActor instances for 'inst' kind
const instActors = new Map();
for (const d of ctx.dyn) {
  if (d.kind === 'inst' && !instActors.has(d)) {
    instActors.set(d, new InstActor(gl, d.mesh, d.capacity || 64));
  }
}

console.log('[main] dyn actors: ' + ctx.dyn.map((d) => d.name + '(' + d.kind + ')').join(' '));
console.log('[main] bbDyn: ' + (ctx.bbDyn || []).map((s) => s.name).join(' '));

// ---------------------------------------------------------------- camera
const cam = new Camera();
if (DBG_CAM && DBG_LOOK) cam.setCam(DBG_CAM, DBG_LOOK, DBG_FOV);
else cam.setView(VIEW0, true);
// ?tour=<0..1> parks the cinematic tour at that phase (use with &freeze=)
if (params.has('tour')) {
  cam.startTour();
  cam.tourT = Number(params.get('tour')) || 0;
  cam.update(0.0001);
}

// ---------------------------------------------------------------- render targets
const W = { value: 1600, h: 900, scale: Q.scale };
const ADAPT = { t: 0, n: 0, min: Q.min, max: Q.max, hi: Q.adaptMs, lo: Q.adaptMs * 0.55, cool: 0 };
let rtScene = null, rtBloomA = null, rtBloomB = null, rtScene2 = null;

function resize() {
  const w = Math.max(320, Math.floor(window.innerWidth * W.scale));
  const h = Math.max(200, Math.floor(window.innerHeight * W.scale));
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  W.w = w; W.h = h;
  for (const rt of [rtScene, rtBloomA, rtBloomB, rtScene2]) if (rt) freeRT(gl, rt);
  rtScene = makeRT(gl, w, h, { depth: true });
  const bw = Math.max(80, Math.floor(w / 2)), bh = Math.max(50, Math.floor(h / 2));
  rtBloomA = makeRT(gl, bw, bh, {});
  rtBloomB = makeRT(gl, bw, bh, {});
  rtScene2 = makeRT(gl, Math.max(80, Math.floor(w / 4)), Math.max(50, Math.floor(h / 4)), {});
}
window.addEventListener('resize', () => resize());
resize();
const quadMesh = quad(gl);

// ---------------------------------------------------------------- per-frame data
const proj = new Float32Array(16);
const view = new Float32Array(16);
const LIGHTS = { pos: new Float32Array(48), col: new Float32Array(48), n: 0 };   // 12 nearest point lights

function nearestLights(pos) {
  const pts = ctx.points;
  if (!pts.length) { LIGHTS.n = 0; return; }
  const best = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const dx = p.p[0] - pos[0], dy = p.p[1] - pos[1], dz = p.p[2] - pos[2];
    const d2 = dx*dx + dy*dy + dz*dz;
    const range = p.range || 40;
    if (d2 > range * range) continue;
    best.push([d2, i]);
  }
  best.sort((a, b) => a[0] - b[0]);
  const n = Math.min(Q.lights, best.length);
  LIGHTS.n = n;
  for (let k = 0; k < n; k++) {
    const p = pts[best[k][1]];
    LIGHTS.pos[k*4] = p.p[0]; LIGHTS.pos[k*4+1] = p.p[1]; LIGHTS.pos[k*4+2] = p.p[2];
    LIGHTS.pos[k*4+3] = p.range || 40;
    LIGHTS.col[k*4] = p.col[0]; LIGHTS.col[k*4+1] = p.col[1]; LIGHTS.col[k*4+2] = p.col[2];
    LIGHTS.col[k*4+3] = p.int ?? 1;
  }
}

// shared scene uniforms (same values for every lit/inst/add draw)
function sceneUniforms() {
  return {
    uCamPos: cam.pos,
    uKeyDir: curLook.keyDir,
    uKeyColor: curLook.keyColor,
    uKeyInt: curLook.keyInt,
    uSkyColor: curLook.ambSky,
    uGroundColor: curLook.ambGround,
    uAmbMul: curLook.ambMul,
    uRimColor: curLook.rim,
    uRim: curLook.rimInt,
    uFogColor: curLook.fogColor,
    uFogDensity: curLook.fogDensity,
    uFogMax: curLook.fogMax,
    uShadowTint: curLook.shadowTint,
    uNight: curLook.night,
    uLPos: LIGHTS.pos,
    uLCol: LIGHTS.col,
    uShadowMap: 0,
    uLightVP: SHADOW.vp,
    uShadowTexel: 1 / SHADOW.size,
    uShadowOn: SHADOW.on ? curLook.shadowOn : 0,
    uProj: proj,
    uView: view,
  };
}

function pass(prog, target, uniforms) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  const w = target ? target.w : W.w, h = target ? target.h : W.h;
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog.program);
  setUniforms(gl, prog, uniforms);
}

const IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

// ---------------------------------------------------------------- audio
const ambience = new Ambience();

// ---------------------------------------------------------------- HUD / UI
const hud = document.getElementById('hud');
const loadingEl = document.getElementById('loading');
const startBtn = document.getElementById('start');
const toastEl = document.getElementById('toast');
const helpEl = document.getElementById('help');
const fpsEl = document.getElementById('fps');
const hintEl = document.getElementById('hint');
const todEl = document.getElementById('tod');
// 标题页隐藏：过渡结束后把 display 也关掉。只靠 visibility 过渡在部分浏览器/无头环境
// 里会继续拦截点击（触屏层被它吃掉，本轮就是在移动模拟里踩到的）。
function hideLoading() {
  if (!loadingEl) return;
  loadingEl.classList.add('hidden');
  setTimeout(() => { if (loadingEl.classList.contains('hidden')) loadingEl.style.display = 'none'; }, 1500);
}
let toastT = 0;
function toast(msg, ms = 2400) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- 导览抄本
// 每处地标一个抵达区域：首次飞进去滑出一张卡片，并把那一页"显影"进抄本（G 打开）。
const guide = createGuide({
  cam,
  toast: (msg, ms) => toast(msg, ms),
  // 触屏上没有键盘，卡片停留久一点，并且可以点开阅读
  cardMs: TOUCH ? 12000 : 9000,
});

let photoMode = false;
function setPhoto(on) {
  photoMode = on;
  hud.classList.toggle('photo', on);
  document.getElementById('letterbox')?.classList.toggle('on', on);
}

// ---------------------------------------------------------------- round 11: 共用动作
// 键盘、触屏动作条、__cielo 调试 API 调的是同一套函数，不各写一份。
function toggleTour() {
  if (cam.tour) { cam.stopTour(); toast('自由飞行'); }
  else { cam.startTour(); toast('自动巡游'); }
}
function cycleTod() {
  const next = dn.cycle();
  toast(next === 'dusk' ? '黄昏 · 日落时分' : next === 'night' ? '夜晚 · 万家灯火' : '白昼 · 天空之城', 2200);
  if (next === 'night') guide.unlockSpecial('night');
  return next;
}
function fireVolley() {
  if (fireworks.disabled) toast('烟花已关闭（?fw=0）', 1600);
  else { fireworks.volley(time); toast('烟花 · 连发', 1400); }
}
function requestFullscreen() {
  try {
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    const el = document.documentElement;
    const p = el.requestFullscreen?.() || el.webkitRequestFullscreen?.();
    if (p && p.then) p.then(() => { try { screen.orientation?.lock?.('landscape'); } catch (e) { /* 平板可能不支持，忽略 */ } }).catch(() => {});
  } catch (e) { /* 非用户手势或浏览器不支持：静默忽略 */ }
}

// 明信片工坊（产品改进 A）：任意机位出一张带地名/日期/昼夜的明信片。
const postcard = createPostcard({
  gl, W, cam, toast,
  todLabel: () => curLook.label,
  setScale: (s) => { W.scale = s; resize(); },
});

// 触屏动作条：与键盘一一对应
const touch = TOUCH ? createTouch({
  canvas, cam, toast,
  actions: {
    tour: toggleTour,
    prev: () => cam.setView(cam.viewIndex - 1, false),
    next: () => cam.setView(cam.viewIndex + 1, false),
    tod: cycleTod,
    fireworks: fireVolley,
    guide: () => guide.toggle(),
    photo: () => setPhoto(!photoMode),
    postcard: () => postcard.open(),
    home: () => cam.setView(0),
    help: () => helpEl?.classList.toggle('show'),
    fullscreen: requestFullscreen,
  },
}) : { enabled: false };

// 手动 / 自动切换画质档（触屏默认 low；桌面 ?q= 或自动降档可切）
function setQuality(name) {
  if (!TIERS[name] || name === QNAME) return;
  QNAME = name;
  Q = TIERS[name];
  ADAPT.min = Q.min; ADAPT.max = Q.max;
  ADAPT.hi = Q.adaptMs; ADAPT.lo = Q.adaptMs * 0.55;
  SHADOW.on = !!Q.shadow && !!SHADOW.rt && !OFF.has('shadow');
  W.scale = Math.min(Math.max(W.scale, Q.min), Q.max);
  document.documentElement.dataset.q = name;
  resize();
  console.log('[main] quality -> ' + name + ' (scale ' + W.scale.toFixed(2) + ', shadow ' + SHADOW.on + ')');
  if (started) toast('画质已切到「' + TIER_CN[name] + '」', 2200);
}

// pointer lock look
let locked = false;
canvas.addEventListener('click', () => {
  // 触屏上没有指针锁定：请求它会失败并吞掉手势（第十一轮）
  if (TOUCH) return;
  if (!locked && !NOUI) canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (locked) cam.onMouse(e.movementX, e.movementY);
  else if (drag) cam.onMouse(e.movementX, e.movementY);
});
let drag = false;
canvas.addEventListener('mousedown', () => { drag = true; });
window.addEventListener('mouseup', () => { drag = false; });
canvas.addEventListener('wheel', (e) => {
  cam.fov = clamp(cam.fov + Math.sign(e.deltaY) * 2.5, 26, 92);
  e.preventDefault();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  // ---- 导览抄本优先：打开时吞掉按键，相机不再跟着动
  if (guide.isOpen()) {
    if (e.code === 'KeyG' || e.code === 'Escape') { e.preventDefault(); guide.close(); return; }
    if (e.code === 'ArrowDown' || e.code === 'KeyX' || e.code === 'ArrowRight') { e.preventDefault(); guide.nav(1); return; }
    if (e.code === 'ArrowUp' || e.code === 'KeyZ' || e.code === 'ArrowLeft') { e.preventDefault(); guide.nav(-1); return; }
    if (e.code === 'KeyU') { e.preventDefault(); guide.toggleSpoiler(); return; }
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyG') { e.preventDefault(); guide.toggle(); return; }
  cam.onKey(e.code, true);
  if (e.code === 'Space') {
    e.preventDefault();
    toggleTour();
  } else if (e.code === 'KeyC') {
    e.preventDefault();
    postcard.open();
  } else if (/^Digit[1-9]$/.test(e.code)) {
    cam.setView(Number(e.code.slice(5)) - 1);
  } else if (e.code === 'Digit0') {
    cam.setView(9);
  } else if (e.code === 'KeyZ') {
    cam.setView(cam.viewIndex - 1);
  } else if (e.code === 'KeyX') {
    cam.setView(cam.viewIndex + 1);
  } else if (e.code === 'KeyP') {
    setPhoto(!photoMode);
  } else if (e.code === 'KeyH') {
    helpEl?.classList.toggle('show');
  } else if (e.code === 'KeyR') {
    cam.setView(0);
  } else if (e.code === 'KeyM') {
    const on = ambience.toggle();
    toast(on ? '声音开' : '声音关');
  } else if (e.code === 'KeyN') {
    cycleTod();
  } else if (e.code === 'KeyF') {
    fireVolley();
  }
});
window.addEventListener('keyup', (e) => cam.onKey(e.code, false));

// ---------------------------------------------------------------- frame
let time = START_T;
let last = performance.now();
let frames = 0, fpsAcc = 0, cpuMs = 0;
let started = false;
let bootN = 0, bootSum = 0;   // 开局帧时间采样（自动画质档用）

const perf = { frames: 0, cpuMs: 0, drawCalls: 0, tris: world.tris, buildMs };
window.__cielo = {
  cam, ctx, world, perf,
  setView: (i) => cam.setView(i, false),
  setCam: (p, l, f) => cam.setCam(p, l, f),
  tour: (on) => (on ? cam.startTour() : cam.stopTour()),
  daynight: dn,
  setTod: (k, instant = true) => dn.setTod(k, instant),
  cycleTod: () => dn.cycle(),
  firework: () => fireworks.volley(time),
  fireworks,
  nightLights,
  guide,
  postcard,
  touch,
  isTouch: TOUCH,
  quality: () => QNAME,
  tiers: TIERS,
  setQuality: (n) => setQuality(n),
  stats: () => ({ quality: QNAME, scale: W.scale, shadow: SHADOW.on, touch: TOUCH, pointerLocked: locked, started }),
  ready: false,
};

function drawFrame(now) {
  const dtRaw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, Math.max(0, dtRaw));
  if (FREEZE >= 0) time = FREEZE;
  else if (window.__cielo && window.__cielo.forceTime != null) time = window.__cielo.forceTime;
  else time += dt;

  // time of day first: it drives the sky, the key light, the fog and the
  // additive night layer this frame (dt=0 under freeze keeps the frame fixed)
  curLook = dn.update(FREEZE >= 0 ? 0 : dt);
  if (todEl) todEl.textContent = curLook.label;

  const c0 = performance.now();
  cam.update(FREEZE >= 0 ? 0 : dt);
  // 冻结帧（截图 / ?freeze=）时 dt 恒为 0，抵达检测用一个固定步长，卡片才会出现
  if (started) guide.update(cam.pos, FREEZE >= 0 ? 0.24 : dt);
  ambience.camPos = cam.pos;
  const aspect = W.w / W.h;
  const p = m4.perspective((cam.fov * Math.PI) / 180, aspect, 0.4, 4200);
  proj.set(p);
  view.set(cam.viewMatrix());
  nearestLights(cam.pos);

  // actor buckets (needed by both the shadow pass and the colour pass)
  const dynOK = (d) => !NO_ACTOR.has(d.name);
  const litActors = ctx.dyn.filter((d) => d.kind === 'model' && !NO_ACTOR.has(d.name) && (d.prog || 'lit') === 'lit');
  const whaleActors = ctx.dyn.filter((d) => d.kind === 'model' && !NO_ACTOR.has(d.name) && d.prog === 'whale');
  const addActors = ctx.dyn.filter((d) => d.kind === 'model' && !NO_ACTOR.has(d.name) && d.prog === 'add');
  const instActorsList = ctx.dyn.filter((d) => d.kind === 'inst' && dynOK(d));

  let draws = 0;

  // ---- 0. sun shadow map (day / dusk only; at night it is switched off) ---
  if (SHADOW.on && !OFF.has('shadow') && curLook.shadowOn > 0.5) {
    // never sample the shadow texture while rendering into it
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, SHADOW.rt.fbo);
    gl.viewport(0, 0, SHADOW.size, SHADOW.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(P.depth.program);
    setUniforms(gl, P.depth, { uProj: SHADOW.proj, uView: SHADOW.view, uModel: IDENT });
    drawMesh(gl, world.mesh);
    for (const a of litActors) {
      setUniforms(gl, P.depth, { uModel: a.model ? a.model(time, dt) : IDENT });
      drawMesh(gl, a.mesh);
    }
    for (const a of whaleActors) {
      setUniforms(gl, P.depth, { uModel: a.model ? a.model(time, dt) : IDENT });
      drawMesh(gl, a.mesh);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // ---- 1. scene target ---------------------------------------------------
  gl.bindFramebuffer(gl.FRAMEBUFFER, rtScene.fbo);
  gl.viewport(0, 0, W.w, W.h);
  gl.clearColor(0.02, 0.04, 0.09, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  // round 11: 低画质档关掉阴影后**仍然**要把深度纹理绑到 unit 0 —— 否则 unit 0 还
  // 留着上一帧 composite 绑上去的 rtScene 颜色纹理，而场景 shader 的 uShadowMap 采样
  // unit 0，就形成「帧缓冲 ↔ 已绑定纹理」反馈环（安卓上会直接丢帧/黑屏）。
  if (SHADOW.rt) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, SHADOW.rt.tex);
  } else {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // sky dome (no depth write)
  if (!OFF.has('sky')) {
    const f = cam.forward;
    const right = norm([-f[2], 0, f[0]]);
    // up = right x forward  (NOT forward x right: that flips the whole sky upside down)
    const up = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
    gl.depthMask(false);
    pass(P.sky, rtScene, {
      uCamPos: cam.pos, uRight: right, uUp: up, uFwd: f,
      uTanFov: Math.tan((cam.fov * Math.PI) / 360), uAspect: aspect,
      uZenith: curLook.skyZenith, uSkyMid: curLook.skyMid, uHorizon: curLook.skyHorizon, uHaze: curLook.haze,
      uSunDir: curLook.sunVisDir, uSunColor: curLook.sunColor,
      uMoonDir: curLook.moonDir, uMoonColor: curLook.moonColor,
      uCloudLit: curLook.cloudLit, uCloudShade: curLook.cloudShade, uCloudDeep: curLook.cloudDeep,
      uTime: time, uCloudCov: curLook.cloudCov,
      uNight: curLook.night, uStarInt: curLook.starInt, uMoonInt: curLook.moonInt, uMoonSize: curLook.moonSize,
    });
    drawMesh(gl, quadMesh); draws++;
    gl.depthMask(true);
  }

  // ---- 2. opaque world ---------------------------------------------------
  if (!OFF.has('world')) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    pass(P.lit, rtScene, { ...sceneUniforms(), uModel: IDENT, uTime: time });
    drawMesh(gl, world.mesh); draws++;
    glCheck('world');
  }

  // ---- 3. dynamic actors -------------------------------------------------
  if (litActors.length) {
    pass(P.lit, rtScene, { ...sceneUniforms(), uModel: IDENT, uTime: time });
    for (const a of litActors) {
      const model = a.model ? a.model(time, dt) : IDENT;
      const extra = a.uniforms ? a.uniforms(time, dt) : null;
      setUniforms(gl, P.lit, { uModel: model, ...(extra || {}) });
      gl.depthMask(true);
      if (a.blend === 'add') { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); }
      else { gl.disable(gl.BLEND); }
      drawMesh(gl, a.mesh); draws++;
      glCheck('model:' + (a.name || '?'));
    }
    gl.disable(gl.BLEND);
  }

  // ---- 3b. the whale(s): a dedicated shader with wrap light + cloud bounce
  if (whaleActors.length) {
    pass(P.whale, rtScene, { ...sceneUniforms(), uModel: IDENT, uTime: time });
    for (const a of whaleActors) {
      setUniforms(gl, P.whale, { uModel: a.model ? a.model(time, dt) : IDENT });
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      drawMesh(gl, a.mesh); draws++;
      glCheck('whale:' + (a.name || '?'));
    }
  }

  if (instActorsList.length && !OFF.has('inst')) {
    pass(P.inst, rtScene, { ...sceneUniforms(), uTime: time });
    gl.disable(gl.BLEND);
    for (const a of instActorsList) {
      const act = instActors.get(a);
      if (a.mesh && a.mesh.maxIndex >= a.mesh.vertCount) {
        if (!a._warned) { a._warned = 1; console.warn('[main] inst actor "' + a.name + '" has an index buffer that does not match its vertices; skipping'); }
        continue;
      }
      const n = a.fill ? a.fill(time, act, dt) : 0;
      act.upload(n);
      if (n > 0) { drawMesh(gl, a.mesh); draws++; glCheck('inst:' + (a.name || '?')); }
    }
  }

  // ---- 4. billboards (transparent, depth-tested, no depth write) ----------
  if (!OFF.has('bill')) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    // reset the blend function: an additive pass (fireworks / night windows) may
    // have been the last thing to touch it, and the cloud sprites must composite
    // normally (this was a real washed-out-sky bug when fireworks came in).
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // static cloud sea / lanterns
    pass(P.bill, rtScene, {
      uProj: proj, uView: view,
      uCamPos: cam.pos, uTime: time,
      uFogColor: curLook.fogColor, uFogDensity: curLook.fogDensity * 0.6, uFogMax: curLook.fogMax,
      uSunColor: curLook.sunColor,
      uAdditive: 0, uAlphaMul: 1,
      uNight: curLook.night, uCloudNight: curLook.cloudBillboardTint,
    });
    if (staticBB.m.instances > 0 && !OFF.has('bs')) { setUniforms(gl, P.bill, { uUp: 0 }); drawMesh(gl, staticBB.m); draws++; glCheck('staticBB'); }
    // the sun glare is its own batch (identical order at day; fades at night)
    if (glareBB.m.instances > 0 && !OFF.has('bs')) {
      setUniforms(gl, P.bill, { uUp: 0, uAlphaMul: curLook.sunGlare });
      drawMesh(gl, glareBB.m); draws++; glCheck('sunGlare');
    }

    // dynamic billboards
    const bbSys = OFF.has('bd') ? [] : (ctx.bbDyn || []).filter((s) => !NO_BB.has(s.name));
    for (const sys of bbSys) {
      if (sys.skip && sys.skip()) continue;
      dynBB.begin();
      sys.fill(time, dynBB, dt);
      // an empty system must not be drawn: drawMesh() clamps the instance count to
      // >=1, which would re-use the previous system's first sprite (additive systems
      // then paint a huge stale glow across the frame).
      if (dynBB.count === 0) continue;
      // one-shot diagnostic: absurdly large sprite = an artifact nobody wants
      if (!sys._scanned) {
        sys._scanned = 1;
        for (let i = 0; i < dynBB.count; i++) {
          const o = i * 10;
          const size = dynBB.data[o + 3];
          if (size > 90) {
            console.warn('[main] big billboard in ' + (sys.name || 'bbDyn') + ': size=' + size.toFixed(1) +
              ' shape=' + dynBB.data[o + 6] + ' pos=' + [0,1,2].map(k => dynBB.data[o + k].toFixed(0)).join(','));
            break;
          }
        }
      }
      dynBB.upload();
      if (sys.additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      setUniforms(gl, P.bill, { uUp: sys.up ? 1 : 0, uAdditive: sys.additive ? 1 : 0, uAlphaMul: 1 });
      drawMesh(gl, dynBB.m); draws++;
      glCheck('bb:' + (sys.name || '?'));
    }
    gl.depthMask(true);
  }

  // ---- 5. additive effects ----------------------------------------------
  // The night-window layer is the only add actor, and it is a pure function of
  // uNightGlow: skipped entirely in daylight so the day frame is untouched.
  if (addActors.length && !OFF.has('add') && curLook.glow > 0.001) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    pass(P.add, rtScene, { uProj: proj, uView: view, uCamPos: cam.pos, uTime: time, uAddMode: 0, uNightGlow: 0 });
    for (const a of addActors) {
      setUniforms(gl, P.add, { uModel: a.model ? a.model(time, dt) : IDENT, ...(a.uniforms ? a.uniforms(time, dt) : {}) });
      drawMesh(gl, a.mesh); draws++;
      glCheck('add:' + (a.name || '?'));
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // ---- 6. bloom ----------------------------------------------------------
  if (!OFF.has('bloom')) {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    // bright pass -> half
    pass(P.bright, rtBloomA, { uTex: 0, uThreshold: curLook.bloomThreshold, uKnee: 0.35 });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rtScene.tex);
    drawMesh(gl, quadMesh); draws++;
    // H then V
    for (let i = 0; i < 2; i++) {
      pass(P.blur, rtBloomB, { uTex: 0, uDir: i === 0 ? [1, 0] : [0, 1], uTexel: 1 + i * 1.4 });
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, rtBloomA.tex);
      drawMesh(gl, quadMesh); draws++;
      // ping-pong
      const t = rtBloomA; rtBloomA = rtBloomB; rtBloomB = t;
    }
    // quarter-res, wide blur for the soft haze
    pass(P.blur, rtScene2, { uTex: 0, uDir: [1, 0], uTexel: 2.4 });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rtBloomA.tex);
    drawMesh(gl, quadMesh); draws++;
  }

  // ---- 7. composite ------------------------------------------------------
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W.w, W.h);
  gl.disable(gl.DEPTH_TEST);
  pass(P.comp, null, {
    uScene: 0, uBloom1: 1, uBloom2: 2,
    uTime: time, uRes: [W.w, W.h],
    uExposure: curLook.exposure, uBloom: curLook.bloomInt,
    uSaturation: curLook.saturation, uContrast: curLook.contrast,
    uVignette: curLook.vignette, uGrain: 0.018, uFxaa: Q.fxaa && W.scale >= 0.6 ? 1.0 : 0.0,
  });
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtScene.tex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rtBloomA.tex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, rtScene2.tex);
  drawMesh(gl, quadMesh); draws++;

  // ---- 8. 明信片工坊：需要出片时先抬一帧分辨率，下一帧 readPixels（截完自动恢复）
  if (postcard) postcard.onFrame();

  const c1 = performance.now();
  cpuMs = cpuMs * 0.9 + (c1 - c0) * 0.1;
  // adaptive render scale: keep the scene interactive on weaker GPUs
  if (FREEZE < 0 && started && !OFF.has('adapt')) {
    ADAPT.t += dtRaw * 1000; ADAPT.n++;
    if (ADAPT.n >= 60) {
      const avg = ADAPT.t / ADAPT.n;
      ADAPT.t = 0; ADAPT.n = 0;
      if (ADAPT.cool > 0) ADAPT.cool--;
      else if (avg > ADAPT.hi && W.scale > ADAPT.min) { W.scale = Math.max(ADAPT.min, W.scale - 0.12); resize(); ADAPT.cool = 2; }
      else if (avg < ADAPT.lo && W.scale < ADAPT.max) { W.scale = Math.min(ADAPT.max, W.scale + 0.08); resize(); ADAPT.cool = 2; }
    }
  }
  // 开局 150 帧后按实测帧时间调整一次画质档（只调一次，避免来回跳）
  if (FREEZE < 0 && started && bootN >= 0) {
    bootN++;
    bootSum += dtRaw * 1000;
    if (bootN === 150) {
      const avg = bootSum / bootN;
      bootN = -1;
      console.log('[main] first 150 frames avg ' + avg.toFixed(1) + ' ms · quality ' + QNAME);
      if (avg > 40 && QNAME !== 'low') setQuality('low');
      else if (TOUCH && avg < 18 && QNAME === 'low') setQuality('mid');
    }
  }
  perf.cpuMs = cpuMs;
  perf.drawCalls = draws;
  perf.frames++;
  if (FREEZE < 0 && started) {
    frames++;
    fpsAcc += dtRaw;
    if (fpsAcc > 0.5) {
      if (fpsEl) fpsEl.textContent = Math.round(frames / fpsAcc) + ' FPS\n' + Math.round(cpuMs * 10) / 10 + ' ms cpu\n' + (world.tris / 1000).toFixed(0) + 'k tris';
      frames = 0; fpsAcc = 0;
    }
  }

  window.__cielo.ready = true;
  if (!OFF.has('logo') && !started) { /* keep loader until start */ }
  requestAnimationFrame(drawFrame);
}

// ---------------------------------------------------------------- boot
function ready() {
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = '进入城市';
  }
  if (loadingEl && (NOUI || params.has('autostart'))) hideLoading();
}
function startExperience() {
  started = true;
  try { ambience.start(); } catch (e) { console.warn('audio', e); }
  // gentle push-in from a slightly higher, wider pose to the hero framing
  cam.setCam([6, 38.5, 108], [-18, 56, -200], 52);
  cam.setView(0, false);
  if (TOUCH) {
    setTimeout(() => toast('左手推摇杆飞行 · 右手拖动环视', 3600), 2200);
    setTimeout(() => toast('底部「导览」打开城市抄本', 3600), 6600);
  } else {
    setTimeout(() => toast('空格键 · 自动巡游整座城市', 3200), 2600);
    setTimeout(() => toast('G · 打开城市导览抄本', 3200), 6200);
    setTimeout(() => toast('N 切换昼夜 · F 放烟花', 3200), 10000);
  }
  hideLoading();
  hud?.classList.add('show');
  setTimeout(() => hintEl?.classList.add('fade'), 9000);
  if (!TOUCH) canvas.requestPointerLock?.();
}
if (startBtn) startBtn.addEventListener('click', startExperience);
if (NOUI) {
  hideLoading();
  hud?.classList.add('show');
  started = true;
}

// round 11: PWA —— 线上 https（GitHub Pages）可以「添加到主屏幕」，装好后断网也能打开。
// manifest / 触屏图标只在 http(s) 下注入：直接双击单文件（file://）时读 manifest 会被 CORS 拦，
// 注入可以避免控制台报错，也不影响 PWA 安装。局域网 http 下 service worker 注册会被浏览器拒绝，自动跳过。
if (location.protocol === 'http:' || location.protocol === 'https:') {
  const mf = document.createElement('link');
  mf.rel = 'manifest'; mf.href = 'cielo.webmanifest';
  document.head.appendChild(mf);
  const icon = document.createElement('link');
  icon.rel = 'apple-touch-icon'; icon.href = '../assets/pwa/icon-192.png';
  document.head.appendChild(icon);
}
if (!params.has('sw0') && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  try { navigator.serviceWorker?.register('cielo-sw.js').catch(() => {}); } catch (e) { /* ignore */ }
}

requestAnimationFrame((n) => {
  last = n;
  requestAnimationFrame(drawFrame);
  setTimeout(ready, 60);
  // ?postcard=1：截图/验收时自动冲洗一张明信片
  if (params.has('postcard')) setTimeout(() => { if (started) postcard.open(); }, 1800);
});
