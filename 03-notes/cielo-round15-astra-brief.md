# Round 15 施工合同 · 画中宇宙「星鲸环 ASTRA」（第二世界 + 露台画架传送门）

> 开工前写、开工后冻结。写清楚了才动手；改了就写进 HANDOFF 的遗留。
> 用户原话（2026-11-26）：「现在天空鲸城项目文件是不是太大了，我设想是再做一个新的世界（项目），
> 「天空鲸城 CIELO」从露台的画架上的画，靠近后触发点击事件，进入新的世界。新的世界是在太空中，
> 你先制作一个美丽的太空环境，做一个巨大空间站出来。如果你有更好的想法可以进行实现。」

## 0. 一句话

CIELO 露台那只画架上的画（画的是鲸背城）变成一扇门：走近、看向画布、点击 → 镜头坠入画布 →
进入**第二个可游览世界「星鲸环 ASTRA」**：一片有星云、环带巨行星与恒星的太空，中央是一座直径
约 1.2 km 的巨型环站——**鲸环站**（The Whale Cradle），它是天空鲸的摇篮：CIELO 里那些驮城的鲸，
都从这里的船坞下潜去云海。

**为什么另开一个项目**（回答用户第一问）：见 §1 体检。结论：单个成品 1.05 MB / gzip 352 KB 不算大，
真正的成本是**一个构建里塞两个世界观**（加载、构建内存、美术基线互相牵制）。所以走
「**共享引擎库 + 各自世界 + 各自单文件成品**」，入口用导航 + 电影过渡，不塞进同一个 HTML。

## 1. 现状体检（测得的数据，2026-11-26）

| 项 | 现状事实 | 影响 / 判断 |
|---|---|---|
| 成品 `04-output/CIELO.html` | 1,074,887 B（1,049.7 KB）；gzip **351.8 KB** / brotli **289.7 KB** | 网页传输不算大；单文件策略本身没问题 |
| 源码 | `01-source/cielo/src` 73 文件 / 1,964.7 KB；`tools` 50 文件 / 439.5 KB | 已经是「一个中型前端项目」；再塞一整个太空世界会翻倍 |
| 几何 | 静态 **2,163,136 tri** / 7 批上传 / 点光 194 | 软上限约 220 万，**已经没有余量** |
| 构建 | `node build.mjs` 约 1.5–2 s；JS 堆峰值 29 MB（第十二轮修复后） | 再加 60–80 万三角的世界，构建与显存都会更难 |
| 04-output 里的过期分文件构建 | 12 个 `CIELO.*.html`（cathedral/opera/rooms/train/station…共约 8.7 MB）仍在仓库里被跟踪 | 这是真正「项目文件太大」的部分之一 → 本轮清理（保留 CIELO.html / CELESTIA.html 与 .dev） |
| 已有第二世界 | `CELESTIA.html` 145 KB / gzip 51 KB | 证明「另开一个项目」在这仓库已跑通过：独立 build + 独立成品 |

## 2. 交付物（本轮必须同时成立）

1. `04-output/ASTRA.html`：单文件、零外部请求的太空世界（新项目 `01-source/astra/`）。
2. `04-output/CIELO.html`：露台画架可交互 → 点击后坠入画中 → 导航到 ASTRA；`CIELO.html?at=easel` 回到画架前。
3. 两边都能 `file://` 双击打开（界面文字 + 构建戳），桌面与触屏都能玩。
4. 体检脚本 + 文档（本文件 / HANDOFF / STATUS / 日记）+ 提交推送。

## 3. 世界观与美术基线（ASTRA）

- **名称**：中文「星鲸环」/ 英文 **ASTRA**。成品文件 `ASTRA.html`，构建戳与 CIELO 同规则。
- **叙事**：环站的船坞里系着年轻的天空鲸；它们被放归云海，驮起后来的城市。CIELO 画架上的画，
  就是其中一头鲸背上的城。→ 两个世界互为「上游 / 下游」，不是拼贴。
