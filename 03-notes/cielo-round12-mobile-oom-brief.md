# CIELO 第十二轮施工合同 —— 手机崩溃 / 缺建筑（内存）修复 + 产品迭代

> 用户原话（2026-11-24 23:37）：**先解决两个问题，我发的图片，1 是在手机上的 chrome 打开崩溃问题，
> https://lb290.github.io/code-animation/04-output/CIELO.html 这个。2 是用手机自带浏览器打开没有显示教堂，
> 火车站，大剧院，打开的是这个地址 …。解决之后提交推送代码，然后再按产品需要的功能迭代开发**。
>
> 配图证据：① 安卓 Chrome 的崩溃页（sad tab，「无法打开此网页」）；② 手机自带浏览器里能进城市，
> 但**教堂 / 火车站 / 大剧院**都不见了。

## 一、根因（不是猜的，是量出来的）

| 事实 | 数字 |
|---|---|
| 桌面 headless 打开成品后 performance.memory.usedJSHeapSize | **1276 MB**（jsHeapSizeLimit 4192 MB） |
| 安卓 Chrome renderer 堆上限 | 通常 300–500 MB → **整页 OOM，sad tab** |
| src/geo.js 的 B 用普通 JS number 数组累积 | 顶点 67,708,557 个 double ≈ **542 MB**；索引 6,146,187 个 ≈ 49 MB |
| 上传前再整块拷贝 | Float32Array ≈ 271 MB + Uint32Array ≈ 25 MB（峰值 1.2 GB+） |
| 复现（限制 V8 老生代 350 MB，桌面 headless） | 只有 city 模块打印完成，之后构建卡死 |
| 自带浏览器为什么「只缺后几个大模块」 | world.js 的 tag() **捕获模块异常后继续构建**：内存耗尽发生在后面的模块，于是 cathedral(122,824) / station(101,910) / opera(101,695) 静默缺失 |

结论：**两个现象同一个根因 —— 构建期内存峰值。** 一个直接崩，一个「崩掉最后几个模块」。

## 二、改法（只在内存上，不动内容）

1. src/geo.js：B 增加 chunked 模式 —— 顶点/索引进固定大小 Float32Array/Uint32Array 块；每块记录**有效长度** used[k]（一条顶点不能跨块，块尾会留 <11 个 float 的空位）。默认模式仍是普通数组：20 多个体检脚本直接读 b.v[i]，不能动。
2. src/gl.js：新增 meshChunked() —— 先 bufferData 定长、再逐块 bufferSubData（按 used 拷），不再需要「先把整个世界拼成一个 271 MB 的 Float32Array」。
3. src/world.js：在模块边界按 20 万三角预算分批上传（world.meshes，本轮 7 批），上传后 reset() 复用块、构建结束 release() 放掉；?batch= 可覆盖批大小（调试）。新增 ctx.failures：模块构建失败 / gl.getError() 非零都会被记录并显示在 ?diag（不再静默缺建筑）。
4. src/main.js：主渲染与阴影 pass 改为遍历 world.meshes；开局画质探测跳过前 40 帧（分批上传后头几十帧有一次性的 GC/着色器抖动，曾把桌面误判成「设备慢」降档）。
5. tools/geo-acc-check.mjs（新增，进 checkall）：跨块时 chunked 输出与普通数组**逐字节相同**、used[] 覆盖率、reset() 复用后与新建构建一致 —— 专门防「块尾空位导致整体错位」复发。

## 三、验收标准（可执行）

| # | 命令 / 操作 | 期望 |
|---|---|---|
| 1 | node tools/checkall.mjs | **29/29 PASS**（新增 geo-acc-check） |
| 2 | node tools/mobile-check.mjs | 全 PASS（触屏/质量档/抄本/明信片/桌面零回归） |
| 3 | 旧构建 vs 新构建同机位截图（view 0/40/70，1280×720，?noui&freeze=2&tod=day） | 逐像素一致（本轮实测 max diff 0–1） |
| 4 | 移动模拟 + --js-flags=--max-old-space-size=200 | 三角 2,048,729 全量、21 模块、ctx.failures=[]、JS 堆 ≈ 29 MB |
| 5 | node tools/mem-check.mjs | 全 PASS（内存 / 完整性 / 帧循环） |
| 6 | ?diag 面板 | 显示 世界批数 / 构建 ms / JS 堆 / 失败列表 |

## 四、风险与注意

- **显存没有变小**：顶点缓冲仍是 2.05M tri（≈271 MB VBO + 25 MB IBO，分 7 个 buffer）。本轮解决的是**崩溃（JS 堆）**；若真机仍报 context lost，下一步才是「移动端几何降级」（分档减细分，不删内容）。
- 批次边界在**模块边界**上，city 一个模块 776,371 tri，是单批上限（≈103 MB JS 峰值）；仍远低于手机配额。
- 桌面零回归是硬约束：chunked 模式只被 world.js 使用，体检脚本走默认数组路径。
- **不要**再往 B 里塞「按块尾整块拷贝」的写法；geo-acc-check 就是为这个坑立的。

## 五、开工 30 秒

```powershell
cd F:/AI/dsh/code-animation/01-source/cielo
node build.mjs && node tools/checkall.mjs && node tools/mobile-check.mjs && node tools/mem-check.mjs
node tools/serve.mjs --host=0.0.0.0
```
