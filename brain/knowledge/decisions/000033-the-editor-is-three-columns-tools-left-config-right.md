---
title: 编辑器是三栏，工具在左、配置在右
icon: 🧭
status: accepted
---

## Decision

工作流编辑器改为三栏，对齐飞书集成平台（AnyCross）：

- **左侧**：44px 图标栏（连接器 / 运行记录 / 版本）+ 260px 内容面板。
  连接器选择器、运行记录、版本列表都挂在这里。
- **中间**：画布。
- **右侧**：只做节点配置，内部分四个 tab —— 操作 / 入参 / 出参 / 错误处理。

`RightSideBarType` 从五态减为两态（`NONE`、`CONNECTOR_SETTINGS`），新增
`LeftSideBarType`（`NONE`、`CONNECTOR_PICKER`、`RUNS`、`VERSIONS`）。

## Context

[[000031-the-connector-selector-is-a-right-hand-panel-not-a-popover]] 把选择器放在右侧，
理由写的是"对标飞书，那套编排器的心智是『画布只画流程，配置都在右侧』"。

**这个前提是错的。** AnyCross 的文档《使用工作流编辑器》原文：

> 流程设计界面包含三个区域：左侧为功能区域。包含连接器、日志、校验、项目配置、数据存储、搜索。
> 中间为流程画布。右侧为节点的配置面板。

其产品截图也印证：左侧是三列图标网格的连接器面板，右侧是带
"操作 / 凭证 / 入参 / 出参 / 错误处理" tab 的配置面板。

## Why

0031 自己列出的代价——"右侧面板同时承担了选择器、参数、运行记录、版本四种内容，
`RightSideBarType` 的分支变多"——正是把本该在左边的东西塞进右边造成的。换到左侧后
这个代价直接消失，而且**左右两栏可以同时打开**：选连接器时画布和节点配置都还在。

原来的 `NodePalette`（172 行）是个死面板——条目 `cursor-default`、没有 onClick、
不能拖，底部还写着"Click + on the canvas to add a node."。它占着左侧位置却不能用，
本次整体删除，位置让给真正的功能区。

被否掉的做法是保留右侧选择器只把面板加宽：那样"选完连接器 → 配参数"仍然是同一块面板
的两次覆盖，画布旁永远只能看到一件事。

## Consequences

- 左侧图标栏的"运行记录"工具位带 `Permission.READ_WORKFLOW` 守卫。这个守卫原来挂在
  顶部栏的"运行记录"按钮上，按钮移走时必须跟着走，否则无权限用户会看到入口。
- 编辑器顶部栏腾出空间后补上了运行状态 chip、最后更新时间和「调试」按钮。
- 连接器选择从列表行改为**三列图标网格**（`ConnectorGridItem`），一屏能看完全部连接器。
- 右侧面板宽度从 480px 收窄到 320px——不再需要容纳选择器的多列内容。

## Gotchas

- **主操作保留「发布」，不是飞书的「完成」。** 飞书的「完成」语义是退出编辑回到它的
  *流程预览页*，我们没有这一层；主操作的真实语义是让工作流生效。照抄「完成」会让按钮
  说的和做的不是一回事。这是有意识的偏离，不是遗漏。
- **`mutate: true` 会跨语言污染连接器缓存。** `fetchLatestConnectors` 原本用
  `translateConnector({ mutate: true })` 就地改写 dev 连接器的缓存对象。把 `displayName`
  加进 `pathsToValuesToTranslate` 之后，只要有一个 `locale=zh` 的请求打过来，缓存里的连接器名
  就被永久改成中文——之后英文用户拿到的也是中文，因为 `translateConnector` 对 `en` 找不到
  `i18n['en']` 就原样返回那个已被污染的对象。已改为 `mutate: false`。
  **给可翻译字段表加字段时，先确认调用点不是就地修改共享缓存。**
- **右侧面板分 tab 之后，e2e 要跟着切 tab。** 步骤属性在「入参」、测试与样本数据在「出参」。
  `builder.page.ts` 的 `openStepInputTab` / `openStepOutputTab` 就是为此存在，
  `testTrigger` / `testStep` / `loadSampleData` 已内聚了切 tab 动作。
- **e2e 把语言钉成 en。** 界面默认简体中文，而这些用例断言的是英文文案，所以
  `playwright.config.ts` 的 `use.storageState` 和 `global-setup.ts` 都会写入
  `localStorage['fema.language'] = 'en'`。改语言解析逻辑时记得同步这两处。
- **`PanelImperativeHandle.resize()` 不能传 `'320px'` 这种带单位的字符串。**
  react-resizable-panels 4.7 的类型注释说字符串可以带 `px`，实测 `resize('320px')` 被误解析，
  面板直接钉到 `maxSize`（当时是 60%，1512px 视口下就是 843px，画布只剩 562px）。
  实测对照：`resize(320)` → 320px ✅、`resize('320px')` → 60% ❌、`resize('21%')` → 21% ✅、
  `resize(21)` → 21% ——**数值 >100 当像素、≤100 当百分比**。所以固定像素宽度一律传数字。
- **面板宽度存的是百分比，左栏一开右栏就缩水。** 左侧工具栏 + 260px 面板不在
  `ResizablePanelGroup` 里，它们一出现 group 变窄，右栏那个百分比换算出来的像素宽度就跟着掉
  （320px → 261px，标题栏会丢掉步骤名）。所以那个 `useLayoutEffect` 的依赖里必须有
  `leftSidebar`，左右开合时重新把右栏钉回 320px。
- **左栏「连接器」按钮必须同时设置 `connectorSelectorOperation`。**
  `ConnectorPickerPanel` 在 operation 为 null 时 `return null`，而 `ToolRail` 的 `onSelect`
  只改 `leftSidebar`——结果点开是一块 260px 的空白板，飞书那个「随时打开左栏浏览连接器」的
  心智根本不成立，连接器面板只能被画布的 `+` 被动唤起。`BuilderLeftPanel` 现在自己算目标：
  触发器为 EMPTY 就走 `UPDATE_TRIGGER`，否则取主路径最后一步做 `ADD_ACTION` / `AFTER`。
- **节点卡片副标题给的是连接器名，不是 `step.name`。** 原来那里用等宽字体渲染
  `step.name`，等于把 `trigger`、`step_1` 这种内部标识摆给用户看；内部名留在 tooltip 里
  （公式引用时才需要）。另外卡片逻辑宽度 `WORKFLOW_CANVAS_STEP_WIDTH` 从 176 加到 240——
  176px 减去 px-3、logo 36、chevron 28 和两个 10px 间距后，标题只剩 ~66px，
  「1. 捕获Webhook」都放不下。
