// Minimal WebGL2 helpers: programs, meshes, instanced meshes, render targets.
// Attribute locations are fixed in the shaders (layout(location=N)), so a VAO is
// valid for every program that uses the same layout.
export const STRIDE = 11; // pos(3) normal(3) color(3) mat(2)

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 not available');
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  return gl;
}

function compile(gl, type, src, name) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || '';
    const lines = src.split('\n');
    const m = log.match(/:(\d+):/);
    let ctx = '';
    if (m) {
      const n = +m[1];
      ctx = lines
        .slice(Math.max(0, n - 4), n + 3)
        .map((l, i) => `${Math.max(1, n - 3) + i}: ${l}`)
        .join('\n');
    }
    throw new Error(`shader ${name} ${type === gl.VERTEX_SHADER ? 'vert' : 'frag'}:\n${log}\n${ctx}`);
  }
  return sh;
}

export function program(gl, vs, fs, name = '') {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, name));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link ${name}: ${gl.getProgramInfoLog(p)}`);
  const uniforms = {};
  const types = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const key = info.name.replace(/\[0\]$/, '');
    uniforms[key] = gl.getUniformLocation(p, info.name);
    types[key] = { type: info.type, size: info.size };
  }
  return { program: p, uniforms, types, name };
}

export function setUniforms(gl, prog, values) {
  const u = prog.uniforms;
  for (const k in values) {
    const loc = u[k];
    if (loc === undefined || loc === null) continue;
    const v = values[k];
    const t = prog.types[k];
    if (t && (t.type === gl.SAMPLER_2D || t.type === gl.SAMPLER_CUBE)) {
      if (typeof v === 'number') gl.uniform1i(loc, v);
      continue;
    }
    if (typeof v === 'number') gl.uniform1f(loc, v);
    else if (typeof v === 'boolean') gl.uniform1i(loc, v ? 1 : 0);
    else if (v.length === 2) gl.uniform2fv(loc, v);
    else if (v.length === 3) gl.uniform3fv(loc, v);
    else if (v.length === 4) gl.uniform4fv(loc, v);
    else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
    else if (t && t.size > 1) {
      if (v.length === t.size * 4) gl.uniform4fv(loc, v);
      else if (v.length === t.size * 3) gl.uniform3fv(loc, v);
      else if (v.length === t.size * 2) gl.uniform2fv(loc, v);
      else if (v.length === t.size) gl.uniform1fv(loc, v);
    }
  }
}

const ATTRS = [
  ['aPos', 3, 0],
  ['aNormal', 3, 12],
  ['aColor', 3, 24],
  ['aMat', 2, 36],
];

function setupAttribs(gl) {
  const S = STRIDE * 4;
  for (const [name, size, off] of ATTRS) {
    const loc = { aPos: 0, aNormal: 1, aColor: 2, aMat: 3 }[name];
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, S, off);
  }
}

export function mesh(gl, verts, indices, mode) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const varr = verts instanceof Float32Array ? verts : new Float32Array(verts);
  gl.bufferData(gl.ARRAY_BUFFER, varr, gl.STATIC_DRAW);
  setupAttribs(gl);
  let ibo = null, count;
  if (indices && indices.length) {
    ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const arr = indices instanceof Uint32Array ? indices : new Uint32Array(indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    count = arr.length;
  } else {
    count = varr.length / STRIDE;
  }
  gl.bindVertexArray(null);
  const vertCount = varr.length / STRIDE;
  let maxIndex = -1;
  if (indices && indices.length) {
    const ia = indices instanceof Uint32Array ? indices : new Uint32Array(indices);
    for (let i = 0; i < ia.length; i++) if (ia[i] > maxIndex) maxIndex = ia[i];
    if (maxIndex >= vertCount) {
      console.warn('[gl] mesh has an index (' + maxIndex + ') beyond its vertex count (' + vertCount + ') — verts and indices came from different builders');
    }
  }
  return { vao, vbo, ibo, count, mode: mode ?? gl.TRIANGLES, instances: 0, vertCount, maxIndex };
}


// 流式上传：geo.js 的 chunked B 把顶点/索引存在一串小块 TypedArray 里。这里先按最终
// 字节数 bufferData 一个空缓冲，再把每块 bufferSubData 进去 —— 不需要先把整个世界的
// 顶点拼成一个 270 MB 的 Float32Array（第十二轮手机 OOM 的最后一根稻草）。
export function meshChunked(gl, b) {
  const v = b.v, ix = b.i;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, v.length * 4, gl.STATIC_DRAW);
  // 每块拷"有效长度" used[k]：块尾可能留不到 11 个 float 的空位，拷整块会让后面所有顶点错位
  let off = 0;
  for (let k = 0; k < v.c.length; k++) {
    const take = v.used[k];
    if (take > 0) gl.bufferSubData(gl.ARRAY_BUFFER, off * 4, v.c[k].subarray(0, take));
    off += take;
  }
  setupAttribs(gl);
  let ibo = null, count;
  if (ix.length) {
    ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ix.length * 4, gl.STATIC_DRAW);
    off = 0;
    for (let k = 0; k < ix.c.length; k++) {
      const take = ix.used[k];
      if (take > 0) gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, off * 4, ix.c[k].subarray(0, take));
      off += take;
    }
    count = ix.length;
  } else {
    count = Math.round(v.length / STRIDE);
  }
  gl.bindVertexArray(null);
  const vertCount = Math.round(v.length / STRIDE);
  return { vao, vbo, ibo, count, mode: gl.TRIANGLES, instances: 0, vertCount, maxIndex: vertCount - 1 };
}

// Mesh with a caller-defined vertex layout (used by the fish lantern, whose
// vertices carry surface parameters in attributes 4 and 5).
export function customMesh(gl, verts, indices, layout, strideFloats) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const arr = verts instanceof Float32Array ? verts : new Float32Array(verts);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  const S = strideFloats * 4;
  for (const it of layout) {
    gl.enableVertexAttribArray(it.loc);
    gl.vertexAttribPointer(it.loc, it.size, gl.FLOAT, false, S, (it.offset || 0) * 4);
  }
  let ibo = null, count;
  if (indices && indices.length) {
    ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const ia = indices instanceof Uint32Array ? indices : new Uint32Array(indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ia, gl.STATIC_DRAW);
    count = ia.length;
  } else {
    count = arr.length / strideFloats;
  }
  gl.bindVertexArray(null);
  return { vao, vbo, ibo, count, mode: gl.TRIANGLES, instances: 0 };
}

// instLayout: [{loc, size, offset}] with a shared stride in floats
export function addInstances(gl, m, data, instLayout, strideFloats) {
  gl.bindVertexArray(m.vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const arr = data instanceof Float32Array ? data : new Float32Array(data);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  const S = strideFloats * 4;
  for (const it of instLayout) {
    gl.enableVertexAttribArray(it.loc);
    gl.vertexAttribPointer(it.loc, it.size, gl.FLOAT, false, S, it.offset * 4);
    gl.vertexAttribDivisor(it.loc, 1);
  }
  gl.bindVertexArray(null);
  m.instances = arr.length / strideFloats;
  m.instBuf = buf;
  return m;
}

export function drawMesh(gl, m) {
  gl.bindVertexArray(m.vao);
  if (m.ibo) gl.drawElementsInstanced(m.mode, m.count, gl.UNSIGNED_INT, 0, Math.max(1, m.instances));
  else gl.drawArraysInstanced(m.mode, 0, m.count, Math.max(1, m.instances));
}

// Fullscreen triangle: positions in clip space, other attributes unused.
export function quad(gl) {
  const V = (x, y) => [x, y, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  return mesh(gl, [...V(-1, -1), ...V(3, -1), ...V(-1, 3)], null, gl.TRIANGLES);
}

// ------------------------------------------------------------ render targets
export function makeRT(gl, w, h, opts = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const internal = opts.internal || gl.RGBA16F;
  const type = opts.type || gl.HALF_FLOAT;
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
  const filter = opts.nearest ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let depth = null;
  if (opts.depth) {
    depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  }
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete ' + status);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, depth, w, h };
}

// Depth-only target for the sun shadow map (no colour attachment).
export function makeDepthRT(gl, size) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('shadow fbo incomplete ' + status);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, size, w: size, h: size };
}

export function freeRT(gl, rt) {
  if (!rt) return;
  gl.deleteTexture(rt.tex);
  gl.deleteFramebuffer(rt.fbo);
  if (rt.depth) gl.deleteRenderbuffer(rt.depth);
}