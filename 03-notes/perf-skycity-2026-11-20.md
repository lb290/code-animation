# PERF-REPORT · 天空之城主循环优化（task-1）

范围：只改 _scratch/perf 副本，未碰主树、未改 src/shaders.js / fish.js / world.js / gl.js / fx.js。
基线：GTX 1070 Ti + ANGLE(D3D11)，headless 用 gl.finish 整帧；headed = 向日葵虚拟显示器 60Hz。

## 1. 改动文件（可合并回主树）
1. F:\AI\dsh\code-animation\_scratch\perf\01-source\skycity\src\main.js
   - ?perf=1 覆盖层 + __sky.perf（renderer/倍率/RT/rAF fps/实测 ms/显示 Hz/软硬渲染/封顶判断）
   - HUD 改两行中文：`57 FPS · 1280×720 · 254k tris · 74 calls` / `GPU 0.3ms · 倍率 100% · 硬件加速`
   - 自适应分辨率重写：改为 gl.finish 实测整帧耗时驱动，迟滞(降2/升3次采样)+冷却45帧+启动120帧，下限 0.55；
     30Hz 垂直同步/串流不再误降（旧逻辑用 rAF 间隔 >27ms 就降档）
   - 鱼灯：距离 LOD（屏幕投影高度 ≥54px=high / ≥16px=low / 否则 tiny）+ 两遍绘制共用的球-视锥剔除；
     小鱼 26→20（半径 108→95，保持场密度）；绘制公共 uniform 只设一次，循环内只设 5 个 per-fish uniform；
     模型矩阵直接写入预分配 Float32Array（去掉每帧 ~230 个临时矩阵/对象）
   - 孔明灯 240→96，Billboards 容量 400→128（火星/烟花/流星数量不动）
   - 鱼灯光晕：每条鱼一张 shape 3 加性暖色 billboard，场景 pass 内、bloom 之前，1 次实例化绘制
   - 光点 top-5 鱼 / top-3 城市灯改为无分配 top-K（去掉每帧 filter/map/sort/slice）
   - bloom bright pass 阈值 1.0→0.88；删除重复的 m4.perspective 调用；每帧 calls/tris 统计
2. F:\AI\dsh\code-animation\_scratch\perf\01-source\skycity\template.html
   - #fps 加 white-space:pre-line（HUD 两行）；加 <link rel="icon" href="data:,">（消掉 favicon 404 控制台报错）
3. F:\AI\dsh\code-animation\_scratch\perf\01-source\skycity\tools\bench.mjs（工具，不属交付物）
   - 测量前关自适应+锁倍率 1；记录 calls/tris/fish/perf；SwiftShader 下不再用 rAF 回调内 gl.finish 包装

## 2. 调参入口（main.js 顶部常量）
- FISH_HALO = { on, radius:0.92, alpha:0.16, color:[1.0,0.64,0.32], forward:0.35, glowScale:0.18 }  加性光晕
- BRIGHT_THRESHOLD = 0.88        bloom 亮部阈值
- SKY_LANTERN_COUNT = 96         孔明灯数量
- SMALL_FISH_COUNT = 20          小鱼数量
- FISH_LOD = { highPx:54, lowPx:16 }   距离 LOD 阈值（屏幕像素）
- ADAPT = { min:0.55, max:1.0, downMs:24, upMs:11.5, downSamples:2, upSamples:3, sampleEvery:30, cooldown:45, warmup:120 }
URL：?perf=1 诊断层 · ?q=0.55..1 锁倍率 · ?adapt=0 关自适应 · ?no=halo 关光晕（原有 ?freeze/?view/?cam/?studio/?no=cloud,puff,bloom/?noui/?hour/?tune/?draw 全保留）

## 3. 前后数字（headless 真显卡，每帧包 gl.finish；格式 rAF ms / gpuMs）
| 分辨率 | 视角 | 基线 | 新版 | 绘制 calls | 三角形(drawn) |
|---|---|---|---|---|---|
| 1280×720 | 0 | 0.57 / 0.50 | 0.51 / 0.43 | 86 → 74 | 287k → 254k |
| 1280×720 | 4 | 0.76 / 0.68 | 0.70 / 0.61 | 86 → 46 | 290k → 168k |
| 1280×720 | 7 | 0.71 / 0.63 | 0.65 / 0.57 | 86 → 72 | 290k → 265k |
| 1440×900 | 0 | 0.68 / 0.61 | 0.64 / 0.56 | 86 → 74 | — |
| 1440×900 | 4 | 0.93 / 0.84 | 0.91 / 0.80 | 86 → 44 | — |
| 1440×900 | 7 | 0.90 / 0.83 | 0.87 / 0.78 | 86 → 70 | — |
| 1920×1080 | 0 | 0.96 / 0.88 | 0.89 / 0.80 | 86 → 74 | — |
| 1920×1080 | 4 | 1.40 / 1.32 | 1.33 / 1.14 | 86 → 46 | — |
| 1920×1080 | 7 | 1.28 / 1.19 | 1.21 / 1.13 | 86 → 72 | — |
| headed 1440×900 | 0/4/7 | 56.4fps, gpu 0.54ms | 56.4fps, gpu 0.28ms | 86 → 74/44/70 | — |
| SwiftShader 640×360 | 0 | 82.7ms（12.1fps） | 62.8ms（15.9fps） | 86 → 74 | — |

