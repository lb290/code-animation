// 分块几何累加器体检（第十二轮手机 OOM 修复的回归网）
//   node tools/geo-acc-check.mjs
//
// 背景：world.js 现在用 B({chunked:true}) 把顶点写进固定大小的 Float32Array/
// Uint32Array 块，再按批流式上传。第一版漏了一个细节：一条顶点不能跨块，所以每块
// 尾部会留下不到 11 个 float 的空位；上传时若按"整块长度"拷贝，后面所有顶点会整体
// 错位 —— 屏幕上表现为城市大块消失 + 黑色剪影 + 彩色竖条（已经踩过一次）。
//
// 本检查断言：
//   1. 跨块（>1 个 chunk）时，chunked 模式输出的顶点/索引与普通数组模式逐字节相同；
//   2. 每块的有效长度 used[k] 总和等于总数 n（不会漏拷/多拷）；
//   3. reset() 复用块后重新累积，结果与新建 B 完全一致（分批上传的正确性）；
//   4. 默认模式（体检脚本直接读 b.v[i] 的那条路径）不受影响。
import { B, box, cylinder, sphere, lathe, torus } from '../src/geo.js';

let fails = 0;
function ok(name, cond, detail) {
  if (!cond) fails++;
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  ' + detail : ''));
}

// ---- 1. 合成几何：4 万个盒子 = 48 万三角 ≈ 1584 万个 float，跨很多块
function synth(opts, n) {
  const b = new B(opts);
  for (let i = 0; i < n; i++) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (i % 400) * 2, (i % 37) * 0.3, Math.floor(i / 400) * 2, 1]);
    box(b, 1, 1, 1, [0.5, 0.4, 0.3]);
    b.pop();
    if (i % 5000 === 0) {
      cylinder(b, 8, 1, 1.2, 3, [0.2, 0.7, 0.4]);
      sphere(b, 1.5, [0.9, 0.2, 0.1], undefined, { rings: 4, seg: 6 });
      torus(b, 2, 0.3, 8, 6, [0.1, 0.2, 0.9]);
      lathe(b, [[0.2, 0], [1, 0.5], [0.6, 1.2]], 7, [0.3, 0.5, 0.8]);
    }
  }
  return b;
}

const plain = synth(undefined, 40000);
const chunk = synth({ chunked: true }, 40000);
const P = plain.build();
const C = chunk.build();

ok('identical vertex count', P.verts.length === C.verts.length, P.verts.length + ' vs ' + C.verts.length);
ok('crossed many vertex chunks', chunk.v.c.length > 20, chunk.v.c.length + ' chunks');
ok('crossed many index chunks', chunk.i.c.length > 5, chunk.i.c.length + ' chunks');

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return -1;
}
let d = firstDiff(P.verts, C.verts);
ok('chunked vertices byte-identical to plain arrays', d < 0, d < 0 ? '' : 'first diff at float ' + d);
d = firstDiff(P.indices, C.indices);
ok('chunked indices byte-identical to plain arrays', d < 0, d < 0 ? '' : 'first diff at index ' + d);

// ---- 2. used[] 覆盖率
const sumUsed = chunk.v.used.reduce((a, x) => a + x, 0);
ok('vertex used[] sums to n', sumUsed === chunk.v.n, sumUsed + ' vs ' + chunk.v.n);
const sumUsedI = chunk.i.used.reduce((a, x) => a + x, 0);
ok('index used[] sums to n', sumUsedI === chunk.i.n, sumUsedI + ' vs ' + chunk.i.n);
// 块尾空位必然存在（11 不整除 262144），这正是那个 bug 的条件
ok('chunk tail padding exists (the bug condition is covered)', chunk.v.used.some((x) => x !== chunk.v.c[0].length));

// ---- 3. reset() 复用块后与新建 B 一致
const reuse = new B({ chunked: true });
synth({ chunked: true }, 3000);                      // 预热出若干块
reuse.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
box(reuse, 1, 1, 1, [0.5, 0.4, 0.3]);
reuse.reset();
for (let i = 0; i < 4000; i++) {
  reuse.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (i % 900) * 0.9, 0, 0, 1]);
  box(reuse, 1, 1, 1, [0.5, 0.4, 0.3]);
  reuse.pop();
}
const fresh = new B({ chunked: true });
for (let i = 0; i < 4000; i++) {
  fresh.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (i % 900) * 0.9, 0, 0, 1]);
  box(fresh, 1, 1, 1, [0.5, 0.4, 0.3]);
  fresh.pop();
}
const R = reuse.build().verts, F = fresh.build().verts;
ok('reset() + reuse identical to fresh builder', firstDiff(R, F) < 0, R.length + ' floats');
reuse.release();
ok('release() drops chunks', reuse.v.c.length === 0 && reuse.v.n === 0);

console.log('\n' + (fails === 0 ? 'ALL PASS' : fails + ' FAILED'));
process.exit(fails === 0 ? 0 : 1);