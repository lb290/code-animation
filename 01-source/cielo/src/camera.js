// camera.js — free flight, scripted cinematic tour, smooth viewpoint transitions.
import { m4, clamp, lerp, ease, catmull, damp, norm, sub, add, scale as vs, cross, TAU } from './math.js';
import { L } from './layout.js';

export const VIEWS = L.views;

// ---- cinematic tour: a single closed spline through the whole city ----------
const TOUR = [
  [4, 32.8, 90],      // 1 stand on the terrace behind the balustrade
  [2, 30.0, 78],      // 2 step off the edge, dropping over the boulevard
  [1, 16.0, 58],      // 3 fall into the avenue
  [1, 5.0, 30],       // 4 street level
  [2, 6.0, -14],      // 5 down the boulevard
  [10, 8.0, -44],     // 6 the fountain plaza
  [-4, 12.0, -78],    // 7 under the viaduct
  [-34, 20.0, -110],  // 8 rise toward the cathedral
  [-78, 34.0, -104],  // 9 cathedral flank
  [-124, 46.0, -60],  // 10 round the west spires
  [-140, 62.0, 4],    // 11 over the rooftops
  [-104, 74.0, 62],   // 12 into the sky over the palace
  [-14, 86.0, 96],    // 13
  [76, 96.0, 76],     // 14 the glass dome
  [126, 108.0, 34],   // 15
  [112, 124.0, -18],  // 16
  [58, 190.0, -52],   // 17 climbing to the whale
  [-16, 310.0, -120], // 18
  [-120, 430.0, -210],// 19 beside the whale-city
  [-210, 400.0, -80], // 20
  [-150, 250.0, 30],  // 21
  [-44, 92.0, 84],    // 22
  [0, 52.0, 104],     // 23
  [4, 32.8, 90],      // 24 back on the terrace
];
const TOUR_LOOK = [
  [-20, 44, -200],    // 1
  [-14, 30, -210],    // 2
  [-6, 16, -200],     // 3
  [0, 12, -180],      // 4
  [0, 14, -150],      // 5
  [0, 16, -120],      // 6
  [-20, 24, -140],    // 7
  [-96, 74, -24],     // 8
  [-98, 84, -20],     // 9
  [-96, 60, 10],      // 10
  [-40, 40, 80],      // 11
  [40, 60, 80],       // 12
  [104, 112, 44],     // 13
  [104, 118, 44],     // 14
  [100, 110, 60],     // 15
  [40, 120, -40],     // 16
  [-20, 200, -170],   // 17
  [-70, 330, -250],   // 18
  [-180, 450, -330],  // 19
  [-320, 430, -300],  // 20
  [-250, 320, -90],   // 21
  [-10, 60, -120],    // 22
  [-16, 46, -200],    // 23
  [-20, 44, -200],    // 24
];
const TOUR_FOV = [58, 60, 64, 66, 64, 62, 60, 56, 52, 56, 58, 60, 56, 48, 50, 56, 58, 54, 52, 56, 58, 58, 58, 58];
const TOUR_SECONDS = 108;

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
    this.shake = 0;
    this.speedMul = 1;
    this.viewIndex = 0;
    // round 11: 触屏摇杆输入（-1..1，x=左右平移，z=前后，y=升降）。桌面永远保持 0。
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
      t: 0, dur: 1.7,
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
  startTour() {
    this.tour = true;
    this.tourT = 0;
    this.transition = null;
  }
  stopTour() {
    this.tour = false;
  }
  onKey(code, down) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
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
      // smooth the aim so spline corners do not snap
      this.yaw = this.yaw + ((((wantYaw - this.yaw + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 8));
      this.pitch = damp(this.pitch, wantPitch, 8, dt);
      // fov follows the same spline
      const fi = u * TOUR_FOV.length;
      const f0 = Math.floor(fi) % TOUR_FOV.length, f1 = (f0 + 1) % TOUR_FOV.length;
      this.fov = lerp(TOUR_FOV[f0], TOUR_FOV[f1], fi - Math.floor(fi));
      this.vel = [0, 0, 0];
      return;
    }
    if (this.transition) {
      const tr = this.transition;
      tr.t += dt;
      const k = ease.inOutCubic(clamp(tr.t / tr.dur, 0, 1));
      this.pos = [
        lerp(tr.fromPos[0], tr.toPos[0], k),
        lerp(tr.fromPos[1], tr.toPos[1], k),
        lerp(tr.fromPos[2], tr.toPos[2], k),
      ];
      const d = norm(sub(tr.toLook, tr.toPos));
      const toYaw = Math.atan2(d[0], d[2]);
      const toPitch = Math.asin(clamp(d[1], -1, 1));
      let dy = toYaw - tr.fromYaw;
      while (dy > Math.PI) dy -= TAU;
      while (dy < -Math.PI) dy += TAU;
      this.yaw = tr.fromYaw + dy * k;
      this.pitch = lerp(tr.fromPitch, toPitch, k);
      this.fov = lerp(tr.fromFov, tr.toFov, k);
      this.lookAt = tr.toLook;
      if (tr.t >= tr.dur) { this.look = [...tr.toLook]; this.transition = null; }
      return;
    }
    const { f, r, u } = this.basis();
    let ax = 0, ay = 0, az = 0;
    if (this.keys.has('KeyW')) az += 1;
    if (this.keys.has('KeyS')) az -= 1;
    if (this.keys.has('KeyD')) ax += 1;
    if (this.keys.has('KeyA')) ax -= 1;
    if (this.keys.has('KeyE') || this.keys.has('Space')) ay += 1;
    if (this.keys.has('KeyQ')) ay -= 1;
    // round 11: 触屏摇杆是模拟量，按下越远走得越快（键盘仍为满速）
    const t = this.touch;
    let tmag = 0;
    if (t && (t.x || t.z || t.y)) {
      const tx = clamp(t.x, -1, 1), tz = clamp(t.z, -1, 1), ty = clamp(t.y, -1, 1);
      ax += tx; az += tz; ay += ty;
      tmag = Math.min(1, Math.hypot(tx, tz, ty));
    }
    const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 3.4 : 1;
    const speed = 30 * fast * this.speedMul;
    const want = add(add(vs(r, ax), vs(u, ay)), vs(f, az));
    const wl = Math.hypot(want[0], want[1], want[2]) || 1;
    const mag = tmag > 0 ? tmag : Math.min(1, Math.hypot(ax, ay, az));
    const target = vs(want, (speed * mag) / wl);
    for (let i = 0; i < 3; i++) {
      this.vel[i] = damp(this.vel[i], target[i], 7, dt);
      this.pos[i] += this.vel[i] * dt;
    }
    this.pos[0] = clamp(this.pos[0], -1500, 1500);
    this.pos[1] = clamp(this.pos[1], -20, 1150);
    this.pos[2] = clamp(this.pos[2], -1500, 1500);
    // keep the visitor from dropping through the plaza
    if (this.pos[1] < 2.2) this.pos[1] = 2.2;
  }
  viewMatrix() {
    const f = this.forward;
    return m4.lookAt(this.pos, add(this.pos, f), [0, 1, 0]);
  }
}
