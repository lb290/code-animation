// main.js — 星鲸环 ASTRA 主循环。
// 渲染管线从 CIELO 第十三轮移植（输出=设备像素 / 场景=像素预算 / FXAA+bloom+tonemap /
// 输出分辨率 4tap unsharp / 自适应分辨率三档），世界与天空是本世界自己的：
// 太空天空（space-sky.fs）+ 环站几何 + 舞台光。没有昼夜、没有抄本、没有明信片。
import { createGL, program, quad, makeRT, makeDepthRT, freeRT, drawMesh, setUniforms } from '../../cielo/src/gl.js';
import * as S from './shaders.js';
import { m4, clamp, norm, add, scale as vs, TAU, len } from './engine.js';
import { Camera, VIEWS } from './camera.js';
import { ROOMS as ROOM_DEFS, roomToWorld, gpt } from './interiors-plan.js';
import { buildWorld } from './world.js';
import { LOOK, SKY, C } from './palette.js';
import { rgb } from '../../cielo/src/geo.js';
import { Billboards, staticBillboards } from '../../cielo/src/fx.js';
import { InstActor } from '../../cielo/src/actor.js';
import { detectTouch, createTouch } from '../../cielo/src/touch.js';

const canvas = document.getElementById('c');
const gl = createGL(canvas);
const params = new URLSearchParams(location.search);
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
  if (e !== gl.NO_ERROR) console.warn('[glcheck] ' + label + ' 0x' + e.toString(16));
};
const VIEW0 = params.has('view') ? Number(params.get('view')) : 0;
const DBG_CAM = params.has('cam') ? params.get('cam').split(',').map(Number) : null;
const DBG_LOOK = params.has('look') ? params.get('look').split(',').map(Number) : null;
const DBG_FOV = params.has('fov') ? Number(params.get('fov')) : 55;
const FROM = params.get('from') || '';
const FORCED_TOUCH = params.has('touch') ? params.get('touch') !== '0' : null;
const TOUCH = FORCED_TOUCH !== null ? FORCED_TOUCH : detectTouch();

// ---- 质量三档：太空世界几何比 CIELO 少一个数量级，像素预算给得更高 -------------
const TIERS = {
  high: { shadow: true, outCap: 3.4e6, outDpr: 2, px0: 2.30e6, pxMin: 1.05e6, pxMax: 3.60e6, gpuMs: 12.5, fxaa: 1, sharpen: 0.26, lights: 12, sky: 1 },
  mid: { shadow: false, outCap: 2.8e6, outDpr: 2, px0: 1.60e6, pxMin: 0.90e6, pxMax: 2.60e6, gpuMs: 13.5, fxaa: 1, sharpen: 0.40, lights: 10, sky: 1 },
  low: { shadow: false, outCap: 2.3e6, outDpr: 2, px0: 1.05e6, pxMin: 0.60e6, pxMax: 1.90e6, gpuMs: 14.5, fxaa: 1, sharpen: 0.52, lights: 8, sky: 0 },
};
const TIER_ORDER = ['low', 'mid', 'high'];
const TIER_CN = { high: '精细', mid: '均衡', low: '流畅' };
const Q_KEY = 'astra.q.v1';
const loadQuality = () => { try { return localStorage.getItem(Q_KEY) || ''; } catch { return ''; } };
let QNAME = String(params.get('q') || loadQuality() || 'high').toLowerCase();
if (!TIERS[QNAME]) QNAME = 'high';
let Q = TIERS[QNAME];
if (TOUCH) document.documentElement.classList.add('touch');
document.documentElement.dataset.q = QNAME;

// ---------------------------------------------------------------- programs
const P = {
  lit: program(gl, S.LIT_VS, S.LIT_FS, 'lit'),
  inst: program(gl, S.INST_VS, S.INST_FS, 'inst'),
  bill: program(gl, S.BILL_VS, S.BILL_FS, 'bill'),
  add: program(gl, S.ADD_VS, S.ADD_FS, 'add'),
  sky: program(gl, S.SKY_VS, S.SKY_FS, 'sky'),
  bright: program(gl, S.POST_VS, S.BRIGHT_FS, 'bright'),
  blur: program(gl, S.POST_VS, S.BLUR_FS, 'blur'),
  comp: program(gl, S.POST_VS, S.COMPOSITE_FS, 'comp'),
  up: program(gl, S.POST_VS, S.UPSCALE_FS, 'up'),
  depth: program(gl, S.DEPTH_VS, S.DEPTH_FS, 'depth'),
};

// ---------------------------------------------------------------- world
const t0 = performance.now();
const world = buildWorld(gl);
const ctx = world.ctx;
const buildMs = performance.now() - t0;
if (ctx.failures && ctx.failures.length) console.warn('[main] world failures: ' + JSON.stringify(ctx.failures));

