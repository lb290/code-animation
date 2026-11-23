// Boot, render loop, post-processing, interaction.
import * as S from './shaders.js';
import { createGL, program, setUniforms, mesh, customMesh, drawMesh, quad, makeRT, freeRT } from './gl.js';
import { buildWorld, KOI_PATHS, ISLANDS } from './world.js';
import { buildFish, FISH_STRIDE } from './fish.js';
import { buildMachiya } from './buildings.js';
import { B, grid, rgb, mixc } from './geo.js';
import { C, PRESETS } from './palette.js';
import { Camera, VIEWS } from './camera.js';
import { Billboards, staticBillboards } from './fx.js';
import { m4, mulberry32, clamp, lerp, TAU, norm, sub, add, cross, scale as vs, smoothstep } from './math.js';
import { Ambience } from './audio.js';

// ---------------------------------------------------------------- perf / look constants
// 鱼灯光晕：每条鱼一张极淡的加性暖色 billboard（BILL shape 3 = 软光晕），在场景
// pass 内、bloom 之前绘制；鱼身随后覆盖中心，于是只留下轮廓外的一圈暖光。
// lead 调参与开关都在这几个常数上（URL 还可 ?no=halo 临时关闭）。
const FISH_HALO = {
  on: true,
  radius: 0.92,              // 光晕半径 = 鱼身长 × radius（billboard 直径 ≈ 1.84 × 身长）
  alpha: 0.16,               // 峰值透明度，极淡；0.10–0.24 之间调
  color: [1.0, 0.64, 0.32],  // 线性空间暖金
  forward: 0.35,             // 沿视线朝相机前移（× 身长），避免被鱼身整体遮住
  glowScale: 0.18,           // 每条鱼自身 glow 对 alpha 的增益
};
const BRIGHT_THRESHOLD = 1.02;          // bloom 亮部阈值（0.88 时灯笼糊成大团）
const SKY_LANTERN_COUNT = 96;           // 孔明灯数量（原 240）
const SMALL_FISH_COUNT = 20;            // 小鱼数量（原 26）
const FISH_LOD = { highPx: 54, lowPx: 16 }; // 按屏幕投影高度选 high / low / tiny
const ADAPT = {                         // 自适应分辨率：按实测渲染耗时驱动，不看 rAF 间隔
  min: 0.55, max: 1.0,
  downMs: 24, upMs: 11.5,               // > 24ms 降档（<40fps），< 11.5ms 升档（>60fps 有余量）
  downStep: 0.12, upStep: 0.06,
  downSamples: 2, upSamples: 3,         // 连续采样次数（迟滞）
  sampleEvery: 30,                      // 每 30 帧做一次 gl.finish 采样
  cooldown: 45,                         // 调整后的冷却帧数
  warmup: 120,                          // 启动忽略帧数
};

const canvas = document.getElementById('c');
const gl = createGL(canvas);
gl.disable(gl.CULL_FACE);

const P = {
  lit: program(gl, S.LIT_VS, S.LIT_FS, 'lit'),
  fish: program(gl, S.FISH_VS, S.FISH_FS, 'fish'),
  fishFin: program(gl, S.FISH_VS, S.FISH_FIN_FS, 'fishFin'),
  sky: program(gl, S.SKY_VS, S.SKY_FS, 'sky'),
  cloud: program(gl, S.CLOUD_VS, S.CLOUD_FS, 'cloud'),
  add: program(gl, S.ADD_VS, S.ADD_FS, 'add'),
  bill: program(gl, S.BILL_VS, S.BILL_FS, 'bill'),
  fall: program(gl, S.FALL_VS, S.FALL_FS, 'fall'),
  bright: program(gl, S.POST_VS, S.BRIGHT_FS, 'bright'),
  blur: program(gl, S.POST_VS, S.BLUR_FS, 'blur'),
  comp: program(gl, S.POST_VS, S.COMPOSITE_FS, 'comp'),
  dbg: program(gl, S.LIT_VS, S.DBG_FS, 'dbg'),
};

const state = {
  time: 0,
  frame: 0,
  palette: PRESETS[0],
  presetIndex: 0,
  quality: 1,
  avgMs: 0,      // rAF 间隔 EMA（保留旧字段，兼容 bench；不再用于自适应判断）
  gpuMs: 0,      // 实测整帧耗时（gl.finish 采样：CPU 提交 + GPU）
  cpuMs: 0,      // 提交阶段耗时（不含 finish 等待）
  rafMs: 0,      // rAF 间隔 EMA
  stats: { calls: 0, tris: 0, fish: { hi: 0, lo: 0, tiny: 0, culled: 0, drawn: 0 } },
  paused: false,
  started: false,
  tourHint: false,
};

// ---------------------------------------------------------------- world
const world = buildWorld(gl);

// ---- fish lanterns --------------------------------------------------------
// One shared high-detail mesh for every lantern fish; each fish only differs
// by its transform, its paper seed and its glow.
const FISH_LAYOUT = [
  { loc: 0, size: 3, offset: 0 },  // position
  { loc: 1, size: 3, offset: 3 },  // normal
  { loc: 4, size: 3, offset: 6 },  // (part, u, v)
  { loc: 5, size: 3, offset: 9 },  // (finId, tint, seed)
];
function makeFishMesh(lod) {
  const g = buildFish(7, lod);
  return {
    body: customMesh(gl, g.verts, g.bodyIndices, FISH_LAYOUT, FISH_STRIDE),
    fin: customMesh(gl, g.verts, g.finIndices, FISH_LAYOUT, FISH_STRIDE),
    tris: g.tris,
  };
}
const fishHi = makeFishMesh('high');
const fishLo = makeFishMesh('low');
const fishTiny = makeFishMesh('tiny');
console.log('[fish] hi', JSON.stringify({ body: fishHi.body.count / 3, fin: fishHi.fin.count / 3 }),
  '· lo', JSON.stringify({ body: fishLo.body.count / 3, fin: fishLo.fin.count / 3 }),
  '· tiny', JSON.stringify({ body: fishTiny.body.count / 3, fin: fishTiny.fin.count / 3 }));

// big lantern koi on their long circuits ...
const FISH = KOI_PATHS.map((k, i) => ({
  ...k, seed: (i * 1.7 + 0.31) % 7.0, glow: 1.0 + (i % 3) * 0.10, swim: 0.85 + (i % 4) * 0.10,
}));
// ... and a drift of small lantern fish in between the towers
{
  const rf = mulberry32(9182);
  // 26 -> 20: 半径范围同步收到 20..115（面积比 20/26，场密度基本不变），
  // 前 20 个种子序列完全不变，所以剩下的鱼位置与原来一一对应。
  for (let i = 0; i < SMALL_FISH_COUNT; i++) {
    const r = 20 + Math.pow(rf(), 0.7) * 95;
    const sgn = rf() < 0.5 ? 1 : -1;
    FISH.push({
      cx: (rf() - 0.5) * 24, cz: (rf() - 0.5) * 24, r,
      y: -4 + Math.pow(rf(), 0.8) * 64,
      len: 1.7 + rf() * 2.4,
      speed: sgn * (0.075 + rf() * 0.075), phase: rf() * TAU, dir: 1,
      seed: rf() * 7.0, glow: 0.80 + rf() * 0.34, swim: 0.7 + rf() * 0.5, small: true,
    });
  }
}

