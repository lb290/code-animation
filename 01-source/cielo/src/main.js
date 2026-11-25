// main.js — CIELO renderer: HDR forward pass, painted sky, bloom, grade.
import { createGL, program, mesh, quad, makeRT, makeDepthRT, freeRT, drawMesh, setUniforms } from './gl.js';
import * as S from './shaders.js';
import { m4, clamp, norm, mulberry32, TAU, sub, add, scale as vs, len } from './math.js';
import { Camera, VIEWS } from './camera.js';
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
import { ROUTES, routeById } from './routes.js';
import { LORE } from './lore.js';

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

// ---------------------------------------------------------------- round 11/13: touch + quality
// 第十三轮把画质档从「CSS 像素的百分数」改成**像素预算**——用户反馈手机端"不卡了但建筑很粗糙"，
// 根因是旧模型 canvas 只有 innerWidth*0.6 个 CSS 像素、完全没算 devicePixelRatio：在 dpr 2~3 的
// 手机上等于先渲染 0.87 MP 再被浏览器放大 3~4 倍。新模型把三件事分开：
//   · outCap/outDpr 输出画布（合成/锐化在这一档分辨率跑，dpr≤2 时与屏幕 1:1）
//   · px0/pxMin/pxMax 场景内部 HDR 目标的像素预算，由自适应调节器按 GPU 时间在区间内挑最优点
//   · gpuMs 每帧允许的 GPU 时间；sharpen 放大时的锐化；fxaa 内部分辨率抗锯齿；lights 点光数
// ?touch=0/1 可强制触屏形态，?q=low|mid|high 可手动指定档位（触屏菜单里也有「画质」按钮）。
const FORCED_TOUCH = params.has('touch') ? params.get('touch') !== '0' : null;
const TOUCH = FORCED_TOUCH !== null ? FORCED_TOUCH : detectTouch();
const TIERS = {
  high: { shadow: true,  outCap: 3.4e6, outDpr: 2, px0: 1.90e6, pxMin: 0.90e6, pxMax: 3.20e6, gpuMs: 12.5, fxaa: 1, sharpen: 0.28, lights: 12, sky: 1 },
  mid:  { shadow: false, outCap: 2.7e6, outDpr: 2, px0: 1.35e6, pxMin: 0.78e6, pxMax: 2.30e6, gpuMs: 13.5, fxaa: 1, sharpen: 0.42, lights: 10, sky: 1 },
  low:  { shadow: false, outCap: 2.2e6, outDpr: 2, px0: 0.95e6, pxMin: 0.55e6, pxMax: 1.70e6, gpuMs: 14.5, fxaa: 1, sharpen: 0.55, lights: 8,  sky: 0 },
};
const TIER_ORDER = ['low', 'mid', 'high'];
const TIER_CN = { high: '精细', mid: '均衡', low: '流畅' };
// 画质档位选择要跨会话记住：用户在手机上选了「精细」，下次打开不该又回到默认。
const Q_KEY = 'cielo.q.v1';
const loadQuality = () => { try { return localStorage.getItem(Q_KEY) || ''; } catch { return ''; } };
// 触屏默认「精细」：第十三轮的实测里，精细档（场景 1.9 MP + 输出=设备像素）比均衡档
// 的锐度高一倍；跑不动的设备由开局探测自动降一档、之后交给自适应分辨率兜底。
let QNAME = String(params.get('q') || loadQuality() || 'high').toLowerCase();
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
  up: program(gl, S.POST_VS, S.UPSCALE_FS, 'up'),
  depth: program(gl, S.DEPTH_VS, S.DEPTH_FS, 'depth'),
};

// ---------------------------------------------------------------- world
const t0 = performance.now();
const world = buildWorld(gl);
const ctx = world.ctx;
const buildMs = performance.now() - t0;
// 第十二轮：模块构建 / GPU 上传若有失败，必须在控制台和 ?diag 里留下名字（"少了教堂/车站"
// 这类问题以前是静默的，用户只能看到城市缺块）。
if (ctx.failures && ctx.failures.length) console.warn('[main] world failures: ' + JSON.stringify(ctx.failures));

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
// 触屏上连「精细」档也不开阴影 —— 那是与分辨率无关的固定几何成本，手机扛不住，
// 「精细」在手机上的含义是更高像素预算 + 更多点光，不是阴影。
if (!Q.shadow || TOUCH) SHADOW.on = false;
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

