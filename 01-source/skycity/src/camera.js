// Camera: free flight, scripted tour, smooth viewpoint transitions.
import { m4, clamp, lerp, ease, catmull, damp, norm, sub, add, scale as vs, cross, TAU } from './math.js';

export const VIEWS = [
  { name: '云上之城', pos: [-146, 44, 236], look: [0, 58, 0], fov: 44 },
  { name: '灯市', pos: [33, 4.0, 32], look: [7, 6.5, 44], fov: 62 },
  { name: '俯瞰', pos: [128, 168, 196], look: [0, 6, 0], fov: 48 },
  { name: '灯桥', pos: [3, 6.5, 88], look: [0, 30, 0], fov: 52 },
  { name: '鲤群', pos: [64, 30, 66], look: [34, 24, -4], fov: 46 },
  { name: '岛底', pos: [-138, -74, 118], look: [0, 40, 0], fov: 54 },
  { name: '云海', pos: [206, 14, 150], look: [-80, -60, 10], fov: 50 },
  { name: '高塔', pos: [150, 66, -120], look: [0, 22, 0], fov: 46 },
];

const TOUR = [
  [0, 76, 250], [30, 44, 176], [4, 16, 92], [-38, 12, 54],
  [-96, 22, 4], [-118, 34, -46], [-52, 30, -74], [24, 38, -60],
  [70, 46, -6], [52, 30, 66], [10, 20, 108], [-16, 30, 150],
];
const TOUR_LOOK = [
  [0, 8, 0], [0, 12, 20], [0, 18, 0], [0, 22, -10],
  [-120, 18, -30], [-134, 14, -34], [0, 20, -10], [0, 18, 0],
  [0, 16, 0], [0, 10, 60], [0, 6, 132], [0, 20, 0],
];

export class Camera {
  constructor() {
    this.pos = [0, 62, 236];
    this.yaw = Math.PI;
    this.pitch = -0.14;
    this.fov = 48;
    this.vel = [0, 0, 0];
    this.keys = new Set();
    this.tour = false;
    this.tourT = 0;
    this.transition = null;
    this.lookAt = [0, 8, 0];
    this.freeLook = false;
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
    const v = VIEWS[i % VIEWS.length];
    this.tour = false;
    this.lookAt = v.look;
    if (instant) {
      this.pos = [...v.pos];
      this.fov = v.fov;
      const d = norm(sub(v.look, v.pos));
      this.yaw = Math.atan2(d[0], d[2]);
      this.pitch = Math.asin(clamp(d[1], -1, 1));
      this.transition = null;
      return;
    }
    this.transition = {
      t: 0, dur: 1.6,
      fromPos: [...this.pos], fromYaw: this.yaw, fromPitch: this.pitch, fromFov: this.fov,
      toPos: v.pos, toLook: v.look, toFov: v.fov,
    };
  }
  startTour() {
    this.tour = true;
    this.tourT = 0;
    this.transition = null;
    this.lookAt = [0, 8, 0];
  }
  stopTour() {
    this.tour = false;
  }
  onKey(code, down) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    if (down && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(code) && (this.tour || this.transition)) {
      this.tour = false;
      this.transition = null;
    }
  }
  onMouse(dx, dy) {
    if (this.tour) return;
    this.yaw -= dx * 0.0022;
    this.pitch = clamp(this.pitch - dy * 0.0022, -1.45, 1.45);
    if (this.transition) this.transition = null;
  }
  update(dt) {
    if (this.tour) {
      this.tourT += dt * 0.018;
      const u = this.tourT % 1;
      const p = catmull(TOUR, u);
      const l = catmull(TOUR_LOOK, u);
      this.pos = [p[0], p[1], p[2]];
      this.lookAt = l;
      const d = norm(sub(l, p));
      this.yaw = Math.atan2(d[0], d[2]);
      this.pitch = Math.asin(clamp(d[1], -1, 1));
      this.fov = 50;
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
      // shortest yaw path
      let dy = toYaw - tr.fromYaw;
      while (dy > Math.PI) dy -= TAU;
      while (dy < -Math.PI) dy += TAU;
      this.yaw = tr.fromYaw + dy * k;
      this.pitch = lerp(tr.fromPitch, toPitch, k);
      this.fov = lerp(tr.fromFov, tr.toFov, k);
      this.lookAt = tr.toLook;
      if (tr.t >= tr.dur) this.transition = null;
      return;
    }
    // free flight
    const { f, r, u } = this.basis();
    let ax = 0, ay = 0, az = 0;
    if (this.keys.has('KeyW')) az += 1;
    if (this.keys.has('KeyS')) az -= 1;
    if (this.keys.has('KeyD')) ax += 1;
    if (this.keys.has('KeyA')) ax -= 1;
    if (this.keys.has('KeyE') || this.keys.has('Space')) ay += 1;
    if (this.keys.has('KeyQ') || this.keys.has('ShiftLeft')) ay -= 1;
    const fast = this.keys.has('ShiftRight') ? 3.2 : 1;
    const speed = 26 * fast;
    const want = add(add(vs(r, ax), vs(u, ay)), vs(f, az));
    const wl = Math.hypot(...want) || 1;
    const target = vs(want, speed / wl);
    for (let i = 0; i < 3; i++) {
      this.vel[i] = damp(this.vel[i], target[i], 7, dt);
      this.pos[i] += this.vel[i] * dt;
    }
    // soft bounds: keep the camera in the world
    this.pos[0] = clamp(this.pos[0], -420, 420);
    this.pos[1] = clamp(this.pos[1], -190, 220);
    this.pos[2] = clamp(this.pos[2], -420, 420);
  }
  viewMatrix() {
    const f = this.forward;
    return m4.lookAt(this.pos, add(this.pos, f), [0, 1, 0]);
  }
}