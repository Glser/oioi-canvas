---
target: home page / web/src/pages/home/index.tsx
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:D:\\java\\oioi-canvas\\web\\src\\pages\\home\\index.tsx"
target_fingerprint: "sha256:e352348f89e66e1098eaddaee14ed6de10ad11a7bf14ee6cfee314800e223c9b"
target_path: "D:\\java\\oioi-canvas\\web\\src\\pages\\home\\index.tsx"
timestamp: 2026-10-30T12-43-00Z
slug: web-src-pages-home-index-tsx
---
# Impeccable Critique — Home

Target: `web/src/pages/home/index.tsx` (Operate surface: product workspace home, with app shell)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Agent 已连接是输入框里的靛蓝，面板打开是导航里的紫色；主按钮禁用时只有 hover 才解释原因 |
| 2 | Match System / Real World | 2 | 文案说「交给 Agent 开启画布推演」，实际是配对本地进程后再复制一条 MCP 指令 |
| 3 | User Control and Freedom | 2 | 删除有确认；创建画布并挂起任务没有撤销；卡片是 `onClick` 不是链接，无法新开标签 |
| 4 | Consistency and Standards | 1 | 硬编码中文 vs `t()`，靛蓝 vs 紫色 Agent，`stone-*` vs `canvasThemes`，`开启创作` vs `新建画布` |
| 5 | Error Prevention | 2 | 删除确认是真的；假上传和只关窗的「确认」会诱发出错操作 |
| 6 | Recognition Rather Than Recall | 2 | Agent 是本机配对流程，首页只写了「Agent」；卡片操作依赖 hover 记忆 |
| 7 | Flexibility and Efficiency | 2 | 有 Enter 发送和 zip 导入导出；最近作品只能鼠标悬停操作，搜索只匹配标题 |
| 8 | Aesthetic and Minimalist Design | 1 | 工作台首页被做成营销 Hero：扫光标题、三色光晕、5 行输入、4 个灵感芯片 |
| 9 | Error Recovery | 2 | 「请先连接本地 Agent」不说怎么连；搜索无结果没有一键清空；导入失败只有一条 toast |
| 10 | Help and Documentation | 2 | 文档只在桌面状态栏；配对说明锁在侧栏；真正的产品说明 `home.description` 没用上 |
| **Total** | | **18/40** | **Poor** |

## Design Specificity Verdict

**LLM assessment:** 外壳是有作者意识的：暖石色、真实 logo、悬浮玻璃岛、Agent 作为一等导航。首页本身却是可替换的 AI 工具皮：扫光口号、彩虹光晕、无标签大输入框、假的 `+` 上传、四条风格芯片、主按钮叫「开启创作」。源码注释直接写了「小云雀 / Liblib 融合风格」。产品真正的句子已经写在 i18n 里：`在无限画布中生成、连接和重组图片、文字与图形，让创作从单次生成变成连续推演。` 上线的却是「探索无限灵感，推演极致视界」。画布才是产品；导航岛以生图 / 视频 / 提示词 / 资产 / 配置带路，从不把首页标成一个地方。

**Deterministic scan:** `impeccable detect --json` 对首页、布局、顶栏、移动抽屉、`index.html`、404 扫描结果为 `[]`，exit 0，0 条 findings。这不是干净证明。引擎对 HTML canary（Inter + 紫/靛）能打出 `overused-font` 和 `ai-color-palette`；对 React TSX 里的 `stone-*`、`to-indigo-500/10`、`bg-purple-500/15`、假上传、无限 shimmer 全部漏检。Detector 与设计评审在这里不一致：评审看到的问题是真的，扫描是假阴性。

**Visual overlays:** 本会话没有浏览器自动化，无法注入 overlay。无可靠的用户可见高亮。

## Overall Impression

导航岛和「最近作品」已经是产品。首页上半截还在扮演模型广场。最大机会：把首页从「营销对话框」收成「画布工作台」——提示词是创建画布的一条路径，不是挡住作品库的舞台。

## What's Working

- 桌面导航岛是写过的，不是模板：胶囊毛玻璃、滚动/开面板时文字用 grid 收缩，logo 是回到首页的入口。
- 「最近作品」是真的本地库：节点封面、zip 导入导出、原地重命名。这才是产品。
- 空状态文案是全页最具体的一句：节点、连线、外观。比 Hero 口号诚实。

## Priority Issues

### P0 主按钮说了做不到的事
- **What:** 占位符写「按 Enter 交给 Agent 开启画布推演」，tooltip 写「发送并把任务交给 Agent」，按钮写「开启创作」。未连接时按钮 `disabled`；连上之后也只是新建空画布、`setPendingTask`，让用户去复制 MCP 指令。
- **Why it matters:** 首页唯一主行动在未连接时是死的；连上了也不是发送，是复制作业。用户会以为产品坏了。
- **Fix:** 默认成功路径改成「新建画布，并把提示词落到画布上」。Agent 连上再显示「交给 Agent」。未连接时主按钮改成「连接 Agent」，不要禁用。内联配对（启动本机服务 / 6 位配对码），不要只丢一条 warning。
- **Suggested command:** `$impeccable clarify` + `$impeccable onboard`

