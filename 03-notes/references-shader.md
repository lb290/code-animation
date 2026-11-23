# 外部参考资源：着色器 / 片段程序

> 记录时间 2026-11-19。这两站是"用代码做视觉"最密集的两个素材库：
> 一个是有十几年积累的 GLSL 作品库，一个是能写/调/导出的现代 shader 编辑器。
> 它们解决的是同一件事的不同阶段——**找配方** vs **调配方**。

---

## 1. Shadertoy — https://www.shadertoy.com/

**是什么**：Inigo Quilez 等人做的 GLSL 片段着色器平台，十万级公开 shader，
全部是"一个 `mainImage` 函数 + 若干 buffer"就能在浏览器里实时跑起来的画面。
没有模型、没有贴图，画面完全由数学生成——和本项目"零素材"的思路同源。

**强在哪（值得逐条拆的技法）**：

| 技法 | 说明 | 对 AETHER 这类片子的用处 |
|---|---|---|
| Raymarching + SDF | 用距离场描述几何，光线步进求交 | 想升级成"真 3D"但不上 Blender 的最短路径 |
| FBM / domain warping | 多层噪声 + 坐标扭曲 | 云、烟、流体、大理石纹的通用配方 |
| IQ cosine palette | `a+b*cos(2π(c*t+d))` 一行出色带 | 比手工调色板更统一的配色 |
| Multipass buffer 反馈 | Buffer A/B/C/D 互相读上一帧 | 真正的拖尾、流体平流、时域累积 |
| 时域抖动 / TAA | 每帧偏移亚像素再平均 | 低成本消除噪点（本项目目前只有颗粒） |
| Tone mapping + bloom | ACES / 阈值泛光 | 与 `01-source/rlib.py` 的后处理链可直接对照 |

**怎么用**：
- 检索词：`raymarching`、`sdf`、`fbm`、`domain warping`、`palette`、`bloom`、`volumetric`
- **移植到本项目（CPU/numpy）**：着色器是逐像素纯函数，numpy 向量化后语义一致，
  只是 1080p 一帧需要几秒到几十秒 → 适合出**关键帧/静帧**，或降到 540p 做成 12–24fps 的风格片。
- **更快落地的路线**：Three.js / 原生 WebGL 页面 + `window.renderAt(t)` 逐帧可截，
  再用 Playwright 逐帧截图 → ffmpeg 编码（与 `02-refs/varghq-skills/threejs-animatic` 完全一致）。
- **许可**：每个 shader 的授权由作者单独指定（不少是 CC BY-NC-SA），
  抄公式自用没问题，**商用/二创前必须看该 shader 页面的 License 字段**。

---

## 2. FragCoord — https://fragcoord.xyz/

**是什么**：浏览器内的现代 GLSL shader 编辑器（WebGL2，可选 WebGPU）：
实时预览、**多 pass 渲染**、变量 Inspector、把 shader 转成 **WGSL / HLSL / Metal**，
并带公开的 shader gallery。

**强在哪**：
- 写 shader 时的即时反馈（比在 Shadertoy 里改一行等一帧更顺手）
- 多 pass 结构可视化 —— 正好对应 Shadertoy 的 Buffer 机制，适合做"反馈类"效果
- 跨后端导出（WGSL/HLSL/Metal）→ 想搬到 Three.js / WebGPU / 原生引擎时不用重写
- Inspector 能直接看中间变量，调 SDF 距离场、噪声层级时非常省时间

**怎么用**：
1. 在 FragCoord 里把效果写成 `uv + time → color` 的纯函数
2. 用 Inspector 调参数（步进次数、噪声频率、palette），截图对比
3. 定稿后：要么导出目标后端接进 WebGL 管线，要么照抄公式进 `rlib.py` 做成 numpy 版
4. 交付链路不变：**逐帧可截 → ffmpeg**（本项目已验证：raw RGB24 直灌 stdin，省一半 IO）

---

## 3. 与本项目的关系

| 本项目已有 | 这两个站能补的 |
|---|---|
| 粒子泼溅 + 泛光 + ACES（`rlib.py`） | 体积光、SDF 几何、真正的时域累积 |
| 解析流场（curl of potential） | FBM 域扭曲做更有机的烟/流体 |
| 逐帧 numpy 渲染（1.1 s/帧 @1080p） | 逐像素着色器语义完全一致，可移植但要降分辨率或改走 WebGL |

**下一步最省力的组合**：Shadertoy 找配方 → FragCoord 调通 → Playwright 逐帧截 → 现有 ffmpeg 管线编码 + `01-source/audio/make_score.py` 配乐。

---

## 4. 待补充（以后遇到就往下加）

- [ ] Shadertoy 上收藏 5 个"volumetric / raymarching"高赞 shader 的链接与许可
- [ ] FragCoord 导出的 WGSL 片段，接到 Three.js 的测试记录
- [ ] 若引入 Blender：`02-refs/varghq-skills/blender-code-film` 的 pipeline 与本项目的对接点
