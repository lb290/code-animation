# CIELO 第三轮 · 精细角色与生灵（2026-11-22）

用户反馈（原话）：「天空鲸城，把鸽子，空中的鱼群，女孩，长颈鹿，做精细，气球要飘动。」
= 已有场景不变，把 **鸽子 / 空中鱼群 / 女孩 / 长颈鹿** 做精细，并让 **气球真正飘动**。

## 0. 工程与硬规则（先读，违者画面会坏）

工作目录：`F:/AI/dsh/code-animation/01-source/cielo`

- 引擎：自研单文件 WebGL2。几何全用 `src/geo.js` 的 `B` builder 程序化生成，
  颜色是 **linear rgb**（用 `C.*` 色板或 `mixc/mulc`，禁止直接写 sRGB 0..255）。
- **每个 `b.push(mat)` 必须配对 `b.pop()`**；矩阵 **必须 16 个 float**（末位 1）。
- 随机数一律用传入的 `rng()`（mulberry32），**禁止 Math.random** —— 否则静帧不可复现。
- 材质用 `MT.*`（matte/cloth/skin/gloss/polish/leaf/metal/gold/glow…），
  第 2 分量是 gloss，别把材质数组当颜色传（`b.quad(..., MT.stone)` 会变荧光色）。
- 每个模块只改自己的文件；**不要动** life.js / hero.js 之外的共享文件
  （palette.js、actor.js、geo.js、main.js、layout.js、camera.js、template.html、build.mjs）。
- 三角面预算：整个场景当前 ~92 万，上限 220 万。各模块预算见任务。
- 每个动态实例 / 模型 actor 需要 **自己的 mesh**（main.js 会把实例 buffer 绑进 mesh VAO）。

## 1. 构建 / 预览 / 截图

```bash
cd /f/AI/dsh/code-animation/01-source/cielo
node build.mjs --as=myname        # -> 04-output/CIELO.myname.html（不要覆盖 CIELO.html）
node tools/serve.mjs              # 已在 8099 跑着，一般不用再起
```

静态服务器已在 `http://127.0.0.1:8099/`（root = 04-output）。截图用 shot.mjs（headless Chrome + CDP）：

```bash
node tools/shot.mjs --url="http://127.0.0.1:8099/CIELO.myname.html?noui=1&autostart=1&freeze=3" \
  --w=1600 --h=900 --gpu=default --port=94xx \
  --do=wait:3500 \
  --do='eval:__cielo.cam.setView(8,true)' \
  --do=wait:400 --do='shot:../../04-output/cielo/_r3/myname.png'
```

- `port` 用任务里指定的专属端口，避免并行冲突。
- `freeze=3` 冻结时间；换 `freeze=0` / `freeze=6` 检查动画不同相位。
- 截图存 `04-output/cielo/_r3/<name>/`（这是过程图，可保留）。
- 也可用 `__cielo.setCam([x,y,z],[lx,ly,lz],fov)` 自定义机位。
- **并行构建**：别的 agent 可能正在写别的文件，若 `build.mjs` 报的是不属于你的语法错误，
  等 2 秒重试（最多 3 次），不要改别人的文件。

## 2. 动态 actor API（本轮的动画都走这套）

实例化（鱼群、鸽群、自由气球）：

```js
import { mesh } from './gl.js';
import { B } from './geo.js';
import { trs } from './actor.js';
const m = mesh(ctx.gl, r.verts, r.indices);      // 1 个 actor 独占一个 mesh
ctx.dyn.push({ name, kind: 'inst', mesh: m, capacity: N, fill(t, act) {
  // k 从 0 开始；phase 0..1；sway 振幅；mode：0=鸟翼拍动 1=鱼尾摆 2=布料慢飘
  act.set(k, trs([x,y,z], yaw, scale, pitch, roll), phase, sway, 1, mode);
  return k;
}});
```

模型动画（一整个 mesh 用一个矩阵，如长颈鹿腿 / 气球束）：

```js
ctx.dyn.push({ name, kind: 'model', mesh: m, model: (t, dt) => trs(pos, yaw, scale, pitch, roll) });
```

- `trs` 旋转顺序 R = Ry * Rx * Rz，平移在矩阵末列。
- 实例 shader 的形变：mode 0 沿局部 +Y 抬翼（|x| 越大越多）；mode 1 鱼身侧向波（-z 越远越大）。
  所以鸟翼要沿 ±X 展开、鱼头朝 +Z 尾朝 -Z、y=0 在身体中线。
- `main.js` 会为 inst actor 每帧调 fill 并上传；capacity ≥ fill 返回数量。

## 3. 世界锚点

- 露台面 `y=30`，栏杆外沿曲线：x∈[-34,34] 时 `z = 93 - 9*cos(π/2*|x|/34)^1.3`；栏杆顶 `y≈31.25`。
- 女孩 `(3, 30, railZ(3)+2 ≈ 86.1)`，面朝 -Z（城市方向）。
- 大道：x=0，z 从 96 到 -210，宽 26；中央广场 z=-46 r=44。
- 观景点（layout.js `L.views`，索引从 0 起）：
  `8 少女与花`（机位 0.9,31.48,83 look 3,31.28,86.1 fov37）、
  `9 空中鱼群`（1.5,37.6,92 look 18,36.3,77）、
  `10 长颈鹿`（-3,9.2,96 look -3.2,4.6,36）、
  `11 气球飘动`（7.6,31.9,90.5 look 11.6,34.8,81）、
  `12 白鸽`（-2,40,94 look 10,42,74）。
  你的元素要在这几个机位里好看 —— 这是验收镜头。

## 4. 自检工具（必须写）

每个模块写一个 node 端几何体检 `tools/<name>-check.mjs`（不需要 GL/浏览器）：
把纯几何函数导出（如 `export function doveGeom(nb, ...)`），在 check 里
`const b = new B(); geom(b, ...);` 然后断言：

1. `b.i.length/3` 在预算内、> 0；
2. 顶点包围盒合理（尺寸对、没有 NaN / 超过 ±3000 的远点）；
3. `b.badColor === undefined`、`b.bad === undefined`；
4. push/pop 平衡：`b.stack.length === 1`；
5. 同样输入 rng 两次，三角形数量一致（确定性）。

跑法：`node tools/<name>-check.mjs`，输出 PASS + 数字。把结果写进交付汇报。

## 5. 交付汇报格式

- 改了/新建了哪些文件；
- 三角面数、actor 数、截图路径（至少 2 张：默认 freeze + 另一个相位）；
- check 输出；
- 已知取舍 / 还想迭代的点。