### P1 工作台首页被营销 Hero 压住
- **What:** `pt-[150px]` / `md:pt-[180px]`、无限 `.home-title-shimmer`、琥珀/天蓝/靛蓝光晕、四条「试试灵感」、5 行输入框，把「最近作品」挤出首屏。两个开始动词互相抢：`开启创作` vs `新建画布`。导航从不高亮 Home，`navigation.canvas`（我的画布）闲置。
- **Why it matters:** 用户已经在产品里，却被当成广告访客。真正的画布库变成第二屏。
- **Fix:** 去掉口号、光晕、扫光。用已有的 `home.description`。Composer 收成网格上方的创建条。把 Home / 我的画布放进导航岛并标成当前页。
- **Suggested command:** `$impeccable distill`，然后 `$impeccable quieter`

### P1 最近作品是悬停博物馆
- **What:** `<article onClick>` 不是链接。复选框 `size-3.5` 且 `opacity-0 group-hover:opacity-100`。「更多操作」同样靠悬停。键盘、读屏、触摸选不了、重命名不了、导出不了。
- **Why it matters:** 桌面还能凑合；笔记本触控板和手机上，批量操作基本消失。
- **Fix:** 整卡改成 `<Link to=/canvas/:id>`。复选框常驻且至少 24px。菜单始终可聚焦。不要用 `onKeyDown` 冒充链接。
- **Suggested command:** `$impeccable harden`

### P2 幽灵控件和文案分叉
- **What:** 上传 `beforeUpload` 只 toast「素材上传功能即将支持」。展开弹窗的「确认」和「取消」一样只关窗。搜索空态硬编码「未找到符合条件的画布」，创建/导入走 `t()`。更好的产品说明 `home.description` 闲置。
- **Why it matters:** 看起来能用的入口其实不能用。中英文和空态会各说各话。
- **Fix:** 上传未做成就拿掉。展开框要么直接变大输入，要么确认即发送。文案统一走 i18n。
- **Suggested command:** `$impeccable clarify`

### P2 移动端壳把工作台工具丢了
- **What:** 窄屏顶栏只有汉堡 + logo。没有 Agent、文档、语言、主题。抽屉是五个工作台，没有 Home 和 Agent。`rows={5}` 加上 150px 顶距把作品列表推下去。卡片悬停操作在触摸上失效。
- **Why it matters:** 手机上既发不了主任务，也管不好画布。
- **Fix:** 顶栏或底栏常驻 Agent。抽屉顺序：首页、Agent，然后工作台。Composer 改为 `rows={2}`。卡片操作可见。
- **Suggested command:** `$impeccable layout`

## Persona Red Flags

**Jordan（第一次来）:** 看到「探索无限灵感，推演极致视界」和五个工作台，首页未选中；「开启创作」是灰的；芯片能填词但不能发；「新建画布」被藏在更安静的位置；「上传素材」是假的。

**Alex（熟手）:** 180px Hero 浪费垂直空间；5 行输入；`Enter 发送` 和「开启创作」语义打架；搜索只匹配标题；没有全选；批量操作要先悬停勾选；`submittingRef` 置 true 后不复位，回首页可能再也发不出去。

**Sam（键盘 / 读屏）:** textarea 无 label 且 `outline-none`；「最近作品」是 `span` 不是 `h2`；卡片不在 tab 序；logo `alt="Logo"`；标题 `color: transparent` 无限扫光，没有 `prefers-reduced-motion`。

**Riley（找茬）:** 假上传；确认空操作；标题截断成前 20 字；灵感芯片每次随机；404 是另一套灰点背景；深色写死 `#141413` / `#1a1918`，偏离 `canvasThemes`。

## Minor Observations

- `index.html` 的 title 是诚实的「无限画布」，页面 h1 不是。
- 注释写 28px 点阵，CSS 是 `21.6px`。
- h1 的 `translate-y-2` 是在补 logo+口号没对齐。
- 空卡片、空状态、Hero、导航反复用同一 logo，空画布列表像贴纸墙。
- 删除对话框模式是对的；「已选 N 项」再藏一层导出/删除是错的。
- 生图/视频工作台已经是 `pt-16` 的 Operate 布局；只有首页还在扮落地页。
- 移动端 logo 是回首页的唯一路，不认识这个标就回不去。
- `home/index.tsx` 残留未使用 import：`useTransition`、`Tabs`、`Sparkles`、`Video`、`FileText`、`History`、`LayoutGrid`、`MessageSquare`、`Music2`。

## Questions to Consider

- 这个输入框并不能真的把任务发给 Agent，为什么它还是 Operate 首页的主角？
- 为什么把 `home.description` 换成任何模型广场都能用的口号？
- 首页到底是画布库、Agent 启动器，还是工作台切换器？导航岛已经选了工作台。
- 只想要一张空白无限画布的人，能在灰色「开启创作」下面找到「新建画布」吗？
- 「Agent」到底是连接状态、侧栏开关，还是发送目标？现在一个词、两种颜色，三件事。
