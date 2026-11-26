// portal.js — Round 15 画中世界：露台画架上的那幅画，是通往「星鲸环 ASTRA」的门。
//
// 行为（桌面 / 触屏同一套状态机，触屏只在 main.js 的 TOUCH 分支里多注册一个 tap）：
//   · 相机距画布 ≤ 5.5 m 且视线与「相机→画布」夹角 ≤ ~25.8° → 显示一行提示 + 画布微光；
//   · 点击画布 / 回车（触屏：轻点画布）→ 2.4 s「坠入画中」过渡（白/星光扩散 +
//     相机向画布 dolly-in + FOV 收窄）→ location.href = 'ASTRA.html?from=easel'；
//   · 热点未激活时本模块不做任何事，canvas 的点击仍是原有的「进入指针锁定」。
//
// 画布世界锚点（实测常量，来自 terrace-set.js 的画架几何，改画架要同步）：
//   canvas center = (-1.865, 31.24, 88.824)
//     ← 露台面 Y0 = 30.03（terrace-set.js:20）+ 画架局部 (0, 1.21, 0.155)
//     ← EASEL = {x:-2.0, z:88.9}，局部 +Z 经 yaw 旋转后 = 世界 (-sin yaw, 0, cos yaw)
//   画布法线（朝观者）= (0.8725, 0, -0.4886)，画架 yaw = -2.0813 rad
//     ← 画架面向 GIRL = (3.0, 86.1)；画布正面法线是局部 +Z
//   这两个数不是美术参数，是"那张画的心脏在世界上的坐标"，所以写死并注明出处。
import { clamp, cross, norm, sub } from './math.js';

export const CANVAS = Object.freeze({
  center: Object.freeze([-1.865, 31.24, 88.824]),
  normal: Object.freeze([0.8725, 0, -0.4886]),
  yaw: -2.0813,
  width: 1.06,   // canvasAssembly 的 W（m），只用于把微光投影成合适的屏幕尺寸
  height: 0.86,  // canvasAssembly 的 H（m）
});

// 近距判定：中心点距离 + 视线夹角（不用像素射线：简单、稳、和分辨率无关）
export const NEAR_DIST = 5.5;    // m，≤5.5 m 算"走到画前"
export const NEAR_COS = 0.90;    // 视线与「相机→画布」方向的最小余弦（≈25.8°）

// 从 ASTRA 回到 CIELO（?at=easel）的落位：画布中心 + 法线 × 2.4 m，再抬高 0.15 m，
// 看向画布，fov 46。数值：(-1.865+0.8725*2.4, 31.24+0.15, 88.824-0.4886*2.4)
export const RETURN_POSE = Object.freeze({
  pos: Object.freeze([0.229, 31.39, 87.651]),
  look: Object.freeze([-1.865, 31.24, 88.824]),
  fov: 46,
});

export const TARGET_URL = 'ASTRA.html?from=easel';
export const DURATION = 2.4;     // 2.0–2.6 s（合同 §2.2）

// 坠入的终点：画布正前方 0.38 m（不要真的穿进画布，最后一帧留给过渡层盖住）
const END_OFFSET = 0.38;

/**
 * 画架传送门。
 *
 * @param {object} opts
 * @param {import('./camera.js').Camera} opts.cam  相机（setCam 之后也能正常工作）
 * @param {boolean} [opts.touch]                  是否触屏形态（只影响提示文案，不改状态机）
 * @param {Document} [opts.doc]                   便于测试注入（默认 document）
 * @param {function(string):void} [opts.onEnter]  过渡结束后的动作；默认跳转 TARGET_URL
 * @returns {{
 *   ready: () => boolean,
 *   state: () => 'idle'|'entering'|'done',
 *   target: () => string,
 *   progress: () => number,
 *   probe: () => {dist:number, cos:number, near:boolean},
 *   enter: (opts?: {dry?: boolean}) => {ok:boolean, target:string, state:string, reason?:string},
 *   enterFromInput: () => boolean,
 *   tap: () => boolean,
 *   reset: () => void,
 *   update: () => void,
 * }}
 */
