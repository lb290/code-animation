// camera.js — 星鲸环的自由飞行 + 观景点过渡 + 一条环站环绕的自动巡游。
// 与 CIELO 的 Camera 同构（键位/过渡/触屏输入一致），观景点与巡游路径是本世界自己的。
import { clamp, norm, sub, cross, add, scale as vs, TAU, catmull } from './engine.js';
import { L, ST } from './layout.js';

export const VIEWS = L.views;

// 自动巡游：绕环站一圈的半空样条（16 点），镜头始终看向站点中心附近。
const TOUR = (() => {
  const pts = [];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + 0.35;
    const r = 1080 + Math.sin(a * 3.0) * 260;
    const y = 120 + Math.sin(a * 2.0 + 1.2) * 220;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return pts;
})();
const TOUR_LOOK = TOUR.map((p, i) => [0, 40 + Math.sin(i * 0.7) * 90, 0]);
const TOUR_FOV = TOUR.map((_, i) => 52 + Math.sin(i * 0.9) * 8);
const TOUR_SECONDS = 132;

export class Camera {
  constructor() {
    this.pos = [...VIEWS[0].pos];
    this.look = [...VIEWS[0].look];
    const d = norm(sub(this.look, this.pos));
    this.yaw = Math.atan2(d[0], d[2]);
    this.pitch = Math.asin(clamp(d[1], -1, 1));
    this.fov = VIEWS[0].fov;
    this.vel = [0, 0, 0];
    this.keys = new Set();
    this.tour = false;
    this.tourT = 0;
    this.transition = null;
    this.lookAt = [...VIEWS[0].look];
    this.speedMul = 1;
    this.viewIndex = 0;
    this.touch = { x: 0, z: 0, y: 0 };
  }
  get forward() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return [Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp];
  }
  basis() {
    const f = this.forward;
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    return { f, r, u };
  }
  viewMatrix() {
    // 与 CIELO 同一套：先算视线方向，再由 yaw/pitch 构造
    return null; // 由 main.js 用 m4.lookAt 现算（见 main.js）
  }
  setView(i, instant = false) {
    this.viewIndex = ((i % VIEWS.length) + VIEWS.length) % VIEWS.length;
    const v = VIEWS[this.viewIndex];
    this.tour = false;
    this.lookAt = [...v.look];
    if (instant) {
      this.pos = [...v.pos];
      this.fov = v.fov;
      const d = norm(sub(v.look, v.pos));
      this.yaw = Math.atan2(d[0], d[2]);
      this.pitch = Math.asin(clamp(d[1], -1, 1));
      this.transition = null;
      this.vel = [0, 0, 0];
      return;
    }
    this.transition = {
      t: 0, dur: 1.8,
      fromPos: [...this.pos], fromYaw: this.yaw, fromPitch: this.pitch, fromFov: this.fov,
      toPos: [...v.pos], toLook: [...v.look], toFov: v.fov,
    };
  }
  setCam(pos, look, fov) {
    this.pos = [...pos];
    this.look = [...look];
    const d = norm(sub(look, pos));
    this.yaw = Math.atan2(d[0], d[2]);
    this.pitch = Math.asin(clamp(d[1], -1, 1));
    this.fov = fov;
    this.transition = null;
    this.tour = false;
    this.lookAt = [...look];
  }
  startTour() { this.tour = true; this.tourT = 0; this.transition = null; }
  stopTour() { this.tour = false; }
  onKey(code, down) {
    if (down) this.keys.add(code); else this.keys.delete(code);
    if (down && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space'].includes(code) && (this.tour || this.transition)) {
      this.tour = false;
      this.transition = null;
    }
  }
  onMouse(dx, dy) {
    if (this.tour) this.tour = false;
    this.yaw -= dx * 0.0022;
    this.pitch = clamp(this.pitch - dy * 0.0022, -1.45, 1.45);
    if (this.transition) this.transition = null;
  }
  update(dt) {
    if (this.tour) {
      this.tourT = (this.tourT + dt / TOUR_SECONDS) % 1;
      const u = this.tourT;
      const p = catmull(TOUR, u, true);
      const l = catmull(TOUR_LOOK, u, true);
      this.pos = p;
      this.lookAt = l;
      const d = norm(sub(l, p));
      const wantYaw = Math.atan2(d[0], d[2]);
      const wantPitch = Math.asin(clamp(d[1], -1, 1));
      this.yaw = this.yaw + ((((wantYaw - this.yaw + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 8));
      this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 8);
      const fi = u * TOUR_FOV.length;
      const f0 = Math.floor(fi) % TOUR_FOV.length, f1 = (f0 + 1) % TOUR_FOV.length;
      this.fov = TOUR_FOV[f0] + (TOUR_FOV[f1] - TOUR_FOV[f0]) * (fi - Math.floor(fi));
      return;
    }
    if (this.transition) {
      const tr = this.transition;
      tr.t += dt;
      const k = (tr.t / tr.dur) < 1 ? (1 - Math.pow(1 - (tr.t / tr.dur), 3)) : 1;
      this.pos = [
        tr.fromPos[0] + (tr.toPos[0] - tr.fromPos[0]) * k,
        tr.fromPos[1] + (tr.toPos[1] - tr.fromPos[1]) * k,
        tr.fromPos[2] + (tr.toPos[2] - tr.fromPos[2]) * k,
      ];
      const d = norm(sub(tr.toLook, tr.toPos));
      const toYaw = Math.atan2(d[0], d[2]);
      const toPitch = Math.asin(clamp(d[1], -1, 1));
      const dy = ((toYaw - tr.fromYaw + Math.PI * 3) % TAU) - Math.PI;
      this.yaw = tr.fromYaw + dy * k;
      this.pitch = tr.fromPitch + (toPitch - tr.fromPitch) * k;
      this.fov = tr.fromFov + (tr.toFov - tr.fromFov) * k;
      if (tr.t >= tr.dur) { this.transition = null; this.lookAt = [...tr.toLook]; }
      return;
    }
    const { f, r, u } = this.basis();
    const K = this.keys;
    const ax = (K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0);
    const ay = (K.has('KeyE') ? 1 : 0) - (K.has('KeyQ') ? 1 : 0);
    const az = (K.has('KeyW') ? 1 : 0) - (K.has('KeyS') ? 1 : 0);
    const t = this.touch;
    const tx = clamp(t.x, -1, 1), tz = clamp(t.z, -1, 1), ty = clamp(t.y, -1, 1);
    const tmag = Math.hypot(tx, tz);
    const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 3.6 : 1;
    const speed = 44 * fast * this.speedMul;
    // 触屏摇杆：touch.js 里 z = -dy/R（手指往上推 → z>0 = 前进），所以是 az + tz
    const want = add(add(vs(r, ax), vs(u, ay + ty)), vs(f, az + tz));
    const wl = Math.hypot(want[0], want[1], want[2]) || 1;
    const mag = tmag > 0 ? tmag : Math.min(1, Math.hypot(ax, ay + ty, az - tz));
    const target = vs(want, (speed * mag) / wl);
    const k2 = 1 - Math.exp(-9 * dt);
    this.vel = [this.vel[0] + (target[0] - this.vel[0]) * k2, this.vel[1] + (target[1] - this.vel[1]) * k2, this.vel[2] + (target[2] - this.vel[2]) * k2];
    this.pos = [this.pos[0] + this.vel[0] * dt, this.pos[1] + this.vel[1] * dt, this.pos[2] + this.vel[2] * dt];
    // 太空的"地板"：不要撞进行星/掉出世界（软边界，反弹感）
    const R = Math.hypot(this.pos[0], this.pos[1], this.pos[2]);
    if (R > 3200) {
      const k = 3200 / R;
      this.pos = [this.pos[0] * k, this.pos[1] * k, this.pos[2] * k];
      this.vel = vs(this.vel, 0.2);
    }
  }
}
