---
icon: 📁
---

# Folders

文件夹是项目内组织工作流的一层目录，最多三层，工作流通过 `folderId` 挂在文件夹下。

### 规则
- 每个项目最多 100 个文件夹，最多三层；名称 1–50 字，**同一层级**内不重名（不区分大小写）。常量 `FOLDER_LIMIT_PER_PROJECT` / `FOLDER_MAX_DEPTH` / `FOLDER_NAME_MAX_LENGTH` 在 `packages/core/execution/src/lib/workflows/folders/folder.ts`。
- `parentId` 指向上级文件夹，为空即项目根目录。
- 删除文件夹时，子文件夹和工作流移到上一级（不是根目录），整个过程在一个事务里完成。

### 接口
- `/v1/folders`：`POST /` 新建（可带 `parentId`），`POST /:id` 重命名，`GET /`、`GET /:id`，`DELETE /:id`。
- 移动工作流走项目工作区的 `POST /v1/project-workspace/batch/move`，见 [项目工作区](project-workspace.md)。

### Gotchas
- `POST /v1/folders` 现在是严格新建，重名报 `folderNameTaken`；旧的「同名即返回已有文件夹」语义只保留在 `workflowFolderService.upsert`，供 `CreateWorkflowRequest.folderName` 这条老路径用，而且只在根目录层查找。
- 唯一约束是两个部分索引：根目录层 `(projectId, displayName) WHERE parentId IS NULL`，子层 `(parentId, displayName) WHERE parentId IS NOT NULL`。对根目录做 `upsert` 必须带 `indexPredicate: '"parentId" IS NULL'`，否则 Postgres 找不到冲突目标。
- 删除时子文件夹上移可能和上一级已有文件夹重名，服务端会自动加「 (2)」后缀，规则在 `folderTreeUtils.planMoveUp`。
- `UncategorizedFolderId` 是字符串 `"NULL"`，只在老的工作流列表查询里当「未分类」用。

### Key files
- `packages/server/api/src/app/workflows/folder/` — `workflowFolderService`、`folderTreeUtils`、实体和路由
- `packages/core/execution/src/lib/workflows/folders/` — `Folder`、请求 DTO、上限常量
- `packages/web/src/features/project-workspace/` — 侧栏工作流树里的文件夹操作
