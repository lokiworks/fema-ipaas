---
icon: 🗂️
---

# 项目工作区

进入项目后看到的一切：左侧项目侧栏（项目切换、资源入口、工作流树）、项目概览页、全部项目页，以及批量发布、导入导出、复制项目这些跨工作流的操作。

**项目目录** — `GET /v1/projects/directory` 返回租户里所有团队项目（加上自己的个人项目），带「我的权限」、工作流数、运行中数、成员数和生效的工作流上限；非成员 `myRole` 为 null，页面显示「无权限」。
**工作流树** — `GET /v1/project-workspace/tree`，文件夹加轻量工作流行；`hasUnpublishedChanges` = 已部署过（生产或测试）且最新版本是 DRAFT。
**概览统计** — `GET /v1/project-workspace/stats`，近 7 天 / 前 7 天 / 本月的生产运行次数、成功与失败，外加每个工作流最近一次运行和测试、生产版本号。
**批量发布** — 三步：`POST /batch/publish-check` 校验 → 填发布描述（≤300，存到 `workflow_version.publishNote`）→ `POST /batch/publish` 看结果。双环境项目里批量发布就是部署到测试（`workflowReleaseService.deployToTest`）。
**导出 / 导入** — 导出文件 `format: workflow-export, version: 1`，连接和样例数据都剥掉；导入只认这个格式，重名自动加后缀，导入后是草稿。
**复制项目** — `POST /v1/projects/:id/copy`：复制文件夹层级、项目配置、映射表（含数据）、数据存储结构、环境开关（审批人改成自己）、两端都是租户级连接的连接替换、全部工作流（草稿）。不复制成员、版本、推广记录、日志。
**项目权限申请** — 租户内的非成员对团队项目发起「申请权限」（`project_access_request`，理由可选，≤200 字），同一人同一项目只保留一条待审批；项目所有者、项目管理员（`MEMBER:MANAGE`）和租户管理员审批，通过时选角色（默认「可查看」）并走加成员逻辑，拒绝只改状态。入口在全部项目、无权限项目页、项目成员页顶部和首页「待我处理」。

## 权限对照
- 新建项目：任何租户成员都可以，创建人自动成为所有者（Admin）。
- 编辑项目基本信息、复制项目：`WORKFLOW:UPDATE`（可编辑及以上）。
- 删除项目：`PROJECT:UPDATE`，也就是项目所有者；还有运行中的工作流时不能删。
- 复制工作流到别的项目：对源项目要 `WORKFLOW:READ`，对目标项目要 `WORKFLOW:UPDATE`，目标项目单独校验。

### Gotchas
- 批量发布的校验会读编辑锁（`lockService.getLock`），被他人锁定的工作流归为 INVALID、原因 `workflowLockedByAnotherEditor`，不参与发布。
- 工作流名称在项目内唯一（不区分大小写）：`workflowService.create` 一律自动加「 (2)」后缀，而不是报错。所以前端弹窗要自己查重给提示；之后的 `IMPORT_WORKFLOW` 会覆盖名称，调用方要传去重后的名字。
- 生效的工作流上限 = `project.workflowsLimit ?? instanceLimits.projectWorkflows()`（环境变量 `FEMA_PROJECT_MAX_WORKFLOWS`，默认 1000）。新建、导入、复制都会检查，超了报 `projectWorkflowLimitReached`。设计稿里的「默认 50 / 每月 10 万」没有照搬，自托管默认不设这么低。
- 复制项目时，只有租户级（`scope = TENANT`）连接算可用，项目级连接一律清空，因为新项目不在任何连接的 `projectIds` 里。
- 映射表 id 在复制后会变：工作流入参里等于旧表 id 的字符串会被整体替换成新 id（`workflowTransferUtils.remapIds`）。
- 批量删除会先把这些工作流待审批的推广申请改成「已撤回」，再逐个删除。
- 申请接口 `POST /v1/project-access-requests` 用 `publicTenant` 放行（申请人还不是成员），项目归属在服务里按 `tenantId` 校验，别的租户或个人项目一律当作不存在；审批接口靠 `ProjectResourceType.TABLE` 从申请行取 `projectId` 做权限校验。
- **个人项目不能加成员。** 邀请接口对个人项目返回 `VALIDATION` + `messageKey: personalProjectHasNoMembers`（`tenantGuards.assertTeamProject`），先校验权限再校验类型，免得非成员借此探测项目类型。前端所有「分享 / 邀请」入口用 `projectSharingUtils.isPersonal` 禁用并说明原因，成员弹窗对个人项目不请求 `user-invitations`，只显示「新建团队项目」。目录接口 `ProjectDirectoryItem` 没有 `type`，全部项目页靠项目集合（`projectCollectionUtils.useAll`）判断哪行是个人项目。
- **全部项目页的「分享」就地弹出成员弹窗**：`ProjectSettingsDialog` 带 `projectId` 时只显示成员页签，成员、邀请、权限的 hooks 都按这个 `projectId` 请求，不切换当前项目。
- **角色名**：`DefaultProjectRole.ADMIN` 显示为「管理员」，只有 `project.ownerId` 那个人显示「所有者」（`projectRoleLabels.memberLabel`），邀请和审批下拉里选的是「管理员」。
- 「他人正在编辑」这一项校验还没做：写这块时平台还没有编辑锁。
- 最近一次运行只看最近 30 天，避免 `DISTINCT ON` 扫完整张 execution 表。

## Key files
- `packages/server/api/src/app/project-workspace/` — 树、统计、批量操作、导入导出（`projectWorkspaceModule`）
- `packages/server/api/src/app/project/` — `projectDirectoryService`、`projectCopyService`、`projectDirectoryController`、`projectAccessRequestService`
- `packages/web/src/features/project-access-requests/` — 申请按钮、无权限页、成员页的待审批列表
- `packages/server/api/src/app/workflows/workflow/workflow-naming.ts` — 名称去重和上限检查
- `packages/core/shared/src/lib/automation/project-workspace/` — 请求 / 响应类型和导出文件格式
- `packages/web/src/features/project-workspace/` — 侧栏工作流树、各种弹窗、概览卡片
- `packages/web/src/app/components/project-layout/project-nav-column.tsx` — 项目侧栏
- `packages/web/src/app/routes/home/` — 项目概览（路由仍是 `/projects/:id/home`），`packages/web/src/app/routes/projects/` — 全部项目