- **配色（不用纯黑太空）**：深靛紫底 `#0b1030` → `#1a1a4a`；星云品红/薰衣草/青绿/金；
  恒星暖白；环站**象牙白船壳 + 黄铜 + 深靛钢**（延续 CIELO 的 Beaux-Arts 血统，只是换到太空）；
  舷窗暖金 `#ffd9a0` 与青绿 `#8ff0e0` 两种光。太空不空：星云、环带行星、银河带是主体背景。
- **光照**：单恒星方向光（暖白，强），环境光很低（深蓝），靠 **emissive 舷窗 + 点光** 提亮；
  雾密度极低（0.00005 级）只做远景空气感。**lit.fs 着色器原样复用**（不改 = 零风险）。
- **构图**：环站主直径 **1,200 m**（环心半径 600，环带截面约 92×74 m），
  中央脊柱从 y −300 到 y +460，玻璃穹顶在 y ≈ +120（半径 130，可飞入），6 条辐条连接环与核心。
  **环带平面取 XZ（环轴 = Y）**，环站中心 = 世界原点。
- **机位（观景点，只追加）**：0 画中初降（远景，行星在环后）· 1 环站全景 · 2 环带立面 · 3 对接港
  · 4 穹顶外 · 5 穹顶中庭（内景）· 6 鲸鱼摇篮 · 7 脊柱塔顶 · 8 环下仰望 · 9 星云远眺。
  首个机位兼作「从画中坠入」的落点。

## 4. 技术架构（两个世界共用什么、各自持有什么）

```text
01-source/astra/
  build.mjs          esbuild → 04-output/ASTRA.html（--dev / --as=NAME 与 CIELO 同约定）
  template.html      页面骨架 + 加载页 + 标题页 + HUD + 帮助 + 触屏条（CSS 沿用 CIELO 风格，换配色）
  src/
    main.js          渲染主循环（从 CIELO 第十三轮管线移植：阴影可选 / 天空 / bloom / composite /
                     upscale / 自适应分辨率三档 / 指针锁定 / 触屏 / ?view ?cam ?q ?noui ?freeze ?diag）
    world.js         世界组装：island? 无 → station-ring / station-core / space-props / env
    engine.js        **共享引擎再导出**：geo(B/box/cylinder/lathe/torus/sphere/ribbon/bar3...)、
                     lib3d(MT/ellipsoid/tubePath/disc/extrudeXY/extrudeXZ/radialSlabs)、math
                     —— 全部从 ../../cielo/src/ 引用，不复制
    palette.js       太空色板 C / LOOK（字段名与 cielo palette 的 LOOK 一致，main.js 只认字段）
    camera.js        自由飞行 + 观景点过渡（本世界自有 VIEWS，从 layout.js 读）
    layout.js        唯一锚点表：ST（环站）/ DOME / 船坞 / views[]
    shaders.js       glsl 组装（本世界自有 glsl/ 目录）
    glsl/            lit.vs/fs（原样复制）、bill、inst、add、post 系列（原样复制）、
                     **space-sky.fs（新写）**、head/noise（复制）
    station-ring.js  ← 子代理 ring：环带外壳
    station-core.js  ← 子代理 core：脊柱 + 辐条 + 穹顶 + 内景
    space-props.js   ← 子代理 props：小行星 / 飞船 / 星鲸方舟 / 光尘
    touch.js         用 ../cielo/src/touch.js（通用，DOM id 与 template 对齐即可）
  tools/
    checkall.mjs     汇总（本站自有）
    station-ring-check.mjs / station-core-check.mjs / space-props-check.mjs / astra-check.mjs
```

**共享引擎的纪律**：`geo.js / lib3d.js / math.js / gl.js / actor.js / fx.js / touch.js` 只读引用，
**本轮不修改**（谁要改，先改 CIELO 的体检基线 —— 不在范围）。着色器各自持有，避免两个世界的美术互相牵制。