export function createPortal(opts = {}) {
  const cam = opts.cam;
  const doc = opts.doc || document;
  const win = doc.defaultView || window;
  const onEnter = opts.onEnter || ((url) => { win.location.href = url; });
  // 触屏与否只影响提示文案（模板里 .desk-only/.touch-only 用 CSS 分流），不改状态机
  void opts.touch;
  const $ = (id) => doc.getElementById(id);

  const hintEl = $('portal-hint');
  const veilEl = $('portal-veil');
  const glowEl = $('portal-glow');
  const bgEl = $('portal-bg');
  const flashEl = $('portal-flash');
  const starsEl = $('portal-stars');
  const wordEl = $('portal-word');

  // 状态机：idle → entering → done（dry 跑完停在 done；真实进入在 done 之前就跳走了）
  // 过渡进度用墙上时钟（performance.now）驱动，而不是累加帧间隔：低帧率设备上
  // 过渡也一定是 2.4 s 的真实时间，不会被 dt 上限拖长（无头 swiftshader 尤其明显）。
  const S = { state: 'idle', t: 0, t0: 0, dry: false, saved: null, finished: false };
  const now = () => (win.performance && win.performance.now ? win.performance.now() : Date.now());
  let hintOn = false;
  let glowOn = false;

  const angleCos = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // ------------------------------------------------------------------ 判定
  function probe() {
    const c = CANVAS.center, p = cam.pos;
    const dx = c[0] - p[0], dy = c[1] - p[1], dz = c[2] - p[2];
    const dist = Math.hypot(dx, dy, dz);
    const f = cam.forward;
    const cos = dist > 1e-4 ? (f[0] * dx + f[1] * dy + f[2] * dz) / dist : 1;
    return { dist, cos, near: dist <= NEAR_DIST && cos >= NEAR_COS };
  }

  function ready() {
    return S.state === 'idle' && probe().near;
  }

  // ------------------------------------------------------------------ DOM
  function setHint(on) {
    if (!hintEl || hintOn === on) return;
    hintOn = on;
    hintEl.classList.toggle('show', on);
    hintEl.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  function setGlow(on) {
    if (!glowEl || glowOn === on) return;
    glowOn = on;
    glowEl.classList.toggle('on', on);
    if (!on) glowEl.style.opacity = '';
  }

  // 把画布中心投影到屏幕上，给微光一个"贴在画上"的位置和大小（只动 DOM，不改几何）
  function placeGlow() {
    if (!glowEl || !cam) return;
    const f = cam.forward;
    let r = cross(f, [0, 1, 0]);
    if (Math.hypot(r[0], r[1], r[2]) < 1e-4) r = [1, 0, 0];
    else r = norm(r);
    const u = cross(r, f);
    const d = sub(CANVAS.center, cam.pos);
    const z = angleCos(d, f);
    if (!(z > 0.25)) { setGlow(false); return; }
    const x = angleCos(d, r), y = angleCos(d, u);
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
    const vw = win.innerWidth || 1280, vh = win.innerHeight || 720;
    const aspect = vw / Math.max(1, vh);
    const px = (0.5 + 0.5 * (x / (z * tanHalf * aspect))) * vw;
    const py = (0.5 - 0.5 * (y / (z * tanHalf))) * vh;
    const size = clamp((CANVAS.width * 1.5) / (2 * z * tanHalf) * vh, 20, Math.min(vw, vh) * 1.3);
    if (px < -size || px > vw + size || py < -size || py > vh + size) { setGlow(false); return; }
    glowEl.style.left = px.toFixed(1) + 'px';
    glowEl.style.top = py.toFixed(1) + 'px';
    glowEl.style.width = size.toFixed(1) + 'px';
    glowEl.style.height = size.toFixed(1) + 'px';
    // 越近越亮（但不刺眼）：1.5 m 时约 0.9，5.5 m 时约 0.45
    const k = clamp(1.25 - (probe().dist - 1.5) / 5.5, 0.4, 0.95);
    glowEl.style.opacity = k.toFixed(3);
    setGlow(true);
  }

  // ------------------------------------------------------------------ 过渡
  function begin(dry) {
    S.state = 'entering';
    S.t = 0;
    S.t0 = now();
    S.dry = !!dry;
    S.finished = false;
    S.saved = { pos: [...cam.pos], yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov };
    // 过渡期间禁掉巡游 / 机位过渡 / 残余速度，镜头完全交给本模块
    cam.tour = false;
    cam.transition = null;
    cam.vel = [0, 0, 0];
    setHint(false);
    setGlow(false);
    try { doc.documentElement.classList.add('portal-in'); } catch (e) { /* ignore */ }
    if (veilEl) veilEl.classList.add('on');
    if (bgEl) bgEl.style.opacity = '0';
    if (flashEl) flashEl.style.opacity = '0';
    if (starsEl) starsEl.style.opacity = '0';
    if (wordEl) wordEl.style.opacity = '0';
  }

  function restoreCamera() {
    const s = S.saved;
    if (!s) return;
    cam.pos = [...s.pos];
    cam.yaw = s.yaw;
    cam.pitch = s.pitch;
    cam.fov = s.fov;
    cam.vel = [0, 0, 0];
    cam.transition = null;
  }

  function step() {
    const p = clamp((now() - S.t0) / 1000 / DURATION, 0, 1);
    S.t = p * DURATION;
    const e = p * p;              // ease-in：先是"被吸住"，最后一下坠入
    const s = S.saved;
    const c = CANVAS.center, n = CANVAS.normal;

    // ---- 相机 dolly-in：从进入时的位置滑到画布正前方 0.38 m，视线始终钉在画布中心
    const endX = c[0] + n[0] * END_OFFSET, endY = c[1] + n[1] * END_OFFSET, endZ = c[2] + n[2] * END_OFFSET;
    cam.pos = [
      s.pos[0] + (endX - s.pos[0]) * e,
      s.pos[1] + (endY - s.pos[1]) * e,
      s.pos[2] + (endZ - s.pos[2]) * e,
    ];
    const dx = c[0] - cam.pos[0], dy = c[1] - cam.pos[1], dz = c[2] - cam.pos[2];
    const dl = Math.hypot(dx, dy, dz) || 1;
    cam.yaw = Math.atan2(dx, dz);
    cam.pitch = Math.asin(clamp(dy / dl, -1, 1));
    // 极轻的震颤（0.004 rad 级）让"坠入"有速度感；不影响几何、不改变世界
    cam.yaw += Math.sin(S.t * 46) * 0.0035 * e;
    cam.pitch += Math.cos(S.t * 39) * 0.0025 * e;
    cam.fov = s.fov + (26 - s.fov) * e;   // FOV 收窄（轻微）
    cam.vel = [0, 0, 0];

    // ---- 过渡层：白 / 星光扩散
    if (veilEl) veilEl.classList.add('on');
    if (bgEl) bgEl.style.opacity = String(Math.min(1, p * p * 1.15));
    if (flashEl) {
      flashEl.style.opacity = String(clamp((p - 0.26) / 0.58, 0, 1));
      flashEl.style.transform = 'scale(' + (0.25 + 2.1 * p).toFixed(3) + ')';
    }
    if (starsEl) {
      starsEl.style.opacity = String(Math.min(1, p * 1.35));
      starsEl.style.transform = 'translate(-50%,-50%) scale(' + (0.35 + 2.4 * p).toFixed(3) + ')';
    }
    if (wordEl) wordEl.style.opacity = String(clamp((p - 0.30) / 0.34, 0, 1));
    if (glowEl && glowOn) glowEl.style.opacity = String(Math.max(0, 1 - p * 2.2));

    if (p >= 1 && !S.finished) finish();
  }

  function finish() {
    S.finished = true;
    S.t = DURATION;
    if (S.dry) {
      // 自动化测试用：只跑状态机，不跳转（跳转会断开 CDP 会话）
      S.state = 'done';
      if (bgEl) bgEl.style.opacity = '1';
      if (wordEl) wordEl.style.opacity = '1';
      console.log('[portal] dry run 完成：' + DURATION + ' s 过渡结束，目标 ' + TARGET_URL + '（未跳转）');
      return;
    }
    try {
      onEnter(TARGET_URL);
    } catch (e) {
      console.warn('[portal] 进入画中世界失败', e);
      S.state = 'idle';
      restoreCamera();
      try { doc.documentElement.classList.remove('portal-in'); } catch (e2) { /* ignore */ }
      if (veilEl) veilEl.classList.remove('on');
      if (bgEl) bgEl.style.opacity = '0';
    }
  }

  // ------------------------------------------------------------------ 对外 API
  function enter(o = {}) {
    const dry = !!(o && o.dry);
    if (S.state !== 'idle' && S.state !== 'done') {
      return { ok: false, target: TARGET_URL, state: S.state, reason: 'busy' };
    }
    if (!dry && !probe().near) {
      return { ok: false, target: TARGET_URL, state: S.state, reason: 'not-near' };
    }
    begin(dry);
    return { ok: true, target: TARGET_URL, state: S.state, dry };
  }

  // canvas click / 键盘回车共用：只有热点真的激活时才吞掉输入
  function enterFromInput() {
    if (!ready()) return false;
    enter();
    return true;
  }

  // 触屏轻点画布（main.js 只在 TOUCH 分支调用）
  function tap() {
    if (!ready()) return false;
    enter();
    return true;
  }

  function reset() {
    // dry 跑完（done）或过渡中都要还原镜头：测试/调试后不能把玩家留在画布里
    if (S.state === 'entering' || S.state === 'done') restoreCamera();
    S.state = 'idle';
    S.t = 0;
    S.t0 = 0;
    S.dry = false;
    S.finished = false;
    S.saved = null;
    setHint(false);
    setGlow(false);
    try { doc.documentElement.classList.remove('portal-in'); } catch (e) { /* ignore */ }
    if (veilEl) veilEl.classList.remove('on');
    if (bgEl) bgEl.style.opacity = '0';
    if (flashEl) flashEl.style.opacity = '0';
    if (starsEl) starsEl.style.opacity = '0';
    if (wordEl) wordEl.style.opacity = '0';
    return { ok: true, state: S.state };
  }

  function update() {
    if (S.state === 'entering') { step(); return; }
    if (S.state !== 'idle') { setHint(false); setGlow(false); return; }
    // 只在"走近 + 看向画布"时出现；帧数成本是 1 次点积，可忽略
    const on = probe().near;
    setHint(on);
    if (on) placeGlow(); else setGlow(false);
  }

  // bfcache 返回（用户在 ASTRA 里按了后退）：把状态机和镜头收干净
  try {
    win.addEventListener('pageshow', (e) => { if (e && e.persisted) reset(); });
  } catch (e) { /* 非浏览器环境忽略 */ }

  return {
    ready,
    state: () => S.state,
    target: () => TARGET_URL,
    // 实时进度（不依赖是否刚渲染过一帧）：验收脚本可随时读
    progress: () => (S.state === 'done' ? 1
      : S.state === 'entering' ? clamp((now() - S.t0) / 1000 / DURATION, 0, 1)
      : 0),
    probe,
    enter,
    enterFromInput,
    tap,
    reset,
    update,
  };
}
