# STATUS · 天空鲸城（CIELO）/ code-animation

> **新会话从这里开始**：90 秒读完这一页，再按「6 · 文档地图」去读本轮合同与交接历史。
> 本页只写**现在**；每轮的历史在 [HANDOFF.md](HANDOFF.md)，每天的过程在 [05-daily/](05-daily/)。

<!-- AUTO:START -->
> 自动生成 · 2026-11-24 21:49 · 运行 `node tools/status.mjs --write` 刷新。下面每一行都是从仓库里读出来的，不靠人记。

| 项 | 值 |
|---|---|
| 分支 / HEAD（生成时） | `main` @ `ef0eadd` · docs: 工作记录规范 + STATUS 现状页 + 自动事实块 + 平板用法 |
| 工作树 | 2 个改动（3-notes/worklog-format.md、tools/status.mjs） |
| 成品 · 天空鲸城 | `04-output/CIELO.html` · 957.9 KB |
| 成品 · 天空之城 · 灯祭 | `04-output/CELESTIA.html` · 145.0 KB |
| 几何体检 | 28 项（`node tools/checkall.mjs`） |
| 内容规模 | 观景点 80 · 抄本 31 页 |
| 最近日记 | `05-daily/2026-11-24.md` |
<!-- AUTO:END -->

## 0. 一句话

手写 WebGL2、零依赖的**可游览幻想都市**：云上的白城，巨鲸驮着一座城堡从塔尖游过；城市里有可飞入的宫殿、玻璃宫、大教堂、高架车站、歌剧院，31 处地标各有一页「建筑介绍 + 故事」的导览抄本。成品是**单个 HTML 文件**（约 0.9 MB，内联全部 JS 与着色器），桌面与安卓平板/手机都能玩。

## 1. 线上入口（可直接点开）

| 入口 | 地址 | 说明 |
|---|---|---|
| 天空鲸城 CIELO | <https://lb290.github.io/code-animation/04-output/CIELO.html> | 主成品；平板可「添加到主屏幕」离线玩 |
| 天空之城 · 灯祭 CELESTIA | <https://lb290.github.io/code-animation/04-output/CELESTIA.html> | 夜景浮岛灯市 |
| 首页（全部入口） | <https://lb290.github.io/code-animation/> | 三件作品索引 |
| 成片与图集 | <https://github.com/lb290/code-animation/releases> | 《天空巡礼》、AETHER 1080p |

## 2. 本轮（Round 11 · 2026-11-24 晚）

**用户委托**：① 提交并推送代码；② 规定工作记录格式；③ 天空鲸城支持安卓平板（局域网访问或平板独立运行）；④ 列两个产品改进方案并推进一个。中途追加：⑤ 游览中的建筑介绍要详细（先讲建筑与场景，再讲故事）；⑥ 音乐沙龙天花板的银河不好看，改成星象剧场那种星空。

**施工合同**：[03-notes/cielo-round11-android-brief.md](03-notes/cielo-round11-android-brief.md)（开工前写的现状体检与验收标准；本轮实际范围比它更大，以本页为准）

| # | 项目 | 状态 |
|---|---|---|
| 1 | 提交并推送第十轮遗留 + 本轮全部改动 | ✅ |
| 2 | 工作记录规范（四层记录 + 模板 + `tools/status.mjs` 自动事实块） | ✅ |
| 3 | 安卓平板：触摸输入层 / 移动质量档 / 竖屏与安全区 / 触屏抄本 | ✅ |
| 4 | 安卓独立运行：PWA（manifest + service worker + 图标，可装主屏幕离线） | ✅ |
| 5 | 局域网：`serve.mjs --host=0.0.0.0` 打印平板地址 | ✅ |
| 6 | 抄本「景」文案 31 条（先建筑、后故事，10,717 字，带源码出处） | ✅ |
| 7 | 音乐沙龙天花板星空重做（对齐星象剧场，+19,346 tri） | ✅ |
| 8 | 产品改进：① 明信片工坊（本轮推进）② 主题航线 · 导览巴士（下一轮候选） | ✅ ① / 📋 ② |
| 9 | 桌面零回归 + 平板验收（`checkall` 28/28 + `mobile-check` 全 PASS） | ✅ |
| 10 | 真机试用反馈 4 条：旧构建识别（构建戳 + `?diag`）/ 导览不自动弹 / 菜单收纳 / 双手同时移动+转向 | ✅ |

## 3. 下一步（≤5 条，按优先级）

1. **产品改进 ②（下一轮）「主题航线 · 导览巴士」**：抄本里加三条主题路线（建筑朝圣 / 童话奇观 / 云端秘境），一键串联观景点连续巡游，配解说卡片与进度。复用 `cam.setView` + `guide`，平板大按钮友好。详见 [03-notes/cielo-product-ideas.md](03-notes/cielo-product-ideas.md)。
2. **真机验证**：找一台安卓平板跑 `?perf=1`，记录三档画质在 3 个观景点的 fps；把读数写进 STATUS 与 HANDOFF（本轮只有 headless 相对数据，没有真机数字）。
3. **真机确认**：用新构建（标题页有构建戳）重跑平板；若「拷贝版缺建筑」仍出现，用 `?diag` 对比三角数（完整构建静态 2,048,729 tri）并回报。
4. **沙龙星云**：视用户反馈决定是否再压（只留星点 + 星座，星云从 10 团减到 6 团、透明度再降 30%）。
5. 长期：`CIELO.dev.html` 已 1.5 MB，是否继续保留开发版/单场景版入口，下次清理时决定。

## 4. 硬约束（违反会返工）

- **桌面零回归**：所有触屏逻辑必须在 `html.touch` / `TOUCH` 为真时生效；桌面截图与第十轮一致。`tools/checkall.mjs` 28/28 + `tools/mobile-check.mjs` 全 PASS 才算完成。
- **零依赖**：CIELO 源码不引第三方运行时库；成品是**单个 HTML**，构建后不请求任何外部资源（PWA 的 manifest / sw / 图标是可选增强，页面本身不依赖它们）。
- **内容是数据**：建筑介绍在 `03-notes/lore-scene/group-*.json`（单一事实源），用 `node tools/build-lore-scene.mjs` 生成 `src/lore-scene.js`；**不要手改生成物**。
- **数字要有出处**：文案里的尺寸/数量必须能在源码常量或 HANDOFF 里核对；不确定就不写数字。
- **不要为了手机删内容**：性能靠关阴影、降渲染倍率、减点光；`?q=low|mid|high` 与自动降档是唯一手段。
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
# 5. 平板/触屏验收（需要 Chrome，约 1–2 分钟）
node tools/mobile-check.mjs
# 6. 浏览器里看（桌面 8099；平板联调加 --host=0.0.0.0）
node tools/serve.mjs --host=0.0.0.0
```

桌面快捷键：`空格` 巡游 · `1–9/0` 观景 · `Z/X` 切换 · `G` 抄本 · `N` 昼夜 · `F` 烟花 · `P` 摄影 · `C` 明信片 · `H` 帮助 · `R` 回露台。
触屏：左半屏摇杆 · 右半屏环视 · 右侧升降 · 底部动作条。
URL 参数：`?view=` `?cam=` `?tod=day|dusk|night` `?freeze=` `?noui` `?q=low|mid|high` `?touch=0|1` `?perf` `?nomod=`。

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