## 5. 内容模块契约（子代理照此实现）

```js
// 每个模块一个函数，签名固定；由 world.js 末尾按顺序调用（各自 try/catch）
export function buildStationRing(b, ctx, rng) {...}
export function buildStationCore(b, ctx, rng) {...}   // 含穹顶内景（同一 owner，可拆第二个文件）
export function buildSpaceProps(b, ctx, rng) {...}
```

- `b`：`geo.js` 的 `B` 构建器。**每个 push 必须配对 pop**；`b.tri(p0,p1,p2,col,mat,N0?,N1?,N2?)`、
  `b.quad(a,b,c,d,col,mat,N)`、`b.push(mat16)`/`b.pop()`；顶点 11 float，别手搓。
- `ctx`：`{ gl, failures, points, lanterns, dyn, bbDyn, props, triLog }`
  - `ctx.points.push({p:[x,y,z], col:[r,g,b], range, int})` 点光（全局只取最近 12 盏，**每模块 ≤8 盏**）
  - `ctx.lanterns.push({p, size, rot, alpha, shape, col})` 静态 billboard（shape 0..6，见 `fx.js/bill.fs`）
  - `ctx.dyn / ctx.bbDyn` 本轮不用（保持静态，先保证好看与可飞）
  - `ctx.props` 模块间交接（**只写自己的键**：`ctx.props.ring = {...}`）
- **随机**：每个模块 build 内 `const R = mulberry32(0x57A11001)` 之类**自有种子**，不许用传入的 `rng`；
  同一份源码两次构建必须逐三角相同（check 会验）。
- **材质**：`mat = [emissive, gloss]`（lit.fs）。太空基线：船壳 `[0.02,0.34]`、黄铜 `[0.06,0.86]`、
  玻璃 `[0.16,0.95]`、舷窗 `[0.85,0.10]`、青绿灯带 `[0.95,0.05]`、石/砖 `[0.02,0.16]`。
  **不要用 0.0 emissive 的纯黑**：太空里没有环境光的地方会变成死黑块，最小值 0.02。
- **单位**：真实米。环站中心 (0,0,0)，环轴 Y，环心半径 **600**，环带截面 **92（径向）× 74（轴向）**。
- **三角预算**（硬上限）：ring ≤ **220,000** / core ≤ **200,000**（外壳 + 内景合计）/ props ≤ **130,000**；
  全网世界静态总量 ≤ **800,000**（软上限 900,000）。
- **可飞入**：穹顶中庭是可飞行体积，内部（`DOME` 内腔）**0 顶点**；入口是真门洞（航线射线 0 命中）。

## 6. 验收标准（每条可执行、可判定）

| # | 标准 | 判定 |
|---|---|---|
| 1 | ASTRA 构建通过 | `cd 01-source/astra && node build.mjs` → `built .../ASTRA.html (… KB)` |
| 2 | 世界内容齐全 | `node tools/checkall.mjs` 全 PASS（本世界 check 列表，最终 ≥4 项） |
| 3 | 三角预算 | astra-check：总量 ≤ 900,000、各模块 ≤ 上表、两次构建逐三角确定性 |
| 4 | 穹顶可飞入 | station-core-check：`?cam=` 从 6 个方向打射线，门洞段 0 命中、内腔 0 顶点 |
| 5 | 画架传送门 | portal-check：`?cam=` 落位画架前后，`__cielo.portal.ready()` 为真 → `click` → 2.6 s 内出现过渡层且 `location` 指向 ASTRA |
| 6 | 桌面零回归 | `CIELO` 构建后 `node tools/checkall.mjs` **31/31 PASS**；画架外点击仍进指针锁定 |
| 7 | 手机可用 | `node tools/mobile-check.mjs` 全 PASS（ASTRA 侧：触屏条可见、摇杆位移 > 0、Tap 可进门） |
| 8 | 截图 | 每个观景点一张 `04-output/_r15/*.png`，主视觉 ≥1 张能当封面 |
| 9 | 双击可开 | `file://` 打开无控制台报错（除 manifest/CORS 允许项），构建戳可见 |

