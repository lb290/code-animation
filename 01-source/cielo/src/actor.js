// actor.js — dynamic (per-frame animated) drawables.
// Two kinds:
//   Actor     : one mesh + a model matrix computed each frame (train, whale, ferris wheel)
//   InstActor : one mesh instanced N times, matrices filled each frame (koi, doves, petals)
import { mesh } from './gl.js';

export const INST_FLOATS = 20; // mat4 (16) + [phase, sway, unused, alpha] (4)

export class InstActor {
  constructor(gl, m, capacity) {
    this.gl = gl;
    this.m = m;
    this.capacity = capacity;
    this.data = new Float32Array(capacity * INST_FLOATS);
    this.buf = gl.createBuffer();
    gl.bindVertexArray(m.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 5; k++) {
      const loc = 4 + k;
      const size = k === 4 ? 4 : 4;
      const off = (k * 4) * 4;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, INST_FLOATS * 4, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    m.instances = 0;
  }
  // write one instance (i = index into the capacity)
  // mode: 0 = bird wing flap, 1 = fish tail wave, 2 = slow cloth flutter
  set(i, mt, phase = 0, sway = 0, alpha = 1, mode = 0) {
    const o = i * INST_FLOATS;
    const d = this.data;
    d[o] = mt[0]; d[o+1] = mt[1]; d[o+2] = mt[2]; d[o+3] = mt[3];
    d[o+4] = mt[4]; d[o+5] = mt[5]; d[o+6] = mt[6]; d[o+7] = mt[7];
    d[o+8] = mt[8]; d[o+9] = mt[9]; d[o+10] = mt[10]; d[o+11] = mt[11];
    d[o+12] = mt[12]; d[o+13] = mt[13]; d[o+14] = mt[14]; d[o+15] = mt[15];
    d[o+16] = phase; d[o+17] = sway; d[o+18] = mode; d[o+19] = alpha;
  }
  upload(count) {
    const gl = this.gl;
    if (count > this.capacity) {
      if (!this._warned) { this._warned = 1; console.warn('[actor] instance count ' + count + ' > capacity ' + this.capacity + '; clamping'); }
      count = this.capacity;
    }
    this.m.instances = count;
    if (count <= 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, count * INST_FLOATS));
  }
}

// Build a TRS model matrix (float32x16, column-major) with optional yaw then pitch.
export function trs(pos, yaw = 0, scale = 1, pitch = 0, roll = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Ry * Rx * Rz
  const m00 = cy * cr + sy * sp * sr, m01 = cp * sr, m02 = -sy * cr + cy * sp * sr;
  const m10 = -cy * sr + sy * sp * cr, m11 = cp * cr, m12 = sy * sr + cy * sp * cr;
  const m20 = sy * cp, m21 = -sp, m22 = cy * cp;
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  return new Float32Array([
    m00 * s[0], m01 * s[0], m02 * s[0], 0,
    m10 * s[1], m11 * s[1], m12 * s[1], 0,
    m20 * s[2], m21 * s[2], m22 * s[2], 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

export const IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
