---
icon: 🛠️
---

# 连接器开发

在界面上把一个 HTTP 服务封装成自定义连接器：草稿存在 `connector_blueprint`，发布成真正的连接器版本，
只在本租户内可见。入口 `/tenant/connectors/development`，需要「连接器开发」模块权限。

**蓝图（blueprint）** — 一个自定义连接器的草稿：定义（基础信息、认证、状态码、操作、触发器）加所有者和协作开发者。标识符保存后不可改，连接器名是 `@fema-ipaas/connector-custom-<标识符>`。_Avoid_：「builder 生成的源码」（旧功能已删除）
**清单（manifest）** — 发布时打进 tgz 的 `blueprint.json`，只有数据没有代码，由引擎里的运行时解释执行，见 *devkit-connectors-are-a-manifest-run-by-an-engine-runtime*。
**草稿构建** — 为测试和调试临时打的包，版本号 `0.0.<哈希>`，只挂在蓝图上、不进连接器目录；定义没变就复用。
**版本** — 显示为 x.y，包版本 x.y.p。「发布新版本」是 x.y.0，「在当前版本中发布更新」是 x.y.(p+1)。状态：灰度中 / 全量发布 / 停止支持。
**灰度** — 版本只对选定项目可选、可运行；由 `connectorVersionAvailability` 在读取时推导，不写进 `connector_metadata`。

## Gotchas

- 灰度在两处生效：连接器列表和节点面板选版本时按项目挑「可选的最高版本」；运行时（worker 解析连接器、引擎下载包）拿不到本项目灰度范围外的版本会报找不到。停止支持的版本仍能运行，只是不再被选；最后一个版本停止支持后连接器从列表消失（已下线）。
- 调整灰度项目时，被移出的项目里已经用了灰度版本的节点会在运行时失败——界面要提示这一点。
- 「在当前版本中发布更新」不会改变已发布工作流用的版本（ADR 0006），见 *update-in-current-version-is-a-patch-release*。
- 认证测试和调试都在 worker 上跑草稿构建，需要用户至少是一个项目的成员（EXECUTE_ACTION 必须带项目）。测试数据加密存在 `authTestData`，接口只回显掩码 `••••••`，提交掩码表示保留原值。
- 授权码类型的取令牌和刷新令牌走平台标准 OAuth 2.0（`credentialsOauth2Service`），模板化的令牌请求只用于客户端凭证类型。
- 加签插件 `function beforeRequest(request, auth)` 在连接器子进程里用 `new Function` 执行，也就是在 worker 沙箱里，不在 API 进程里；提供 `crypto`、`Buffer` 和 `helpers.sha256/md5/hmacSha256`。
- 客户端凭证类型每次调用都会先请求一次令牌（子进程每次调用后退出，没有进程内缓存）。
- 轮询触发器用 `setSchedule({ intervalMs })` 设置间隔，启用时先拉一轮做种子，之后只发出去重键没见过的数据；检查点取条目字段的最大值，存在 store 的 `devkit_polling_state`。即时触发器是 WEBHOOK 策略：启用时调订阅端点并把订阅 ID 存进 store，停用时带着它调取消订阅端点，没有握手（challenge）支持。
- 可见性表达式的字段被放进一个动态属性组 `__conditional_inputs`，所以入参标识不能以 `__` 开头，也不能叫 `auth`。
- 可用范围（按成员 / 部门）和国际化还没有做，自定义连接器对租户内所有能用连接器的人可见。

## Key files

- `packages/core/utils/src/lib/connector-blueprint` — 定义 schema 和纯逻辑：模板渲染、可见性表达式、状态码规则、发布检查、变更对比、灰度选版本、预置服务
- `packages/server/engine/src/lib/core/connector/blueprint-runtime` — `blueprintRuntime.build`，在 `connector-child.ts` 里通过 `blueprintRuntime.install()` 挂到全局
- `packages/server/api/src/app/connectors/blueprint` — 蓝图 CRUD、认证测试、调试、发布（`connectorBlueprintPublishService`）、`connectorVersionAvailability`
- `packages/server/api/src/app/connectors/openapi/openapi-blueprint-mapper.ts` — OpenAPI 3.x 导入成蓝图
- `packages/web/src/features/connector-blueprints` — 前端