## 7. 实现顺序（每步可独立验收）

1. **脚手架**（lead）：`01-source/astra/build.mjs + template.html + src/{main,world,palette,camera,layout,shaders,engine}.js + glsl/* + 三个桩模块` → 能构建、能飞、能看到太空天空（星云 + 星 + 环带行星）。
2. **传送门**（子代理 portal，与 1 并行）：CIELO 侧画架交互 + 过渡 + 返回落位 + portal-check。
3. **三块内容**（子代理 ring / core / props，与 1 并行，1 的契约先给）：各自模块 + 各自 check。
4. **集成**（lead）：world.js 接线、观景点 10 个、光照/点光/曝光调美术、去除穿模、截图。
5. **体检 + 回归**（lead）：ASTRA checkall、CIELO checkall 31/31、mobile-check、mem-check（串行！）。
6. **文档与发布**（lead）：brief → HANDOFF 顶部追加 → STATUS 改写 → 日记 → status.mjs → 提交推送 → Pages 核对。

## 8. 测试方法（精确命令）

```powershell
# ASTRA 构建 + 体检
cd F:/AI/dsh/code-animation/01-source/astra; node build.mjs; node tools/checkall.mjs
# 静态截图（先起服务；不要把 shot.mjs 放进管道）
cd F:/AI/dsh/code-animation/04-output; node ../01-source/cielo/tools/serve.mjs --port=8099
node ../01-source/cielo/tools/shot.mjs --url="http://127.0.0.1:8099/ASTRA.html?noui=1&freeze=2&view=1&tod=day" --w=1280 --h=720 --out=04-output/_r15/v1.png --do=wait:3000 --do=shot:04-output/_r15/v1.png
# CIELO 回归（串行！）
cd F:/AI/dsh/code-animation/01-source/cielo; node build.mjs; node tools/checkall.mjs
node tools/mobile-check.mjs
```

> 注意：`shot.mjs` 的 `--out` 只是相对 cwd 的路径；截图要 `--do=wait:...` 后再 `--do=shot:`。
> `mobile-check` 与 `mem-check` **必须串行**（抢 CDP 端口会出假读数，第十四轮踩过）。

## 9. 风险与注意

1. **跨项目 import**：`astra/src/engine.js` 引用 `../../cielo/src/*.js`。esbuild 能打包，但**禁止**改被引用文件；
   若必须改，先跑 CIELO 的 `checkall` + `mobile-check`。
2. **画架点击 vs 指针锁定**：CIELO 的 canvas click 原本只做 `requestPointerLock()`。加交互时必须
   「热点未激活 → 原行为；热点激活 → 进画」；指针已锁定时 click 事件仍会到 canvas，别重复触发。
3. **过渡层**必须能在 `?noui` 与 `freeze` 下被自动化测试点到（portal-check 用 `__cielo.portal` API，不靠像素）。
4. **太空不是纯黑**：死黑 + bloom 会变成脏；用深靛紫 + 星云 + 舷窗光，先保证「一眼好看」。
5. **不要为了手机删内容**：沿用三档 + 自适应分辨率 + 关阴影；ASTRA 总三角比 CIELO 小得多，手机应更轻松。
6. **两个世界的构建戳要能区分**：标题页写 `星鲸环 · ASTRA`，`?diag` 里有世界名与构建戳。

## 10. 不在本轮范围

- ASTRA 的多层室内（本轮只做穹顶中庭一处可飞入内景）。
- ASTRA 的音频（沿用静音，若 canvas 初始化后极便宜可加一条空间风噪；不列为验收）。
- 改 CIELO 的既有内容/画质系统（第十三/十四轮基线不动）。
- PWA 离线包与 GitHub Pages 的 ASTRA 独立入口（本轮只保证同目录相对跳转可用；发布后补 manifest）。
