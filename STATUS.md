# STATUS · 天空鲸城（CIELO）/ 星鲸环（ASTRA）/ code-animation

> **新会话从这里开始**：90 秒读完这一页，再按「6 · 文档地图」去读本轮合同与交接历史。
> 本页只写**现在**；每轮的历史在 [HANDOFF.md](HANDOFF.md)，每天的过程在 [05-daily/](05-daily/)。

<!-- AUTO:START -->
> 自动生成 · 2026-11-26 22:48 · 运行 `node tools/status.mjs --write` 刷新。下面每一行都是从仓库里读出来的，不靠人记。

| 项 | 值 |
|---|---|
| 分支 / HEAD（生成时） | `main` @ `1011750` · chore(tools): 刷新 STATUS 事实块（云井塔已上线 / Pages 已修复） |
| 工作树 | 26 个改动（gitignore、01-source/cielo/src/lore.js、01-source/cielo/src/main.js、01-source/cielo/template.html、04-output/CIELO.cathedral.html、04-output/CIELO.html …） |
| 成品 · 天空鲸城 | `04-output/CIELO.html` · 1061.4 KB |
| 成品 · 天空之城 · 灯祭 | `04-output/CELESTIA.html` · 145.0 KB |
| 成品 · 星鲸环（画中世界） | `04-output/ASTRA.html` · 190.6 KB |
| 几何体检 | CIELO 31 项 · ASTRA 4 项 |
| 内容规模 | 观景点 天空鲸城 84 · 星鲸环 10 ；抄本 32 页 |
| 最近日记 | `05-daily/2026-11-26.md` |
<!-- AUTO:END -->

## 0. 一句话

手写 WebGL2、零依赖的**两个可游览世界**：云上的白城「天空鲸城 CIELO」（巨鲸驮着城堡游过塔尖、
84 处观景点、32 页导览抄本、七处可飞入的地标），以及**画中的太空世界「星鲸环 ASTRA」**
（露台画架那幅画就是门：走近点击、镜头坠入画布，落进一片有星云与环带巨行星的星海，中央是直径 1.2 km 的
巨型环站「鲸环站」：环带 / 六条辐条 / 可飞入的玻璃穹顶中庭 / 56 m 黄铜鲸骨，10 个观景点）。
两个世界各自是**单个 HTML 文件**（内联全部 JS 与着色器），桌面与安卓平板/手机都能玩；
另有夜景灯市「天空之城 · 灯祭 CELESTIA」。

## 1. 线上入口（可直接点开）

| 入口 | 地址 | 说明 |
|---|---|---|
| 天空鲸城 CIELO | <https://lb290.github.io/code-animation/04-output/CIELO.html> | 主成品（1,061.4 KB / 2,163,136 tri / 84 观景 / 32 页抄本） |
| **星鲸环 ASTRA** | <https://lb290.github.io/code-animation/04-output/ASTRA.html> | **第十五轮新世界**（190.6 KB / 281,212 tri / 10 观景） |
| 天空之城 · 灯祭 CELESTIA | <https://lb290.github.io/code-animation/04-output/CELESTIA.html> | 夜景浮岛灯市 |
| 首页（全部入口） | <https://lb290.github.io/code-animation/> | 三件作品索引 |
| 成片与图集 | <https://github.com/lb290/code-animation/releases> | 《天空巡礼》、AETHER 1080p |

> **怎么进新世界**：在 CIELO 里飞到露台，走到画架前（露台西侧、少女旁边）→ 出现「走近画中世界 · 点击画布 / 回车」
> → 点击 → 2.4 s 坠入画中 → ASTRA；在 ASTRA 里按 `R` 或点左下「回到画中」→ 回到画架前（`?at=easel`）。
> 也可以直接打开上面的 ASTRA 链接。

## 2. 本轮（Round 15 · 2026-11-26）：画中世界「星鲸环 ASTRA」+ 露台画架传送门

**用户委托**：「现在天空鲸城项目文件是不是太大了，我设想是再做一个新的世界（项目），「天空鲸城 CIELO」从露台
的画架上的画，靠近后触发点击事件，进入新的世界。新的世界是在太空中，你先制作一个美丽的太空环境，
做一个巨大空间站出来。如果你有更好的想法可以进行实现。」

**施工合同**：[03-notes/cielo-round15-astra-brief.md](03-notes/cielo-round15-astra-brief.md)（§1 = "是不是太大"的实测答案）