// ---------------------------------------------------------------- 第十三轮：分辨率模型
// 输出画布与场景内部解耦：scenePx 是内部 HDR 渲染目标的像素预算（自适应），
// 输出画布尽量贴着设备像素（dpr 上限 OUT_DPR_CAP，且不超过档位 outCap），
// 合成后由一个「放大 + 锐化 + 晕影 + 颗粒」pass 在输出分辨率收尾 —— 低分辨率的场景
// 也能在屏幕上得到锐利的边、而不是被浏览器双线性放大成一团糊。
const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
const OUT_DPR_CAP = 2;
const W = { outW: 1280, outH: 720, srcW: 1280, srcH: 720, scale: 1, cssW: 1280, cssH: 720, outScale: 1 };
let scenePx = Q.px0;
// 输出分辨率系数：极弱设备连场景像素降到最低都还超预算时（说明瓶颈在输出分辨率的
// 放大/合成 pass），才把它往下调 —— 这是最后一道保险，默认 1.0。
let outMul = 1;
// ?gputarget=<ms> 强制自适应目标（验收脚本用：desktop 上把它设成 3 ms 就能看到"降档"分支）
const GPU_TARGET = params.has('gputarget') ? Number(params.get('gputarget')) : 0;
let rtScene = null, rtBloomA = null, rtBloomB = null, rtScene2 = null, rtLdr = null;
const clampPx = (p) => Math.min(Q.pxMax, Math.max(Q.pxMin, p));

function layout() {
  const cw = Math.max(320, window.innerWidth), ch = Math.max(200, window.innerHeight);
  // ---- 输出画布：贴着设备像素出，dpr 高于 2 的部分交给浏览器（再高的屏 dpr 收益极低、成本翻倍）
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
  // ---- 场景内部：由 scenePx 预算 + CSS 宽高比推出（保证像素数近似等于预算）
  // 场景像素不必超过输出像素（超过就是超采样，成本翻倍换不到观感）：预算保留原值
  // （旋转屏幕 / 拉大窗口后能自己长回去），实际尺寸用 effective = min(预算, 输出)。
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
    for (const rt of [rtScene, rtBloomA, rtBloomB, rtScene2, rtLdr]) if (rt) freeRT(gl, rt);
    rtScene = makeRT(gl, sw, sh, { depth: true });
    const bw = Math.max(80, Math.floor(sw / 2)), bh = Math.max(50, Math.floor(sh / 2));
    rtBloomA = makeRT(gl, bw, bh, {});
    rtBloomB = makeRT(gl, bw, bh, {});
    rtScene2 = makeRT(gl, Math.max(80, Math.floor(sw / 4)), Math.max(50, Math.floor(sh / 4)), {});
    // 合成结果先落 LDR（RGBA8），放大 pass 再在输出分辨率上采样它
    rtLdr = makeRT(gl, sw, sh, { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE });
  }
}
function resize() { layout(); }
window.addEventListener('resize', () => layout());
// ?px=<像素数> 可强制场景内部预算（对比截图 / 排查画质用）
const PX_KEY = 'cielo.px.v2';
function loadPx(name) {
  try { const v = Number((JSON.parse(localStorage.getItem(PX_KEY) || '{}'))[name]); return v > 0 ? v : 0; } catch { return 0; }
}
function savePx(name, px) {
  try { const j = JSON.parse(localStorage.getItem(PX_KEY) || '{}'); j[name] = Math.round(px); localStorage.setItem(PX_KEY, JSON.stringify(j)); } catch { /* 隐私模式忽略 */ }
}
if (params.has('px')) scenePx = Number(params.get('px')) || scenePx;
else { const st = loadPx(QNAME); if (st) scenePx = st; }
scenePx = clampPx(scenePx);
layout();
const quadMesh = quad(gl);