// ---- per-frame fish draw state -------------------------------------------------
// Preallocated: the hot loop composes the model matrix directly into these
// buffers instead of building seven temporary Float32Array(16) per fish per
// frame, so the main loop does not allocate (GC shows up as rAF jitter).
const FISH_STATE = FISH.map((k) => ({
  model: new Float32Array(16),
  pos: [0, 0, 0],
  phase: k.phase, len: k.len, seed: k.seed, glow: k.glow, swim: k.swim ?? 1, small: !!k.small,
}));
// model = T(px,py,pz) · Ry(yaw) · Rz(bank) · S(s), written straight into out.
function composeFish(out, px, py, pz, yaw, bank, s) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cb = Math.cos(bank), sb = Math.sin(bank);
  const m = out.model;
  m[0] = cy * cb * s;  m[1] = sb * s;       m[2] = -sy * cb * s; m[3] = 0;
  m[4] = -cy * sb * s; m[5] = cb * s;       m[6] = sy * sb * s;  m[7] = 0;
  m[8] = sy * s;       m[9] = 0;            m[10] = cy * s;      m[11] = 0;
  m[12] = px;          m[13] = py;          m[14] = pz;          m[15] = 1;
  out.pos[0] = px; out.pos[1] = py; out.pos[2] = pz;
}

// cloud sea: a big disc of low-poly waves, displaced again in the vertex shader
const cloudB = new B();
grid(cloudB, 2600, 2600, 72, 72, (x, z) => -152, (x, z) => mixc(C.fog, rgb('#6a789c'), 0.5), [0, 0]);
const cloudMesh = mesh(gl, cloudB.v, cloudB.i);

// sky
const skyQuad = quad(gl);

// static lantern billboards
const lanternBB = staticBillboards(gl, world.lanterns);
const cloudPuffBB = staticBillboards(gl, world.cloudPuffs || []);

// dynamic fields
const embers = new Billboards(gl, 900);
const skyLanterns = new Billboards(gl, SKY_LANTERN_COUNT + 32); // 240 -> 96，buffer 同步缩小
const sparks = new Billboards(gl, 1600);
const fishHalo = new Billboards(gl, FISH.length + 4);           // 一条鱼一张 halo，一次实例化绘制
const DRAW_FISH = Array.from({ length: FISH.length }, () => ({ k: null, mesh: null })); // 复用，不每帧新建

const rng = mulberry32(99);
const emberParts = [];
for (let i = 0; i < 620; i++) {
  const a = rng() * TAU, r = Math.sqrt(rng()) * 78;
  emberParts.push({
    p: [Math.cos(a) * r, 2 + rng() * 42, Math.sin(a) * r],
    v: [(rng() - 0.5) * 1.4, 1.2 + rng() * 2.6, (rng() - 0.5) * 1.4],
    size: 0.1 + rng() * 0.22,
    life: 4 + rng() * 8,
    max: 12,
    col: mixc(rgb('#ffb066'), rgb('#ffe6b0'), rng()),
    phase: rng() * TAU,
  });
}
const skyLanternParts = [];
for (let i = 0; i < SKY_LANTERN_COUNT; i++) {
  const a = rng() * TAU, r = Math.sqrt(rng()) * 70;
  skyLanternParts.push({
    p: [Math.cos(a) * r, 4 + rng() * 26, Math.sin(a) * r],
    v: [(rng() - 0.5) * 0.9, 2.2 + rng() * 2.2, (rng() - 0.5) * 0.9],
    size: 0.55 + rng() * 0.6,
    life: 30 + rng() * 40,
    max: 70,
    col: mixc(C.paper, rgb('#ff8a3c'), rng() * 0.6),
    phase: rng() * TAU,
  });
}
const sparkParts = [];

// ---------------------------------------------------------------- camera
const cam = new Camera();
const params = new URLSearchParams(location.search);
const DBG = params.has('dbg') ? Number(params.get('dbg')) : -1;
const OFF = new Set((params.get('no') || '').split(',').filter(Boolean));
// start on the establishing view unless a view/tour was requested
if (!params.has('view') && !params.has('tour')) cam.setView(0, true);
// ?tune=uRim:0,uKeyInt:0  — override shader uniforms for look development
const TUNE = {};
for (const kv of (params.get('tune') || '').split(',').filter(Boolean)) {
  const i = kv.indexOf(':');
  TUNE[kv.slice(0, i)] = Number(kv.slice(i + 1));
}
if (params.has('view')) cam.setView(Number(params.get('view')) || 0, true);
if (params.has('tour')) cam.startTour();
if (params.has('fov')) cam.fov = Number(params.get('fov'));
const noUI = params.has('noui');
// ?freeze=6.5 pins the clock (deterministic stills); ?cam=x,y,z&look=x,y,z sets the eye
const FREEZE = params.has('freeze') ? Number(params.get('freeze')) : -1;
if (params.has('cam')) {
  const p0 = params.get('cam').split(',').map(Number);
  const lk = (params.get('look') || '0,0,0').split(',').map(Number);
  const d = norm(sub(lk, p0));
  cam.pos = p0;
  cam.yaw = Math.atan2(d[0], d[2]);
  cam.pitch = Math.asin(clamp(d[1], -1, 1));
  cam.fov = params.has('fov') ? Number(params.get('fov')) : 48;
  cam.transition = null;
}
// ?studio=1  — look-development mode: a single lantern fish on black, no city.
// ?angle=<deg> freezes the orbit, ?seed / ?glow / ?swim drive the paper + lamp.
const STUDIO = params.has('studio');
const STUDIO_ANGLE = params.has('angle') ? (Number(params.get('angle')) * Math.PI) / 180 : -1;
const STUDIO_SEED = params.has('seed') ? Number(params.get('seed')) : 0.35;
const STUDIO_GLOW = params.has('glow') ? Number(params.get('glow')) : 1.0;
const STUDIO_SWIM = params.has('swim') ? Number(params.get('swim')) : 1.0;
const STUDIO_DIST = params.has('dist') ? Number(params.get('dist')) : 6.2;
const STUDIO_EYE = params.has('eye') ? Number(params.get('eye')) : 0.55;
const STUDIO_LOOK = (params.get('look') || '0,0,0').split(',').map(Number);
const DRAW = params.get('draw') || 'both'; // both | body | fin — look-dev isolation

// ?lab=1 — 建筑 look-dev：一栋町屋单独放在暗场里，相机绕它转。
// 可配 ?floors=1..3 &detail=0..2 &seed=N &w= &d= &dist= &eye= &angle= &fov=
const LAB = params.has('lab');
const LAB_DETAIL = params.has('detail') ? Number(params.get('detail')) : 2;
const LAB_SEED = params.has('seed') ? Number(params.get('seed')) : 7;
const LAB_DIST = params.has('dist') ? Number(params.get('dist')) : 13;
const LAB_EYE = params.has('eye') ? Number(params.get('eye')) : 2.2;
let labMesh = null;
if (LAB) {
  const lb = new B();
  const lctx = { lanterns: [], points: [], additive: [], beams: [], falls: [] };
  buildMachiya(lb, lctx, mulberry32(LAB_SEED), {
    detail: LAB_DETAIL,
    floors: params.has('floors') ? Number(params.get('floors')) : 2,
    w: params.has('w') ? Number(params.get('w')) : 6.2,
    d: params.has('d') ? Number(params.get('d')) : 5.2,
  });
  labMesh = mesh(gl, lb.v, lb.i);
  console.log('[lab] tris', lb.triCount, 'verts', lb.v.length / 11);
}

