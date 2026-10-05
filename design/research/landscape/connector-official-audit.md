# 飞书与北森连接器对照官方文档的审计

审计时间 2026-10-05（企业落地验证 D 组）。方法：逐个动作读官方文档，把连接器的请求、响应处理、错误码、限流、幂等做法和文档对照。飞书文档取自 `open.feishu.cn` 的 Markdown 版本（页面地址后加 `.md`）和文档站的 `api/tools/document/detail` 接口，北森取自接口文档站（Apifox 公开站，`apifox.com/apidoc/docs-site/436023`）。北森的令牌流程、限频和时间窗口径只能从 `beisen-help-docs.md` 登记的登录站帮助文档和第三方转述得到，表里单独标出来源。

**没有访问任何真实飞书或北森租户。** 「一致」只表示和文档写的一致，不表示在真实租户上跑通过。文档没写、页面打不开或说法互相矛盾的，一律记「未能确认」，没有猜。

统计（共 70 条）：一致 31，不一致 26（全部已修），未能确认 8（其中 3 条，F7、B16、B17，已按保守方式防御），功能差距 5（3 条已补动作，2 条没补，见 B24、B31）。个别条目同时带两种结论，按第一种计，另一种写在条目里。

最严重的五个不一致：

1. 飞书暂停和恢复账号发的是 `status.is_frozen`，官方请求体是顶层 `is_frozen`（`status` 只是响应里的结构）。真实飞书上暂停会静默无效，模拟服务却照着连接器的写法接受了，所以全部测试是绿的。
2. 北森业务响应的 `code` 官方是字符串 `"200"`、`"417"`，连接器用数字 `200` 比较，真实租户上每一次时间窗查询都会被判成失败。
3. 北森获取下级组织的请求字段官方是 `oId`、`isWithDisable`、`isWithSelf`，连接器发的 `organizationId`、`isIncludeSubOrganization` 北森不认；获取任职记录的 ID 字段官方是 `oIds`，连接器发的是 `userIds`。
4. 飞书创建用户的 `client_token` 只由手机号决定，同一个手机号换部门或姓名后重试会得到 40021（同一令牌、其他参数不同）；创建撞上「手机号已存在」直接失败，没有复用已有账号。
5. 飞书免费版月额度 `99991403`（HTTP 429）、IP 白名单 `99991401`、令牌端点的 `10015` 等都没有映射，会当成普通失败被反复重试或指向错误的修复动作；同时 `230001` 被写成「收件人不存在」，官方写的是参数错误。

## 飞书