// ---- 自适应分辨率：优先用 GPU 计时器（真实 GPU ms，不受 vsync 量化），拿不到就退化到帧时间
const GPU_TIMER = gl.getExtension('EXT_disjoint_timer_query_webgl2');
let tqCur = null, tqPrev = null, gpuMs = 0;
function gpuBegin() {
  if (!GPU_TIMER || tqCur || tqPrev) return;
  tqCur = gl.createQuery();
  gl.beginQuery(GPU_TIMER.TIME_ELAPSED_EXT, tqCur);
}
function gpuEnd() {
  if (!GPU_TIMER || !tqCur) return;
  gl.endQuery(GPU_TIMER.TIME_ELAPSED_EXT);
  tqPrev = tqCur; tqCur = null;
}
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

// 调节器状态：每 30 帧一个窗口；窗口里没有"超预算帧"的比例决定方向。
const ADAPT = { n: 0, gpuSum: 0, gpuN: 0, dtSum: 0, dtMin: 999, cool: 3, settle: 0, lastSave: 0, measure: 0 };
let adaptLock = false;   // 明信片等"要一帧高分辨率"的功能会临时锁住调节器

function adaptStep(dtRaw) {
  const g = gpuPoll();
  if (g >= 0) {
    gpuMs = gpuMs ? gpuMs * 0.75 + g * 0.25 : g;
    ADAPT.gpuSum += g; ADAPT.gpuN++;
  }
  if (FREEZE >= 0 || !started || adaptLock || OFF.has('adapt')) return;
  ADAPT.dtSum += dtRaw * 1000;
  if (dtRaw * 1000 < ADAPT.dtMin) ADAPT.dtMin = dtRaw * 1000;
  ADAPT.n++;
  if (ADAPT.n < 30) return;
  const avgGpu = ADAPT.gpuN ? ADAPT.gpuSum / ADAPT.gpuN : -1;
  const avgDt = ADAPT.dtSum / ADAPT.n;
  const vsync = Math.min(ADAPT.dtMin, 33.4);
  ADAPT.n = 0; ADAPT.gpuSum = 0; ADAPT.gpuN = 0; ADAPT.dtSum = 0; ADAPT.dtMin = 999;
  // 开局 2.5 s 不调：着色器编译 + 构建期 GC 抖动会骗过调节器（第十二轮的教训）
  if (bootN >= 0) return;
  const target = GPU_TARGET || Q.gpuMs;
  let action = 0;
  const adb = params.has('adaptlog');
  if (avgGpu > 0) {
    ADAPT.measure = avgGpu;
    if (avgGpu > target * 1.08) action = -1;
    else if (avgGpu < target * 0.80) action = 1;
  } else {
    // 没有 GPU 计时器：帧时间被 vsync 量化，只能用"是否超过一个刷新周期"判断
    ADAPT.measure = avgDt;
    if (avgDt > vsync * 1.30) action = -1;
    else if (avgDt < vsync * 1.04) action = 1;
  }
  if (adb) console.log('[adapt] gpu ' + avgGpu.toFixed(2) + ' dt ' + avgDt.toFixed(1) + ' target ' + target +
    ' px ' + (scenePx / 1e6).toFixed(2) + ' outMul ' + outMul + ' action ' + action + ' cool ' + ADAPT.cool);
  if (ADAPT.cool > 0) { ADAPT.cool--; return; }
  if (action < 0) {
    const next = clampPx(scenePx * 0.86);
    if (next < scenePx - 1e5) {
      scenePx = next; ADAPT.cool = 3; ADAPT.settle = 0; layout();
    } else if (W.srcW * W.srcH <= Q.pxMin * 1.03 && outMul > 0.63) {
      // 场景像素已经到底还超预算 → 瓶颈在输出分辨率的合成/放大 pass，降输出分辨率
      outMul = Math.max(0.62, outMul - 0.12); ADAPT.cool = 3; ADAPT.settle = 0; layout();
    } else {
      ADAPT.settle = 0;
    }
  } else if (action > 0) {
    const next = clampPx(scenePx * 1.05);
    if (next > scenePx + 1e5) { scenePx = next; ADAPT.cool = 5; ADAPT.settle = 0; layout(); }
    else if (outMul < 1) { outMul = Math.min(1, outMul + 0.08); ADAPT.cool = 5; ADAPT.settle = 0; layout(); }
    else ADAPT.settle++;
  } else {
    ADAPT.settle++;
  }
  if (ADAPT.settle >= 5 && performance.now() - ADAPT.lastSave > 4000) {
    ADAPT.lastSave = performance.now();
    savePx(QNAME, scenePx);
  }
}

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
  const w = target ? target.w : W.outW, h = target ? target.h : W.outH;
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
// 每处地标一个抵达区域：首次飞进去把那一页"显影"进抄本（G / 底部导览打开）。
// 第十一轮修订：默认不再自动弹卡片（用户反馈导览内容不要挡画面），只在菜单/左下挂「新」角标。
const guide = createGuide({
  cam,
  toast: (msg, ms) => toast(msg, ms),
  // 触屏上没有键盘，卡片停留久一点，并且可以点开阅读
  cardMs: TOUCH ? 12000 : 9000,
  autoCard: params.has('cards'),
  onFresh: (n) => setFreshBadge(n),
});