// ---------------------------------------------------------------- perf diagnostics
// ?perf=1 打开左下角诊断覆盖层；同一份数据通过 __sky.perf 暴露（snapshot）。
// 正常 HUD 保持两行中文，不显示渲染器字符串。
const PERF = params.has('perf');
const glInfo = (() => {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const vendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '') : '';
  const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
  const software = /swiftshader|llvmpipe|subzero|software|basic render/i.test(renderer + ' ' + vendor);
  return { vendor, renderer, software, hwAccel: !software };
})();
const PERF_STATE = {
  adaptive: !(params.has('adapt') && params.get('adapt') === '0'),
  raf: new Float32Array(180), rafI: 0, rafN: 0,
  displayHz: 0,
  downStreak: 0, upStreak: 0, lastChange: -1e9,
  samples: 0,
  el: null,
};
if (params.has('q')) state.quality = clamp(Number(params.get('q')) || 1, ADAPT.min, ADAPT.max);
if (PERF) {
  const el = document.createElement('div');
  el.id = 'perf-overlay';
  el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:30;pointer-events:none;' +
    'font:11px/1.62 ui-monospace,Menlo,Consolas,monospace;color:#d3e2f7;background:rgba(6,10,20,.74);' +
    'border:1px solid rgba(120,160,220,.30);border-radius:3px;padding:8px 11px;white-space:pre;' +
    'letter-spacing:.02em;text-shadow:0 1px 2px rgba(0,0,0,.9)';
  document.body.appendChild(el);
  PERF_STATE.el = el;
}

// ---------------------------------------------------------------- render targets
let sceneRT = null, brightRT = null, blurA = null, blurB = null, blurC = null, blurD = null, blurE = null, blurF = null;
let W = 1, H = 1, RW = 1, RH = 1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * state.quality;
  const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  if (w === W && h === H) return;
  W = canvas.width = w;
  H = canvas.height = h;
  RW = Math.floor(w * 0.75);
  RH = Math.floor(h * 0.75);
  for (const rt of [sceneRT, brightRT, blurA, blurB, blurC, blurD, blurE, blurF]) if (rt) freeRT(gl, rt);
  sceneRT = makeRT(gl, RW, RH, { depth: true });
  brightRT = makeRT(gl, Math.floor(RW / 2), Math.floor(RH / 2));
  blurA = makeRT(gl, Math.floor(RW / 2), Math.floor(RH / 2));
  blurB = makeRT(gl, Math.floor(RW / 2), Math.floor(RH / 2));
  blurC = makeRT(gl, Math.floor(RW / 4), Math.floor(RH / 4));
  blurD = makeRT(gl, Math.floor(RW / 4), Math.floor(RH / 4));
  blurE = makeRT(gl, Math.floor(RW / 8), Math.floor(RH / 8));
  blurF = makeRT(gl, Math.floor(RW / 8), Math.floor(RH / 8));
}

function pass(prog, target, uniforms) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  gl.viewport(0, 0, target ? target.w : W, target ? target.h : H);
  gl.useProgram(prog.program);
  setUniforms(gl, prog, uniforms);
  drawMesh(gl, skyQuad);
}

// ---------------------------------------------------------------- frame helpers
// 无分配 top-K：替换每帧 fish/city 灯的 filter().map().sort().slice()。
function nearestK(list, k, posOf, idxOut, dOut) {
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = posOf(list[i]);
    if (!p) continue;
    const dx = p[0] - cam.pos[0], dy = p[1] - cam.pos[1], dz = p[2] - cam.pos[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (n === k && d >= dOut[k - 1]) continue;
    let j = n < k ? n : k - 1;
    while (j > 0 && dOut[j - 1] > d) { dOut[j] = dOut[j - 1]; idxOut[j] = idxOut[j - 1]; j--; }
    dOut[j] = d; idxOut[j] = i;
    if (n < k) n++;
  }
  return n;
}

// 视锥 6 平面（世界空间，法线朝内），从 proj·view 提取。
const FRUSTUM = new Float32Array(24);
const PV = new Float32Array(16);
function makeFrustum() {
  m4.mul(proj, view, PV);
  const M = PV, f = FRUSTUM;
  const rows = [
    [M[0], M[4], M[8], M[12]],
    [M[1], M[5], M[9], M[13]],
    [M[2], M[6], M[10], M[14]],
    [M[3], M[7], M[11], M[15]],
  ];
  const put = (o, a, s) => {
    let x = rows[3][0] + s * rows[a][0], y = rows[3][1] + s * rows[a][1];
    let z = rows[3][2] + s * rows[a][2], w = rows[3][3] + s * rows[a][3];
    const l = Math.hypot(x, y, z) || 1;
    f[o] = x / l; f[o + 1] = y / l; f[o + 2] = z / l; f[o + 3] = w / l;
  };
  put(0, 0, 1); put(4, 0, -1); put(8, 1, 1); put(12, 1, -1); put(16, 2, 1); put(20, 2, -1);
}
function sphereVisible(x, y, z, r) {
  const f = FRUSTUM;
  for (let o = 0; o < 24; o += 4) {
    if (f[o] * x + f[o + 1] * y + f[o + 2] * z + f[o + 3] < -r) return false;
  }
  return true;
}

// 显示刷新率估计：把 180 帧 rAF 间隔按常见 Hz 分桶，取占比最高者。
const HZ_CANDIDATES = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
function estimateHz() {
  const n = PERF_STATE.rafN, arr = PERF_STATE.raf;
  if (n < 30) return PERF_STATE.displayHz;
  let best = 0, bestScore = 0;
  for (const hz of HZ_CANDIDATES) {
    const exp = 1000 / hz, tol = exp * 0.09;
    let score = 0;
    for (let i = 0; i < n; i++) { if (Math.abs(arr[i] - exp) <= tol) score++; }
    if (score > bestScore) { bestScore = score; best = hz; }
  }
  if (best && bestScore >= n * 0.25) PERF_STATE.displayHz = best;
  return PERF_STATE.displayHz;
}