// ---------------------------------------------------------------- shadow
const SHADOW = { size: 2048, rt: null, proj: null, view: null, vp: new Float32Array(16), on: !OFF.has('shadow') };
try { SHADOW.rt = makeDepthRT(gl, SHADOW.size); } catch (e) { SHADOW.on = false; console.warn('shadow off', e); }
if (!Q.shadow || TOUCH) SHADOW.on = false;
{
  const center = [0, 30, 0];
  const lightDir = norm(LOOK.keyDir);
  const eye = add(center, vs(lightDir, 2600));
  const view = m4.lookAt(eye, center, [0, 1, 0]);
  const proj = m4.ortho(-860, 860, -860, 860, 1, 4200);
  SHADOW.view = view;
  SHADOW.proj = proj;
  SHADOW.vp.set(m4.mul(proj, view));
}

// ---------------------------------------------------------------- render targets
const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
const OUT_DPR_CAP = 2;
const W = { outW: 1280, outH: 720, srcW: 1280, srcH: 720, scale: 1, cssW: 1280, cssH: 720, outScale: 1 };
let scenePx = Q.px0;
let outMul = 1;
const GPU_TARGET = params.has('gputarget') ? Number(params.get('gputarget')) : 0;
let rtScene = null, rtBloomA = null, rtBloomB = null, rtScene2 = null, rtBloomC = null, rtLdr = null;
const clampPx = (p) => Math.min(Q.pxMax, Math.max(Q.pxMin, p));

function layout() {
  const cw = Math.max(320, window.innerWidth), ch = Math.max(200, window.innerHeight);
  let os = Math.min(DPR, OUT_DPR_CAP) * outMul;
  let ow = Math.max(320, Math.round(cw * os));
  let oh = Math.max(200, Math.round(ch * os));
  const outBudget = Q.outCap * outMul * outMul;
  if (ow * oh > outBudget) {
    const k = Math.sqrt(outBudget / (ow * oh));
    ow = Math.max(320, Math.round(ow * k));
    oh = Math.max(200, Math.round(oh * k));
    os = ow / cw;
  }
  const effPx = Math.min(scenePx, ow * oh);
  const aspect = cw / ch;
  const sw = Math.max(320, Math.round(Math.sqrt(effPx * aspect)));
  const sh = Math.max(200, Math.round(sw / aspect));
  const changed = !rtScene || rtScene.w !== sw || rtScene.h !== sh;
  W.cssW = cw; W.cssH = ch;
  W.outW = ow; W.outH = oh; W.outScale = os;
  W.srcW = sw; W.srcH = sh; W.scale = sw / cw;
  if (canvas.width !== ow || canvas.height !== oh) { canvas.width = ow; canvas.height = oh; }
  if (changed) {
    for (const rt of [rtScene, rtBloomA, rtBloomB, rtScene2, rtBloomC, rtLdr]) if (rt) freeRT(gl, rt);
    rtScene = makeRT(gl, sw, sh, { depth: true });
    const bw = Math.max(80, Math.floor(sw / 2)), bh = Math.max(50, Math.floor(sh / 2));
    rtBloomA = makeRT(gl, bw, bh, {});
    rtBloomB = makeRT(gl, bw, bh, {});
    const qw = Math.max(80, Math.floor(sw / 4)), qh = Math.max(50, Math.floor(sh / 4));
    rtScene2 = makeRT(gl, qw, qh, {});
    rtBloomC = makeRT(gl, qw, qh, {});
    rtLdr = makeRT(gl, sw, sh, { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE });
  }
}
window.addEventListener('resize', () => layout());
const PX_KEY = 'astra.px.v1';
function loadPx(name) {
  try { const v = Number((JSON.parse(localStorage.getItem(PX_KEY) || '{}'))[name]); return v > 0 ? v : 0; } catch { return 0; }
}
function savePx(name, px) {
  try { const j = JSON.parse(localStorage.getItem(PX_KEY) || '{}'); j[name] = Math.round(px); localStorage.setItem(PX_KEY, JSON.stringify(j)); } catch { /* 忽略 */ }
}
if (params.has('px')) scenePx = Number(params.get('px')) || scenePx;
else { const st = loadPx(QNAME); if (st) scenePx = st; }
scenePx = clampPx(scenePx);
layout();
const quadMesh = quad(gl);