// 新记载角标：触屏挂右下菜单按钮，桌面是左下角一枚小胶囊（点了就打开抄本）
function setFreshBadge(n) {
  const v = Number(n) || 0;
  touch?.setBadge?.(v);
  const b = document.getElementById('newbadge');
  if (!b) return;
  b.textContent = '抄本 · ' + v + ' 条新记载 · 点击阅读';
  b.classList.toggle('show', v > 0);
}
document.getElementById('newbadge')?.addEventListener('click', () => guide.toggle());

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
  // 出片要把画面拍清楚：临时把场景像素预算抬到输出画布大小（只多渲染一帧），截完恢复。
  getPx: () => scenePx,
  setPx: (p) => { scenePx = clampPx(p); layout(); },
  lock: (v) => { adaptLock = !!v; },
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
    quality: () => cycleQuality(1),
    home: () => cam.setView(0),
    help: () => helpEl?.classList.toggle('show'),
    fullscreen: requestFullscreen,
  },
}) : { enabled: false };


// ---------------------------------------------------------------- 第十二轮：主题航线 · 导览巴士
// 数据在 src/routes.js（三条有序站点表：观景点索引 + 抄本页 id + 停留秒数）。
// 启程后：cam.setView() 平滑到该站 → 停留 → 下一站；航线条常驻顶部显示进度，
// 可暂停/继续/退出/读这一站。任何手动操作（摇杆、拖视角、WASD、观景键）都会在
// 镜头稳定后被判定为"用户接管"，航线自动退出 —— 用户永远优先于导览。
const LORE_INDEX = new Map(LORE.map((e, i) => [e.id, i]));
const ROUTE = { r: null, i: 0, t: 0, paused: false };
const routebar = document.getElementById('routebar');
const rbRoute = document.getElementById('rb-route');
const rbStop = document.getElementById('rb-stop');
const rbPause = document.getElementById('rb-pause');
const gbRoutes = document.getElementById('gb-routes');
const gbRoutesBtn = document.getElementById('gb-routes-btn');

