---
icon: 🔁
---

# 字段映射与映射表

**映射表** —— 项目级的键值对照（例如「北森部门 → 飞书部门 ID」），可以导入 CSV，多处复用。
**字段映射** —— 数据映射连接器的 `map_fields` 操作：逐个目标字段指定来源、常量和转换（去空格、转数字、日期格式、查映射表……），支持对列表逐项映射。
**缺失处理** —— 映射表里查不到时：报错 / 用默认值 / 原样透传。
**触发器去重** —— 触发器设置里按一个字段路径在时间窗口内去重，重复事件不启动运行。

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
- 端到端脚本：`tools/e2e/scenarios/s2-field-mapping.mjs`，起栈用 `tools/e2e/stack/` 下的脚本，另需单独起 worker。

## Key files
- `packages/core/utils/src/lib/data-mapping.ts`
- `packages/server/api/src/app/mapping-table/`
- `packages/connectors/core/data-mapper/` — `map_fields`
