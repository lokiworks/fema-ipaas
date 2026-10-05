---
icon: 📦
---

# 方案

**方案** —— 一组可以装进任意项目的工作流、映射表、配置项和检查项，带版本号。来源是官方目录（默认为空）或租户从项目里生成，设计取舍见决定 000044。
**方案库** —— 方案页的第一个页签：分类筛选、搜索、「我创建的」；「已安装」页签按项目列出安装记录，有新版本时给「升级」。
**连接槽位** —— 方案里每个用到的连接器占一个槽，安装时由安装人选一个连接；`connections` 以连接器名为键、连接 `externalId` 为值。
**配置项** —— 安装时填的值（下拉、单选、文本），按 `patches` 改写流程节点的输入，校验统一走 `solutionUtils.resolveConfig`。
**检查项** —— 安装前的逐项检查。`blocking` 的必须通过；非阻塞的要勾选「已知晓」，没通过的会记进安装记录的 `skippedChecks`。
**安装向导** —— 5 步：选项目 → 选连接 → 配置 → 检查 → 确认，确认页先调预览，容量不够（`capacityError`）时禁用安装。

## Gotchas

- **官方目录现在有两个方案，第一个是：北森 → 飞书 人员同步（`official/beisen-feishu.ts`）。** 三条流（入职开通、调岗改部门、离职暂停）按北森 `GetByTimeWindow` 的字段写，部门用任职部门 OId 查映射表（文档里任职记录只有 OId 没有名称），映射表行留空由安装的人填，缺对照会明确失败而不是悄悄用错。群 ID 两项没有默认值。构建函数在模块加载时就用 `WorkflowTrigger.parse` 校验，结构写错会让 API 启动失败，所以改它要先跑 `test/unit/official-beisen-feishu.test.ts`。端到端验证脚本是 `tools/e2e/main-line/run-official-solution.mjs`，配合同目录的模拟服务。
- **官方目录里第二个方案：北森员工信息 → 飞书多维表格 花名册（`official/beisen-bitable-roster.ts`）。** 一条流：北森员工变动 → 字段映射（姓名、工号、手机号、邮箱、部门名称、入职日期，没有目标节点，字段名就是多维表格的列名）→ 写入多维表格。安装时填 App Token 和数据表 ID，部门用 OId 查映射表换成名称，表行留空由安装的人填。**所有方案安装前都过 `solutionMappingCheck`**（走 `core-utils` 的 `dataMapping.validateSpec`，和编辑器、发布前检查是同一套规则），映射有阻塞问题、或查的表不在方案里，安装直接拒绝。两个官方方案共用 `official/official-solution-builders.ts` 里的构建函数。端到端验证在 `tools/e2e/scenarios/s2-field-mapping.mjs` 的 `solution` 阶段。
- 方案页是租户级页面（和问题中心同级，在 `guards/index.tsx` 注册），不属于某个项目；`/solutions` 开头的路径在 `ProjectDashboardLayout` 里隐藏项目头。
- 官方方案目录为空时，方案库显示空状态并引导「基于项目生成方案」，不是错误。
- 列表接口的 `mine` 只认字符串 `'true'` 和 `'false'`；查询参数不能用 `z.coerce.boolean()`，它会把 `'false'` 也当成 `true`。前端目前不传，在客户端按 `createdBy` 过滤。
- 安装向导里的连接选择、检查、预览都依赖已选项目；换项目会清掉已选连接和「已知晓」勾选。
- 新建连接的对话框来自 `app/connections`，所以安装向导放在 `app/routes/solutions/install/`，而不是 `features/solutions/`（features 不能反向依赖 app）。
- 只有创建人能「发布新版本」，且只有从项目生成的方案才有来源项目可重新打包。
- 升级只替换草稿，线上版本要重新发布才生效。
- **官方北森 → 飞书方案 1.1 做过三处可靠性修正（`official/beisen-feishu.ts`）。** 入职和调岗的触发器带 `concurrency.orderKeyPath = {{trigger.recordInfo.jobNumber}}`，同一员工的变动按工号排队逐条处理（原来没有保序键，同一员工的几条变动并发跑，最后写进飞书的不一定是最后一条；实测把保序键关掉后，10 个连续调岗两次的员工里有 2 个最终部门不是最后一条）；调岗去重键加上 `startDate`，A 到 B 再调回 A 不再被当成重复事件吞掉；HR 群和 IT 群的通知改成「先查 store 里的已通知记录、发完再记下」（`check_notified` / `mark_notified`，键 `onboard-notified:工号:startDate`），不再靠「这次新建了账号」判断，因为 worker 被强杀后整个运行从头重跑，账号已存在就被当成不用通知（实测 60 人里 3 人漏通知，运行却显示成功）。代价是重跑在发完消息、写记录之前被打断时会多发一条，宁可重复不要漏。

## Key files
- `packages/core/shared/src/lib/automation/solution/` — 类型与 `solutionUtils`
- `packages/server/api/src/app/solution/` — 接口、安装与升级、`OFFICIAL_SOLUTIONS`
- `packages/web/src/features/solutions/` — API、hooks、方案库、详情、生成与升级对话框
- `packages/web/src/app/routes/solutions/` — 方案页、详情页、安装向导
