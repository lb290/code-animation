// Dynamic instanced billboards: sky lanterns, embers, fireworks, mist.
import { mesh, addInstances } from './gl.js';

const QUAD_V = [
  // aPos corner (xy), normal, colour, mat  -- only aPos is used
  -1, -1, 0, 0, 0, 1, 1, 1, 1, 0, 0,
  1, -1, 0, 0, 0, 1, 1, 1, 1, 0, 0,
  1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0,
  -1, -1, 0, 0, 0, 1, 1, 1, 1, 0, 0,
  1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0,
  -1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0,
];
const QUAD_I = [0, 1, 2, 3, 4, 5];

// instance layout: pos(3) + (size, rot, alpha, shape)(4) + colour(3) = 10 floats
export const INST_STRIDE = 10;
export const INST_LAYOUT = [
  { loc: 4, size: 3, offset: 0 },
  { loc: 5, size: 4, offset: 3 },
  { loc: 6, size: 3, offset: 7 },
];

export class Billboards {
  constructor(gl, capacity) {
    this.gl = gl;
    this.m = mesh(gl, QUAD_V, QUAD_I);
    this.capacity = capacity;
    this.data = new Float32Array(capacity * INST_STRIDE);
    this.count = 0;
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.m.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    for (const it of INST_LAYOUT) {
      gl.enableVertexAttribArray(it.loc);
      gl.vertexAttribPointer(it.loc, it.size, gl.FLOAT, false, INST_STRIDE * 4, it.offset * 4);
      gl.vertexAttribDivisor(it.loc, 1);
    }
    gl.bindVertexArray(null);
    this.m.instances = 0;
  }
  begin() {
    this.count = 0;
  }
  add(x, y, z, size, rot, alpha, shape, col) {
    if (this.count >= this.capacity) {
      if (!this._warned) { this._warned = 1; console.warn('[fx] billboard capacity ' + this.capacity + ' exceeded — extra sprites are being dropped'); }
      return;
    }
    const o = this.count * INST_STRIDE;
    const d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = size; d[o + 4] = rot; d[o + 5] = alpha; d[o + 6] = shape;
    d[o + 7] = col[0]; d[o + 8] = col[1]; d[o + 9] = col[2];
    this.count++;
  }
  upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * INST_STRIDE));
    this.m.instances = this.count;
  }
}

// Static billboards: built once, one upload.
export function staticBillboards(gl, items) {
  const bb = new Billboards(gl, Math.max(1, items.length));
  bb.begin();
  for (const it of items) bb.add(it.p[0], it.p[1], it.p[2], it.size, it.rot || 0, it.alpha ?? 1, it.shape ?? 1, it.col);
  bb.upload();
  return bb;
}

// A small CPU particle system for embers / sky lanterns / fireworks.
export class ParticleField {
  constructor(gl, capacity) {
    this.gl = gl;
    this.bb = new Billboards(gl, capacity);
    this.parts = [];
    this.capacity = capacity;
  }
  spawn(p) {
    if (this.parts.length < this.capacity) this.parts.push(p);
  }
  update(dt, time) {
    const arr = this.parts;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) {
        arr.splice(i, 1);
        continue;
      }
      if (p.update) p.update(p, dt, time);
      else {
        p.p[0] += p.v[0] * dt;
        p.p[1] += p.v[1] * dt;
        p.p[2] += p.v[2] * dt;
      }
    }
  }
  draw() {
    this.bb.begin();
    for (const p of this.parts) {
      const a = p.fade ? Math.min(1, p.life / p.fade) : 1;
      this.bb.add(p.p[0], p.p[1], p.p[2], p.size, p.rot || 0, (p.alpha ?? 1) * a, p.shape ?? 0, p.col);
    }
    this.bb.upload();
    return this.bb;
  }
}
