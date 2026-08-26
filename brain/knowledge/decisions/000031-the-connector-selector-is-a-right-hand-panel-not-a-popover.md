---
title: 连接器选择器是右侧面板，不是画布浮层
icon: 🎚️
status: accepted
---

## Decision

在工作流编辑器里挑触发器或动作，走的是右侧面板 `RightSideBarType.CONNECTOR_PICKER`
（`packages/web/src/app/builder/connector-picker-panel/`），不再是画布上的 Radix Popover。

选择器、动作列表、参数配置三步在同一个右侧面板里依次推进：选连接器 → 选它的触发器/动作 →
自动切到 `CONNECTOR_SETTINGS` 配参数。`builder/connectors-selector/index.tsx` 只剩点击目标，
负责把 `openedConnectorSelectorStepNameOrAddButtonId` 和 operation 写进 builder store；
tab 内容组件（Explore / Apps / Utility / Core Components / Approvals）原样复用。

未配置的触发器节点被选中时，`canvas-state.ts` 的 `selectStepByName` 直接开这个面板——
它以前把 `rightSidebar` 设成 `NONE`，点空触发器什么都不出。

## Context

产品对标飞书集成平台，那套编排器的心智是「画布只画流程，配置都在右侧」。
上游的 Popover 宽 340–600px、列表限高 300px，压在画布上，还得靠
`useAdjustConnectorListHeightToAvailableSpace` 去量视口余量、减 20px 防止贴边裁切。

## Why

面板拿到的是一整列高度和可拖拽的宽度，不需要量视口；画布全程可见，选完连接器直接过渡到
参数配置，不用先关浮层再点节点。代价是右侧面板同时承担了选择器、参数、运行记录、版本四种内容，
`RightSideBarType` 的分支变多。

被否掉的另一个做法是保留 Popover 只把它加宽加高：省事，但压画布和贴边裁切这两个问题还在，
而且「选完 → 配置」仍然是两次上下文切换。

## Consequences

- 右侧面板默认宽度从 `25%` 改为 `480px`，选择器的 5 个分类 tab 才排得开。
- 旧的 popover 尺寸辅助函数在这条路径上失效，`web-feature-anatomy.md` 的对应 gotcha 已更新。
- 替换已有节点的连接器时，被替换的名字通过 store 的
  `connectorSelectorReplacedStepDisplayName` 传给面板标题，不再靠组件 prop。
- 发布按钮同期从画布横幅移到编辑器头部右侧，画布顶部不再被一条 banner 占掉。
