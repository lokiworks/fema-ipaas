---
icon: 🔁
---

# 字段映射与映射表

**映射表** —— 项目级的键值对照（例如「北森部门 → 飞书部门 ID」），可以导入 CSV，多处复用。
**字段映射** —— 数据映射连接器的 `map_fields` 操作：逐个目标字段指定来源、常量和转换（去空格、转数字、日期格式、查映射表……），支持对列表逐项映射。
**缺失处理** —— 映射表里查不到时：报错 / 用默认值 / 原样透传。
**触发器去重** —— 触发器设置里按一个字段路径在时间窗口内去重，重复事件不启动运行。
**宽编辑器** —— 映射面板里的「展开」打开的弹窗：左目标字段、中转换、右来源，最右是 JSON 预览（样例算出的结果、类型标签、类型错误）和内嵌的数据选择器。侧栏里保留紧凑视图；展开后紧凑视图让位，同一份映射不会有两处同时编辑。
**覆盖率** —— 映射表被查过的值里有多少在表里有对应行。来源有两个：最近 30 次运行（服务端，只读脱敏后的展示日志）和编辑器里测试过的样例（前端）。缺口可以逐个填上对照值并加入映射表。

## Gotchas

- **工作流跨项目搬家会带着它用到的映射表。** 导出文件多一个可选的 `mappingTables`（旧文件没有也能导入）；导入和「复制到别的项目」时，`workflowTransferTables.resolveInProject` 在目标项目按「名称 + 键标签 + 值标签」都相同来复用已有的表，否则新建（重名自动加 `(2)`），再把流程里查表转换的表 id 换成目标项目的。只有名称相同、含义不同的表不会被复用。同项目内复制不动表。
- **模板里不带映射表。** 保存为模板时清掉查表转换的表 id（`withoutLookupTables`），保留转换本身，从模板创建的人在映射编辑器里重新选表；模板是共享的，不能指向某个项目里的表。
- 映射逻辑在 `core-utils` 的 `dataMapping`，编辑器预览和运行时共用同一份代码；改转换规则要同时看两处表现。
- 连接器运行时通过 `/v1/worker/mapping-tables/:id` 取映射表，映射表改动对下一次运行立即生效，不需要重新发布。
- 同步 Webhook（`/sync`）不经过工作流去重。
- 被已发布步骤引用的映射表不能删除。
- **映射规格里的「写入目标」键叫 `destination`，不能叫 `target`。** react-hook-form 的 `field.onChange` 会把带 `target` 键的对象当成 DOM 事件，值写不进表单（选了目标节点却什么都没发生）。行里的 `target`（目标字段名）在嵌套层，不受影响。
- **映射校验只有一份**：`core-utils` 的 `dataMapping.validateSpec`（不需要样例，必填未映射、日期格式、没选映射表、目标里没有的字段）和 `evaluate`（带值，类型不符、必填为空、可选值、列表某项缺字段、查表未命中）。编辑器预览、构建器的 `workflowValidator`、服务端发布前的 `workflowPublishUtils.assertMappingsValid`、运行时 `map_fields` 都调它，所以手动、AI 建议、方案模板产出的映射走同一个关。
- **日期按文本原样解析，不看服务器时区**：`2026/10/08`、`2026年10月8日`、`20261008`、带时间的写法都保留写出来的年月日和时分秒；只有数字（秒或毫秒时间戳）按东八区格式化。格式串区分大小写，`yyyy-MM-dd` 会被判为无法识别，而不是输出 `yyyy-10-dd`。
- **步骤引用带 `['output']`**：数据选择器和自动映射写入的都是 `{{trigger['output']['body']['x']}}`，编辑器预览按同样的形式读样例；以前预览读不到，永远显示「还没有样例数据」。
- **自动映射建议不看请求头和原始请求体**（`headers`、`rawBody`），否则 `sec-ch-ua-mobile` 会被当成手机号的来源。建议默认不勾选、不显示置信度、写明依据。
- **目标节点不必先在流程里存在。** 目标下拉里的「添加写入节点…」列出所有连接器的写入类操作（`WRITE`、`DESTRUCTIVE`），选定后：目标字段行按操作的输入属性生成（类型、必填），并在映射节点之后插入这个写入步骤，标 `pendingReview`（待确认），入参全部接成 `{{映射节点['output']['字段名']}}`，项目里恰有一个可用连接时顺带填上 `auth`。这个步骤没确认前发布会被拦。步骤和目标各自走一次 `applyOperation`，所以映射面板要先写目标、再加步骤。
- **「待确认」的措辞看工作流有没有 `metadata.aiGenerated`**：AI 路径生成的写「AI 生成」，映射面板加的写「自动加入」。服务端发布前的拒绝文案（`Confirm every AI-generated step`）两种都一样，只有直接调 API 才看得到。
- **覆盖率只信脱敏后的展示日志。** 含 `***`（三个及以上星号）的键视为已脱敏：不计入命中率、不出现在缺口列表，只在「已跳过」里计数；没有保留入参的运行单独计数。所以按手机号、邮箱这类默认会被打码的字段查表，覆盖率永远看不到缺口，这是有意的，不要为此去读原始日志。
- **覆盖率接口**：`GET /v1/mapping-tables/:id/coverage`、`GET /v1/mapping-tables/coverage?workflowId=`、`POST /v1/mapping-tables/:id/rows`（只追加新键，已有的键不动）。校验面板和发布提醒里的「覆盖率不足」是警告，不拦发布；表的缺失处理是「报错」时文案写明运行到这些值会失败。
- **Radix Select 会在值变化后用空字符串再触发一次 `onValueChange`**（原生 select 找不到当前值对应的选项），目标下拉要忽略空值和等于当前值的选择，否则刚设上的目标会被冲掉。
- **宽编辑器里的数据选择器是内嵌的第二个实例**（`DataSelector embedded`），它挂载期间画布上的那个让位（`embeddedDataSelectorCount`）。窄画布（宽度小于 760）下画布上的选择器贴着底部工具栏上方，宽度跟着画布，会先量一下选中节点的位置，压到节点就改到顶部。
- **键盘**：来源输入框旁的拖拽圆点不在 Tab 顺序里（`tabindex=-1`），同样的事用输入框里的 Alt+Shift+R：先选上游节点，再选它的出参字段。Tab 顺序按目标字段逐行：来源、转换，再到下一行。
- 端到端脚本：`tools/e2e/scenarios/s2-field-mapping.mjs`，起栈用 `tools/e2e/stack/` 下的脚本，另需单独起 worker。

## Key files
- `packages/core/utils/src/lib/data-mapping.ts`
- `packages/server/api/src/app/mapping-table/`
- `packages/connectors/core/data-mapper/` — `map_fields`
- `packages/core/utils/src/lib/mapping-coverage.ts` — 覆盖率统计，`dataMapping.lookupKeys` 算每行真正查表的键
- `packages/server/api/src/app/mapping-table/mapping-table-coverage.service.ts` — 从运行日志统计覆盖率
- `packages/web/src/features/mapping-tables/components/` — `mapping-editor`（紧凑视图）、`mapping-wide-editor`、`mapping-json-preview`、`mapping-coverage-panel`
- `packages/web/src/app/builder/connector-properties/mapping-write-step-dialog.tsx` — 添加写入节点