// ---------------------------------------------------------------- GPU timer / adapt
const GPU_TIMER = gl.getExtension('EXT_disjoint_timer_query_webgl2');
let tqCur = null, tqPrev = null, gpuMs = 0;
function gpuBegin() { if (!GPU_TIMER || tqCur || tqPrev) return; tqCur = gl.createQuery(); gl.beginQuery(GPU_TIMER.TIME_ELAPSED_EXT, tqCur); }
function gpuEnd() { if (!GPU_TIMER || !tqCur) return; gl.endQuery(GPU_TIMER.TIME_ELAPSED_EXT); tqPrev = tqCur; tqCur = null; }
function gpuPoll() {
  if (!tqPrev) return -1;
  let ok = false;
  try { ok = gl.getQueryParameter(tqPrev, gl.QUERY_RESULT_AVAILABLE); } catch (e) { ok = false; }
  if (!ok) return -1;
  let ms = 0;
  try {
    if (GPU_TIMER && gl.getParameter(GPU_TIMER.GPU_DISJOINT_EXT)) { gl.deleteQuery(tqPrev); tqPrev = null; return -1; }
    ms = gl.getQueryParameter(tqPrev, gl.QUERY_RESULT) / 1e6;
  } catch (e) { ms = 0; }
  gl.deleteQuery(tqPrev); tqPrev = null;
  if (!(ms > 0 && ms < 250)) return -1;
  return ms;
}
const ADAPT = { n: 0, gpuSum: 0, gpuN: 0, dtSum: 0, dtMin: 999, cool: 3, settle: 0, lastSave: 0, measure: 0 };
let adaptLock = false;
function adaptStep(dtRaw) {
  const g = gpuPoll();
  if (g >= 0) { gpuMs = gpuMs ? gpuMs * 0.75 + g * 0.25 : g; ADAPT.gpuSum += g; ADAPT.gpuN++; }
  if (FREEZE >= 0 || !started || adaptLock || OFF.has('adapt')) return;
  ADAPT.dtSum += dtRaw * 1000;
  if (dtRaw * 1000 < ADAPT.dtMin) ADAPT.dtMin = dtRaw * 1000;
  ADAPT.n++;
  if (ADAPT.n < 30) return;
  const avgGpu = ADAPT.gpuN ? ADAPT.gpuSum / ADAPT.gpuN : -1;
  const avgDt = ADAPT.dtSum / ADAPT.n;
  const vsync = Math.min(ADAPT.dtMin, 33.4);
  ADAPT.n = 0; ADAPT.gpuSum = 0; ADAPT.gpuN = 0; ADAPT.dtSum = 0; ADAPT.dtMin = 999;
  if (bootN >= 0) return;
  const target = GPU_TARGET || Q.gpuMs;
  let action = 0;
  const adb = params.has('adaptlog');
  if (avgGpu > 0) {
    ADAPT.measure = avgGpu;
    if (avgGpu > target * 1.08) action = -1; else if (avgGpu < target * 0.80) action = 1;
  } else {
    ADAPT.measure = avgDt;
    if (avgDt > vsync * 1.30) action = -1; else if (avgDt < vsync * 1.04) action = 1;
  }
  if (adb) console.log('[adapt] gpu ' + avgGpu.toFixed(2) + ' dt ' + avgDt.toFixed(1) + ' target ' + target +
    ' px ' + (scenePx / 1e6).toFixed(2) + ' outMul ' + outMul + ' action ' + action + ' cool ' + ADAPT.cool);
  if (ADAPT.cool > 0) { ADAPT.cool--; return; }
  if (action < 0) {
    const next = clampPx(scenePx * 0.86);
    if (next < scenePx - 1e5) { scenePx = next; ADAPT.cool = 3; ADAPT.settle = 0; layout(); }
    else if (W.srcW * W.srcH <= Q.pxMin * 1.03 && outMul > 0.63) { outMul = Math.max(0.62, outMul - 0.12); ADAPT.cool = 3; ADAPT.settle = 0; layout(); }
    else ADAPT.settle = 0;
  } else if (action > 0) {
    const next = clampPx(scenePx * 1.05);
    if (next > scenePx + 1e5) { scenePx = next; ADAPT.cool = 5; ADAPT.settle = 0; layout(); }
    else if (outMul < 1) { outMul = Math.min(1, outMul + 0.08); ADAPT.cool = 5; ADAPT.settle = 0; layout(); }
    else ADAPT.settle++;
  } else ADAPT.settle++;
  if (ADAPT.settle >= 5 && performance.now() - ADAPT.lastSave > 4000) { ADAPT.lastSave = performance.now(); savePx(QNAME, scenePx); }
}