| # | 项目 | 状态 |
|---|---|---|
| 1 | **"文件太大"的答案**：不塞进同一个 HTML，另开第二个项目（共享引擎、各自世界、各自单文件）；顺手清掉 10 个过期分施工员构建（8.15 MB）并在 `.gitignore` 忽略 `--as=` 产物 | ✅ |
| 2 | 新项目 `01-source/astra/`：build.mjs / template.html / main.js（第十三轮管线移植）/ world.js / palette / camera / layout / 自有 glsl | ✅ |
| 3 | **太空天空** `space-sky.fs.glsl`：深靛虚空 + 三瓣星云 + 银河带 + 三维格点星场 + 四芒亮星 + 环带巨行星（条带/晨昏线/环投影）+ 小卫星 + 恒星 | ✅ |
| 4 | **环站外壳** `station-ring.js` 129,388 tri：1.2 km 环带 / 4,512 舷窗 / 真开口对接港 / 6 组花瓣帆 / 内圈光环 | ✅ |
| 5 | **核心塔与穹顶** `station-core.js` 128,050 tri：脊柱塔 / 6 辐条 / 24 肋玻璃穹顶 / 110×72 m 北门洞 / 可飞行中庭（鲸骨祭坛·环廊·浑天仪） | ✅ |
| 6 | **太空道具** `space-props.js` 23,774 tri：69 块小行星/冰屑 / 3 头星座鲸（401 星点）/ 3 艘货船 / 8 浮标 / 远景姊妹站 / 光尘 | ✅ |
| 7 | **露台画架传送门**：`src/portal.js` + main.js/template 接线；2.4 s 坠入过渡；`?at=easel` 归来落位；触屏轻点；桌面零回归 | ✅ |
| 8 | 10 个观景点 + 自动巡游 + 三档画质 + 触屏（沿用 CIELO 输入层） | ✅ |
| 9 | 体检：ASTRA **4/4**（ring 40 / core 8 组 / props 46 / 世界 24，含真门洞射线与逐 float 确定性）+ 浏览器 `mobile-check` **17/17**；CIELO `checkall` **31/31**、`portal-check` **34/34**、`mobile-check` PASS | ✅ |
| 10 | 端到端实测：画架点击 → ASTRA 加载 281,212 tri 自动落位；ASTRA 按 R → CIELO?at=easel 站回画架前 | ✅ |
| 11 | 文档（合同 / HANDOFF / 日记 / STATUS / README / 首页）+ 提交推送 + Pages 核对 | ✅ |

> **线上**：CIELO **1,086,892 B（1,061.4 KB）** / gzip 355.8 KB；**ASTRA 195,206 B（190.6 KB）** / gzip 67.3 KB；
> 静态三角 CIELO **2,163,136**（零回归）+ ASTRA **281,212**；观景点 84 + 10；抄本 32 页。
> 构建戳在标题页与 `?diag` 里，两件作品都能自查版本。

## 3. 下一步（≤5 条，按优先级）

1. **ASTRA 真机看一次**：平板打开 `?view=0/1/5`（初降 / 全景 / 中庭），记录 HUD 的 gpu ms 与 FPS；
   281k tri 比 CIELO 轻一个数量级，若仍掉帧先看 `scenePx` 是否被自适应压低（`astra/src/main.js` 的 `TIERS`）。
2. **给 ASTRA 配音频**（下一轮最划算的观感升级）：一条低频太空 drone + 进入穹顶时的混响切换 + 对接港的机械哔声；
   新增 `astra/src/audio.js`，不要复用 CIELO 的城市环境音。
3. **帆张线加粗 / 改帆角**（见 HANDOFF 第十五轮遗留 2）：`station-ring.js` 的 `SAILS` 与张线半径，消掉个别机位的"发丝竖线"。
4. **ASTRA 的 PWA + Pages 独立入口**：照 `cielo.webmanifest / cielo-sw.js` 再做一份，让新世界也能"添加到主屏幕"离线玩。
5. **产品改进 C「游客护照」**（旧候选，见 [03-notes/cielo-product-ideas.md](03-notes/cielo-product-ideas.md)）：
   可以把两个世界合成一本护照 —— CIELO 32 页 + ASTRA 10 景，集齐出「通关证书」，复用明信片出片管线。

## 4. 硬约束（违反会返工）

- **桌面零回归**：所有触屏逻辑必须在 `html.touch` / `TOUCH` 为真时生效；`checkall` + `mobile-check` 全 PASS 才算完成。
- **零依赖**：两个世界的源码都不引第三方运行时库；成品是**单个 HTML**，构建后不请求任何外部资源
  （CIELO 与 ASTRA 之间用相对链接跳转不算请求）。
- **内容是数据**：CIELO 建筑介绍在 `03-notes/lore-scene/group-*.json`（单一事实源），用 `node tools/build-lore-scene.mjs`
  生成 `src/lore-scene.js`；**不要手改生成物**。
- **数字要有出处**：文案里的尺寸/数量必须能在源码常量或 HANDOFF 里核对。
- **不要为了手机删内容**：性能靠关阴影、降渲染倍率、减点光；`?q=low|mid|high` 与自动降档是唯一手段。
- **内存预算**：世界几何必须走 `B({chunked:true})` + `world.meshes` 分批流式上传；动 `geo.js/gl.js` 必须跑
  `node tools/geo-acc-check.mjs`（两个世界共用这两个文件，改完两边都要复跑）。
