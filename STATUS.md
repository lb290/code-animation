# STATUS · 天空鲸城（CIELO）/ 星鲸环（ASTRA）/ code-animation

> **新会话从这里开始**：90 秒读完这一页，再按「6 · 文档地图」去读本轮合同与交接历史。
> 本页只写**现在**；每轮的历史在 [HANDOFF.md](HANDOFF.md)，每天的过程在 [05-daily/](05-daily/)。

<!-- AUTO:START -->
> 自动生成 · 2026-11-27 01:42 · 运行 `node tools/status.mjs --write` 刷新。下面每一行都是从仓库里读出来的，不靠人记。

| 项 | 值 |
|---|---|
| 分支 / HEAD（生成时） | `main` @ `f99f05f` · feat(astra): 悬灯画廊——环带下四间可飞入的室内 + 修巡游「一闪一闪的光污染」 |
| 工作树 | 干净 |
| 成品 · 天空鲸城 | `04-output/CIELO.html` · 1061.4 KB |
| 成品 · 天空之城 · 灯祭 | `04-output/CELESTIA.html` · 145.0 KB |
| 成品 · 星鲸环（画中世界） | `04-output/ASTRA.html` · 377.4 KB |
| 几何体检 | CIELO 31 项 · ASTRA 9 项 |
| 内容规模 | 观景点 天空鲸城 84 · 星鲸环 20 ；抄本 32 页 |
| 最近日记 | `05-daily/2026-11-27.md` |
<!-- AUTO:END -->

## 0. 一句话

手写 WebGL2、零依赖的**两个可游览世界**：云上的白城「天空鲸城 CIELO」（巨鲸驮着城堡游过塔尖、
84 处观景点、32 页导览抄本、七处可飞入的地标），以及**画中的太空世界「星鲸环 ASTRA」**
（露台画架那幅画就是门：走近点击、镜头坠入画布，落进一片有星云与环带巨行星的星海，中央是直径 1.2 km 的
巨型环站「鲸环站」：环带 / 六条辐条 / 可飞入的玻璃穹顶中庭 / 56 m 黄铜鲸骨；环带下沿挂着一条
**悬灯画廊**，四间朝向巨行星的落地大窗室内（彩窗画室 / 丝绒茶厅 / 玻璃工坊 / 青花书房），共 20 个观景点）。
两个世界各自是**单个 HTML 文件**（内联全部 JS 与着色器），桌面与安卓平板/手机都能玩；
另有夜景灯市「天空之城 · 灯祭 CELESTIA」。

## 1. 线上入口（可直接点开）

| 入口 | 地址 | 说明 |
|---|---|---|
| 天空鲸城 CIELO | <https://lb290.github.io/code-animation/04-output/CIELO.html> | 主成品（1,061.4 KB / 2,163,136 tri / 84 观景 / 32 页抄本） |
| **星鲸环 ASTRA** | <https://lb290.github.io/code-animation/04-output/ASTRA.html> | 画中太空世界（377.4 KB / 445,525 tri / **20 观景，含悬灯画廊四间房**） |
| 天空之城 · 灯祭 CELESTIA | <https://lb290.github.io/code-animation/04-output/CELESTIA.html> | 夜景浮岛灯市 |
| 首页（全部入口） | <https://lb290.github.io/code-animation/> | 三件作品索引 |
| 成片与图集 | <https://github.com/lb290/code-animation/releases> | 《天空巡礼》、AETHER 1080p |

> **怎么进新世界**：在 CIELO 里飞到露台，走到画架前（露台西侧、少女旁边）→ 出现「走近画中世界 · 点击画布 / 回车」
> → 点击 → 2.4 s 坠入画中 → ASTRA；在 ASTRA 里按 `R` 或点左下「回到画中」→ 回到画架前（`?at=easel`）。
> 也可以直接打开上面的 ASTRA 链接。

## 2. 本轮（Round 16 · 2026-11-27）：修「一闪一闪的光污染」+ 悬灯画廊四间可进入室内

**用户委托**：「读 HANDOFF.md 继续做 ASTRA。**游览的时候会有一闪一闪的光污染**，就像截图发给你的那样。
**根据这几个图分别做可进入游览的精美室内**（素材/图片/幻想城市/室内 下的 111530188 / 68499618 / 68390607 / 46454797 四张）。」

**施工合同**：[03-notes/astra-round16-interiors-brief.md](03-notes/astra-round16-interiors-brief.md)