结论：本机不是 GPU 瓶颈（720p~1080p 整帧 0.4–1.3ms）；headed 56fps 是 60Hz 垂直同步/串流封顶，
GPU 只花 0.3ms。真实收益主要在：绘制调用 -14%~-49%（视锥剔除）、CPU 提交减半（headed gpuMs 0.54→0.28）、
软件渲染 -24%。鱼 LOD 在 1600×900 view0 实测 7 high / 13 low / 7 tiny / 剔除 0。

## 4. 自适应修复的证据（__sky.perf.testAdaptive(rAF ms, 实测 ms) 确定性注入）
- testAdaptive(33.3, 0.5) = 1.0 → 30Hz 封顶 + GPU 0.5ms：**不降档**（旧逻辑 avgMs 33>27 会一路降到 0.66）
- testAdaptive(16.7, 40) = 0.55 → 真慢：降到下限 0.55 后停
- testAdaptive(16.7, 6) = 1.0 → 有富余：保持满倍率
- SwiftShader 实时 20s：倍率 1 → 0.64（继续向 0.55），cost 40ms，判定 GPU 受限；
  软件渲染下 ANGLE 的 gl.finish 测不到光栅时间，故软件路径用 rAF×0.9 兜底（renderCostMs）。

## 5. 验证
- 截图：shots/before/{view0,view4,view7,studio0,studio55}.png vs shots/after/ 同名；halo 为预期新增，其余无回退
  （view7 天空的黑色矩形为**基线已有**问题，非本次改动引入）
- ?perf=1 覆盖层截图 shots/after/perf-overlay-720p.png；正常 HUD shots/after/hud-720p.png
- file:// 直接打开离线可用（shots/after/offline-file.png），无控制台报错（原 favicon 404 已消）
- 单文件 110.3KB，无第三方库/外部资源，esbuild target es2020

## 6. 权衡与坑
- 自适应改倍率会重建 8 张 RT（一次性 hitch），冷却 45 帧≈1s；后续可量化尺寸或改 viewport 缩放。
- 鱼 LOD 阈值处可能有 pop；tiny 仅 3.0k tris，远景够用；若发现近处鱼突然变糊先调 highPx(54)。
- halo 在 ?studio=1 里也会出现（look-dev 对比时像一层暖光）；不想要就 ?no=halo。
- 孔明灯 240→96 是用户明确要求；天空会比之前空，想补密度就调 SKY_LANTERN_COUNT（buffer 容量为 +32）。
- 小鱼的视觉位置与原来前 20 个种子一一对应；半径缩到 95 是为保持面密度。
- SwiftShader 旧 bench 的「rAF 回调内 gl.finish」包装在该构建下会虚高 ~19x（ANGLE 软件路径问题），
  已改为软件渲染只测 rAF 间隔；真显卡上包装器数值仍可信。
- 着色器建议（未改 shaders.js）：FISH_FS（约 599 行起）/ FISH_FIN_FS（约 794 行起）可按 LOD 传 uLod uniform
  跳过高频 noise 细节层，给 tiny 鱼省片元；但本机 GPU 并非瓶颈，收益有限。

---

## 附：第二轮（建筑/街市）之后的复测（23:20）

世界静态 mesh 从 49k 三角形涨到 **176,692**（71 栋町屋 + 街市 + 石板街）。GTX 1070 Ti / 1280×720 / headless，每帧 `gl.finish`：

| 视图 | 整帧 ms / GPU ms | 绘制三角形 | calls |
|---|---|---|---|
| view 0 云上之城 | 0.64 / 0.54 | 386k | 74 |
| view 1 灯市（街） | 0.66 / 0.58 | 297k | 44 |
| view 4 鲤群 | 0.69 / 0.59 | 308k | 44 |
| view 7 高塔 | 0.81 / 0.69 | 390k | 74 |

结论：三角形 +12.7 万、GPU 每帧只 +0.11–0.15 ms（仍 <0.7 ms），draw call 不变。
上一轮「30 帧的锅在串流/虚拟显示器，不在渲染」的结论继续成立。