| # | 项目 | 连接器当前做法（修复前） | 官方文档说法 | 是否一致 | 官方链接 |
| --- | --- | --- | --- | --- | --- |
| F1 | 取令牌 | `POST /open-apis/auth/v3/tenant_access_token/internal`，体 `app_id`、`app_secret` | 同 | 一致 | [自建应用获取 tenant_access_token](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal) |
| F2 | 令牌有效期与刷新 | 缓存到过期前 5 分钟；被拒后清缓存重取并重试一次 | 最长 2 小时；剩余不足 30 分钟再取会拿到新令牌，旧的仍有效，不足以外返回原令牌 | 一致 | 同上 |
| F3 | 令牌过期码 | 99991663、99991664 触发刷新 | 99991663 是无效或过期的 tenant_access_token，99991661 缺令牌，99991665 租户令牌非法，99991664 是 app_access_token 非法 | 不一致，已修（99991661、99991665 也触发刷新） | [通用错误码](https://open.feishu.cn/document/ukTMukTMukTM/ugjM14COyUjL4ITN) |
| F4 | 令牌端点出错 | 99991663 当「凭证无效」；令牌端点的 HTTP 400 不解析飞书错误码 | App Secret 错 10015，应用停用 10014，App ID 不识别 10003 | 不一致，已修 | 通用错误码 |
| F5 | 创建用户 URL 与 ID 类型 | `POST /contact/v3/users`，部门 ID 以 `od-` 开头用 `open_department_id`，否则 `department_id` | `department_id_type` 默认 `open_department_id`，自定义部门 ID 不得以 `od-` 开头（43008）；`user_id_type` 默认 `open_id` | 一致 | [创建用户](https://open.feishu.cn/document/server-docs/contact-v3/user/create) |
| F6 | 创建用户必填与约束 | 传 `name`、`mobile`、`department_ids`、`employee_type` | 这四项必填；非中国大陆手机号必须同时传邮箱（44020）；手机号、邮箱、工号在租户内唯一；未认证企业人数上限 100、只能加 +86 号码 | 一致 | 创建用户 |
| F7 | 手机号写法 | 创建发 `+86…`；批量查询也只发 `+86…` | 创建接受 `13011111111` 或 `+8613011111111`；批量查询示例只有裸号，+86 写法是否匹配没写 | 未能确认；已修（查询同时发两种写法） | [通过手机号或邮箱获取用户 ID](https://open.feishu.cn/document/server-docs/contact-v3/user/batch_get_id) |
| F8 | 创建幂等 | `client_token` 只由应用 ID 和手机号决定 | 同一令牌、其他参数不同返回 40021；只有创建用户和部门有 `client_token` | 不一致，已修（对整个请求体取哈希） | 创建用户 |
| F9 | 用户已存在 | 先查再建，建时撞上重复直接抛错；查询不带 `include_resigned` | 41001 手机号已存在、41002 邮箱已存在、41003 两个不同账号占用（HTTP 409）、41053 用户已存在；查询默认不返回已离职成员，也不返回范围外成员 | 不一致，已修（重查复用，已离职报错） | 创建用户、批量查询 |
| F10 | 批量查 ID | `POST /contact/v3/users/batch_get_id`，`mobiles`、`emails` | 同；各最多 50 个；没有匹配的条目不带 `user_id`；不支持企业邮箱；权限 `contact:user.id:readonly` | 一致 | 批量查询 |
| F11 | 暂停与恢复 | `PATCH /contact/v3/users/:id`，体 `{ status: { is_frozen } }` | 体是顶层 `is_frozen`；`status` 是响应字段 | 不一致，已修 | [修改用户部分信息](https://open.feishu.cn/document/server-docs/contact-v3/user/patch) |
| F12 | 暂停与改部门限速 | 无本地节流，靠 429 与 44025 重试 | 更新 `department_ids`、`is_frozen` 限 1 QPS，并发冻结有概率失败；44025 是并发更新锁，等几秒重试 | 一致 | 修改用户部分信息 |
| F13 | 更新用户 | 只发填了的字段，`department_ids` 整体替换 | 未传的参数不更新 | 一致 | 修改用户部分信息 |
| F14 | 获取用户 | `GET /contact/v3/users/:id`，读 `status.is_frozen`、`is_resigned` | 同；`department_path` 在应用身份下不返回 | 一致 | [获取单个用户信息](https://open.feishu.cn/document/server-docs/contact-v3/user/get) |
| F15 | 离职与已退出用户 | 无处理 | 更新离职用户 42006，未加入 44010，主动退出 44011 | 不一致，已修（映射提示） | 修改用户部分信息 |
| F16 | 搜索用户与部门 | 不用搜索接口 | 搜索部门只支持 `user_access_token`；搜索用户页面没取到 | 搜索部门一致；搜索用户未能确认 | [搜索部门](https://open.feishu.cn/document/server-docs/contact-v3/department/search) |
| F17 | 部门不存在 | 无映射 | 获取部门 40015，通用错误码 41017，修改用户 44035；创建用户传不存在部门时具体返回哪个文档没写 | 不一致，已修（三个码都映射）；创建时的确切返回码未能确认 | 通用错误码 |
| F18 | 通讯录权限范围 | 40004、41050 映射为 403 并提示加范围 | 40004 部门不在范围内（HTTP 403），41050 成员不在范围内；根部门下的操作需要全员权限；范围改完要发版并经管理员批准 | 一致 | [权限范围资源介绍](https://open.feishu.cn/document/ukTMukTMukTM/uETNz4SM1MjLxUzM/v3/guides/scope_authority) |
| F19 | 所需权限名 | 向导写 `contact:user.id:readonly`、`contact:contact`、`im:message:send_as_bot`、`bitable:app` | 创建与修改 `contact:contact`；查 ID `contact:user.id:readonly`；读用户与部门 `contact:contact.base:readonly` 或 `contact:contact:readonly_as_app`；发消息 `im:message:send_as_bot`；列群需群信息读权限；多维表格 `bitable:app` 或 `base:record:create`，且应用要是该表的协作者 | 不一致，已修（补读权限、列群权限、协作者） | 各接口页的权限要求 |
| F20 | 缺权限 | 99991672 提示开通权限 | msg 里列出缺的 scope | 一致 | 通用错误码 |
| F21 | 限流响应 | 读 `x-ogw-ratelimit-reset`，缺省等 1 秒 | HTTP 429（旧接口 400）加 99991400，头 `x-ogw-ratelimit-reset`，没有 `Retry-After` | 一致 | [频控策略](https://open.feishu.cn/document/server-docs/api-call-guide/frequency-control) |
| F22 | 限流其他码 | 只有 99991400 | 消息 11232、11247、230020，多维表格 1254290、1254291、1254607 也是限流或并发冲突 | 不一致，已修 | 通用错误码、[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create) |
| F23 | 限流计数单位 | 平台登记为「接口 × 应用 × 租户」 | 同；创建、查询 1000 次/分钟加 50 次/秒；改部门与暂停 1 QPS；同一用户或群发消息 5 QPS；多维表格新增 50 次/秒、搜索 20 次/秒 | 一致（1 QPS 特例未单独声明） | 频控策略 |
| F24 | 免费版月额度 | 无映射 | 99991403 加 HTTP 429，每个自然月 1 号刷新；通讯录不计入，消息计入；2026 年 6 月限时 100 万次，之后的上限文档没写 | 不一致，已修（按下月 1 号北京时间阻塞，不自动重试）；2026 年 10 月的额度值未能确认 | [自建应用 API 调用量上限](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/platform-updates-/custom-app-api-call-limit) |
| F25 | IP 白名单 | 无映射 | 99991401，应用开了白名单时仅名单内 IP 可调用 | 不一致，已修 | 通用错误码 |
| F26 | 成员与席位上限 | 无映射 | 41007、41008、44023、44052 | 不一致，已修 | 创建用户 |
| F27 | 发消息 | `POST /im/v1/messages?receive_id_type=…`，体 `receive_id`、`msg_type`、`content` | 同；`receive_id_type` 支持 open_id、union_id、user_id、email、chat_id | 一致 | 发送消息 |
| F28 | 消息幂等 | 不传 `uuid` | `uuid` 最长 50 字符，1 小时内同一 `uuid` 至多成功发一条；重复请求具体返回什么文档没写 | 不一致，已修（可选去重键）；重复请求的返回形态未能确认 | 发送消息 |
| F29 | 消息错误码 | 230001 当「收件人不存在」，230002 当 403 | 230001 是参数错误；230002 机器人不在群（HTTP 400）；230013 用户不在可用范围或已离职；230006 未开机器人；230029 已离职；232009 群已解散 | 不一致，已修 | 发送消息 |
| F30 | 列群 | `GET /im/v1/chats` 只取第一页 100 个 | 分页返回 `page_token`、`has_more` | 不一致，已修（取全） | [获取用户或机器人所在的群列表](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/chat/list) |
| F31 | 多维表格新增记录 | `POST …/records`，无 `client_token` | 支持 `client_token`（UUIDv4）幂等；格式错 1254037；冲突 1255006；错误多数是 HTTP 200 加非零 code | 不一致，已修（去重键转成确定性 UUIDv4） | [新增记录](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create) |
| F32 | 多维表格错误码 | 1254005 当「记录不存在」，1254404 当「表不存在」 | 1254005 是 WrongViewId，记录不存在 1254043，表与 App Token 不存在 1254040、1254041，列名不存在 1254045，类型不匹配 1254015、1254060 到 1254066；没有 1254404 | 不一致，已修 | 新增记录 |
| F33 | 多维表格搜索 | `POST …/records/search`，只取一页 | `page_size` 最大 500，`page_token`，`has_more`；`filter` 的 `conjunction`、`conditions`、`operator: is`、`value` 数组 | 请求一致；分页不一致，已修 | [查询记录](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/search) |
| F34 | 列数据表 | `GET …/tables`，一页 100 | 分页 | 不一致，已修（取全） | [列出数据表](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table/list) |
| F35 | 事件订阅 | 握手回显 `challenge`，校验 `header.token`，AES-256-CBC 解密（密钥为 Encrypt Key 的 SHA-256，前 16 字节为 IV） | v2 事件结构含 `header.event_type`、`header.token`；加密事件需解密 | 一致 | [事件概述](https://open.feishu.cn/document/server-docs/event-subscription-guide/overview) |
| F36 | 事件签名校验 | 不校验 `X-Lark-Signature` | 配了 Encrypt Key 时的验签细节该页没取到 | 未能确认 | 事件概述 |
| F37 | 删除与恢复用户 | 不提供删除，不提供恢复（设计决定：离职只暂停） | `DELETE /contact/v3/users/:id`；恢复已删除用户 10 次/分钟 | 一致（设计取舍） | [删除用户](https://open.feishu.cn/document/server-docs/contact-v3/user/delete)、[恢复已删除用户](https://open.feishu.cn/document/server-docs/contact-v3/user/resurrect) |
| F38 | 列部门成员与子部门 | 没有 | `GET /contact/v3/users/find_by_department`（`page_size` 最大 50，根部门 ID 为 0），`GET /contact/v3/departments/:id/children`（`fetch_child`） | 差距，已补动作 | [获取部门直属用户列表](https://open.feishu.cn/document/server-docs/contact-v3/user/find_by_department)、[获取子部门列表](https://open.feishu.cn/document/server-docs/contact-v3/department/children) |

## 北森

| # | 项目 | 连接器当前做法（修复前） | 官方文档说法 | 是否一致 | 官方链接 |
| --- | --- | --- | --- | --- | --- |
| B1 | 取令牌 | `POST {域名}/token`，JSON `grant_type=client_credentials`、`app_key`、`app_secret` | 同（来源：登录站「接口调用流程」登记加[第三方转述官方](https://blog.csdn.net/caiwenzong/article/details/142235753)；官方令牌页本身未能直接读取） | 一致，来源非一手 | `beisen-help-docs.md` |
| B2 | 带令牌 | `Authorization: Bearer <token>` | 同 | 一致 | 同上 |
| B3 | 令牌有效期 | 缓存 `expires_in` 减 5 分钟，缺省按 1 小时 | 2 小时，期间重复获取返回同一令牌；响应里的字段名 `expires_in` 文档没写 | 一致；字段名未能确认 | `beisen-help-docs.md` |
| B4 | 令牌失败的响应形态 | 读 `error`、`error_description`、`error_code` | 官方没写，来自此前的探测请求 | 未能确认 | `building-connectors.md` |
| B5 | 时间窗接口地址 | `POST /TenantBaseExternal/api/v5/Employee/GetByTimeWindow` | 同 | 一致 | [员工与单条任职时间窗](https://apifox.com/apidoc/docs-site/436023/api-6342604) |
| B6 | 时间窗请求字段 | `startTime`、`stopTime`、`timeWindowQueryType`、`empStatus`、`employType`、`serviceType`、`isGetLatestRecord`、`withDisabled`、`isWithDeleted`、`capacity`、`scrollId`、`columns` | 同；`startTime`、`stopTime`、`timeWindowQueryType` 必填，格式 `2021-01-01T00:00:00` | 一致 | 同上 |
| B7 | `approvalStatuses` | 发 `[4]` | 公开接口页没有这个字段；登录站帮助文档登记说可传且只允许 2 和 4 | 未能确认（保留） | `beisen-employee-timewindow-api.md` |
| B8 | `timeWindowQueryType` 取值 | 1 任一修改，2 业务修改 | 公开页只写「时间窗查询类型」、示例为 1；登录站登记 1 修改时间（含夜间系统重算）、2 业务修改时间 | 未能确认（公开页）；与登录站一致 | 同上 |
| B9 | 时间窗跨度 | 按 89 天分段 | 限定 90 天（含），超出返回 417「只支持查询90天范围内的数据，请分段查询」 | 一致 | api-6342604 |
| B10 | 滚动分页 | 循环到数据为空，页间不做业务处理 | 每批 ≤300，两次调用间隔不超 10 秒，不能跳页、不能回跳 | 一致 | api-6342604 |
| B11 | 滚动结束判断 | 数据为空或没有 `scrollId` | 公开页：`isLastData` 为 true 表示没有更多；登录站登记：以 `data` 为空为准，`isLastData` 已废弃 | 一致；两处说法不同，已改为任一成立都结束 | api-6342604 |
| B12 | 响应业务码 | `code !== 200` 就当失败 | `code` 是字符串，`"200"` 成功，`"417"` 参数异常，`"500"` 服务端异常 | 不一致，已修（400 以下算成功） | api-6342604 |
| B13 | 错误响应形态 | 读 `code`、`message` | HTTP 200，体 `{ data: null, code: "417", message }` | 一致（码类型见 B12） | api-6342604 |
| B14 | 人员状态枚举 | 在职范围 `[2, 3]` | 示例 `[2,3,7]` 为试用、正式、返聘；默认（不传且不含离职）查试用、正式、返聘；1 待入职，8 离职 | 不一致，已修（加 7） | api-6342604 |
| B15 | 离职口径 | 离职范围 `empStatus [8]`、`isGetLatestRecord false` | 登录站登记：只要生效的离职，`approvalStatuses` 传 4、`isGetLatestRecord` 传 false | 一致（登录站来源） | `beisen-help-docs.md` |
| B16 | 时区与起止边界 | 按所选时区（默认北京时间）格式化，窗口为 `[上次, 现在]` | 公开页只写格式，没写时区，也没写起止是否包含 | 未能确认；已防御（重叠 5 分钟加内容哈希去重） | api-6342604 |
| B17 | 变动晚可见 | 无处理，窗口紧接上次结束 | 没有写；滚动 ID 形似搜索引擎游标，可能有索引延迟 | 未能确认；已防御（同上） | api-6342604 |
| B18 | 限流数字 | 按「当天封禁」处理，429 转成阻塞到次日零点 | 公开接口页 100 次/秒/企业、3000 次/分钟/企业；登录站登记每租户每接口 50 次/秒、3000 次/分钟，时间窗接口 1500 次/分钟，触发后当天不可恢复 | 一致（登录站来源）；公开页与登录站数字不同，未能确认 | api-6342604、`beisen-help-docs.md` |
| B19 | 429 形态 | HTTP 429 或 200 体里的 `API rate limit exceeded` | 登录站登记 `429 API rate limit exceeded` | 一致 | `beisen-help-docs.md` |
| B20 | 下级组织 | `POST …/Organization/GetSubOrganizations`，体 `organizationId`、`isIncludeSubOrganization` | 体是 `oId`（整数）、`isWithDisable`、`isWithSelf`、`queryDate`；根组织 OId 为 900 加租户 ID，默认 0 | 不一致，已修 | [查询指定组织的下级组织单元列表](https://apifox.com/apidoc/docs-site/436023/api-6342677) |
| B21 | 整棵子树 | 把「包含所有层级」映射到 `isIncludeSubOrganization` | 另有接口 `GetSubOrganizationTrees`，体 `oIds` | 不一致，已修 | [批量查询下级组织树分支](https://apifox.com/apidoc/docs-site/436023/api-6342681) |
| B22 | 任职记录 | `POST …/Employee/GetServiceInfoByIds`，体 `userIds` | 体字段是 `oIds`（整数数组，必填，≤300），含义是员工 UserID（tips 写明；字段说明写「业务 OId」，表述含混）；错误示例 `Ids is null` | 不一致，已修（并按 300 一批） | [任职记录相关信息](https://apifox.com/apidoc/docs-site/436023/api-6342603) |
| B23 | 待入职人员详情 | `POST /RecruitV6/api/v1/RecruitOnBoarding/GetStaffInfos`，体为 ID 数组 | 同，示例 ID 是 GUID，最多 1000；错误码 400、417、500 | 一致（超限时改为本地报错） | [查询待入职人员信息](https://apifox.com/apidoc/docs-site/436023/api-6342725) |
| B24 | 待入职员工 ID | 没有 | `GetStaffIds` 按时间分页（每页最多 1000，`batchId`） | 差距，未补（用「待入职」状态范围的时间窗代替） | [获取待入职员工Id](https://apifox.com/apidoc/docs-site/436023/api-6342729) |
| B25 | 应聘者 ID | `POST /RecruitV6/api/v1/Applicant/GetApplicantIds`，体 `email`、`mobile`、`certificateNumber`、`candidateId` | 同，`code` 为整数 200 | 一致 | [根据搜索条件获取应聘者Id](https://apifox.com/apidoc/docs-site/436023/api-6342750) |
| B26 | 标准简历 | `GET …/Applicant/GetResume`，查询参数 `applicantId`、`isShortUrl` | 同 | 一致 | [获取标准简历](https://apifox.com/apidoc/docs-site/436023/api-6342754) |
| B27 | 按邮箱查 UserID | 没有 | `GetUserIDByEmail`，体 `email`（需小写），找不到返回 null | 差距，已补动作 | [根据员工Email获取员工UserID](https://apifox.com/apidoc/docs-site/436023/api-6342605) |
| B28 | 组织下的员工名单 | 没有 | `GetEmployeeOfOrganization`，体 `orgOId`、`includeSubOrg`，滚动分页 | 差距，已补动作 | [滚动查询指定组织下的员工](https://apifox.com/apidoc/docs-site/436023/api-6342608) |
| B29 | 空数据当失败 | 成功码配 `data: null` 也抛错 | 按邮箱查不到时返回 null，属于正常结果 | 不一致，已修 | api-6342605 |
| B30 | 所需接口权限 | 向导写「员工记录、组织、招聘」 | 登录站登记：在连接器里逐个添加接口；员工数据要同时勾「员工信息」和「任职记录」；可配授信 IP | 不一致，已修（按动作列出接口名） | `beisen-help-docs.md` |
| B31 | 事件订阅器 | 没有（首发用轮询） | 北森可推送员工事件（`EmpEvent`，类型含 `AddEmp`），消息要加解密，官方建议再用接口补偿 | 差距，未补 | [第三方转述](https://blog.csdn.net/caiwenzong/article/details/142235753) |
| B32 | 接口失败码 | 417 带原文，500 带原文 | 417 参数异常或业务不合法，500 服务端异常，招聘接口另有 400 | 一致 | api-6342604、api-6342725 |

## 连接器重深度打分

按 `product-brief.md`「连接器重深度」八项清单打分：2 分满足，1 分部分满足，0 分缺。「修复前」是本次审计开始时的状态，「现在」是本次修复后的状态；「现在」只表示代码和模拟服务上的状态，没有在真实租户上验证。

| 项目 | 飞书 修复前 | 飞书 现在 | 北森 修复前 | 北森 现在 | 剩下的差距 |
| --- | --- | --- | --- | --- | --- |
| 连接向导和缺权限提示 | 1 | 2 | 1 | 2 | 向导按步骤列出真实权限名（飞书）和接口名（北森）、通讯录权限范围、IP 白名单、可用范围，中英文都有；缺权限在失败步骤带权限名，前端按角色给指引。保存时只校验凭证，不探测全部权限（产品备忘的有意取舍） |
| 分页取全 | 1 | 2 | 2 | 2 | 飞书的群列表、数据表列表、记录搜索原先只取第一页，现在取全（有上限）；北森时间窗和组织名单按滚动游标取到底。北森的待入职员工 ID 分页（`GetStaffIds`）没有做 |
| 声明限流计数单位 | 1 | 1 | 1 | 1 | 平台登记了计数单位（飞书接口 × 应用 × 租户，北森按企业），但登记表放在 `core/shared`，没有表达特例：飞书改部门与暂停 1 QPS、免费版月额度、北森时间窗接口比通用更严。特例只体现在错误处理里（读 `x-ogw-ratelimit-reset`、月额度按下月 1 号阻塞、北森当天封禁）。要让平台按声明排队需要扩展登记表，没做 |
| 写操作声明幂等键或查重键 | 1 | 2 | 不适用 | 不适用 | 飞书开通先按手机号和邮箱查重，创建带整个请求体的 `client_token`，撞重复时重查复用；暂停、恢复、更新天然幂等；消息和多维表格新增记录增加可选去重键（`uuid`、`client_token`），默认不开，不幂等的写操作仍不自动重试。北森连接器只读，没有写操作 |
| 能按业务键读回 | 1 | 2 | 1 | 2 | 飞书：按手机号、邮箱查（含暂停与离职状态）、按 open_id 读、暂停后立即读回确认；飞书没有按工号查的接口，工号靠列部门成员后匹配。北森：新增按邮箱查 UserID；按工号查没有公开接口文档，靠组织名单匹配 |
| 错误码映射到谁能修 | 1 | 2 | 1 | 1 | 飞书约 70 个码有解释，前端把它们归到应用开发者、飞书管理员、流程作者等角色并给中文处理办法。北森只有 401、429、417、凭证几类，北森的权限不足和 IP 不受信返回什么，文档没写，没有映射 |
| 输出结构 | 1 | 2 | 1 | 2 | 声明了 `outputSchema` 的动作和触发器，数据选择器里是带标签的树；多维表格新增和搜索的列是动态的，没有声明；北森按 ID 取任职记录、待入职详情、简历直接返回原始结构，没有声明 |
| 能列出全量名单供对账 | 0 | 2 | 1 | 2 | 飞书新增列出部门成员（可含全部子部门，含暂停与离职状态）和列出子部门；北森新增列出组织下的员工（可含下级组织）。1 万人的实际耗时和调用量要在真实租户上量 |

合计：飞书从 7 分升到 15 分（满分 16），北森从 8 分升到 12 分（满分 14，幂等一项不适用）。

## 剩下需要真实租户确认的事

这些是文档没写或说法不一致的地方，连接器已按保守方式处理，真实租户验收时要看一眼：

- 飞书批量查询里 `+86` 写法的手机号是否匹配（F7）。
- 创建用户传不存在的部门时返回哪个码（F17）。
- 同一 `uuid` 重复发送消息时，飞书返回原消息还是报错（F28）。
- `client_token` 的有效期（飞书文档没写）。
- 2026 年 10 月免费版的月额度值（F24）。
- 北森时间窗的时区、起止是否包含、变动多久后可见（B16、B17）。
- 北森公开页和登录站限频数字不同（B18），以及触发限流后的实际封禁时长。
- 北森令牌响应里 `expires_in` 的字段名（B3）。
- 北森根组织 OId 是否就是 900 加租户 ID（B20，文档示例为 `900100000`）。