// ---------------------------------------------------------------- scene uniforms
const proj = new Float32Array(16);
const view = new Float32Array(16);
const LIGHTS = { pos: new Float32Array(48), col: new Float32Array(48), n: 0 };
function nearestLights(pos) {
  const pts = ctx.points;
  if (!pts.length) { LIGHTS.n = 0; return; }
  const best = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const dx = p.p[0] - pos[0], dy = p.p[1] - pos[1], dz = p.p[2] - pos[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    const range = p.range || 40;
    if (d2 > range * range) continue;
    best.push([d2, i]);
  }
  best.sort((a, b) => a[0] - b[0]);
  const n = Math.min(Q.lights, best.length);
  LIGHTS.n = n;
  for (let k = 0; k < n; k++) {
    const p = pts[best[k][1]];
    LIGHTS.pos[k * 4] = p.p[0]; LIGHTS.pos[k * 4 + 1] = p.p[1]; LIGHTS.pos[k * 4 + 2] = p.p[2]; LIGHTS.pos[k * 4 + 3] = p.range || 40;
    LIGHTS.col[k * 4] = p.col[0]; LIGHTS.col[k * 4 + 1] = p.col[1]; LIGHTS.col[k * 4 + 2] = p.col[2]; LIGHTS.col[k * 4 + 3] = p.int ?? 1;
  }
}
function sceneUniforms() {
  return {
    uCamPos: cam.pos,
    uKeyDir: LOOK.keyDir,
    uKeyColor: LOOK.keyColor,
    uKeyInt: LOOK.keyInt,
    uSkyColor: LOOK.ambSky,
    uGroundColor: LOOK.ambGround,
    uAmbMul: LOOK.ambMul,
    uRimColor: LOOK.rim,
    uRim: LOOK.rimInt,
    uFogColor: LOOK.fogColor,
    uFogDensity: LOOK.fogDensity,
    uFogMax: LOOK.fogMax,
    uShadowTint: LOOK.shadowTint,
    uNight: 0,
    uLPos: LIGHTS.pos,
    uLCol: LIGHTS.col,
    uShadowMap: 0,
    uLightVP: SHADOW.vp,
    uShadowTexel: 1 / SHADOW.size,
    uShadowOn: SHADOW.on ? LOOK.shadowOn : 0,
    uProj: proj,
    uView: view,
  };
}
function pass(prog, target, uniforms) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  const w = target ? target.w : W.outW, h = target ? target.h : W.outH;
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog.program);
  setUniforms(gl, prog, uniforms);
}
const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// ---------------------------------------------------------------- camera / UI
const cam = new Camera();
let curLook = LOOK;
const hud = document.getElementById('hud');
const loadingEl = document.getElementById('loading');
const startBtn = document.getElementById('start');
const toastEl = document.getElementById('toast');
const helpEl = document.getElementById('help');
const fpsEl = document.getElementById('fps');
const hintEl = document.getElementById('hint');
function hideLoading(instant = false) {
  if (!loadingEl) return;
  loadingEl.classList.add('hidden');
  // NOUI / 自动化截图时直接摘掉标题页：只靠 CSS 过渡的话，某些无头/合成器组合会把
  // 半透明的旧层留在截图里（第十五轮验收里看到过"标题页鬼影 + HUD 重影"）。
  if (instant) { loadingEl.style.display = 'none'; return; }
  setTimeout(() => { if (loadingEl.classList.contains('hidden')) loadingEl.style.display = 'none'; }, 1600);
}
let toastT = 0;
function toast(msg, ms = 2600) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
}
const viewsEl = document.getElementById('viewname');
function setView(i, instant = false) {
  cam.setView(i, instant);
  const v = VIEWS[cam.viewIndex];
  if (viewsEl) { viewsEl.textContent = v.name; viewsEl.classList.add('show'); clearTimeout(setView._t); setView._t = setTimeout(() => viewsEl.classList.remove('show'), 2600); }
}
function cycleView(dir) { setView(cam.viewIndex + dir); }
let photoMode = false;
function setPhoto(on) {
  photoMode = on;
  hud?.classList.toggle('photo', on);
  document.getElementById('letterbox')?.classList.toggle('on', on);
  toast(on ? '摄影模式 · 界面已隐藏（P 返回）' : '界面已恢复', 1800);
}
function requestFullscreen() {
  try {
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    const el = document.documentElement;
    const p = el.requestFullscreen?.() || el.webkitRequestFullscreen?.();
    if (p && p.then) p.then(() => { try { screen.orientation?.lock?.('landscape'); } catch (e) { /* 忽略 */ } }).catch(() => {});
  } catch (e) { /* 忽略 */ }
}
function setQuality(name, persist = true) {
  if (!TIERS[name]) return;
  QNAME = name; Q = TIERS[name];
  document.documentElement.dataset.q = name;
  if (persist) { try { localStorage.setItem(Q_KEY, name); } catch { /* 忽略 */ } }
  scenePx = clampPx(Q.px0);
  outMul = 1;
  if (!Q.shadow) SHADOW.on = false; else SHADOW.on = !OFF.has('shadow') && SHADOW.rt && !TOUCH;
  layout();
  toast('画质 · ' + TIER_CN[name], 1600);
}
function cycleQuality(dir = 1) {
  const i = TIER_ORDER.indexOf(QNAME);
  setQuality(TIER_ORDER[(i + dir + TIER_ORDER.length) % TIER_ORDER.length]);
}
function toggleHelp() { helpEl?.classList.toggle('show'); }
function toggleTour() {
  if (cam.tour) { cam.stopTour(); toast('自由飞行'); }
  else { cam.startTour(); toast('自动巡游 · 绕环站一周'); }
}
function goPaiting() { location.href = 'CIELO.html?at=easel'; }