| # | 项目 | 状态 |
|---|---|---|
| 1 | **光污染根因**：bloom 的 `uTexel` 被当"屏宽比例"传（实际 ±3.2 整屏 UV）+ `CLAMP_TO_EDGE` → 屏幕边缘的高亮被抹满全屏，镜头一转就闪（实测 132 s 巡游里有 +0.154 的单帧亮度尖峰） | ✅ |
| 2 | **修法**：bloom 两级、真实纹素（新增 `rtBloomC`）+ bright 单像素钳 8.0 + billboard 近场淡出。只改 ASTRA，CIELO 零改动 | ✅ |
| 3 | **悬灯画廊**：方位 250°、环带下沿 y=-86、208 m 廊桥（7 根吊索+7 根斜拉索+中央塔）、4 间 40×26×18 m 房（13 m 真拱门 + 30 m 真拱窗） | ✅ |
| 4 | **四间房**（各 1 个模块 + 独立体检）：彩窗画室 28,879 / 丝绒茶厅 41,386 / 玻璃工坊 41,273 / 青花书房 46,009 tri；每间 6 灯、77–106 组陈设 | ✅ |
| 5 | 画廊壳 6,766 tri；ASTRA 静态 **281,212 → 445,525**；单文件 **190.6 → 377.4 KB**（gzip 123.8 KB） | ✅ |
| 6 | 观景点 **10 → 20**（10 悬灯画廊 / 11 画廊长桥 / 12–19 四间房入门·回望；0–9 索引不变） | ✅ |
| 7 | 体检：`checkall` **9/9 PASS**（gallery 61 / painter 42 / tearoom 12 / atelier 29 / study 12 / ring 40 / core / props / 世界）+ `mobile-check` **17/17** | ✅ |
| 8 | 终版 60 s 巡游复测：最大亮度残差 **0.025**、>0.03 的帧 **0**（改前 +0.154） | ✅ |
| 9 | 文档（合同 / HANDOFF / 日记 / README / 首页 / 本页）；20 张终版静帧 + 拼版在 `04-output/_r16/` | ✅ |
| 10 | 提交推送 + Pages 核对 | 🚧 本轮 commit 待做（见下一步 1） |

> **线上（待推送）**：ASTRA **386,504 B（377.4 KB）/ gzip 123.8 KB**、静态 **445,525 tri**、观景点 **20**；
> CIELO **1,086,892 B**（2,163,136 tri / 84 观景 / 32 页抄本）本轮未动。

## 3. 下一步（≤5 条，按优先级）

1. **推送 + Pages 核对（本轮收尾）**：`git push` 后查 `gh api repos/lb290/code-animation/pages` 的 `status` 必须 `built`
   （第十四轮踩过"push 成功但 Pages errored"），再核对线上 `04-output/ASTRA.html` 字节数 = 386,504。
2. **ASTRA 真机看一次**：平板打开 `?view=0/10/12/18`（初降 / 悬灯画廊 / 画室 / 书房），记录 HUD 的 gpu ms 与 FPS；
   445k tri 仍是 CIELO 的 1/5，若掉帧先看 `scenePx` 是否被自适应压低（`astra/src/main.js` 的 `TIERS`）。
3. **给 ASTRA 配音频**（下一轮最划算的观感升级）：一条低频太空 drone + 进入穹顶/画廊时的混响切换；
   新增 `astra/src/audio.js`，不要复用 CIELO 的城市环境音。
4. **画廊外立面再亮一档**（见 HANDOFF 第十六轮遗留 1）：只动 `room-gallery.js` 的灯笼顶檐线与
   `galleryLights()`，**不要动 bloom**（本轮刚把 bloom 的光污染修掉）。
5. **产品改进 C「游客护照」**：CIELO 32 页 + ASTRA 20 景，集齐出「通关证书」，复用明信片出片管线
   （见 [03-notes/cielo-product-ideas.md](03-notes/cielo-product-ideas.md)）。

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
- **验收四件套**：CIELO `checkall`(31/31) + `mobile-check` + `mem-check` + 旧/新截图零回归；
  ASTRA `checkall`(**9/9**：ring/core/gallery/painter/tearoom/atelier/study/props/世界) + `mobile-check`(17/17)。
  **验收脚本必须串行跑**（并行抢 CDP 端口会出假失败/假读数，第十四轮踩过）。