// 真实渲染成本：硬件 GPU 上 gl.finish 可信；软件渲染（SwiftShader）里 finish
// 往往只 flush 命令缓冲、测不到光栅化时间，此时用 rAF 间隔兜底。
function renderCostMs() {
  if (!glInfo.software) return state.gpuMs;
  return Math.max(state.gpuMs, (state.rafMs || 0) * 0.9);
}
function adaptQuality() {
  if (!PERF_STATE.adaptive) return;
  if (state.frame < ADAPT.warmup || document.hidden) return;
  if (state.frame - PERF_STATE.lastChange < ADAPT.cooldown) return;
  const ms = renderCostMs();
  if (!ms) return;
  if (ms > ADAPT.downMs) {
    PERF_STATE.upStreak = 0;
    if (++PERF_STATE.downStreak >= ADAPT.downSamples && state.quality > ADAPT.min + 1e-3) {
      state.quality = Math.max(ADAPT.min, state.quality - ADAPT.downStep);
      resize();
      PERF_STATE.downStreak = 0;
      PERF_STATE.lastChange = state.frame;
    }
  } else if (ms < ADAPT.upMs) {
    PERF_STATE.downStreak = 0;
    if (++PERF_STATE.upStreak >= ADAPT.upSamples && state.quality < ADAPT.max - 1e-3) {
      state.quality = Math.min(ADAPT.max, state.quality + ADAPT.upStep);
      resize();
      PERF_STATE.upStreak = 0;
      PERF_STATE.lastChange = state.frame;
    }
  } else {
    PERF_STATE.downStreak = 0;
    PERF_STATE.upStreak = 0;
  }
}

function perfVerdict() {
  const hz = PERF_STATE.displayHz;
  const budget = hz ? 1000 / hz : 16.7;
  const fps = 1000 / Math.max(1, state.rafMs);
  const cost = renderCostMs();
  const cheap = cost > 0 && cost < budget * 0.5;
  // 30Hz 左右的 rAF 本身就像串流/垂直同步封顶（即使 fps 已经等于这个 30Hz）
  const halfRate = hz > 0 && hz <= 31 && cheap;
  const capped = hz > 0 && fps < hz * 0.85 && cheap;
  const gpuBound = cost > budget * 0.8;
  return { budget, fps, capped: capped || halfRate, halfRate, gpuBound, costMs: +cost.toFixed(2) };
}

function updateHud() {
  if (!ui.fps) return;
  const { fps } = perfVerdict();
  const s = state.stats;
  ui.fps.textContent =
    `${Math.round(fps)} FPS · ${W}×${H} · ${(s.tris / 1000).toFixed(0)}k tris · ${s.calls} calls\n` +
    `GPU ${state.gpuMs.toFixed(1)}ms · 倍率 ${Math.round(state.quality * 100)}% · ${glInfo.software ? '软件渲染' : '硬件加速'}`;
}

function updateOverlay() {
  const el = PERF_STATE.el;
  if (!el) return;
  const { budget, fps, capped, halfRate, gpuBound } = perfVerdict();
  const s = state.stats;
  const hz = PERF_STATE.displayHz;
  const limit = halfRate
    ? `帧率被显示链路封顶在 ${hz}Hz（场景只花 ${state.gpuMs.toFixed(1)}/${budget.toFixed(1)}ms，瓶颈不在渲染）`
    : capped
    ? `帧率被垂直同步/串流封顶（显示 ${hz}Hz，场景只花 ${state.gpuMs.toFixed(1)}/${budget.toFixed(1)}ms）`
    : gpuBound
      ? `GPU 受限（${state.gpuMs.toFixed(1)}ms / 每帧预算 ${budget.toFixed(1)}ms）`
      : 'GPU 余量充足';
  el.textContent = [
    `CELESTIA · perf${PERF_STATE.adaptive ? '' : '（自适应已关）'}`,
    `GPU   ${glInfo.renderer || '?'}`,
    `显示  ${hz || '?'}Hz · rAF ${fps.toFixed(1)}fps（${state.rafMs.toFixed(1)}ms）· 实测整帧 ${state.gpuMs.toFixed(2)}ms（CPU 提交 ${state.cpuMs.toFixed(2)}ms）· 判定用 ${renderCostMs().toFixed(2)}ms`,
    `画布  ${W}×${H} · 渲染倍率 ${Math.round(state.quality * 100)}% · 场景 RT ${RW}×${RH}`,
    `绘制  ${s.calls} calls · ${(s.tris / 1000).toFixed(1)}k tris · 鱼 ${s.fish.drawn}（hi ${s.fish.hi} / lo ${s.fish.lo} / tiny ${s.fish.tiny} / 剔除 ${s.fish.culled}）`,
    `判断  ${glInfo.software ? '软件渲染（SwiftShader/CPU）' : '硬件加速'} · ${limit}`,
    '参数  ?perf=1 · ?q=0.55..1 锁倍率 · ?adapt=0 关自适应 · ?no=halo 关光晕',
  ].join('\n');
}

// ---------------------------------------------------------------- per-frame data
const MOON = norm([0.34, 0.30, -0.89]);
const cityPoints = world.points;
let lightScratch = new Float32Array(32);
let lightColScratch = new Float32Array(32);
const NEAR_FISH_IDX = new Int32Array(8), NEAR_FISH_D = new Float32Array(8);
const NEAR_CITY_IDX = new Int32Array(8), NEAR_CITY_D = new Float32Array(8);

const STUDIO_FISH = {
  model: new Float32Array(16), pos: [0, 0, 0],
  phase: 0.7, len: 5.1, seed: STUDIO_SEED, glow: STUDIO_GLOW, swim: STUDIO_SWIM, small: false,
};
const STUDIO_LIST = [STUDIO_FISH];

function fishState(t) {
  if (STUDIO) {
    composeFish(STUDIO_FISH, 0, 0, 0, 0.62, Math.sin(t * 0.4) * 0.06, 3.0);
    return STUDIO_LIST;
  }
  for (let i = 0; i < FISH.length; i++) {
    const k = FISH[i], o = FISH_STATE[i];
    const a = k.phase + t * k.speed * k.dir;
    const px = k.cx + Math.cos(a) * k.r;
    const pz = k.cz + Math.sin(a) * k.r;
    const bob = k.small ? 1.3 : 2.4;
    const py = k.y + Math.sin(t * (k.small ? 0.62 : 0.42) + k.phase) * bob;
    const sg = k.speed >= 0 ? 1 : -1;
    const yaw = Math.atan2(-Math.sin(a) * sg, Math.cos(a) * sg);
    const bank = Math.sin(t * 0.5 + k.phase) * (k.small ? 0.22 : 0.12);
    composeFish(o, px, py, pz, yaw, bank, k.len / 1.7);
  }
  return FISH_STATE;
}

