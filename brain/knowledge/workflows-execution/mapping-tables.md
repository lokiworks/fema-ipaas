---
icon: 🔁
---

# 字段映射与映射表

**映射表** —— 项目级的键值对照（例如「北森部门 → 飞书部门 ID」），可以导入 CSV，多处复用。
**字段映射** —— 数据映射连接器的 `map_fields` 操作：逐个目标字段指定来源、常量和转换（去空格、转数字、日期格式、查映射表……），支持对列表逐项映射。
**缺失处理** —— 映射表里查不到时：报错 / 用默认值 / 原样透传。
**触发器去重** —— 触发器设置里按一个字段路径在时间窗口内去重，重复事件不启动运行。

## Gotchas
- 映射逻辑在 `core-utils` 的 `dataMapping`，编辑器预览和运行时共用同一份代码；改转换规则要同时看两处表现。
- 连接器运行时通过 `/v1/worker/mapping-tables/:id` 取映射表，映射表改动对下一次运行立即生效，不需要重新发布。
- 同步 Webhook（`/sync`）不经过工作流去重。
- 被已发布步骤引用的映射表不能删除。

## Key files
- `packages/core/utils/src/lib/data-mapping.ts`
- `packages/server/api/src/app/mapping-table/`
- `packages/connectors/core/data-mapper/` — `map_fields`