- **验收四件套**：CIELO `checkall`(31/31) + `mobile-check` + `mem-check` + 旧/新截图零回归；ASTRA `checkall`(4/4) + `mobile-check`。
  **验收脚本必须串行跑**（并行抢 CDP 端口会出假失败/假读数，第十四轮踩过）。
- **两个世界共享引擎**：`astra/src/engine.js` 只读引用 CIELO 的 `geo/lib3d/math/gl/actor/fx/touch`；
  改这些文件 = 同时改两个世界，必须先跑 CIELO 的全套基线。
- **画质零回归（第十三轮基线）**：动 `cielo/src/main.js` 的分辨率模型 / 后处理 / 三档之前，先
  `node tools/quality-check.mjs --tag=before` 留指标；手机端「2×2 同色块 ≤4%、LapVar ≥200」是真机验收过的基线。
- **新模块只能追加**：CIELO 的 `world.js` `tag()` 加在**末尾**、`layout.js` 的 `views` 只追加末尾
  （索引被固定机位/航线/抄本引用），新模块用自己的 `mulberry32` 种子。
- **工作记录**：按 [03-notes/worklog-format.md](03-notes/worklog-format.md) 写；每轮结束必须更新本页 + HANDOFF + 日记 + 提交推送。

## 5. 新会话 3 分钟上手

```powershell
# 1. 读现状（本页）与最近一轮合同
cat STATUS.md; ls 03-notes/*round*.md
# 2. 看仓库真实状态
git status --short; git log --oneline -5
# 3. 刷新自动事实块，与文档对照
node tools/status.mjs
# 4. CIELO 基线（构建 + 31 项体检）
cd 01-source/cielo; node build.mjs; node tools/checkall.mjs
# 5. ASTRA 基线（构建 + 4 项体检）
cd ../astra; node build.mjs; node tools/checkall.mjs
# 6. 浏览器验收（串行；需要 Chrome）
cd ../cielo; node tools/mobile-check.mjs      # 触屏/画质/抄本/明信片 + 桌面回归
cd ../astra; node tools/mobile-check.mjs      # 星鲸环触屏 + 桌面回归
# 7. 浏览器里看（桌面 8099；平板联调加 --host=0.0.0.0）
cd ../cielo; node tools/serve.mjs --host=0.0.0.0
```

CIELO 桌面快捷键：`空格` 巡游 · `1–9/0` 观景 · `Z/X` 切换 · `G` 抄本 · `N` 昼夜 · `F` 烟花 · `P` 摄影 · `C` 明信片 ·
`H` 帮助 · `R` 回露台 · 画架前 `回车` 进画中世界。
ASTRA 桌面快捷键：`WASD` 飞行 · `鼠标` 环视 · `Q/E` 升降 · `Shift` 加速 · `滚轮` 调速 · `空格` 巡游 ·
`1–9/0` 观景 · `Z/X` 切换 · `V` 画质 · `P` 摄影 · `G` 全屏 · `H` 帮助 · `R` 回到画中。
触屏：左半屏摇杆 · 右半屏环视 · 右侧升降 · 右下 ☰ 动作条（两个世界一致）。
URL：`?view=` `?cam=` `?tod=day|dusk|night`（CIELO）`?freeze=` `?noui` `?q=low|mid|high` `?touch=0|1` `?perf`
`?nomod=` `?diag` `?route=architecture|wonder|secret`（CIELO）· `?from=easel` `?at=easel`（传送门）。

## 6. 文档地图

| 文件 | 管什么 |
|---|---|
| **STATUS.md**（本页） | 现在：入口、本轮、下一步、硬约束 |
| [HANDOFF.md](HANDOFF.md) | 每轮历史：现状 / 30 秒上手 / 已知遗留（只追加） |
| [03-notes/worklog-format.md](03-notes/worklog-format.md) | **工作记录规范**（四层记录、模板、检查单、提交规范） |
| [05-daily/](05-daily/) | 每日/每会话日记（六段，坑必写） |
| [03-notes/cielo-round15-astra-brief.md](03-notes/cielo-round15-astra-brief.md) | **本轮合同**：第二世界 + 传送门（含"文件是不是太大"实测与 ASTRA 引擎契约） |
| [03-notes/cielo-production.md](03-notes/cielo-production.md) | CIELO 制作笔记（管线、几何、着色器、参数、每轮技术结论） |
| [03-notes/cielo-spec.md](03-notes/cielo-spec.md) | CIELO 设计规格 |
| [03-notes/lore-scene/](03-notes/lore-scene/) | 抄本「景」文案源文件（JSON，按区域分组） |
| [01-source/cielo/src/lore.js](01-source/cielo/src/lore.js) | 抄本「故事」与抵达区域数据 |
| [01-source/astra/src/engine.js](01-source/astra/src/engine.js) | **两个世界共享的引擎边界**（只读再导出） |
| [01-source/astra/src/layout.js](01-source/astra/src/layout.js) | 星鲸环唯一锚点表（环站尺寸 / 穹顶 / 10 个观景点） |
| [README.md](README.md) | 仓库总览（含平板用法、两个世界怎么互相进入） |