function updateParticles(dt, t) {
  // embers
  for (const p of emberParts) {
    p.life -= dt;
    if (p.life <= 0) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * 80;
      p.p = [Math.cos(a) * r, 1 + rng() * 8, Math.sin(a) * r];
      p.life = p.max;
    }
    p.p[0] += (p.v[0] + Math.sin(t * 0.7 + p.phase) * 0.7) * dt;
    p.p[1] += p.v[1] * dt;
    p.p[2] += (p.v[2] + Math.cos(t * 0.6 + p.phase) * 0.7) * dt;
  }
  // sky lanterns
  for (const p of skyLanternParts) {
    p.life -= dt;
    if (p.life <= 0 || p.p[1] > 190) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * 72;
      p.p = [Math.cos(a) * r, 2 + rng() * 6, Math.sin(a) * r];
      p.life = p.max;
    }
    p.p[0] += (p.v[0] + Math.sin(t * 0.25 + p.phase) * 0.5) * dt;
    p.p[1] += p.v[1] * dt;
    p.p[2] += (p.v[2] + Math.cos(t * 0.22 + p.phase) * 0.5) * dt;
  }
  // fireworks
  if (Math.floor(t / 5.5) !== Math.floor((t - dt) / 5.5) && sparkParts.length < 1400) {
    const a = rng() * TAU;
    const dist = 300 + rng() * 420;
    const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist, cy = 30 + rng() * 90;
    const hue = rng();
    const base = hue < 0.4 ? rgb('#ffb050') : hue < 0.7 ? rgb('#ff5a6a') : hue < 0.9 ? rgb('#8fd8ff') : rgb('#ffe8a0');
    const n = 70 + Math.floor(rng() * 50);
    for (let i = 0; i < n; i++) {
      const th = rng() * TAU, ph = Math.acos(2 * rng() - 1);
      const sp = 12 + rng() * 16;
      sparkParts.push({
        p: [cx, cy, cz],
        v: [Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp],
        size: 0.5 + rng() * 0.9,
        life: 1.4 + rng() * 1.2,
        max: 2.6,
        col: mixc(base, rgb('#ffffff'), rng() * 0.35),
        shape: 0,
      });
    }
  }
  for (let i = sparkParts.length - 1; i >= 0; i--) {
    const p = sparkParts[i];
    p.life -= dt;
    if (p.life <= 0) {
      sparkParts.splice(i, 1);
      continue;
    }
    p.v[1] -= 9.8 * dt * 1.4;
    p.v[0] *= 1 - 0.9 * dt;
    p.v[1] *= 1 - 0.55 * dt;
    p.v[2] *= 1 - 0.9 * dt;
    p.p[0] += p.v[0] * dt;
    p.p[1] += p.v[1] * dt;
    p.p[2] += p.v[2] * dt;
  }
}

function fillBillboards(bb, parts, t) {
  bb.begin();
  for (const p of parts) {
    const fade = Math.min(1, p.life / 1.2);
    const flick = 0.85 + 0.15 * Math.sin(t * 6 + p.phase * 3);
    bb.add(p.p[0], p.p[1], p.p[2], p.size, p.phase || 0, fade * flick, p.shape ?? 0, p.col);
  }
  bb.upload();
}

// ---------------------------------------------------------------- frame
const proj = new Float32Array(16);
const view = new Float32Array(16);
const t0 = performance.now();
let last = t0;

