# STATUS · 天空鲸城（CIELO）/ code-animation

> **新会话从这里开始**：90 秒读完这一页，再按「6 · 文档地图」去读本轮合同与交接历史。
> 本页只写**现在**；每轮的历史在 [HANDOFF.md](HANDOFF.md)，每天的过程在 [05-daily/](05-daily/)。

<!-- AUTO:START -->
> 自动生成 · 2026-11-25 00:41 · 运行 `node tools/status.mjs --write` 刷新。下面每一行都是从仓库里读出来的，不靠人记。

| 项 | 值 |
|---|---|
| 分支 / HEAD（生成时） | `main` @ `d9f95f8` · docs(cielo): 第十二轮记录 —— 崩溃合同 / HANDOFF / STATUS / 日记 / 产品方案 |
| 工作树 | 干净 |
| 成品 · 天空鲸城 | `04-output/CIELO.html` · 978.0 KB |
| 成品 · 天空之城 · 灯祭 | `04-output/CELESTIA.html` · 145.0 KB |
| 几何体检 | 30 项（`node tools/checkall.mjs`） |
| 内容规模 | 观景点 80 · 抄本 31 页 |
| 最近日记 | `05-daily/2026-11-25.md` |
<!-- AUTO:END -->

## 0. 一句话

手写 WebGL2、零依赖的**可游览幻想都市**：云上的白城，巨鲸驮着一座城堡从塔尖游过；城市里有可飞入的宫殿、玻璃宫、大教堂、高架车站、歌剧院，31 处地标各有一页「建筑介绍 + 故事」的导览抄本。成品是**单个 HTML 文件**（约 0.96 MB，内联全部 JS 与着色器），桌面与安卓平板/手机都能玩。第十二轮修掉了手机端崩溃（构建期 JS 堆 1.2 GB → 29 MB），并加了**三条主题航线**（导览巴士）与**明信片工坊**。

## 1. 线上入口（可直接点开）

| 入口 | 地址 | 说明 |
|---|---|---|
| 天空鲸城 CIELO | <https://lb290.github.io/code-animation/04-output/CIELO.html> | 主成品；平板可「添加到主屏幕」离线玩 |
| 天空之城 · 灯祭 CELESTIA | <https://lb290.github.io/code-animation/04-output/CELESTIA.html> | 夜景浮岛灯市 |
| 首页（全部入口） | <https://lb290.github.io/code-animation/> | 三件作品索引 |
| 成片与图集 | <https://github.com/lb290/code-animation/releases> | 《天空巡礼》、AETHER 1080p |
## 2. 本轮（Round 12 · 2026-11-25 凌晨）

**用户委托**：① 安卓 Chrome 打开线上 CIELO.html **标签页崩溃**；② 手机自带浏览器打开**没有教堂 / 火车站 / 大剧院**；③ 修复后**提交推送代码**；④ 再按产品需要**迭代功能**。

**施工合同**：[03-notes/cielo-round12-mobile-oom-brief.md](03-notes/cielo-round12-mobile-oom-brief.md)（含根因实测数据与验收标准）

| # | 项目 | 状态 |
|---|---|---|
| 1 | 根因定位：构建期 JS 堆峰值 1276 MB（安卓 Chrome renderer 上限 300–500 MB）；自带浏览器是「最后几个大模块」分配失败被 `tag()` 静默吞掉 | ✅ |
| 2 | 几何改分块 TypedArray 累积 + 分批流式上传（7 批），构建结束释放；JS 堆 **1276 → 29 MB** | ✅ |
| 3 | 静默失败可见化：`ctx.failures` + `?diag` 显示批数 / 构建 ms / JS 堆 / 失败列表 | ✅ |
| 4 | 新验收：`tools/geo-acc-check.mjs`（跨块逐字节一致）+ `tools/mem-check.mjs`（受限堆手机模拟 15 断言）；`checkall` **30/30** | ✅ |
| 5 | 桌面零回归：旧 vs 新同机位截图**逐像素一致**（max diff 0–1）；`mobile-check` 全 PASS | ✅ |
| 6 | 产品改进 B「主题航线 · 导览巴士」：三条航线 19 站（建筑朝圣 / 童话奇观 / 云端秘境），逐站过渡 + 航线条（暂停 / 退出 / 读这一站），手动操作自动退出 | ✅ |
| 7 | 施工合同 / HANDOFF / 日记 / 产品方案文档同步 | ✅ |

> **线上**：本次收尾提交见 `git log -1`；`CIELO.html` **978.0 KB**（单文件）、静态 2,048,729 tri / 7 批 / 66 draw calls；构建戳可在标题页与 `?diag` 核对。安卓 Chrome 与自带浏览器都应能完整加载（含教堂 / 车站 / 大剧院）。

## 3. 下一步（≤5 条，按优先级）

1. **真机复验（最优先）**：手机 Chrome + 自带浏览器各打开线上地址，确认 ① 不再崩溃 ② 教堂 / 火车站 / 大剧院都在；`?diag` 截图留档（应为 7 批 / JS 堆 ~30 MB / 失败空）。
2. **真机帧率**：`?perf=1` 记录三档画质在 3 个观景点的 fps 写回 STATUS/HANDOFF（本轮只有 headless 17.8 ms/帧）。
3. **显存兜底（若真机报 context lost）**：顶点缓冲仍约 271 MB；下一步做移动端几何降级 —— 从 `city`（776k tri）起按档减细分，不删内容；分块累加器已就位。
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
