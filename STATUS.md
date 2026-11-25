# STATUS · 天空鲸城（CIELO）/ code-animation

> **新会话从这里开始**：90 秒读完这一页，再按「6 · 文档地图」去读本轮合同与交接历史。
> 本页只写**现在**；每轮的历史在 [HANDOFF.md](HANDOFF.md)，每天的过程在 [05-daily/](05-daily/)。

<!-- AUTO:START -->
> 自动生成 · 2026-11-25 00:51 · 运行 `node tools/status.mjs --write` 刷新。下面每一行都是从仓库里读出来的，不靠人记。

| 项 | 值 |
|---|---|
| 分支 / HEAD（生成时） | `main` @ `d31715f` · fix(cielo): ?diag 同时显示 JS 堆与上限（并注明含未回收垃圾），重建 978.0 KB |
| 工作树 | 干净 |
| 成品 · 天空鲸城 | `04-output/CIELO.html` · 978.0 KB |
| 成品 · 天空之城 · 灯祭 | `04-output/CELESTIA.html` · 145.0 KB |
| 几何体检 | 30 项（`node tools/checkall.mjs`） |
| 内容规模 | 观景点 80 · 抄本 31 页 |
| 最近日记 | `05-daily/2026-11-25.md` |
<!-- AUTO:END -->

## 0. 一句话

手写 WebGL2、零依赖的**可游览幻想都市**：云上的白城，巨鲸驮着一座城堡从塔尖游过；城市里有可飞入的宫殿、玻璃宫、大教堂、高架车站、歌剧院，31 处地标各有一页「建筑介绍 + 故事」的导览抄本。成品是**单个 HTML 文件**（约 0.99 MB，内联全部 JS 与着色器），桌面与安卓平板/手机都能玩。第十二轮修掉了手机端崩溃（构建期 JS 堆 1.2 GB → 29 MB）并加了**三条主题航线**；第十三轮重做了**画质系统**（设备像素级输出 + 自适应分辨率 + 输出分辨率锐化），手机端从「0.27 MP 放大 3.3 倍」变成「1.4× 上采样 + 锐化，精细档可 1:1」，像素化指标 −70%。

## 1. 线上入口（可直接点开）

| 入口 | 地址 | 说明 |
|---|---|---|
| 天空鲸城 CIELO | <https://lb290.github.io/code-animation/04-output/CIELO.html> | 主成品；平板可「添加到主屏幕」离线玩 |
| 天空之城 · 灯祭 CELESTIA | <https://lb290.github.io/code-animation/04-output/CELESTIA.html> | 夜景浮岛灯市 |
| 首页（全部入口） | <https://lb290.github.io/code-animation/> | 三件作品索引 |
| 成片与图集 | <https://github.com/lb290/code-animation/releases> | 《天空巡礼》、AETHER 1080p |
## 2. 本轮（Round 13 · 2026-11-25 晚）：画质系统 v2

**用户委托**：「现在手机上打开不会卡死了，但是建筑的显示效果非常粗糙，你继续优化显示效果，**既要流畅，又要精细分辨率高**。」（附手机横屏截图：宫殿门厅，柱子/栏杆是 3–4 像素大方块）

**技术记录**：[03-notes/cielo-round13-quality.md](03-notes/cielo-round13-quality.md)（根因实测 → 方案 → 指标前后对比 → 放弃项 → 限制）

| # | 项目 | 状态 |
|---|---|---|
| 1 | 根因量化：旧 `resize()` 完全没算 `devicePixelRatio`，手机端场景只渲染 **768×349（0.27 MP）再放大 3.3×**；低画质档还关 FXAA；自适应「只降不升」且上限锁死 | ✅ |
| 2 | 新分辨率模型：输出画布按设备像素（dpr≤2 → 1:1）；场景内部用 `scenePx` 像素预算、三档 0.55–3.2 MP | ✅ |
| 3 | 两段后处理：composite（内部 FXAA/bloom/tonemap）→ 新 `upscale.fs.glsl`（输出分辨率 4 tap 锐化 + 晕影/颗粒/dither）；放大不再交给浏览器 | ✅ |
| 4 | 自适应分辨率 v2：GPU 计时器（350 ms 窗口、降快升慢、目标 12.5–14.5 ms）+ 最优点按档位持久化 + `outMul` 兜底 | ✅ |
| 5 | 天空改为实体后画、`LEQUAL` 只着色露天像素（室内机位省 90%+ 天空 shader），同机位**逐像素一致** | ✅ |
| 6 | 三档（流畅/均衡/精细，触屏默认精细、任何触屏档不开阴影）+ 触屏「画质」按钮 / `V` 键 / 持久化 | ✅ |
| 7 | 指标验收（`tools/quality-check.mjs`）：手机 2×2 同色块 **11.01 → 3.33%**、相邻等值 **28.39 → 15.95%**、LapVar **115.7 → 225.2**、边缘 p95 112.2 → 139.3；桌面 1:1 下 LapVar 1283.8 → 2061.5 | ✅ |
| 8 | 回归：`checkall` 30/30、`mem-check`、`mobile-check`（新增画质断言）、成本曲线 `tools/perf-split.mjs` | ✅ |
| 9 | 文档同步（技术记录 / HANDOFF / 日记 / 产品方案 / README） | ✅ |

> **线上**：本次收尾提交见 `git log -1`；`CIELO.html` **986.5 KB**（单文件）、静态 2,048,729 tri / 7 批 / 66 draw calls；构建戳可在标题页与 `?diag` 核对。。安卓 Chrome 与自带浏览器都应能完整加载（含教堂 / 车站 / 大剧院）。

## 3. 下一步（≤5 条，按优先级）