// ---- 输入（桌面）--------------------------------------------------------
let locked = false;
canvas.addEventListener('click', () => {
  if (!locked) lockPointer();
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
// 指针锁定在没有用户手势（自动化 / 程序化 click）时会 reject，吞掉这个 Promise 以免冒出未捕获异常
function lockPointer() {
  try {
    const p = canvas.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* 忽略 */ }
}
document.addEventListener('mousemove', (e) => {
  if (locked || drag) cam.onMouse(e.movementX || 0, e.movementY || 0);
});
let drag = false;
canvas.addEventListener('mousedown', () => { drag = true; });
window.addEventListener('mouseup', () => { drag = false; });
canvas.addEventListener('wheel', (e) => {
  cam.speedMul = clamp(cam.speedMul * (e.deltaY > 0 ? 0.92 : 1.08), 0.25, 6);
  e.preventDefault();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.code;
  if (k === 'Tab') return;
  cam.onKey(k, true);
  if (k === 'Space') { e.preventDefault(); toggleTour(); return; }
  if (k === 'KeyZ') { cycleView(-1); return; }
  if (k === 'KeyX') { cycleView(1); return; }
  if (k === 'KeyV') { cycleQuality(1); return; }
  if (k === 'KeyH') { toggleHelp(); return; }
  if (k === 'KeyP') { setPhoto(!photoMode); return; }
  if (k === 'KeyR') { goPaiting(); return; }
  if (k === 'KeyG') { requestFullscreen(); return; }
  if (k === 'Escape' && locked) document.exitPointerLock?.();
  const dm = k.match(/^Digit([0-9])$/);
  if (dm) { const n = Number(dm[1]); setView(n === 0 ? 9 : n - 1); return; }
});
window.addEventListener('keyup', (e) => cam.onKey(e.code, false));

// ---- 触屏 ---------------------------------------------------------------
const touch = TOUCH ? createTouch({
  canvas, cam, toast,
  actions: {
    tour: () => toggleTour(),
    prev: () => cycleView(-1),
    next: () => cycleView(1),
    view: () => { toast('观景点 ' + (cam.viewIndex + 1) + ' / ' + VIEWS.length + ' · ' + VIEWS[cam.viewIndex].name, 1800); },
    quality: () => cycleQuality(1),
    photo: () => setPhoto(!photoMode),
    help: () => toggleHelp(),
    home: () => setView(0),
    back: () => goPaiting(),
    fullscreen: () => requestFullscreen(),
  },
}) : { enabled: false, setMenu() {}, hint() {} };

document.getElementById('btn-back')?.addEventListener('click', (e) => { e.preventDefault(); goPaiting(); });
document.getElementById('btn-help')?.addEventListener('click', (e) => { e.preventDefault(); toggleHelp(); });
document.getElementById('btn-quality')?.addEventListener('click', (e) => { e.preventDefault(); cycleQuality(1); });

// ---------------------------------------------------------------- boot
let time = START_T;
let last = performance.now();
let frames = 0, fpsAcc = 0, cpuMs = 0;
let started = false;
let bootN = 0, bootSum = 0, bootM = 0;
const BUILD = (() => {
  const el = document.querySelector('.build');
  return el ? el.textContent.replace('构建 ', '').trim() : '?';
})();
function showDiag(extra) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:12px;top:12px;z-index:99;max-width:min(560px,92vw);padding:12px 14px;' +
    'background:rgba(6,10,26,.88);color:#dbe6ff;border:1px solid rgba(150,190,255,.35);border-radius:10px;' +
    'font:11.5px/1.75 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:auto';
  const st = window.__astra.stats();
  d.textContent = [
    'ASTRA · 星鲸环  ' + BUILD,
    '世界静态三角 ' + st.tris.toLocaleString() + ' · 绘制 ' + st.drawCalls + ' 次 · 构建 ' + st.buildMs.toFixed(0) + ' ms',
    '场景 ' + st.scenePx + ' px (' + st.srcW + 'x' + st.srcH + ') · 输出 ' + st.outW + 'x' + st.outH,
    '质量 ' + st.quality + ' · gpu ' + st.gpuMs.toFixed(1) + ' ms · cpu ' + st.cpuMs.toFixed(1) + ' ms',
    '点光 ' + ctx.points.length + ' · 静 billboard ' + (ctx.lanterns || []).length + ' · 批 ' + world.meshes.length,
    'JS 堆 ' + (st.heapMB >= 0 ? st.heapMB + ' MB' : '—') + ' · 观景点 ' + VIEWS.length,
    ctx.failures && ctx.failures.length ? '失败: ' + JSON.stringify(ctx.failures) : '失败: 无',
    extra || '',
  ].join('\n');
  d.addEventListener('click', () => d.remove());
  document.body.appendChild(d);
  return d;
}
const perf = { frames: 0, cpuMs: 0, gpuMs: 0, drawCalls: 0, tris: world.tris, buildMs, scenePx, view: 0, ready: false };
window.__astra = {
  world, ctx, cam, perf,
  views: VIEWS.map((v, i) => ({ i, name: v.name, en: v.en, pos: v.pos, look: v.look, fov: v.fov })),
  setView: (i, instant = true) => { cam.setView(i, instant); return cam.viewIndex; },
  cycleView: (d) => { cycleView(d); return cam.viewIndex; },
  setCam: (p, l, f) => cam.setCam(p, l, f ?? cam.fov),
  quality: (n) => { if (n) setQuality(n); return QNAME; },
  cycleQuality,
  tour: (on) => { if (on === undefined) toggleTour(); else if (on) cam.startTour(); else cam.stopTour(); },
  diag: () => showDiag(),
  forceTime: null,
  reset: () => { cam.setView(0, true); },
  isTouch: TOUCH,
  backUrl: () => 'CIELO.html?at=easel',
  // Round 16 调试：把房间 / 画廊局部坐标换成世界坐标（房间作者摆机位、查灯光时用）
  roomWorld: (key, p) => { const r = ROOM_DEFS.find((x) => x.key === key); return r ? roomToWorld(r.cx, p) : null; },
  galleryWorld: (p) => gpt(p[0], p[1], p[2]),
  roomCx: Object.fromEntries(ROOM_DEFS.map((r) => [r.key, r.cx])),
  res: () => ({ outW: W.outW, outH: W.outH, srcW: W.srcW, srcH: W.srcH, outPx: W.outW * W.outH, scenePx: W.srcW * W.srcH, dpr: DPR, outMul }),
  ready: false,
  stats() {
    return {
      world: 'ASTRA', build: BUILD, tris: world.tris, drawCalls: perf.drawCalls, buildMs,
      quality: QNAME, scenePx: W.srcW * W.srcH, srcW: W.srcW, srcH: W.srcH, outW: W.outW, outH: W.outH,
      gpuMs: perf.gpuMs, cpuMs: perf.cpuMs, view: cam.viewIndex, heapMB: perf.heapMB ?? -1,
      failures: (ctx.failures || []).length,
    };
  },
};
if (params.has('diag')) setTimeout(() => showDiag(), 800);
if (params.has('view')) cam.setView(VIEW0, true);
if (DBG_CAM) cam.setCam(DBG_CAM, DBG_LOOK || add(DBG_CAM, norm([0, 0, -1])), DBG_FOV);

function drawFrame(now) {
  const dtRaw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, Math.max(0, dtRaw));
  if (FREEZE >= 0) time = FREEZE;
  else if (window.__astra && window.__astra.forceTime != null) time = window.__astra.forceTime;
  else time += dt;

  const c0 = performance.now();
  cam.update(FREEZE >= 0 ? 0 : dt);
  const aspect = W.srcW / W.srcH;
  proj.set(m4.perspective((cam.fov * Math.PI) / 180, aspect, 1.0, 9000));
  view.set(m4.lookAt(cam.pos, add(cam.pos, cam.forward), [0, 1, 0]));
  nearestLights(cam.pos);

  const dynOK = (d) => !NO_ACTOR.has(d.name);
  const litActors = ctx.dyn.filter((d) => d.kind === 'model' && dynOK(d) && (d.prog || 'lit') === 'lit');
  const addActors = ctx.dyn.filter((d) => d.kind === 'model' && dynOK(d) && d.prog === 'add');
  const instActorsList = ctx.dyn.filter((d) => d.kind === 'inst' && dynOK(d));
  let draws = 0;

  gpuBegin();

  // ---- 0. 恒星阴影 -------------------------------------------------------
  if (SHADOW.on && !OFF.has('shadow')) {
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
    for (const wm of world.meshes) drawMesh(gl, wm);
    for (const a of litActors) { setUniforms(gl, P.depth, { uModel: a.model ? a.model(time, dt) : IDENT }); drawMesh(gl, a.mesh); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ---- 1. scene target ---------------------------------------------------
  gl.bindFramebuffer(gl.FRAMEBUFFER, rtScene.fbo);
  gl.viewport(0, 0, W.srcW, W.srcH);
  gl.clearColor(0.012, 0.016, 0.045, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  // 阴影纹理永远绑在 unit 0（不采样自己正在写的目标）
  if (SHADOW.rt) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, SHADOW.rt.tex); }
  else { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null); }

  // ---- 2. 静态世界 -------------------------------------------------------
  if (!OFF.has('world')) {
    pass(P.lit, rtScene, { ...sceneUniforms(), uModel: IDENT, uTime: time });
    for (const wm of world.meshes) { drawMesh(gl, wm); draws++; }
    glCheck('world');
  }

  // ---- 3. 动态 actor -----------------------------------------------------
  if (litActors.length) {
    pass(P.lit, rtScene, { ...sceneUniforms(), uModel: IDENT, uTime: time });
    for (const a of litActors) {
      const model = a.model ? a.model(time, dt) : IDENT;
      setUniforms(gl, P.lit, { uModel: model, ...((a.uniforms ? a.uniforms(time, dt) : null) || {}) });
      gl.depthMask(true);
      if (a.blend === 'add') { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); } else gl.disable(gl.BLEND);
      drawMesh(gl, a.mesh); draws++;
    }
    gl.disable(gl.BLEND);
  }
  if (instActorsList.length && !OFF.has('inst')) {
    pass(P.inst, rtScene, { ...sceneUniforms(), uTime: time });
    gl.disable(gl.BLEND);
    for (const a of instActorsList) {
      const act = instActors.get(a);
      const n = a.fill ? a.fill(time, act, dt) : 0;
      act.upload(n);
      if (n > 0) { drawMesh(gl, a.mesh); draws++; }
    }
  }

  // ---- 3b. 天空（实体之后画，只着色露天像素）------------------------------
  if (!OFF.has('sky')) {
    const f = cam.forward;
    const right = norm([-f[2], 0, f[0]]);
    const up = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
    gl.depthMask(false);
    pass(P.sky, rtScene, {
      uCamPos: cam.pos, uRight: right, uUp: up, uFwd: f,
      uTanFov: Math.tan((cam.fov * Math.PI) / 360), uAspect: aspect, uTime: time,
      uStarColor: SKY.starColor, uStarInt: SKY.starInt,
      uVoidHigh: SKY.voidHigh, uVoidLow: SKY.voidLow, uVoidInt: SKY.voidInt,
      uNebA: SKY.nebA, uNebB: SKY.nebB, uNebC: SKY.nebC, uNebD: SKY.nebD, uNebInt: SKY.nebInt,
      uSunDir: SKY.sunDir, uSunColor: SKY.sunColor, uSunInt: SKY.sunInt,
      uPlanetDir: SKY.planetDir, uPlanetAxis: SKY.planetAxis, uPlanetAng: SKY.planetAng,
      uPlanetColA: SKY.planetColA, uPlanetColB: SKY.planetColB, uPlanetAtm: SKY.planetAtm,
      uPlanetInt: SKY.planetInt, uPlanetGlow: SKY.planetGlow,
      uRingColA: SKY.ringColA, uRingColB: SKY.ringColB, uRingInt: SKY.ringInt, uRingTilt: 0,
      uMoonDir: SKY.moonDir, uMoonAng: SKY.moonAng, uMoonCol: SKY.moonCol,
    });
    drawMesh(gl, quadMesh); draws++;
    gl.depthMask(true);
  }

  // ---- 4. billboards -----------------------------------------------------
  if (!OFF.has('bill')) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    pass(P.bill, rtScene, {
      uProj: proj, uView: view, uCamPos: cam.pos, uTime: time,
      uFogColor: LOOK.fogColor, uFogDensity: LOOK.fogDensity * 0.6, uFogMax: LOOK.fogMax,
      uSunColor: LOOK.keyColor, uAdditive: 0, uAlphaMul: 1, uNight: 0, uCloudNight: rgb('#ffffff'),
    });
    if (staticBB.m.instances > 0 && !OFF.has('bs')) { setUniforms(gl, P.bill, { uUp: 0 }); drawMesh(gl, staticBB.m); draws++; }
    const bbSys = OFF.has('bd') ? [] : (ctx.bbDyn || []).filter((s) => !NO_BB.has(s.name));
    for (const sys of bbSys) {
      if (sys.skip && sys.skip()) continue;
      dynBB.begin();
      sys.fill(time, dynBB, dt);
      if (dynBB.count === 0) continue;
      dynBB.upload();
      if (sys.additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      setUniforms(gl, P.bill, { uUp: sys.up ? 1 : 0, uAdditive: sys.additive ? 1 : 0, uAlphaMul: 1 });
      drawMesh(gl, dynBB.m); draws++;
    }
    gl.depthMask(true);
  }

  // ---- 5. 加法特效 -------------------------------------------------------
  if (addActors.length && !OFF.has('add')) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    pass(P.add, rtScene, { uProj: proj, uView: view, uCamPos: cam.pos, uTime: time, uAddMode: 0, uNightGlow: 1 });
    for (const a of addActors) {
      setUniforms(gl, P.add, { uModel: a.model ? a.model(time, dt) : IDENT, ...((a.uniforms ? a.uniforms(time, dt) : null) || {}) });
      drawMesh(gl, a.mesh); draws++;
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // ---- 6. bloom（Round 16 修：旧写法 uTexel 是"整屏 UV 偏移"，±3.2 屏宽的采样在
  // CLAMP_TO_EDGE 下会把屏幕边缘的亮像素抹满整屏 —— 环站亮面/巨行星一旦擦过画面边缘，
  // 全屏就泛起一层金色/青色"光污染"，镜头一转又消失，正是用户说的"一闪一闪"。
  // 现在每级的 texel 都是真实纹素，两级（半分辨率细节 + 四分之一分辨率柔光）叠加。）
  if (!OFF.has('bloom')) {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    pass(P.bright, rtBloomA, { uTex: 0, uThreshold: LOOK.bloomThreshold, uKnee: 0.35 });
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtScene.tex);
    drawMesh(gl, quadMesh); draws++;
    // 第一级：半分辨率 H/V（半径 ~3 纹素 ≈ 6 场景像素）
    for (let i = 0; i < 2; i++) {
      const src = rtBloomA;
      pass(P.blur, rtBloomB, { uTex: 0, uDir: i === 0 ? [1, 0] : [0, 1], uTexel: 1.15 / src.w });
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
      drawMesh(gl, quadMesh); draws++;
      const t = rtBloomA; rtBloomA = rtBloomB; rtBloomB = t;
    }
    // 第二级：四分之一分辨率 H/V（半径再放大 4×，负责"柔光"而不是"糊屏"）
    pass(P.blur, rtBloomC, { uTex: 0, uDir: [1, 0], uTexel: 1.45 / rtBloomC.w });
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtBloomA.tex);
    drawMesh(gl, quadMesh); draws++;
    pass(P.blur, rtScene2, { uTex: 0, uDir: [0, 1], uTexel: 1.45 / rtScene2.h });
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtBloomC.tex);
    drawMesh(gl, quadMesh); draws++;
  }

  // ---- 7a. composite -----------------------------------------------------
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  pass(P.comp, rtLdr, {
    uScene: 0, uBloom1: 1, uBloom2: 2, uTime: time, uRes: [W.srcW, W.srcH],
    uExposure: LOOK.exposure, uBloom: LOOK.bloomInt, uSaturation: LOOK.saturation,
    uContrast: LOOK.contrast, uVignette: 0, uGrain: 0, uFxaa: Q.fxaa ? 1.0 : 0.0,
  });
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtScene.tex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rtBloomA.tex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, rtScene2.tex);
  drawMesh(gl, quadMesh); draws++;

  // ---- 7b. upscale + sharpen --------------------------------------------
  pass(P.up, null, {
    uTex: 0, uSrc: [1 / W.srcW, 1 / W.srcH], uRes: [W.outW, W.outH],
    uSharp: Q.sharpen, uVignette: LOOK.vignette, uGrain: 0.016, uNight: 0,
  });
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtLdr.tex);
  drawMesh(gl, quadMesh); draws++;
  gpuEnd();

  const c1 = performance.now();
  cpuMs = cpuMs * 0.9 + (c1 - c0) * 0.1;
  adaptStep(dtRaw);
  if (FREEZE < 0 && started && bootN >= 0) {
    bootN++;
    if (bootN > 40) { bootSum += dtRaw * 1000; bootM++; }
    if (bootN === 160) {
      const avg = bootSum / Math.max(1, bootM);
      bootN = -1;
      console.log('[main] boot frames 41-160 avg ' + avg.toFixed(1) + ' ms · quality ' + QNAME +
        ' · scene ' + (scenePx / 1e6).toFixed(2) + ' MP / out ' + W.outW + 'x' + W.outH +
        ' · tris ' + world.tris + ' · gpu timer ' + (GPU_TIMER ? 'on' : 'off'));
      if (avg > 52 && QNAME !== 'low') setQuality('low', false);
      else if (avg > 36 && QNAME === 'high') setQuality('mid', false);
    }
  }
  perf.cpuMs = cpuMs;
  perf.drawCalls = draws;
  perf.frames++;
  perf.gpuMs = gpuMs;
  perf.scenePx = scenePx;
  perf.view = cam.viewIndex;
  perf.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
  if (FREEZE < 0 && started) {
    frames++;
    fpsAcc += dtRaw;
    if (fpsAcc > 0.5) {
      if (fpsEl) {
        const gp = GPU_TIMER ? Math.round(gpuMs * 10) / 10 : -1;
        fpsEl.textContent = Math.round(frames / fpsAcc) + ' FPS\n' +
          (gp >= 0 ? gp + ' ms gpu · ' : '') + Math.round(cpuMs * 10) / 10 + ' ms cpu\n' +
          (scenePx / 1e6).toFixed(2) + ' MP 场景 / ' + (W.outW * W.outH / 1e6).toFixed(1) + ' MP 输出';
      }
      frames = 0; fpsAcc = 0;
    }
  }
  window.__astra.ready = true;
  requestAnimationFrame(drawFrame);
}

