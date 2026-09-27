---
icon: 📋
---

# Templates

模板是可复用的工作流蓝图。模板中心（`/templates`）让用户浏览、预览、一键把模板建成项目里的草稿工作流，也能把自己已发布的工作流「生成模板」。

**模板中心三个 Tab** — 由 `createdBy` 决定，前端 `templateCenterUtils.tabOf`：
- **推荐**：`createdBy` 为空的模板 = 官方模板（`tenantId` 为空，存库里或来自模板源）+ 租户管理员在「平台设置 › 模板」里维护的 CUSTOM 模板。界面标「官方模板」。
- **我的模板**：`createdBy` = 当前用户（不论可见范围）。
- **与我共享**：同租户其他人生成、`visibility = TENANT` 的模板。别人 `PRIVATE` 的模板服务端根本不返回。

**TemplateType** — `OFFICIAL`（官方，`tenantId` 为空）、`CUSTOM`（租户内：管理员维护的或用户生成的）、`SHARED`（旧的分享链接，不进列表）。
**TemplateVisibility** — 用户生成模板的可见范围：`PRIVATE` 仅自己、`TENANT` 组织内。管理员维护的模板为空。
**使用次数** — `usageCount`，每次「使用此模板」成功后前端调 `POST /v1/templates/:id/usage` 加一；「最热」按它排序。
**精选** — `featured`，推荐 Tab 在没有搜索和分类筛选时置顶显示；租户管理员在「平台设置 › 模板」列表里开关。
**生成模板** — 工作流「···」菜单，只取**已发布版本**，去掉所有连接引用后存成 CUSTOM 模板（`createdBy` = 本人，`author` = 本人姓名）。

### 使用流程
- 在项目里（`projectId` 传入且可编辑、未满）直接创建；否则先选目标项目，只列可编辑的项目，工作流已满的置灰并写明原因。
- 每个步骤的 `auth` 输入和任何 `{{connections...}}` 引用都会被清空（`templateConnectionUtils.stripTrigger`），建成草稿后跳到编辑器并提示「请在校验面板补全配置」。

### Gotchas
- `GET /v1/templates/:id` 以前是完全公开的，现在走 `unscoped` 认证并用 `templateAccess.canView` 检查：官方和管理员模板仍对任何人（含未登录）可见，用户生成的 `PRIVATE` / `TENANT` 模板只对本人 / 同租户可见。
- 旧的 `workflowService.getTemplate`（removeConnectionsName）只认 `{{connections.xxx}}`，认不出现在的 `{{connections['xxx']}}` 写法；模板相关一律用 `templateConnectionUtils`。
- 更新模板以前会把没传的 `tags` 清空，已修；部分更新（例如只改 `featured`）不会动其他字段。
- 模板源（`TEMPLATES_SOURCE_URL`）没配置时官方模板列表为空，不报错；源里的模板不在库中，使用次数无法累加。
- 导入模板时新工作流的名字取创建时服务端去重后的名字（`version.displayName`），不是模板里的原名。

### Key files
Entry point: `templateController`（`/v1/templates`）。

- `packages/server/api/src/app/template/` — controller、service、entity、`templateAccess`（可见性）、`templateFromWorkflow`（生成模板）、模板源代理
- `packages/core/shared/src/lib/management/template/` — `Template`、`TemplateVisibility`、请求体、`templateConnectionUtils`
- `packages/web/src/features/templates/` — `TemplateCard`、`TemplateDetailDrawer`、`TemplatePickerDialog`、`GenerateTemplateDialog`、`templateCenterUtils`、`templatesHooks.useRecommendedTemplates`
- `packages/web/src/app/routes/templates/` — 模板中心页和分享链接详情页
- `packages/web/src/app/routes/tenant/setup/templates/` — 管理员维护模板、开关精选
