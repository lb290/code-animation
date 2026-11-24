// touch.js — 第十一轮：触屏输入层（安卓平板 / 手机）。
//
// 只在触屏设备上启用（pointer: coarse 或 maxTouchPoints > 0；URL 可用 ?touch=1 / ?touch=0 强制）。
// 桌面端一条事件都不注册，行为与第十轮完全一致。
//
// 操作映射（与键盘一一对应，复用 Camera 的同一套 API）：
//   左半屏按住拖动   → 虚拟摇杆：前推飞、后拉退、左右平移（模拟量，推得越远越快）
//   右半屏按住拖动   → 环视（等价鼠标 mousemove，走 cam.onMouse）
//   右侧 升 / 降     → 升降（等价 E / Q）
//   底部动作条        → 巡游、上一个/下一个观景点、昼夜、烟花、导览抄本、摄影、明信片、回露台、帮助、全屏
//
// 为什么不用 pointer lock：安卓上 pointer lock 不可靠，且会吞掉触摸；触屏下 canvas 直接收 pointer 事件。

const STICK_R = 62;          // 摇杆最大半径（px）
const LOOK_SENS = 2.4;       // 手指位移 -> 视角增益（桌面鼠标为 1.0；手机上 1.65 太钝）
const STICK_ZONE = 0.44;     // 左侧多少比例算摇杆区

export function detectTouch() {
  if (!window.matchMedia) return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches ||
      (navigator.maxTouchPoints || 0) > 0 ||
      'ontouchstart' in window;
  } catch { return false; }
}

export function createTouch({ canvas, cam, actions, toast }) {
  const doc = document;
  const root = doc.getElementById('touchui');
  if (!root) return { enabled: false, dispose() {} };
  root.removeAttribute('hidden');
  doc.documentElement.classList.add('touch');

  const stickEl = doc.getElementById('tu-stick');
  const knobEl = doc.getElementById('tu-knob');
  const menuEl = doc.getElementById('tu-menu');
  const badgeEl = doc.getElementById('tu-badge');
  const pointers = new Map();   // pointerId -> 'stick' | 'look'
  let stickId = null, stickOrigin = null;
  let lookId = null, lookLast = null;
  const $ = (id) => doc.getElementById(id);

  // ---------------------------------------------------------------- 摇杆
  function showStick(x, y) {
    stickEl.classList.add('on');
    stickEl.style.left = x + 'px';
    stickEl.style.top = y + 'px';
    knobEl.style.transform = 'translate(0px,0px)';
  }
  function hideStick() {
    stickEl.classList.remove('on');
    cam.touch.x = 0; cam.touch.z = 0;
  }
  function moveStick(x, y) {
    if (!stickOrigin) return;
    let dx = x - stickOrigin[0], dy = y - stickOrigin[1];
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx = (dx / d) * STICK_R; dy = (dy / d) * STICK_R; }
    knobEl.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    cam.touch.x = dx / STICK_R;
    cam.touch.z = -dy / STICK_R;   // 屏幕往下 = 后退
    if (Math.hypot(cam.touch.x, cam.touch.z) > 0.18 && (cam.tour || cam.transition)) {
      cam.tour = false;
      cam.transition = null;
    }
  }

  // ---------------------------------------------------------------- canvas 上的手指
  function onDown(e) {
    if (e.pointerType === 'mouse') return;              // 桌面鼠标走原有逻辑
    if (e.target !== canvas) return;
    // 菜单展开时，第一下点画面先收起菜单（顺手也让「点外面关闭」成立），不当作摇杆
    if (bar && bar.classList.contains('open')) { setMenu(false); e.preventDefault(); return; }
    const left = e.clientX < window.innerWidth * STICK_ZONE;
    if (left && stickId === null) {
      stickId = e.pointerId;
      pointers.set(e.pointerId, 'stick');
      stickOrigin = [e.clientX, e.clientY];
      showStick(e.clientX, e.clientY);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    } else if (!left && lookId === null) {
      lookId = e.pointerId;
      pointers.set(e.pointerId, 'look');
      lookLast = [e.clientX, e.clientY];
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerType === 'mouse') return;
    const kind = pointers.get(e.pointerId);
    if (kind === 'stick') { moveStick(e.clientX, e.clientY); e.preventDefault(); }
    else if (kind === 'look') {
      if (lookLast) cam.onMouse((e.clientX - lookLast[0]) * LOOK_SENS, (e.clientY - lookLast[1]) * LOOK_SENS);
      lookLast = [e.clientX, e.clientY];
      e.preventDefault();
    }
  }
  function onUp(e) {
    if (e.pointerType === 'mouse') return;
    if (pointers.get(e.pointerId) === 'stick') { hideStick(); stickId = null; stickOrigin = null; }
    else if (pointers.get(e.pointerId) === 'look') { lookId = null; lookLast = null; }
    pointers.delete(e.pointerId);
  }

  canvas.addEventListener('pointerdown', onDown, { passive: false });
  canvas.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  // ---------------------------------------------------------------- 升降键（按住生效）
  let liftId = null;
  function bindLift(el, dir) {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      liftId = e.pointerId;
      cam.touch.y = dir;
      if (cam.tour || cam.transition) { cam.tour = false; cam.transition = null; }
      el.classList.add('on');
    });
    const end = (e) => {
      if (liftId !== e.pointerId) return;
      liftId = null;
      cam.touch.y = 0;
      el.classList.remove('on');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
  }
  bindLift($('tu-up'), 1);
  bindLift($('tu-down'), -1);

  // ---------------------------------------------------------------- 动作条
  const bar = $('tu-actions');
  function setMenu(open) {
    if (!bar) return;
    bar.classList.toggle('open', open);
    menuEl?.setAttribute('aria-expanded', open ? 'true' : 'false');
    const ic = menuEl?.querySelector('.ic');
    if (ic) ic.textContent = open ? '✕' : '☰';
  }
  function onBar(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const fn = actions[btn.dataset.act];
    if (!fn) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu(false);          // 选完就收起，按钮不挡画面
    try { fn(); } catch (err) { console.warn('[touch] action failed', btn.dataset.act, err); }
  }
  // 用 click 而不是 pointerdown：一次点按只触发一次；也让自动化测试可以 btn.click()。
  bar?.addEventListener('click', onBar);
  menuEl?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu(!bar?.classList.contains('open'));
  });

  // ---------------------------------------------------------------- 竖屏提示（手机；平板竖屏仍可用）
  const rotate = $('tu-rotate');
  const mq = window.matchMedia ? window.matchMedia('(orientation: portrait) and (max-width: 700px)') : null;
  function syncRotate() {
    if (!rotate) return;
    rotate.classList.toggle('on', !!(mq && mq.matches));
  }
  $('tu-rotate-x')?.addEventListener('click', () => rotate.classList.remove('on'));
  mq?.addEventListener?.('change', syncRotate);
  syncRotate();

  // 抄本「新记载」角标：挂在右下角菜单按钮上，展开后可见（导览内容不再自动弹卡片）
  function setBadge(n) {
    const v = Number(n) || 0;
    if (badgeEl) badgeEl.textContent = String(v);
    menuEl?.classList.toggle('has', v > 0);
  }

  function dispose() {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    bar?.removeEventListener('click', onBar);
  }

  return {
    enabled: true,
    dispose,
    setMenu,
    setBadge,
    hint: () => toast?.('左手推摇杆飞行，右手同时拖动转视角 · 右下 ☰ 是菜单', 4600),
  };
}