// ---------------------------------------------------------------- 接线
const staticBB = staticBillboards(gl, ctx.lanterns || []);
const dynBB = new Billboards(gl, 3000);
const instActors = new Map();
for (const a of ctx.dyn) if (a.kind === 'inst' && !instActors.has(a)) instActors.set(a, new InstActor(gl, a.capacity || 256, a.mesh));
function ready() {
  if (startBtn) { startBtn.disabled = false; startBtn.textContent = '坠入星海'; }
  if (loadingEl && (NOUI || params.has('autostart'))) hideLoading(NOUI);
  // Round 15：从 CIELO 画中坠入（?from=easel）时不要再让用户点一次「坠入星海」——
  // 上一秒他已经点过画布了。标题页当作出生字幕淡出，直接落到观景点 0。
  if (FROM === 'easel' && !NOUI && !params.has('autostart')) setTimeout(() => { if (!started) startExperience(); }, 700);
}
function arriveFlash() {
  const el = document.getElementById('arrive');
  if (!el) return;
  el.style.transition = 'none';
  el.style.opacity = '1';
  el.style.transform = 'scale(.35)';
  void el.offsetWidth;   // 强制回流，让下面的过渡从"全白小圆"开始
  el.style.transition = '';
  el.style.opacity = '0';
  el.style.transform = 'scale(2.3)';
}
function startExperience() {
  started = true;
  arriveFlash();
  // 从画里坠入：先站得远、高一点，再过渡到主构图
  cam.setCam([470, 430, 2180], [0, 70, 0], 58);
  setView(0);
  if (cam.transition) cam.transition.dur = 2.9;
  hideLoading();
  hud?.classList.add('show');
  setTimeout(() => hintEl?.classList.add('fade'), 11000);
  if (FROM === 'easel') {
    setTimeout(() => toast('你从画里坠入星鲸环 · 这里是天空鲸的摇篮', 4600), 1400);
    setTimeout(() => toast('R 键 / 左下「回到画中」可以回去', 3200), 7400);
  } else {
    setTimeout(() => toast('WASD 飞行 · 点击画面锁定鼠标 · 空格 自动巡游', 3600), 1600);
    setTimeout(() => toast('1–9 / 0 观景点 · Z X 切换 · V 画质 · R 回到画中', 3600), 6200);
  }
  if (!TOUCH) lockPointer();
  if (TOUCH) touch.hint?.();
}
startBtn?.addEventListener('click', startExperience);
if (NOUI) {
  hideLoading(true);
  hud?.classList.add('show');
  started = true;
}
ready();
requestAnimationFrame(drawFrame);
console.log('[astra] built ' + world.tris + ' tris in ' + buildMs.toFixed(0) + ' ms · ' + world.meshes.length + ' batches · views ' + VIEWS.length);