function updateRouteBar() {
  if (!ROUTE.r) { routebar?.classList.remove('on'); return; }
  const st = ROUTE.r.stops[ROUTE.i];
  if (rbRoute) rbRoute.textContent = ROUTE.r.name;
  if (rbStop) rbStop.innerHTML = '第 ' + (ROUTE.i + 1) + ' / ' + ROUTE.r.stops.length + ' 站 · <b>' + st.title + '</b>';
  if (rbPause) rbPause.textContent = ROUTE.paused ? '继续' : '暂停';
  routebar?.classList.add('on');
}
function hideRoutesPanel() {
  gbRoutes?.classList.remove('on');
  gbRoutesBtn?.classList.remove('on');
  gbRoutesBtn?.setAttribute('aria-expanded', 'false');
}
function startRoute(id) {
  const r = routeById(id);
  if (!r) return false;
  ROUTE.r = r; ROUTE.i = 0; ROUTE.t = 0; ROUTE.paused = false;
  guide.close();
  hideRoutesPanel();
  cam.stopTour();
  cam.setView(r.stops[0].view, FREEZE >= 0);
  updateRouteBar();
  toast('航线启程 · ' + r.name + ' · ' + r.stops.length + ' 站', 2600);
  return true;
}
function exitRoute(why) {
  if (!ROUTE.r) return;
  const name = ROUTE.r.name;
  ROUTE.r = null; ROUTE.i = 0; ROUTE.t = 0; ROUTE.paused = false;
  routebar?.classList.remove('on');
  toast('已退出航线「' + name + '」' + (why ? ' · ' + why : ''), 2400);
}
function routeTick(dt) {
  const s = ROUTE;
  if (!s.r) return;
  const st = s.r.stops[s.i];
  const v = VIEWS[st.view];
  if (!s.paused) s.t += dt;
  // 用户接管判定：机位偏移 >12 m 或视线夹角 >23°（只在 2.4 s 镜头稳定后判）
  if (s.t > 2.4) {
    const dx = cam.pos[0] - v.pos[0], dy = cam.pos[1] - v.pos[1], dz = cam.pos[2] - v.pos[2];
    // 视线对比必须用 cam.forward（实时 yaw/pitch）：拖视角只改 yaw/pitch，不会更新 cam.lookAt
    const f = cam.forward;
    const bx = v.look[0] - v.pos[0], by = v.look[1] - v.pos[1], bz = v.look[2] - v.pos[2];
    const lb = Math.hypot(bx, by, bz);
    const cosang = lb > 1e-3 ? (f[0] * bx + f[1] * by + f[2] * bz) / lb : 1;
    if (Math.hypot(dx, dy, dz) > 12 || cosang < 0.92) { exitRoute('你接手了视角'); return; }
  }
  if (!s.paused && s.t >= (st.stay || 14)) {
    s.t = 0;
    s.i++;
    if (s.i >= s.r.stops.length) {
      const nm = s.r.name;
      s.r = null; routebar?.classList.remove('on');
      toast('航线结束 · ' + nm + ' · 抄本已记下沿途的页', 3200);
      return;
    }
    cam.setView(s.r.stops[s.i].view, false);
    guide.hideCard();
    updateRouteBar();
  }
}
function buildRouteCards() {
  const list = document.getElementById('rt-list');
  if (!list || list.dataset.built) return;
  list.dataset.built = '1';
  for (const r of ROUTES) {
    const secs = r.stops.reduce((a, s) => a + (s.stay || 14), 0);
    const card = document.createElement('div');
    card.className = 'rt-card';
    const name = document.createElement('div'); name.className = 'rt-name'; name.textContent = r.name;
    const en = document.createElement('div'); en.className = 'rt-en'; en.textContent = r.en || '';
    const blurb = document.createElement('div'); blurb.className = 'rt-blurb'; blurb.textContent = r.blurb || '';
    const meta = document.createElement('div'); meta.className = 'rt-meta';
    meta.textContent = r.stops.length + ' 站 · 约 ' + Math.max(1, Math.round(secs / 60)) + ' 分钟';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '启程';
    btn.addEventListener('click', () => startRoute(r.id));
    card.append(name, en, blurb, meta, btn);
    list.appendChild(card);
  }
}
buildRouteCards();
gbRoutesBtn?.addEventListener('click', () => {
  const on = !gbRoutes?.classList.contains('on');
  gbRoutes?.classList.toggle('on', on);
  gbRoutesBtn.classList.toggle('on', on);
  gbRoutesBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
});
if (rbPause) rbPause.addEventListener('click', () => {
  if (!ROUTE.r) return;
  ROUTE.paused = !ROUTE.paused;
  updateRouteBar();
  toast(ROUTE.paused ? '航线暂停' : '航线继续', 1600);
});
document.getElementById('rb-exit')?.addEventListener('click', () => exitRoute('手动退出'));
document.getElementById('rb-read')?.addEventListener('click', () => {
  if (!ROUTE.r) return;
  const st = ROUTE.r.stops[ROUTE.i];
  const i = LORE_INDEX.get(st.lore);
  if (i !== undefined) guide.openAt(i);
  if (!ROUTE.paused) { ROUTE.paused = true; updateRouteBar(); }
});

