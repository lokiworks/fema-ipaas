---
title: 外部 MCP 服务器
icon: 🛰️
---

# 外部 MCP 服务器

接入企业已有的 MCP 服务器。一台服务器就是 `@fema-ipaas/connector-mcp` 的一个连接，连接器市场的「MCP 服务器」分类和详情页只是它的专用视图；工具在编辑器里当操作用，也可以交给 AI 智能体。

**服务器元数据** —— `mcp_server` 表（按 `connectionId` 一对一）：描述、地址、传输方式、认证类型、上次同步的工具列表、最近一次失败原因。密钥仍只在连接的加密值里。
**传输方式** —— Streamable HTTP（推荐）或 SSE（旧版：GET 打开事件流、等 `endpoint` 事件、POST 到那个地址、响应从流里回来）。
**连接测试** —— 连接器动作 `test_server`，通过单操作执行在工作节点上跑，返回工具数和延迟，或按顺序给出失败原因：LOOPBACK → LINK_LOCAL → PRIVATE_UNREACHABLE（提示 `FEMA_SSRF_ALLOW_LIST`）→ DNS → TRANSPORT_MISMATCH（405）→ UNAUTHORIZED（401）→ OAUTH_NOT_AUTHORIZED。

## Gotchas
- **测试在工作节点跑，不在 API 里跑。** 新服务器用字面量 auth 值（`{ type: CUSTOM_AUTH, props }`）直接塞进步骤输入，已保存的用 `{{connections['<externalId>']}}`；两种都经 EXECUTE_ACTION。localhost 指的是工作节点自己。
- **保存会再测一次。** 前端先调 `/v1/mcp-servers/test`，保存时服务端重新测试并落工具列表；失败且没带 `saveWithoutPassingTest` 就拒绝保存（「先保存，稍后重试」才带）。
- **OAuth 2.0 用平台现有的 OAuth2 连接机制。** 连接器的 OAuth2 认证把授权地址、Token 地址做成 `{authUrl}` / `{tokenUrl}` 占位符，PKCE S256，scope 为空（需要 scope 的服务器目前接不了）。
- 新建的服务器 `projectMembersPermission = USE`：可用项目的成员不用单独建连接就能用，只有所有者和租户管理员能改；被工作流步骤或智能体（按连接引用或服务器地址匹配）使用时不能删除。
- **探测遵循 `FEMA_SSRF_ALLOW_LIST`。** 连接测试的预检读工作节点环境里的放行名单（沙箱模式由 `create-sandbox-for-job` 注入）：放行的 127.0.0.1 等地址能通过，没放行的 LOOPBACK、LINK_LOCAL 仍被拒绝。放行名单按规范化后的地址匹配，放行 `127.0.0.1` 同时放行它的 IPv4 映射写法和十进制、十六进制写法（URL 解析会先归一），但不放行 `127.0.0.2` 或元数据地址。真正的拦截在引擎的 DNS 和 socket 守卫（严格网络模式），DNS 重绑定靠每次连接前重新解析并逐条检查来挡；非严格模式下探测对环回的拒绝只是诊断，不是安全边界。
- **试用抽屉按工具的 `inputSchema` 生成表单**（`mcp-tool-form-schema.ts`）：字符串、数字、整数、布尔、枚举、数组、嵌套对象，必填在前；自由格式对象、联合类型和超过三层的嵌套退回 JSON。表单和 JSON 两种模式共用一套检查，按字段路径点名（`requester.id`、`attachments[1].url`）；JSON 切回表单时结构里没有的字段原样保留。
- **市场左侧分类名走 `connectorCategoryLabels`**（`features/connectors/utils/connector-category-labels.ts`）：市场分类、`ConnectorCategory` 全部枚举值、动作分类（读取、搜索、写入、破坏性）各一张带类型约束的表，加枚举值时漏了翻译会编译不过。
- 改连接器行为没有提升 `connector-mcp` 的版本号（本轮统一不升版本）；缓存了旧元数据的环境需要重新同步连接器。
- **前端市场分类没有和后端 `ConnectorCategory` 一一对应。** 设计稿要 13 个分类加「MCP 服务器」，但后端枚举是另一套值（如 `PRODUCTIVITY`、`UNIVERSAL_AI`），`connectorMarketUtils.groupsOf` 里手工做的映射，「自定义」分类等价于 `ConnectorSource.PRIVATE`。改分类枚举时要同步改这张映射表。
- **市场的「最新」排序没有真实的时间字段。** `ConnectorMetadataModelSummary` 不带 `created`/`updated`，前端只能拿 `version` 做 semver 排序当替代；要做到真按接入时间排序需要后端补一个字段。
- **编辑已保存的 OAuth2 服务器时拿不到原来的授权地址/Token 地址/Client ID。** `McpServer` 响应只有 `authConfigured`，不回传这几个字段（安全考虑），所以编辑弹窗里这些字段留空即代表「不修改」；用户想「重新授权」必须重新填完整这四项，否则「去授权」按钮是禁用的。
- **工作流编辑器里选 MCP 服务器不走连接器的两级抽屉（连接器→操作）。** 加在 `app/builder/connectors-selector/mcp-server-picker-entries.tsx`，只在「应用」Tab、非搜索态、动作类操作时渲染；点击直接建一个 `@fema-ipaas/connector-mcp` / `call_tool` 步骤并把 `input.auth` 预填成 `{{connections['<externalId>']}}`（用 `handleAddingOrUpdatingStep` 建步骤后再用同一个函数发一次 `UPDATE_ACTION` 覆写 settings，仿照 `custom-connector-selector-items-utils.ts` 里智能体条目的两步写法）。步骤名仍是「Call tool」，没有改成服务器名字。

## Key files
- `packages/connectors/core/mcp/src/lib/common/` — `mcp-client`（两种传输）、`mcp-probe`（失败分类）、`network-address`、`mcp-target`
- `packages/server/api/src/app/mcp-server/` — `mcpServerService`（测试、增改、同步、试用、使用情况、删除）
- `packages/core/shared/src/lib/automation/mcp-service/mcp-server.ts`
- `packages/web/src/app/builder/connectors-selector/mcp-server-picker-entries.tsx` — 节点选择器「应用」里带 MCP 角标的服务器，选中即建 `call_tool` 步骤并预填连接
- `packages/web/src/features/mcp-servers/` — 前端的增删改查 hooks、表单、试用抽屉、探测结果的中文文案映射
- `packages/web/src/app/routes/tenant/connectors/` — 连接器市场、连接器详情、MCP 服务器详情、连接器需求四个页面
- `packages/web/src/features/connector-demands/`、`packages/web/src/features/connector-usage/` — 提需求和使用热度/使用工作流列表