- **bloom 的 `uTexel` 语义**：ASTRA 的 `blur.fs` 现在只接受**真实纹素步长**（`1/纹理宽`）；改 bloom 前先跑
  `node tools/screencast.mjs` 录 60 s 巡游并用 Python 算每帧平均亮度残差，**>0.03 的帧必须是 0**
  （第十六轮的光污染就是这个数错了）。CIELO 的 bloom 仍是旧写法，别顺手去"修"。
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
# 5. ASTRA 基线（构建 + 9 项体检：含悬灯画廊与四间房）
cd ../astra; node build.mjs; node tools/checkall.mjs
# 6. 浏览器验收（串行；需要 Chrome）
cd ../cielo; node tools/mobile-check.mjs      # 触屏/画质/抄本/明信片 + 桌面回归
cd ../astra; node tools/mobile-check.mjs      # 星鲸环触屏 + 桌面回归
# 7. 20 个观景点静帧（需要先起 serve；产物在 04-output/_r16/，不入库）
cd ../astra; node tools/views.mjs ../../04-output/_r16/astra
# 8. 浏览器里看（桌面 8099；平板联调加 --host=0.0.0.0）
cd ../cielo; node tools/serve.mjs --host=0.0.0.0
```

CIELO 桌面快捷键：`空格` 巡游 · `1–9/0` 观景 · `Z/X` 切换 · `G` 抄本 · `N` 昼夜 · `F` 烟花 · `P` 摄影 · `C` 明信片 ·
`H` 帮助 · `R` 回露台 · 画架前 `回车` 进画中世界。
ASTRA 桌面快捷键：`WASD` 飞行 · `鼠标` 环视 · `Q/E` 升降 · `Shift` 加速 · `滚轮` 调速 · `空格` 巡游 ·
`1–9/0` 观景（20 站：10 悬灯画廊 / 11 画廊长桥 / 12–19 四间房）· `Z/X` 切换 · `V` 画质 · `P` 摄影 · `G` 全屏 · `H` 帮助 · `R` 回到画中。
触屏：左半屏摇杆 · 右半屏环视 · 右侧升降 · 右下 ☰ 动作条（两个世界一致）。
URL：`?view=` `?cam=` `?tod=day|dusk|night`（CIELO）`?freeze=` `?noui` `?q=low|mid|high` `?touch=0|1` `?perf`
`?nomod=` `?only=模块名,模块名`（ASTRA 只建指定模块，房间调试用）`?diag`
`?route=architecture|wonder|secret`（CIELO）· `?from=easel` `?at=easel`（传送门）。

## 6. 文档地图

| 文件 | 管什么 |
|---|---|
| **STATUS.md**（本页） | 现在：入口、本轮、下一步、硬约束 |
| [HANDOFF.md](HANDOFF.md) | 每轮历史：现状 / 30 秒上手 / 已知遗留（只追加） |
| [03-notes/worklog-format.md](03-notes/worklog-format.md) | **工作记录规范**（四层记录、模板、检查单、提交规范） |
| [05-daily/](05-daily/) | 每日/每会话日记（六段，坑必写） |
| [03-notes/astra-round16-interiors-brief.md](03-notes/astra-round16-interiors-brief.md) | **本轮合同**：悬灯画廊四间房的坐标系/壳 API/预算/体检/禁区（四名施工员并行用） |
| [03-notes/cielo-round15-astra-brief.md](03-notes/cielo-round15-astra-brief.md) | 第十五轮合同：第二世界 + 传送门（含"文件是不是太大"实测与 ASTRA 引擎契约） |
| [03-notes/cielo-production.md](03-notes/cielo-production.md) | CIELO 制作笔记（管线、几何、着色器、参数、每轮技术结论） |
| [03-notes/cielo-spec.md](03-notes/cielo-spec.md) | CIELO 设计规格 |
| [03-notes/lore-scene/](03-notes/lore-scene/) | 抄本「景」文案源文件（JSON，按区域分组） |
| [01-source/cielo/src/lore.js](01-source/cielo/src/lore.js) | 抄本「故事」与抵达区域数据 |
| [01-source/astra/src/engine.js](01-source/astra/src/engine.js) | **两个世界共享的引擎边界**（只读再导出） |
| [01-source/astra/src/layout.js](01-source/astra/src/layout.js) | 星鲸环唯一锚点表（环站尺寸 / 穹顶 / 20 个观景点） |
| [01-source/astra/src/interiors-plan.js](01-source/astra/src/interiors-plan.js) | **悬灯画廊与四间房的唯一尺寸真值**（方位/坐标/门洞/窗洞/观景点/探针） |
| [01-source/astra/src/room-shell.js](01-source/astra/src/room-shell.js) | 四间房共用外壳（厚墙 / 真门洞 / 30 m 拱窗 / 地台顶板线脚） |
| [01-source/astra/src/room-gallery.js](01-source/astra/src/room-gallery.js) | 画廊本体（廊桥 / 吊索 / 灯笼顶 / 中央塔 / 灯与光斑） |
| [README.md](README.md) | 仓库总览（含平板用法、两个世界怎么互相进入） |