// 手动 / 自动切换画质档（触屏默认 mid；?q= 或触屏菜单「画质」可切）
function setQuality(name, persist = true) {
  if (!TIERS[name] || name === QNAME) return;
  QNAME = name;
  Q = TIERS[name];
  SHADOW.on = !!Q.shadow && !TOUCH && !!SHADOW.rt && !OFF.has('shadow');
  // 该档位上次在这台设备上自动找到的像素预算（没有就用档位默认值）
  const st = params.has('px') ? 0 : loadPx(name);
  scenePx = clampPx(st || Q.px0);
  outMul = 1;
  ADAPT.cool = 4; ADAPT.settle = 0;
  document.documentElement.dataset.q = name;
  if (persist) { try { localStorage.setItem(Q_KEY, name); } catch { /* 隐私模式忽略 */ } }
  layout();
  console.log('[main] quality -> ' + name + ' (scene ' + (scenePx / 1e6).toFixed(2) + ' MP / out ' +
    W.outW + 'x' + W.outH + ', shadow ' + SHADOW.on + ')');
  if (started) toast('画质 · ' + TIER_CN[name], 2200);
}
// 三档循环：流畅 → 均衡 → 精细（触屏菜单「画质」/ 键盘 V / __cielo.cycleQuality()）
function cycleQuality(dir = 1) {
  const i = TIER_ORDER.indexOf(QNAME);
  setQuality(TIER_ORDER[(i + dir + TIER_ORDER.length) % TIER_ORDER.length]);
  return QNAME;
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
  } else if (e.code === 'KeyV') {
    e.preventDefault();
    cycleQuality(1);
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
let bootN = 0, bootSum = 0, bootM = 0;   // 开局帧时间采样（自动画质档用）

// 构建戳（build.mjs 在 HTML 里替换 __BUILD_STAMP__）：用来一眼判断手机上那份是不是最新构建。
const BUILD = (() => {
  const el = document.querySelector('#loading .build');
  return el ? el.textContent.replace(/^构建\s*/, '').trim() : 'unknown';
})();
console.log('[main] build ' + BUILD + ' | static tris ' + world.tris.toLocaleString() + ' | views ' + VIEWS.length + ' | lore ' + guide.total);

// ?diag / __cielo.diag()：一眼看到构建、内容规模、协议与画质（排查"手机上少了建筑"这类问题）
function showDiag(extra) {
  document.getElementById('diag')?.remove();
  const d = document.createElement('div');
  d.id = 'diag';
  d.style.cssText = 'position:fixed;left:12px;top:12px;z-index:40;max-width:min(92vw,620px);padding:12px 14px;' +
    'border-radius:10px;background:rgba(6,16,34,.86);color:#dfe9ff;font:11.5px/1.7 ui-monospace,Menlo,monospace;' +
    'white-space:pre-wrap;cursor:pointer;border:1px solid rgba(160,200,255,.35)';
  const rows = [
    'CIELO 诊断 · 点一下关闭',
    '构建   ' + BUILD,
    '协议   ' + location.protocol + '  触屏 ' + (TOUCH ? 'on' : 'off') + '  画质 ' + QNAME + '（' + TIER_CN[QNAME] + '）',
    '画质   场景 ' + (scenePx / 1e6).toFixed(2) + ' MP（' + W.srcW + 'x' + W.srcH + '）→ 输出 ' +
      (W.outW * W.outH / 1e6).toFixed(2) + ' MP（' + W.outW + 'x' + W.outH + '，dpr ' + DPR.toFixed(2) +
      ' → 输出倍率 ' + W.outScale.toFixed(2) + '）· GPU 计时 ' + (GPU_TIMER ? '可用' : '不可用') +
      (gpuMs > 0 ? ' · gpu ' + gpuMs.toFixed(1) + ' ms' : ''),
    '内容   静态 ' + world.tris.toLocaleString() + ' tri · 动态 ' + ctx.dyn.length + ' actor · 点光 ' + ctx.points.length +
      ' · 观景 ' + VIEWS.length + ' · 抄本 ' + guide.total + ' 页',
    '渲染   绘制 ' + perf.drawCalls + ' 次 · cpu ' + perf.cpuMs.toFixed(1) + ' ms · 已渲染 ' + perf.frames + ' 帧',
    '世界   ' + world.meshes.length + ' 批 · 构建 ' + Math.round(buildMs) + ' ms' +
      (performance.memory ? ' · JS 堆 ' + (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' / 上限 ' +
        (performance.memory.jsHeapSizeLimit / 1048576).toFixed(0) + ' MB（含尚未回收的构建垃圾）' : ''),
    ...(ctx.failures && ctx.failures.length ? ['失败   ' + ctx.failures.map((f) => f.name + ': ' + String(f.msg).slice(0, 70)).join(' | ')] : []),
    '地址   ' + location.href,
  ];
  if (extra) rows.push('附加   ' + extra);
  d.textContent = rows.join('\n');
  d.addEventListener('click', () => d.remove());
  document.body.appendChild(d);
}
const perf = { frames: 0, cpuMs: 0, gpuMs: 0, drawCalls: 0, tris: world.tris, buildMs, scenePx };
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
  build: BUILD,
  diag: showDiag,
  isTouch: TOUCH,
  quality: () => QNAME,
  tiers: TIERS,
  // 第十三轮：画质与分辨率（验收脚本/控制台用）
  cycleQuality: (d = 1) => cycleQuality(d),
  res: () => ({ scenePx, sceneEff: W.srcW * W.srcH, src: [W.srcW, W.srcH], out: [W.outW, W.outH], outPx: W.outW * W.outH, dpr: DPR, outScale: W.outScale, outMul, gpuMs, gpuTimer: !!GPU_TIMER, measure: ADAPT.measure, target: GPU_TARGET || Q.gpuMs }),
  setPx: (p) => { scenePx = clampPx(Number(p) || Q.px0); layout(); return scenePx; },
  getPx: () => scenePx,
  // 主题航线：给验收脚本/控制台用
  routes: ROUTES,
  startRoute: (id) => startRoute(id),
  exitRoute: (why) => exitRoute(why),
  routeState: () => ({ id: ROUTE.r ? ROUTE.r.id : null, index: ROUTE.i, paused: ROUTE.paused, total: ROUTE.r ? ROUTE.r.stops.length : 0, t: +ROUTE.t.toFixed(2) }),
  setQuality: (n) => setQuality(n),
  stats: () => ({ quality: QNAME, scale: W.scale, scenePx, sceneEff: W.srcW * W.srcH, srcW: W.srcW, srcH: W.srcH, outW: W.outW, outH: W.outH, outPx: W.outW * W.outH, dpr: DPR, outScale: W.outScale, outMul, gpuMs, shadow: SHADOW.on, touch: TOUCH, pointerLocked: locked, started }),
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
  // 主题航线（第十二轮）：推进站点、判定"用户接管"
  routeTick(FREEZE >= 0 ? 0 : dt);
  // 冻结帧（截图 / ?freeze=）时 dt 恒为 0，抵达检测用一个固定步长，卡片才会出现
  if (started) guide.update(cam.pos, FREEZE >= 0 ? 0.24 : dt);
  ambience.camPos = cam.pos;
  const aspect = W.srcW / W.srcH;
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

  // GPU 计时（EXT_disjoint_timer_query_webgl2）：一帧只发一个 query，下一帧取结果。
  // 自适应调节器优先用它 —— 帧时间被 vsync 量化成 16.7/33.3，GPU ms 才是真正的余量。
  gpuBegin();

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
    // 世界被分成若干批（world.meshes）：静态几何一样，只是内存分块上传
    for (const wm of world.meshes) drawMesh(gl, wm);
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
  gl.viewport(0, 0, W.srcW, W.srcH);
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

  // ---- 2. opaque world ---------------------------------------------------
  if (!OFF.has('world')) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    pass(P.lit, rtScene, { ...sceneUniforms(), uModel: IDENT, uTime: time });
    for (const wm of world.meshes) { drawMesh(gl, wm); draws++; }
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

  // ---- 3c. sky（实体几何之后画，只着色露天的像素）-------------------------
  // 第十三轮优化：天空 shader 里有 ~380 次噪声采样/像素（两层积云 + 卷云 + 星空），
  // 旧顺序是"先全屏画天空、再让建筑盖上去"——室内机位等于把整屏最贵的 shader 白算一遍。
  // 现在天空的顶点 z 固定在 1.0（= 清屏深度），用 LEQUAL 只画深度仍为 1.0 的像素；
  // 视觉逐像素一致，室外机位省掉建筑遮挡的那部分，室内机位省掉 90%+。
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

  // ---- 7a. composite（场景内部分辨率，HDR → LDR）--------------------------
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  pass(P.comp, rtLdr, {
    uScene: 0, uBloom1: 1, uBloom2: 2,
    uTime: time, uRes: [W.srcW, W.srcH],
    uExposure: curLook.exposure, uBloom: curLook.bloomInt,
    uSaturation: curLook.saturation, uContrast: curLook.contrast,
    // 晕影/颗粒移到输出分辨率的放大 pass：放大后不会被拉成色块/噪团
    uVignette: 0, uGrain: 0, uFxaa: Q.fxaa ? 1.0 : 0.0,
  });
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtScene.tex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rtBloomA.tex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, rtScene2.tex);
  drawMesh(gl, quadMesh); draws++;

  // ---- 7b. 放大 + 锐化（输出分辨率，1:1 贴屏）-----------------------------
  // 内部像素低于输出像素时，双线性放大是"糊"的主要来源；4 tap unsharp 把边缘的
  // 对比度补回来，再叠输出分辨率的晕影/颗粒/抖动 —— 这是"低预算也显精细"的关键。
  pass(P.up, null, {
    uTex: 0, uSrc: [1 / W.srcW, 1 / W.srcH], uRes: [W.outW, W.outH],
    uSharp: Q.sharpen, uVignette: curLook.vignette, uGrain: 0.014, uNight: curLook.night,
  });
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtLdr.tex);
  drawMesh(gl, quadMesh); draws++;
  gpuEnd();

  // ---- 8. 明信片工坊：需要出片时先抬一帧分辨率，下一帧 readPixels（截完自动恢复）
  if (postcard) postcard.onFrame();

  const c1 = performance.now();
  cpuMs = cpuMs * 0.9 + (c1 - c0) * 0.1;
  // 第十三轮：自适应分辨率（GPU 计时器优先）。窗口 30 帧，超预算就降场景像素预算，
  // 一直比较闲就慢慢加回来 —— 旧版「只降不升」会让能跑的手机永远停在 0.6 倍率。
  adaptStep(dtRaw);
  // 开局 160 帧只做记录、不调档：着色器编译 + 构建期 GC 抖动会骗过调节器（第十二轮的教训）
  if (FREEZE < 0 && started && bootN >= 0) {
    bootN++;
    if (bootN > 40) { bootSum += dtRaw * 1000; bootM++; }
    if (bootN === 160) {
      const avg = bootSum / Math.max(1, bootM);
      bootN = -1;
      console.log('[main] boot frames 41-160 avg ' + avg.toFixed(1) + ' ms · quality ' + QNAME +
        ' · scene ' + (scenePx / 1e6).toFixed(2) + ' MP / out ' + W.outW + 'x' + W.outH +
        ' · gpu timer ' + (GPU_TIMER ? 'on' : 'off'));
      // 兜底：开局 2.7 s 平均帧时间明显不够（<30 fps）时降一档；只在真正跑不动时触发，
      // 且不写进 localStorage（用户显式选择的档位下次仍然生效，降档只影响本次会话）。
      if (avg > 50 && QNAME !== 'low') setQuality('low', false);
      else if (avg > 34 && QNAME === 'high') setQuality('mid', false);
    }
  }
  perf.cpuMs = cpuMs;
  perf.drawCalls = draws;
  perf.frames++;
  perf.gpuMs = gpuMs;
  perf.scenePx = scenePx;
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
    setTimeout(() => toast('左手推摇杆飞行 · 右手同时拖动转视角', 3800), 2200);
    setTimeout(() => toast('右下 ☰ 菜单：导览 / 昼夜 / 烟花 / 明信片', 3800), 6800);
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

// ?route=<id>：直接启程一条主题航线（验收截图 / 演示用，可配合 ?freeze= 定住第一站）
if (params.has('route')) startRoute(params.get('route'));

requestAnimationFrame((n) => {
  last = n;
  requestAnimationFrame(drawFrame);
  setTimeout(ready, 60);
  // ?postcard=1：截图/验收时自动冲洗一张明信片；?diag 打开诊断面板
  if (params.has('postcard')) setTimeout(() => { if (started) postcard.open(); }, 1800);
  if (params.has('diag')) setTimeout(() => showDiag(), 1200);
});
