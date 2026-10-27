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

- 同租户不同项目可复用连接 `externalId`。方案连接检查必须先用 `connectionAvailability.whereAvailableIn` 限定所选项目，再判断状态；只按租户和名字取第一条会误取其他项目的同名连接。

- 官方目录包含北森到飞书、企业微信、钉钉的人员与组织方案，以及飞书花名册和审批台账方案。人员方案共四条流：入职、调岗、离职、按最新状态补齐；组织方案共三条流：可调用整树收敛、定时唤醒、组织变动唤醒。组织收敛并发为 1，父部门先于子部门写入；部门绑定复用人员映射表。
- 安装人员方案 1.2 时先安装组织方案，再填写源根组织与组织子流程。缺部门对照会调用组织收敛后再读取。离职不删除成员；钉钉移到待离职部门并通知管理员人工办离职，返回值不宣称已停用。
- 方案包可携带全量对账规则，安装时绑定配置、连接、映射表与补齐工作流。规则 ID 按安装工作流与规则键稳定生成；手动修复先重新读取源当前状态，并持久化修复运行 ID，崩溃后继续同一个运行。
- 审批台账以实例 ID 查重，可读审批编号另存。无公网回调时可改为 approval_instance_polled；停用回调工作流保留共享应用订阅。重放不确定的台账创建前应从读取和查重开始。
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