function frame(now) {
  const frameStart = performance.now();
  const rafDelta = Math.max(0, now - last);
  const dt = Math.max(0, Math.min(0.05, rafDelta / 1000));
  last = now;
  let drawCalls = 0, drawTris = 0;   // 本帧绘制调用 / 三角形，供 HUD、?perf 与报告使用
  state.time += dt;
  if (FREEZE >= 0) state.time = FREEZE;
  state.frame++;
  const t = state.time;

  resize();
  cam.update(dt);
  if (STUDIO) {
    const ang = STUDIO_ANGLE >= 0 ? STUDIO_ANGLE : t * 0.16;
    cam.pos = [
      STUDIO_LOOK[0] + Math.sin(ang) * STUDIO_DIST,
      STUDIO_LOOK[1] + STUDIO_EYE,
      STUDIO_LOOK[2] + Math.cos(ang) * STUDIO_DIST,
    ];
    const dl = Math.hypot(STUDIO_LOOK[0] - cam.pos[0], STUDIO_LOOK[1] - cam.pos[1], STUDIO_LOOK[2] - cam.pos[2]);
    cam.yaw = Math.atan2((STUDIO_LOOK[0] - cam.pos[0]) / dl, (STUDIO_LOOK[2] - cam.pos[2]) / dl);
    cam.pitch = Math.asin((STUDIO_LOOK[1] - cam.pos[1]) / dl);
    cam.fov = 42;
    cam.transition = null;
  } else if (LAB) {
    const ang = STUDIO_ANGLE >= 0 ? STUDIO_ANGLE : t * 0.10;
    const look = [0, 4.0, 0];
    cam.pos = [Math.sin(ang) * LAB_DIST, LAB_EYE, Math.cos(ang) * LAB_DIST];
    const dl = Math.hypot(look[0] - cam.pos[0], look[1] - cam.pos[1], look[2] - cam.pos[2]);
    cam.yaw = Math.atan2((look[0] - cam.pos[0]) / dl, (look[2] - cam.pos[2]) / dl);
    cam.pitch = Math.asin((look[1] - cam.pos[1]) / dl);
    cam.fov = params.has('fov') ? Number(params.get('fov')) : 50;
    cam.transition = null;
  }

  // camera basis + matrices
  const { f, r, u } = cam.basis();
  const pm = m4.perspective((cam.fov * Math.PI) / 180, W / H, 0.6, 4200);
  const vm = cam.viewMatrix();
  proj.set(pm);
  view.set(vm);
  const camPos = cam.pos;
  const tanFov = Math.tan((cam.fov * Math.PI) / 360);
  const pal = state.palette;

  const fishes = LAB ? [] : fishState(t);

  // ---- point lights: the 5 nearest lantern fish + 3 nearest city lanterns
  // 无分配 top-K：替换原来每帧 filter().map().sort().slice() 的临时数组与排序。
  lightScratch.fill(0);
  lightColScratch.fill(0);
  let li = 0;
  if (!STUDIO) {
    const nf = nearestK(fishes, 5, (k) => k.pos, NEAR_FISH_IDX, NEAR_FISH_D);
    for (let i = 0; i < nf; i++) {
      const k = fishes[NEAR_FISH_IDX[i]];
      const s = k.len * 1.05;
      const g = k.glow;
      lightScratch.set([k.pos[0], k.pos[1], k.pos[2], s], li * 4);
      lightColScratch.set([C.koiGold[0] * 1.30 * g, C.koiGold[1] * 0.92 * g, C.koiGold[2] * 0.60 * g, 2.6], li * 4);
      li++;
    }
  }
  const ncity = STUDIO ? 0 : nearestK(cityPoints, 3, (p) => p.p, NEAR_CITY_IDX, NEAR_CITY_D);
  for (let i = 0; i < ncity; i++) {
    const p = cityPoints[NEAR_CITY_IDX[i]];
    if (li >= 8) break;
    lightScratch.set([p.p[0], p.p[1], p.p[2], p.range], li * 4);
    lightColScratch.set([p.col[0], p.col[1], p.col[2], p.int], li * 4);
    li++;
  }

  if (LAB) {
    li = 0;
    lightScratch.set([-2.8, 2.4, 3.6, 9], 0); lightColScratch.set([1.0, 0.60, 0.28, 1.15], 0); li++;
    lightScratch.set([3.2, 3.8, 4.4, 12], 4); lightColScratch.set([1.0, 0.68, 0.36, 0.8], 4); li++;
    lightScratch.set([0, 1.1, 6.5, 15], 8); lightColScratch.set([1.0, 0.48, 0.20, 0.5], 8); li++;
  }

  const common = {
    uProj: proj, uView: view, uCamPos: camPos, uTime: t,
    uKeyDir: MOON, uKeyColor: pal.key, uKeyInt: pal.keyInt,
    uSkyColor: pal.skyAmb, uGroundColor: pal.groundAmb,
    uCityPos: [0, 18, 0], uCityColor: pal.city, uCityRadius: 210,
    uFogColor: pal.fog, uFogDensity: pal.fogDensity, uFogHeight: 0,
    uRimColor: pal.rim, uRim: 0.4,
  };

  // ---- scene pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneRT.fbo);
  gl.viewport(0, 0, RW, RH);
  // unbind the previous frame's textures to avoid a feedback loop
  for (let i = 0; i < 4; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  gl.clearColor(0.02, 0.03, 0.06, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  // sky
  if (!LAB) {
  gl.depthMask(false);
  gl.disable(gl.BLEND);
  gl.useProgram(P.sky.program);
  setUniforms(gl, P.sky, {
    uCamPos: camPos, uRight: r, uUp: u, uFwd: f, uTanFov: tanFov, uAspect: W / H,
    uZenith: pal.zenith, uHorizon: pal.horizon, uHaze: pal.haze, uGlow: pal.glow,
    uSunDir: MOON, uSunColor: pal.moon, uMoonDir: MOON, uMoonColor: pal.moonColor,
    uTime: t, uStars: pal.stars,
  });
  drawMesh(gl, skyQuad);
  drawCalls++; drawTris += 2;
  gl.depthMask(true);
  }

  if (!STUDIO && !LAB) {
  // cloud sea
  if (!OFF.has('cloud') && !OFF.has('world')) {
  gl.useProgram(P.cloud.program);
  setUniforms(gl, P.cloud, {
    ...common, uAmp: 18, uMoonColor: pal.moonColor, uMoonDir: MOON,
    uFogColor: mixc(pal.horizon, pal.haze, 0.55), uGlow: pal.glow,
  });
  gl.bindVertexArray(cloudMesh.vao);
  gl.drawElements(gl.TRIANGLES, cloudMesh.count, gl.UNSIGNED_INT, 0);
  drawCalls++; drawTris += cloudMesh.count / 3;
  }

  // opaque world
  const litProg = DBG >= 0 ? P.dbg : P.lit;
  gl.useProgram(litProg.program);
  setUniforms(gl, litProg, {
    ...common, uModel: m4.identity(), uSway: 0, uSwayOrigin: [0, 0, 0],
    uLPos: lightScratch, uLCol: lightColScratch,
    uAmbMul: 1, uCityMul: 1, uPointMul: 1, uSpecMul: 1, ...TUNE,
  });
  if (DBG >= 0) gl.uniform1i(litProg.uniforms.uMode, DBG);
  if (!OFF.has('static')) {
  gl.bindVertexArray(world.staticMesh.vao);
  gl.drawElements(gl.TRIANGLES, world.staticMesh.count, gl.UNSIGNED_INT, 0);
  drawCalls++; drawTris += world.staticMesh.count / 3;
  }
  }

  // lab stage: a single machiya, no sky, no town
  if (LAB) {
    gl.useProgram(P.lit.program);
    setUniforms(gl, P.lit, {
      ...common, uModel: m4.identity(), uSway: 0, uSwayOrigin: [0, 0, 0],
      uLPos: lightScratch, uLCol: lightColScratch,
      uAmbMul: 0.85, uCityMul: 0.42, uPointMul: 1.15, uSpecMul: 1, ...TUNE,
    });
    gl.bindVertexArray(labMesh.vao);
    gl.drawElements(gl.TRIANGLES, labMesh.count, gl.UNSIGNED_INT, 0);
    drawCalls++; drawTris += labMesh.count / 3;
  }

  // ---- fish lanterns
  // Opaque paper body first, then the silk fins as an additive pass so they
  // read as light shining through a membrane and need no depth sorting.
  // 距离 LOD（high/low/tiny）+ 视锥剔除：两遍绘制共用同一份可见鱼列表。
  const fishBase = {
    ...common,
    uBulb: [-0.01, -0.045, 0.055],
    uLPos: lightScratch, uLCol: lightColScratch,
    uCityColor: STUDIO ? [0, 0, 0] : pal.city,
  };
  makeFrustum();
  const fishStats = state.stats.fish;
  fishStats.hi = 0; fishStats.lo = 0; fishStats.tiny = 0; fishStats.culled = 0;
  let drawFishN = 0;
  for (const k of fishes) {
    if (!STUDIO && !sphereVisible(k.pos[0], k.pos[1], k.pos[2], k.len * 0.80)) {
      fishStats.culled++;
      continue;
    }
    let mesh;
    if (STUDIO) mesh = fishHi;
    else {
      const dx = k.pos[0] - camPos[0], dy = k.pos[1] - camPos[1], dz = k.pos[2] - camPos[2];
      const dist = Math.hypot(dx, dy, dz) || 1;
      // 鱼身投影高度（像素）：世界直径 ≈ 1.7 × 身长
      const px = (k.len * 1.7 * H) / (2 * dist * tanFov);
      if (px >= FISH_LOD.highPx) { mesh = fishHi; fishStats.hi++; }
      else if (px >= FISH_LOD.lowPx) { mesh = fishLo; fishStats.lo++; }
      else { mesh = fishTiny; fishStats.tiny++; }
    }
    const slot = DRAW_FISH[drawFishN++];
    slot.k = k; slot.mesh = mesh;
  }
  fishStats.drawn = drawFishN;

  // 鱼灯光晕：加性、不写深度地先画，鱼身随后覆盖中心，只留轮廓外一圈暖光。
  if (FISH_HALO.on && !OFF.has('halo') && drawFishN) {
    fishHalo.begin();
    for (let i = 0; i < drawFishN; i++) {
      const k = DRAW_FISH[i].k;
      const dx = camPos[0] - k.pos[0], dy = camPos[1] - k.pos[1], dz = camPos[2] - k.pos[2];
      const dl = Math.hypot(dx, dy, dz) || 1;
      const sh = k.len * FISH_HALO.forward;
      fishHalo.add(
        k.pos[0] + (dx / dl) * sh, k.pos[1] + (dy / dl) * sh, k.pos[2] + (dz / dl) * sh,
        k.len * FISH_HALO.radius, 0,
        FISH_HALO.alpha * (k.glow ?? 1) * (1 + FISH_HALO.glowScale * (k.glow ?? 1)),
        3, FISH_HALO.color
      );
    }
    fishHalo.upload();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(P.bill.program);
    setUniforms(gl, P.bill, { uProj: proj, uView: view, uCamPos: camPos, uTime: t, uUp: 1 });
    drawMesh(gl, fishHalo.m);
    drawCalls++; drawTris += drawFishN * 2;
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  if (DRAW !== 'fin') {
  gl.useProgram(P.fish.program);
  // 公共 uniform（矩阵/光照/颜色…）每条鱼只设一次，循环里只改 5 个 per-fish uniform
  setUniforms(gl, P.fish, { ...fishBase, uModel: m4.identity(), uPhase: 0, uSeed: 0, uGlow: 1, uSwim: 1 });
  for (let i = 0; i < drawFishN; i++) {
    const { k, mesh } = DRAW_FISH[i];
    setUniforms(gl, P.fish, { uModel: k.model, uPhase: k.phase, uSeed: k.seed, uGlow: k.glow, uSwim: k.swim });
    gl.bindVertexArray(mesh.body.vao);
    gl.drawElements(gl.TRIANGLES, mesh.body.count, gl.UNSIGNED_INT, 0);
    drawCalls++; drawTris += mesh.body.count / 3;
  }
  }
  if (DRAW !== 'body') {
  gl.enable(gl.BLEND);
  // premultiplied "luminous silk": the membrane both glows and veils what is
  // behind it, so it never washes out to grey over a bright sky
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.useProgram(P.fishFin.program);
  setUniforms(gl, P.fishFin, { ...fishBase, uModel: m4.identity(), uPhase: 0, uSeed: 0, uGlow: 1, uSwim: 1 });
  for (let i = 0; i < drawFishN; i++) {
    const { k, mesh } = DRAW_FISH[i];
    setUniforms(gl, P.fishFin, { uModel: k.model, uPhase: k.phase, uSeed: k.seed, uGlow: k.glow, uSwim: k.swim });
    gl.bindVertexArray(mesh.fin.vao);
    gl.drawElements(gl.TRIANGLES, mesh.fin.count, gl.UNSIGNED_INT, 0);
    drawCalls++; drawTris += mesh.fin.count / 3;
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  }

  if (!STUDIO && !LAB) {
  // waterfalls (blended)
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.useProgram(P.fall.program);
  setUniforms(gl, P.fall, { uProj: proj, uView: view, uTime: t, uCamPos: camPos, uMoonColor: pal.moonColor, uCityColor: pal.city, uSeed: 0 });
  if (!OFF.has('fall') && !OFF.has('world')) {
  gl.bindVertexArray(world.fallMesh.vao);
  gl.drawElements(gl.TRIANGLES, world.fallMesh.count, gl.UNSIGNED_INT, 0);
  drawCalls++; drawTris += world.fallMesh.count / 3;
  }

  // cumulus puffs (alpha blended, before the additive glows)
  if (!OFF.has('puff') && !OFF.has('bb')) {
  gl.useProgram(P.bill.program);
  setUniforms(gl, P.bill, { uProj: proj, uView: view, uCamPos: camPos, uTime: t, uUp: 0 });
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(cloudPuffBB.m.vao);
  gl.drawElementsInstanced(gl.TRIANGLES, cloudPuffBB.m.count, gl.UNSIGNED_INT, 0, cloudPuffBB.m.instances);
  drawCalls++; drawTris += cloudPuffBB.m.instances * (cloudPuffBB.m.count / 3);
  }

  // additive glows
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(P.add.program);
  setUniforms(gl, P.add, { uProj: proj, uView: view, uModel: m4.identity(), uCamPos: camPos, uTime: t, uSoft: 0.85 });
  gl.bindVertexArray(world.addMesh.vao);
  gl.drawElements(gl.TRIANGLES, world.addMesh.count, gl.UNSIGNED_INT, 0);
  drawCalls++; drawTris += world.addMesh.count / 3;

  // billboards
  if (!OFF.has('bb')) {
  gl.useProgram(P.bill.program);
  setUniforms(gl, P.bill, { uProj: proj, uView: view, uCamPos: camPos, uTime: t, uUp: 1 });
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.bindVertexArray(lanternBB.m.vao);
  gl.drawElementsInstanced(gl.TRIANGLES, lanternBB.m.count, gl.UNSIGNED_INT, 0, lanternBB.m.instances);
  drawCalls++; drawTris += lanternBB.m.instances * (lanternBB.m.count / 3);

  updateParticles(dt, t);
  fillBillboards(embers, emberParts, t);
  fillBillboards(skyLanterns, skyLanternParts, t);
  fillBillboards(sparks, sparkParts, t);
  for (const bb of [embers, skyLanterns, sparks]) {
    gl.bindVertexArray(bb.m.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, bb.m.count, gl.UNSIGNED_INT, 0, bb.m.instances);
    drawCalls++; drawTris += bb.m.instances * (bb.m.count / 3);
  }
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  }

  // ---- bloom
  gl.disable(gl.DEPTH_TEST);
  const bloomScale = OFF.has('bloom') ? 0 : pal.bloom;
  const bindTex = (unit, tex) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  };
  bindTex(0, sceneRT.tex);
  pass(P.bright, brightRT, { uTex: 0, uThreshold: BRIGHT_THRESHOLD, uKnee: 0.5 });
  const bw = brightRT.w, bh = brightRT.h;
  bindTex(0, brightRT.tex);
  pass(P.blur, blurA, { uTex: 0, uDir: [1, 0], uTexel: 1 / bw });
  bindTex(0, blurA.tex);
  pass(P.blur, blurB, { uTex: 0, uDir: [0, 1], uTexel: 1 / bh });
  bindTex(0, blurB.tex);
  pass(P.blur, blurC, { uTex: 0, uDir: [1, 0], uTexel: 2 / bw });
  bindTex(0, blurC.tex);
  pass(P.blur, blurD, { uTex: 0, uDir: [0, 1], uTexel: 2 / bh });
  bindTex(0, blurD.tex);
  pass(P.blur, blurE, { uTex: 0, uDir: [1, 0], uTexel: 4 / bw });
  bindTex(0, blurE.tex);
  pass(P.blur, blurF, { uTex: 0, uDir: [0, 1], uTexel: 4 / bh });

  // ---- composite
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.useProgram(P.comp.program);
  bindTex(0, sceneRT.tex);
  bindTex(1, blurB.tex);
  bindTex(2, blurD.tex);
  bindTex(3, blurF.tex);
  setUniforms(gl, P.comp, {
    uScene: 0, uBloom1: 1, uBloom2: 2, uBloom3: 3,
    uTime: t, uRes: [W, H], uExposure: pal.exposure,
    uLift: pal.lift, uGain: pal.gain,
    uVignette: 0.5, uGrain: 0.028, uCA: 0.7, uBloom: bloomScale, uSaturation: pal.saturation,
  });
  drawMesh(gl, skyQuad);
  drawCalls += 9; drawTris += 18;   // bright + 6 × blur + composite（全屏三角形 / 四边形）

  state.frameMs = dt * 1000;
  state.stats.calls = drawCalls;
  state.stats.tris = drawTris;

  // ---- 实测整帧耗时采样（gl.finish，每 ADAPT.sampleEvery 帧一次）+ HUD/覆盖层
  const cpuEnd = performance.now();
  if (PERF_STATE.adaptive || PERF) {
    if (state.frame % ADAPT.sampleEvery === 0) {
      gl.finish();
      const renderMs = performance.now() - frameStart;
      const submitMs = cpuEnd - frameStart;
      state.gpuMs = state.gpuMs ? state.gpuMs * 0.7 + renderMs * 0.3 : renderMs;
      state.cpuMs = state.cpuMs ? state.cpuMs * 0.7 + submitMs * 0.3 : submitMs;
      PERF_STATE.samples++;
      adaptQuality();
    }
  }
  if (rafDelta > 0) {
    PERF_STATE.raf[PERF_STATE.rafI] = rafDelta;
    PERF_STATE.rafI = (PERF_STATE.rafI + 1) % PERF_STATE.raf.length;
    if (PERF_STATE.rafN < PERF_STATE.raf.length) PERF_STATE.rafN++;
    state.rafMs = state.rafMs ? state.rafMs * 0.9 + rafDelta * 0.1 : rafDelta;
    state.avgMs = state.rafMs;   // 兼容旧字段
    if (PERF_STATE.rafN >= 30) estimateHz();
  }
  if (state.frame % 15 === 0) updateHud();
  if (PERF_STATE.el && state.frame % 10 === 0) updateOverlay();

  if (state.started) requestAnimationFrame(frame);
  else requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- input & UI
const ui = {
  loading: document.getElementById('loading'),
  start: document.getElementById('start'),
  hud: document.getElementById('hud'),
  help: document.getElementById('help'),
  fps: document.getElementById('fps'),
  toast: document.getElementById('toast'),
  letterbox: document.getElementById('letterbox'),
};

function toast(msg, ms = 2200) {
  if (!ui.toast) return;
  ui.toast.textContent = msg;
  ui.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => ui.toast.classList.remove('show'), ms);
}

let audio = null;
function startExperience() {
  state.started = true;
  if (ui.loading) ui.loading.classList.add('hidden');
  if (ui.hud) ui.hud.classList.add('show');
  try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (e) { /* 无用户手势时忽略 */ }
  if (!audio) {
    audio = new Ambience();
    audio.start();
  }
  toast('WASD 飞行 · 鼠标环视 · 空格自动巡游 · 1-7 观景点', 4200);
}

if (ui.start) ui.start.addEventListener('click', startExperience);
canvas.addEventListener('click', () => {
  if (!state.started) return startExperience();
  if (document.pointerLockElement !== canvas) {
    try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (e) { /* ignore */ }
  }
});
document.addEventListener('pointerlockchange', () => {
  if (ui.hud) ui.hud.classList.toggle('locked', document.pointerLockElement === canvas);
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) cam.onMouse(e.movementX, e.movementY);
});
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  cam.onKey(e.code, true);
  if (e.code === 'Space') {
    if (cam.tour) { cam.stopTour(); toast('自由飞行'); }
    else { cam.startTour(); toast('自动巡游 · 空格退出'); }
    e.preventDefault();
  }
  if (e.code === 'KeyH') { if (ui.help) ui.help.classList.toggle('show'); if (ui.hud) ui.hud.classList.toggle('hide-stats'); }
  if (e.code === 'KeyT') {
    state.presetIndex = (state.presetIndex + 1) % PRESETS.length;
    state.palette = PRESETS[state.presetIndex];
    toast(state.palette.name);
  }
  if (e.code === 'KeyP') { if (ui.hud) ui.hud.classList.toggle('photo'); }
  if (e.code === 'KeyM' && audio) { audio.toggle(); toast(audio.muted ? '静音' : '声音开'); }
  if (e.code === 'KeyR') { cam.setView(0); }
  if (/^Digit[1-9]$/.test(e.code)) {
    const i = Number(e.code.slice(5)) - 1;
    if (i < VIEWS.length) { cam.setView(i); toast(VIEWS[i].name); }
  }
  if (e.code === 'Escape' && cam.tour) cam.stopTour();
});
window.addEventListener('keyup', (e) => cam.onKey(e.code, false));
window.addEventListener('resize', () => resize());

if (params.has('noui') && ui.hud) ui.hud.classList.remove('show');
if (noUI && ui.loading) ui.loading.classList.add('hidden');

// kick off: build is synchronous, so just start
state.palette = PRESETS[Number(params.get('hour')) === 1 ? 1 : 0];
if (ui.loading) ui.loading.classList.add('ready');
if (ui.start) {
  ui.start.disabled = false;
  ui.start.textContent = '开 始 游 览';
}
resize();
requestAnimationFrame(frame);

// debug / automation hooks
window.__sky = {
  gl,
  progs: P,
  get rt() {
    return { sceneRT, brightRT, blurB, blurD, blurF, W, H, RW, RH };
  },
  setView: (i) => cam.setView(i, true),
  tour: (on) => (on ? cam.startTour() : cam.stopTour()),
  setCam: (p, yaw, pitch, fov) => {
    cam.pos = p; cam.yaw = yaw; cam.pitch = pitch; if (fov) cam.fov = fov;
    cam.tour = false; cam.transition = null;
  },
  state,
  cam,
  world,
  get stats() {
    return {
      tris: state.stats.tris, calls: state.stats.calls, ms: state.frameMs,
      fish: { ...state.stats.fish }, worldTris: world.tris,
    };
  },
  setQuality: (q) => {
    state.quality = clamp(Number(q) || 1, ADAPT.min, ADAPT.max);
    resize();
    return state.quality;
  },
  // 诊断接口：?perf=1 覆盖层看到的就是同一份数据
  perf: {
    info: glInfo,
    get snapshot() {
      const { budget, fps, capped, gpuBound } = perfVerdict();
      return {
        gpu: glInfo.renderer, vendor: glInfo.vendor,
        software: glInfo.software, hwAccel: glInfo.hwAccel,
        quality: +state.quality.toFixed(3),
        dpr: Math.min(window.devicePixelRatio || 1, 1.5) * state.quality,
        canvas: [W, H], sceneRT: [RW, RH],
        rafFps: +fps.toFixed(1), rafMs: +state.rafMs.toFixed(2),
        renderMs: +state.gpuMs.toFixed(2), submitMs: +state.cpuMs.toFixed(2),
        displayHz: PERF_STATE.displayHz, frameBudgetMs: +budget.toFixed(2),
        costMs: +renderCostMs().toFixed(2), capped, gpuBound, adaptive: PERF_STATE.adaptive,
        stats: {
          calls: state.stats.calls,
          tris: Math.round(state.stats.tris),
          fish: { ...state.stats.fish },
        },
      };
    },
    setAdaptive(on) {
      PERF_STATE.adaptive = !!on;
      PERF_STATE.downStreak = 0;
      PERF_STATE.upStreak = 0;
      PERF_STATE.lastChange = state.frame;
      return PERF_STATE.adaptive;
    },
    setQuality(q) {
      state.quality = clamp(Number(q) || 1, ADAPT.min, ADAPT.max);
      resize();
      return state.quality;
    },
    get verdict() {
      return { ...perfVerdict(), displayHz: PERF_STATE.displayHz, adaptive: PERF_STATE.adaptive };
    },
    // 确定性自测：注入 (rAF 间隔, 实测渲染耗时) 采样，返回自适应后的渲染倍率。
    // 用来证明「30Hz 垂直同步/串流不会误降倍率」，以及「真慢时降到 0.55 就停」。
    testAdaptive(rafMs, gpuMs, n = 8) {
      const keepQ = state.quality, keepG = state.gpuMs, keepR = state.rafMs, keepF = state.frame;
      state.rafMs = rafMs;
      state.gpuMs = gpuMs;
      for (let i = 0; i < n; i++) {
        state.frame += ADAPT.cooldown + 1;
        adaptQuality();
      }
      const q = state.quality;
      state.frame = keepF; state.quality = keepQ; state.gpuMs = keepG; state.rafMs = keepR;
      resize();
      return q;
    },
    get overlay() {
      return PERF_STATE.el;
    },
    consts: { FISH_HALO, BRIGHT_THRESHOLD, SKY_LANTERN_COUNT, SMALL_FISH_COUNT, FISH_LOD, ADAPT },
  },
  start: startExperience,
};