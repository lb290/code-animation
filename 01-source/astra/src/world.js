// world.js — ASTRA 世界组装。
// 与 CIELO 的 world.js 同构：每个内容模块一个 tag()，几何分块流式上传，模块失败不静默。
// 顺序 = 空间关系：先环站外壳，再核心塔（含穹顶内景），最后太空道具。
import { B } from './engine.js';
import { meshChunked } from '../../cielo/src/gl.js';
import { buildStationRing } from './station-ring.js';
import { buildStationCore } from './station-core.js';
import { buildSpaceProps } from './space-props.js';

export function buildWorld(gl) {
  const BATCH_TRI = Number(new URLSearchParams(location.search).get('batch') || 200000);
  const meshes = [];
  const b = new B({ chunked: true });
  const flush = () => {
    if (!b.i.length) return;
    const m1 = meshChunked(gl, b);
    const err = gl.getError();
    if (err !== gl.NO_ERROR) ctx.failures.push({ name: 'upload', msg: 'gl error 0x' + err.toString(16) + ' at tri ' + Math.round(b.triCount) });
    meshes.push(m1);
    b.reset();
  };
  const ctx = {
    gl,
    failures: [],
    points: [],       // 点光 {p,col,range,int}
    lanterns: [],     // 静态 billboard {p,size,rot,alpha,shape,col}
    dyn: [],          // 动态 actor（本轮不用）
    bbDyn: [],        // 动态 billboard 系统（光尘）
    props: {},        // 模块间交接
    triLog: {},
  };
  const OFF_MOD = new Set(((new URLSearchParams(location.search).get('nomod') || '')).split(',').filter(Boolean));
  const tag = (name, fn) => {
    if (OFF_MOD.has(name)) { ctx.triLog[name] = 0; return; }
    const i0 = b.i.length / 3;
    try {
      fn();
    } catch (e) {
      console.warn('[world] module ' + name + ' failed:', e && e.message, e && e.stack);
      ctx.failures.push({ name, msg: String((e && e.message) || e) });
    }
    ctx.triLog[name] = (ctx.triLog[name] || 0) + (b.i.length / 3 - i0);
    if (b.i.length / 3 >= BATCH_TRI) flush();
  };

  tag('stationRing', () => buildStationRing(b, ctx));
  tag('stationCore', () => buildStationCore(b, ctx));
  tag('spaceProps', () => buildSpaceProps(b, ctx));

  flush();
  b.release();
  let tris = 0, verts = 0;
  for (const m of meshes) { tris += m.count / 3; verts += m.vertCount; }
  return { mesh: meshes[0] || null, meshes, ctx, tris, verts };
}