1. **真机画质/帧率复验（最优先）**：手机打开线上地址，看右上 HUD（`FPS / gpu ms · cpu ms / 场景 MP · 输出 MP`）与 `?diag` 的 `sceneEff`；记录「室外杂乱机位 / 室内」两组 gpu ms 写回 STATUS。若 `sceneEff` 明显低于 `px0`，按机型微调 `src/main.js` 的 `TIERS.gpuMs / px0`。
2. **真机三档手感**：触屏「画质」切 流畅/均衡/精细，确认 ① 精细不卡 ② 流畅在弱机型也能 60 ③ 选择下次打开还在；把体感写回 HANDOFF 遗留。
3. **显存兜底（若真机报 context lost）**：顶点缓冲仍约 271 MB；下一步做移动端几何降级 —— 从 `city`（776k tri）起按档减细分，不删内容；分块累加器已就位。也顺手把手机默认档从「1.4× 上采样」推到 1:1。
4. **产品改进 C「游客护照」**（下一轮候选，见 [03-notes/cielo-product-ideas.md](03-notes/cielo-product-ideas.md)）：抵达一处盖一个章，集齐 31 页出「通关证书」，复用明信片出片管线；备选「语音导览」（Web Speech API 念抄本正文）。
5. **主题航线真机反馈**：航线条在手机横屏的位置、站间穿墙、退出后是否回到原机位 —— 收 1–2 条再调。

## 4. 硬约束（违反会返工）

- **桌面零回归**：所有触屏逻辑必须在 `html.touch` / `TOUCH` 为真时生效；桌面截图与第十轮一致。`tools/checkall.mjs` 28/28 + `tools/mobile-check.mjs` 全 PASS 才算完成。
- **零依赖**：CIELO 源码不引第三方运行时库；成品是**单个 HTML**，构建后不请求任何外部资源（PWA 的 manifest / sw / 图标是可选增强，页面本身不依赖它们）。
- **内容是数据**：建筑介绍在 `03-notes/lore-scene/group-*.json`（单一事实源），用 `node tools/build-lore-scene.mjs` 生成 `src/lore-scene.js`；**不要手改生成物**。
- **数字要有出处**：文案里的尺寸/数量必须能在源码常量或 HANDOFF 里核对；不确定就不写数字。
- **不要为了手机删内容**：性能靠关阴影、降渲染倍率、减点光；`?q=low|mid|high` 与自动降档是唯一手段。
- **内存预算（第十二轮教训）**：世界几何必须走 `B({ chunked: true })` + `world.meshes` 分批流式上传，**不要**再让整个城市存在一个 JS number 数组里（峰值 1.2 GB → 安卓 Chrome 直接 OOM，自带浏览器则静默缺最后几个模块）。动 `geo.js` 的累加器 / `gl.js` 的 `meshChunked` 必须跑 `node tools/geo-acc-check.mjs`（块尾空位会让整个世界错位）。
- **验收四件套**：`checkall`(30/30) + `mobile-check` + `mem-check` + 旧/新截图零回归，缺一不算完成。
- **工作记录**：按 [03-notes/worklog-format.md](03-notes/worklog-format.md) 写；每轮结束必须更新本页 + HANDOFF + 日记 + 提交推送。

## 5. 新会话 3 分钟上手

```powershell
# 1. 读现状（本页）与最近一轮合同
cat STATUS.md; ls 03-notes/*round*.md
# 2. 看仓库真实状态
git status --short; git log --oneline -5
# 3. 刷新自动事实块，与文档对照
node tools/status.mjs
# 4. 基线可跑（构建 + 28 项几何体检）
cd 01-source/cielo; node build.mjs; node tools/checkall.mjs
# 5. 平板/触屏 + 主题航线验收（需要 Chrome，约 4 分钟）
node tools/mobile-check.mjs
# 6. 内存/完整性验收（受限堆模拟安卓手机 + 桌面零回归）
node tools/mem-check.mjs
# 7. 浏览器里看（桌面 8099；平板联调加 --host=0.0.0.0）
node tools/serve.mjs --host=0.0.0.0
```

桌面快捷键：`空格` 巡游 · `1–9/0` 观景 · `Z/X` 切换 · `G` 抄本 · `N` 昼夜 · `F` 烟花 · `P` 摄影 · `C` 明信片 · `H` 帮助 · `R` 回露台。
触屏：左半屏摇杆 · 右半屏环视 · 右侧升降 · 底部动作条。
URL 参数：`?view=` `?cam=` `?tod=day|dusk|night` `?freeze=` `?noui` `?q=low|mid|high` `?touch=0|1` `?perf` `?nomod=` `?diag` `?route=architecture|wonder|secret` `?batch=`（分批上传预算，调试）。

## 6. 文档地图

| 文件 | 管什么 |
|---|---|
| **STATUS.md**（本页） | 现在：入口、本轮、下一步、硬约束 |
| [HANDOFF.md](HANDOFF.md) | 每轮历史：现状 / 30 秒上手 / 已知遗留（只追加） |
| [03-notes/worklog-format.md](03-notes/worklog-format.md) | **工作记录规范**（四层记录、模板、检查单、提交规范） |
| [05-daily/](05-daily/) | 每日/每会话日记（六段，坑必写） |
| [03-notes/cielo-production.md](03-notes/cielo-production.md) | CIELO 制作笔记（管线、几何、着色器、参数） |
| [03-notes/cielo-spec.md](03-notes/cielo-spec.md) | CIELO 设计规格 |
| [03-notes/lore-scene/](03-notes/lore-scene/) | 抄本「景」文案源文件（JSON，按区域分组） |
| [01-source/cielo/src/lore.js](01-source/cielo/src/lore.js) | 抄本「故事」与抵达区域数据 |
| [README.md](README.md) | 仓库总览（含平板用法） |
