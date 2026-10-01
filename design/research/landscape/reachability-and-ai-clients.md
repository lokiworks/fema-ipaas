# 可达性与 AI 客户端：自托管下的 IM 交互、MCP 客户端与「工具层」方向

调研时间 2026-10-01。要回答三件事：

1. 纯内网、DMZ 反向代理、能出网不能入网三种部署形态下，飞书事件、飞书卡片按钮回传、钉钉 Stream、企业微信回调，以及手机打开 IM 消息里的平台链接，哪些能用。
2. 国内能用的编码助手和 IM 里的 AI 助手，怎么支持 MCP：用什么传输、怎么鉴权、能不能碰到客户内网里的 MCP 服务。
3. 给 Dify、Coze Studio、FastGPT、MaxKB 做「受治理的企业系统工具层」，和 `design-inputs.md` 推荐的「结果台账」方向，是互补还是替代。

**资料与可信度**

- 飞书、钉钉、企业微信、Trae、CodeBuddy、文心快码、Cursor、Claude Code、Dify 都读的是官方文档原文（飞书、钉钉、Trae、Cursor、Claude Code、Dify 有 `.md` 版本，企业微信用开发者中心的正文接口取到）。Coze Studio、FastGPT、MaxKB 以 GitHub 仓库的源码、文档和发布说明为准。
- 企业微信「智能机器人开发」这一组文档是 2026 年 8、9 月新上的，内容可能还在变。
- 本轮 WebSearch 额度在第 3 部分中途用尽。买方怎么比较这些平台，只用了厂商官网的对比页、价格页和第一轮调研，没有做更广的检索；相关判断标【推断】，并列进文末的待访谈清单。
- 不重复第一轮已经查清的内容：企业微信 2022 年两次收紧通讯录接口、企业可信 IP 的「一 IP 一企业」规则（`china.md` §8、§11.3），平台 MCP 双向能力的盘点（`platform-inventory.md` §1.9），以及国外厂商的 MCP 治理（`ai-native.md`）。

## 先说结论

1. **自托管补上了「平台到内网系统」这一段，却打开了「IM 到平台」这一段。** ADR 0018 删掉 Network Agent 的理由成立：平台和北森、金蝶同在客户网络里。但飞书、钉钉、企业微信是 SaaS。事件、卡片点击、机器人消息都要从公网进来，而多数客户不会为一个集成平台开入站口子。答案不是自己造隧道，而是厂商已经提供的反向长连接：飞书「使用长连接接收事件/回调」、钉钉 Stream、企业微信智能机器人长连接。三家文档都写明只要能出网、不需要公网 IP：飞书「无需提供公网 IP 或域名」，钉钉「不需要公网服务器、IP、域名等资源」，企业微信「无需公网 IP」。
2. **「能出网不能入网」下，三家 IM 的交互几乎都能做，只差企业微信自建应用的回调。** 飞书事件和新版卡片回调可以走长连接（只限企业自建应用）。钉钉的事件、机器人消息、卡片回调都可以走 Stream。企业微信自建应用的回调（通讯录变更、应用消息、模板卡片点击）要求 URL「公开可访问」，没有长连接；能替代它的是智能机器人的长连接（相关文档 2026 年 5 月到 9 月更新），可以收消息、收模板卡片点击、主动推送。企业微信通讯录侧在这种形态下只能靠定时全量读取加对账，和第一轮「企业微信不支持增量」的结论叠在一起。
3. **长连接不是「更省事的 Webhook」，它有自己的约束，而且和我们现在的架构冲突。** 飞书一个应用最多 50 条连接，每条消息只随机投给其中一条；钉钉同样是每个应用最多 50 条，并专门警告测试、开发环境的客户端会收到生产的回调。所以测试环境和生产环境共用一个应用，事件就会被分走。企业微信智能机器人同一时间只允许一条连接，新连接会踢掉旧的，多实例部署必须选主。处理时限是飞书 3 秒、企业微信卡片事件 5 秒且不重发。我们的连接器每次调用都起一个新子进程（决定 000029），长连接放不进连接器代码，必须做成平台常驻的「IM 通道」。
4. **重推窗口很短，「没发生」一定会出现。** 飞书推送失败后按 15 秒、5 分钟、1 小时、6 小时重推，最多 4 次，也就是平台停机超过 7 小时左右，事件就丢了；回调（卡片点击）不补推。企业微信智能机器人的模板卡片事件只发一次。「事件加速、拉取比对兜底」是唯一可靠的组合，这条直接支持把对账放在台账的中心。
5. **手机打不开内网平台的链接，这件事厂商帮不上忙。** 三家开放平台文档里都没有找到「手机访问企业内网网页」的通道，只能靠客户自己的 VPN 或零信任客户端。我们现在的告警是群机器人发纯文本，末尾拼一个控制台链接（`notification-channel-sender.ts`），HR 在地铁上点开就是死链。正确做法是让卡片自己说清楚、能就地处理。飞书卡片支持按桌面、安卓、iOS 分别配置链接，也能声明某一端不跳转。
6. **编码助手全部在开发者电脑上跑 MCP 客户端，碰得到内网 MCP；IM 里的托管 AI 助手碰不到。** Trae CN、CodeBuddy、文心快码、Qoder CN（原通义灵码，2026-05-20 更名）、Cursor、Claude Code 都支持本地进程或 HTTP 类 MCP，电脑能访问内网就能连。飞书 aily 和钉钉 DEAP 能添加自定义 MCP，但调用从厂商云上发起，要求地址公网可达。唯一的例外是钉钉 AI 助理的「自定义能力」，它可以声明走 Stream 协议，从内网反向接入，不过那不是 MCP。
7. **在中国大陆，搭建侧 AI 不能只围着 Claude Code 设计。** Anthropic 支持的地区不含中国大陆、香港、澳门，2025 年 9 月起又禁止中国资本控股过半的企业使用；Cursor 会直接隐藏模型方不服务地区的模型。Claude Code 客户端可以把 `ANTHROPIC_BASE_URL` 指向 DeepSeek 这类兼容端点（DeepSeek 官方文档写了接法），但合规要法务确认。首发要在 Trae CN、CodeBuddy、文心快码、Qoder CN 加国产模型上验证。
8. **我们的 MCP 服务端和这些客户端的交集比想象的小。** 现在只接受 POST 的 Streamable HTTP，凭证必须放在 `Authorization: Bearer` 头里，没有 SSE，也不能把凭证放在地址里（`mcp-endpoint.controller.ts`）。Qoder CN 插件文档只列了 STDIO 和 SSE。aily、DEAP 的界面只看到「贴 URL」，没看到自定义请求头的说明。Dify 自托管默认的 `ssrf_proxy` 规则是 `http_access deny to_private_networks`，会拦掉内网地址；FastGPT 的 MCP 客户端拒绝经过 HTTP 代理。Coze Studio 开源版的 MCP 调用是一个返回「not implemented」的空实现。
9. **Dify、Coze Studio、FastGPT、MaxKB 恰好都缺第一轮证实的那块品类空白。** 公开文档和源码里都没有触发器去重或幂等键，没有生产环境的重放和批量补救，没有对账。治理是付费档：Dify 的成员操作日志在企业版，MaxKB 的系统操作日志和 RBAC 在专业版（4.8 万元一套），FastGPT 的运行日志看板和团队权限在商业版（审计日志未查到）。MaxKB 2026 年修过几个和 MCP 有关的漏洞，其中有远程代码执行（CVE-2026-39417）。
10. **「受治理的工具层」和「结果台账」是互补关系，但工具层不能单独成为方向。** 单纯把企业系统接口包成 MCP 正在被商品化：飞书集成平台把连接器和工作流封成 MCP 给 aily，钉钉 MCP 广场有 6000 多个服务，企业微信也把自己的文档、日程、通讯录开放成了 MCP。工具值钱的地方是它背后的台账：对一个业务键「查到位没有」「补到位」，天然幂等、可以预演、有审计、做完会核对。所以推荐把工具层定为台账的出口，不另立中心。

---

## 1. 三种部署形态下的交互可达性

### 1.1 三种形态

| 形态 | 入站（公网 → 平台） | 出站（平台 → 公网） | 典型客户（【推断】，待访谈） |
| --- | --- | --- | --- |
| 纯内网 | 不通 | 不通 | 政务、军工、部分金融；IM 若是私有化部署，另当别论 |
| DMZ 反向代理 | 只有反向代理暴露出去的路径通 | 通常能出（NAT 或 HTTP 代理） | 已有对外系统、安全部门愿意审批入站规则的中大型企业 |
| 能出网不能入网 | 不通 | 通（直连或经 HTTP 代理） | 多数自托管客户：机房能访问互联网，但不开入站口子 |

第一轮的首发主线「北森变动 → 飞书开通 → 通知」在源头侧是拉取北森（出站），不受入站限制。受影响的是 IM 侧：通讯录事件、卡片按钮、机器人收消息、手机打开链接。

### 1.2 飞书

**事件订阅有两种方式**（[事件概述](https://open.feishu.cn/document/server-docs/event-subscription-guide/overview)）：

- **长连接**（[使用长连接接收事件](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case)）：集成飞书 SDK，和开放平台建一条 WebSocket 全双工通道。原文：「只需保证运行环境具备访问公网的能力即可，无需提供公网 IP 或域名、无需使用内网穿透工具」，也「无需部署防火墙和配置白名单」。限制：
  - 「长连接模式仅支持企业自建应用」，商店应用不行。自托管客户都是自己建企业自建应用，不受影响。
  - 收到消息后「需要在 3 秒内处理完成且不抛出异常，否则会触发超时重推机制」。
  - 「每个应用最多建立 50 个连接」。
  - 推送是「集群模式，不支持广播」，同一应用部署了多个客户端时，「只有其中随机一个客户端会收到消息」。
  - 在开发者后台保存订阅方式时，「必须确保本地客户端启动正常，有长连接在线的情况下，才能保存成功」。
- **将事件发送至开发者服务器**，也就是 Webhook（[原文](https://open.feishu.cn/document/event-subscription-guide/event-subscriptions/event-subscription-configure-/choose-a-subscription-mode/send-notifications-to-developers-server)）：
  - 「每个应用只能配置一个请求地址」，并且「必须是 IPv4 公网地址」。
  - 保存时飞书发 `challenge`，要「在 1 秒内」原样返回。
  - 可以用 Encrypt Key 加密、Verification Token 校验来源。

**推送和重推**（同上，事件概述）：

- 要在 3 秒内返回 200（TCP 建联超时 2 秒），长连接下是 3 秒内处理完、不抛异常。
- 失败后「以 15秒、5分钟、1小时、6小时 的间隔重新推送事件，**最多重试 4 次**」。平台停机超过约 7 小时，这段时间的事件就再也收不到了。
- 「至少发送一次」，成功接收也可能收到重复消息，官方建议按 `event_id` 做幂等。
- 有序事件阻塞时，后面的事件进重试队列排队。

**DMZ 下的白名单**：飞书提供[获取事件出口 IP](https://open.feishu.cn/document/server-docs/event-subscription-guide/list) 接口（`GET /open-apis/event/v1/outbound_ip`，权限 `event:ip_list`），并提醒「IP 地址有变更可能，建议定期拉取最新 IP 地址，并自动更新至防火墙规则」。[事件订阅优化指南](https://open.feishu.cn/document/event-subscription-guide/event-subscriptions/event-callback-optimization-guide)建议用中国大陆的服务器，因为 3 秒时限很紧；一周内出现四次重试都失败，开发者小助手会推卡片提醒。

**回调（卡片按钮、链接预览）**（[回调概述](https://open.feishu.cn/document/event-subscription-guide/callback-subscription/callback-overview)、[使用长连接接收回调](https://open.feishu.cn/document/event-subscription-guide/callback-subscription/step-1-choose-a-subscription-mode/configure-callback-request-address)）：

- 回调是同步的：「订阅回调后，开发者服务器需要立即返回响应内容」，「不提供补推机制，超时未响应即认为这次回调失败」。
- 同样有长连接和 Webhook 两种方式；Webhook 方式同样要求 IPv4 公网地址、一个应用一个地址。
- **旧版「消息卡片回传交互（旧）」不支持长连接**，只能走 Webhook。新版卡片回传交互 `card.action.trigger` 可以走长连接。

**卡片回传交互的细节**（[卡片回传交互回调](https://open.feishu.cn/document/feishu-cards/card-callback-communication)）：

- 要在 3 秒内响应，可以弹 Toast、更新卡片或保持不变。
- 回调里带操作人的 `open_id`、`union_id`，开了「获取用户 user ID」权限还有 `user_id`。点按钮的人是谁，飞书替我们认证过了。
- 回调里的更新卡片 token「有效期为 30 分钟，最多可更新 2 次」。

**群自定义机器人**（我们现在的告警渠道用的就是它）（[自定义机器人](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)、[机器人概述](https://open.feishu.cn/document/client-docs/bot-v3/bot-overview)）：

- 「仅支持单向往群组内推送消息」，卡片交互「仅支持配置打开链接交互」，不能回调。
- 频率「单租户单机器人 100 次/分钟，5 次/秒」，IP 白名单最多 10 个。
- 要做按钮回传，必须用「应用机器人」，也就是企业自建应用，而应用的配置变更要企业管理员审核发布。

**卡片里的链接**（[配置卡片交互](https://open.feishu.cn/document/feishu-cards/configuring-card-interactions)）：打开链接「支持为桌面端、安卓端、iOS 端配置不同的链接」，可以用 `lark://msgcard/unsupported_action` 声明某一端不允许跳转。

**SDK**：飞书 Node SDK 的长连接客户端先请求 `{domain}/callback/ws/endpoint` 拿连接地址，建 WebSocket 时接受 `agent` 参数（[`@larksuiteoapi/node-sdk` 源码](https://unpkg.com/@larksuiteoapi/node-sdk/lib/index.js)）。理论上可以接 HTTP 代理，经企业代理的 WebSocket 能不能连通需实测。

### 1.3 钉钉

**Stream 模式**（[服务端 Stream 模式](https://open.dingtalk.com/document/resourcedownload/introduction-to-stream-mode)）：

- 可以监听「机器人回调、事件订阅回调和注册卡片回调」，通过 WebSocket 通讯，「不需要公网服务器、IP、域名等资源」。
- 官方的「五零」：零公网 IP，零加解密、签名和证书管理，零防火墙白名单，零网关，零内网穿透。
- 接入限制：部署环境要能访问公网；「仅适用于企业内部开发和第三方企业应用」；「一个应用默认最多建立50条连接」。
- 原文警告：「客户端启动后即可收到对应卡片的回调，测试、开发环境部署要避免影响生产环境。」

**协议细节**（[Stream 模式协议接入说明](https://open.dingtalk.com/document/direction/stream-mode-protocol-access-description)）：

- 先 `POST /v1.0/gateway/connections/open` 拿 `endpoint` 和 `ticket`，ticket「有效期为90秒且只能用来建立一条连接」。
- 服务端会定时推送 `disconnect`，然后静默 10 秒主动断开，客户端要重新注册、重新建连。
- 事件的确认状态只有 `SUCCESS` 和 `LATER`（消费失败）。返回 `LATER` 后多久重推、断线期间的事件是否保留，未查到，需实测。

**HTTP 方式**：[配置事件推送方式](https://open.dingtalk.com/document/development/configure-stream-push)把 HTTP 推送标为「不推荐」，前提是「拥有公网可访问的请求网址」。[互动卡片回调](https://open.dingtalk.com/document/development/event-callback-card)的 HTTP 模式要「提供一个公网可访问的域名」并注册 `callbackRouteKey`；Stream 模式要在创建卡片实例时把 `callbackType` 设为 `STREAM`。

### 1.4 企业微信

**自建应用的回调**（[回调配置](https://developer.work.weixin.qq.com/document/path/90930)、[接收消息与事件](https://developer.work.weixin.qq.com/document/path/90238)）：

- URL 由开发者搭建，「开发者提供的URL是公开可访问的」，所以要用 Token 签名、EncodingAESKey 加密。
- 支持 http 或 https（建议 https）；保存时企业微信发 GET 验证，要在 1 秒内返回解密后的明文。
- 通讯录变更、应用消息、模板卡片点击都走这个 URL。**这一侧没有长连接。**
- 入站白名单：[获取企业微信回调 IP 段](https://developer.work.weixin.qq.com/document/path/90930)（`getcallbackip`），「建议企业每天定时拉取IP段，更新防火墙设置」。

**回调 URL 归属的规则**：官方开发文档里没找到「回调域名主体必须与企业一致」的原文。但腾讯轻联自己的文档写着，把轻联的 URL 填进自建应用的接收消息，「由于企业微信修改规则，只有2022年1月04日之前创建的自建应用才可以使用此方式」（[腾讯轻联·企业微信自建应用](https://hiflow.tencent.com/docs/applications/wwx-app/)）。【推断】新建的自建应用基本不能再用第三方 SaaS 的回调地址；部署在客户机房、用客户自己域名的平台反而合规。具体校验规则需实测。

**企业可信 IP 是出站方向的白名单**（规则见 `china.md` §8）。[全局错误码](https://developer.work.weixin.qq.com/document/path/90313)里相关的几条：

- 60020「不安全的访问IP」
- 48009「为保障企业数据安全，不再允许通讯录同步助手从新增IP读取通讯录详情」
- 80001「可信域名不正确，或者无ICP备案」
- 85005「可信域名未通过所有权校验」

社区文章称，配置企业可信 IP 之前，要先设置可信域名或接收消息服务器 URL（[阿里云开发者社区](https://developer.aliyun.com/article/1591206)，标题即「配置接收消息服务器URL以设置企业微信自定义应用可信IP」）。如果属实，「能出网不能入网」的客户第一次配置时，仍然要验证一次域名或一个公网 URL。需实测。

**智能机器人**（「智能机器人长连接」一页最后更新于 2026-05-25；「智能机器人开发」这一组文档 2026 年 8 月上线，9 月仍在更新）：

- API 模式有两种连接方式（[开发前必读](https://developer.work.weixin.qq.com/document/path/101805)、[基本概念](https://developer.work.weixin.qq.com/document/path/101806)）：
  - 长连接：适用于「内网部署、对实时性要求高、需要主动推送消息」。
  - URL 回调：适用于「服务器有公网 IP、对高可用有要求」，「回调 URL 必须公网可访问」（[URL 回调概述](https://developer.work.weixin.qq.com/document/path/101840)）。
- 长连接（[使用长连接](https://developer.work.weixin.qq.com/document/path/101833)）：
  - 地址 `wss://openws.work.weixin.qq.com`，连上后用 BotID 和长连接专用 Secret 订阅，每 30 秒发一次 ping。
  - 「每个智能机器人同一时间只能保持一个有效的长连接。当同一机器人发起新连接并完成订阅后，新连接会踢掉旧连接」，官方建议主备切换，不要同时建多个连接。
- 事件（[接收事件](https://developer.work.weixin.qq.com/document/path/101835)）有进入会话、模板卡片点击、用户反馈三类。模板卡片事件「企业微信服务只会发起一次请求，在五秒内收不到响应会断掉连接并丢弃该回调事件」。
- 主动推送（[主动推送消息](https://developer.work.weixin.qq.com/document/path/101837)）：
  - 前置条件是「需要用户先在会话中给机器人发送过消息」。
  - 每个会话限 30 条/分钟、1000 条/小时。
  - 用途里官方自己写了「告警推送」。
- 身份：智能机器人拿到的是密文 `open_userid`，要用自建应用的 access_token 调 `openuserid_to_userid` 才能换成明文 userid（[自建应用与智能机器人的对接](https://developer.work.weixin.qq.com/document/path/101521)）。所以只用智能机器人还不够，认人还要一个自建应用。

### 1.5 手机上打开平台链接

- 飞书、钉钉、企业微信开放平台文档里，都没有找到让手机访问企业内网网页的通道（未查到）。手机不在内网时，只能靠客户自己的 VPN 或零信任客户端，或者把页面经 DMZ 暴露出去。
- 第三方 AI 平台也一样：Dify 的 Human Input 节点只能用网页或邮件链接送达，「Anyone with the link can respond」（[Human Input](https://docs.dify.ai/en/self-host/use-dify/nodes/human-input)），手机能不能打开同样取决于网络。
- 飞书卡片能按端配置链接（见 1.2），这是在不暴露平台的前提下，唯一能让手机端不出现死链的办法。

### 1.6 我们平台的现状

- 飞书连接器的触发器只有 Webhook 一种（`packages/connectors/community/feishu/src/lib/triggers/event-received.ts`）；全仓库没有飞书长连接、钉钉 Stream 或企业微信长连接的代码。
- 告警渠道是三家的群机器人 Webhook，消息类型固定为纯文本，正文末尾拼上链接（`packages/server/api/src/app/alert/notification-channel-sender.ts` 的 `buildRequest`）。不能交互，手机上链接常常打不开。
- 智能体确认和审批走网页确认页，只认 POST（决定 000009），同样依赖浏览器能打开平台。
- 只有一个 `FRONTEND_URL`，同时用来生成控制台链接和 Webhook 地址前缀（`domainHelper.getPublicUrl`、`WEBHOOK_URL_PREFIX`）。没有单独的「对外入口地址」，DMZ 下很难只暴露 Webhook 而不暴露控制台。
- 连接器每次调用都起一个新子进程（决定 000029），放不下需要常驻的长连接。

### 1.7 交互 × 部署形态矩阵

✓ 能用；✗ 不能用；△ 有条件。

| 交互 | 纯内网 | DMZ 反向代理 | 能出网不能入网 |
| --- | --- | --- | --- |
| 飞书事件 · Webhook | ✗ | △ IPv4 公网地址；一个应用一个地址；按出口 IP 接口维护白名单；1 秒 challenge、3 秒响应 | ✗ |
| 飞书事件 · 长连接 | ✗ | ✓ | ✓ 只限企业自建应用；出站 WebSocket 不能被代理拦掉（需实测） |
| 飞书卡片按钮回传 | ✗ | ✓ Webhook 或长连接 | △ 只能用新版回调 `card.action.trigger`；3 秒响应；不补推 |
| 飞书群自定义机器人推送 | ✗ | ✓ | ✓ 只能推送，卡片只能放「打开链接」 |
| 钉钉事件、机器人消息、卡片回调 · Stream | ✗ | ✓ | ✓ 企业内部应用或第三方企业应用；测试和生产要用不同应用 |
| 钉钉 · HTTP 推送和卡片 HTTP 回调 | ✗ | △ 公网可访问的域名 | ✗ |
| 企业微信自建应用回调（通讯录变更、应用消息、模板卡片点击） | ✗ | △ 公网可访问的 URL；回调 IP 段可做白名单；域名归属要求需实测 | ✗ 通讯录靠定时全量读取加对账 |
| 企业微信 API 出站调用（企业可信 IP） | ✗ | ✓ 出口 IP 填进可信 IP | △ 同左；出口 IP 变了报 60020；首次配置可能要先验证域名或 URL（需实测） |
| 企业微信智能机器人 · 长连接（收消息、模板卡片点击、主动推送） | ✗ | ✓ | △ 一个机器人只能一条连接，要选主；主动推送前对方要先发过消息；卡片事件 5 秒、不重发 |
| 手机打开 IM 消息里的平台链接（手机不在内网） | ✗ | △ 只暴露移动处理页，并做 IM 免登或鉴权 | ✗ 除非手机装了企业 VPN 或零信任客户端 |
| IM 托管 AI 助手（aily、钉钉 DEAP）调平台 MCP | ✗ | △ 暴露 `/api/mcp/*`；鉴权方式受客户端限制（见 2.3） | ✗ 钉钉 AI 助理「自定义能力」走 Stream 协议可以，但不是 MCP |
| 内网电脑上的编码助手、客户自托管的 AI 平台调平台 MCP | ✓ | ✓ | ✓ |

纯内网一列全是 ✗，前提是 IM 用的是 SaaS 版。飞书私有化、专有钉钉、政务微信这类私有化 IM 是否支持长连接和卡片回调，未查到。

### 1.8 产品的默认做法

1. **默认按「能出网不能入网」设计，入站一律走厂商的长连接。** 飞书用长连接，钉钉用 Stream，企业微信的通知和交互用智能机器人长连接。Webhook 只在 DMZ 部署里作为可选项。这样不需要公网地址、证书和白名单，符合零配置原则。
2. **长连接做成平台常驻的「IM 通道」，不放进连接器。**
   - 一个 IM 应用连接对应一个通道。飞书多实例可以并存，每条消息随机投给一个实例；钉钉也允许多条连接，投递方式文档没写明，需实测；企业微信智能机器人用 `distributedLock` 选主，备用实例待命。
   - 收到消息先入队，在时限内确认（飞书 3 秒，企业微信卡片事件 5 秒），再异步处理；按 `event_id` 去重。
   - 通道状态（在线与否、最后一条事件时间、最后一次卡片回调时间、重连次数）进「网络与信创」体检页；通道断开算一种「没有动静」，进问题中心。
3. **测试环境和生产环境必须用不同的 IM 应用。** 连接替换（`platform-inventory.md` §1.7）要校验：同一个 App ID 或 BotID 不能同时绑在测试和生产上，否则事件会被随机分走。
4. **卡片自己说清楚，按钮只放能安全重复点的动作。** 卡片写明业务影响、原因、谁能修、下一步是什么。按钮限「重新检查」「我已处理」「预演补到位」这类幂等动作，操作人用 IM 回调里的身份（飞书 `open_id`、钉钉回调里的用户 ID、企业微信 `open_userid` 换成的 userid）映射到平台成员或对方管理员，并写进审计。执行补到位要在卡片上二次确认。要登录才能做的（放行批量停用、确认结果未知）放在控制台。链接按端配置：桌面端指向内网控制台；「能出网不能入网」下移动端声明不跳转，显示「请在电脑上打开」。
5. **企业微信分两条腿走。** 通知和交互走智能机器人（长连接）；通讯录读写走自建应用（出站，配可信 IP）；通讯录变更事件在这种形态下拿不到，靠定时全量读取和对账。体检页显示当前出口 IP，提示填进企业可信 IP。主动推送要求对方先在会话里发过消息，所以接入向导里要有一步「在 HR 群里 @机器人 一次」。
6. **「对外入口地址」和「控制台地址」分开配置。** DMZ 只暴露 Webhook、IM 回调、可选的 MCP 路径和移动处理页，控制台留在内网。体检页能导出反向代理的路径清单，以及飞书出口 IP、企业微信回调 IP 段的白名单片段。
7. **纯内网时如实降级。** IM 渠道显示「这个部署连不到飞书、钉钉、企业微信」及原因，退到站内通知和内网邮件（没配 SMTP 时显示未启用），不报错。
8. **事件只当加速器，不当真相。** 飞书最多重推 4 次，回调不补推，企业微信卡片事件不重发，钉钉 `LATER` 的语义未查清。任何靠 IM 事件触发的结果，都要有定时读取和对账兜底。

### 对设计的含义

- 要给「IM 通道」在对象模型里找一个位置。它和连接（凭证）是两回事：同一个飞书连接既用来调 API（出站），又持有一条常驻的入站通道。告警渠道（群机器人 Webhook）只是这条通道的降级形态。
- 第四版原型的「接入飞书」向导要按部署形态分叉。默认选长连接：先让平台的长连接上线并显示状态，再引导管理员去飞书后台保存订阅方式（飞书要求保存时客户端在线）。DMZ 用户才看到 Webhook 地址和白名单。
- 「谁能修」的交接卡片（`design-inputs.md` 第 4 节第 3 问）在「能出网不能入网」下是可行的：飞书、钉钉走长连接回调，企业微信走智能机器人。前提是不靠打开链接。
- 原则 6「对方系统的约束，由平台吸收」要加上 IM 侧的几条：一个飞书应用一个事件地址、50 条连接随机投递、企业微信机器人单连接、3 秒和 5 秒时限、卡片 token 30 分钟内最多更新 2 次。

---

## 2. AI 客户端对 MCP 的支持

### 2.1 编码助手

| 产品 | MCP 客户端在哪运行 | 传输 | 鉴权 | 能否连内网 MCP | 在中国大陆用模型 |
| --- | --- | --- | --- | --- | --- |
| Trae CN（TraeCode IDE） | 本机；TRAE Work 的云端任务在云上 | stdio、SSE、Streamable HTTP | `headers`、`env`；项目级 `.trae/mcp.json` | 本机能访问就能连；云端任务不行 | 国内版直连，内置国产模型 |
| Qoder CN（原通义灵码） | 本机插件；QoderWork CN 桌面应用 | 插件文档只列 STDIO、SSE，最多同时连 10 个服务；QoderWork CN 支持 Streamable HTTP 加 Headers | `env`、Headers | 本机能访问就能连 | 国内 |
| 腾讯云 CodeBuddy（IDE、插件、CodeBuddy Code CLI） | 本机；CLI 有本地沙箱和云端沙箱两种 | stdio、SSE、HTTP（流式） | `headers`（支持 `${ENV}` 展开）、OAuth；可按 MCP 工具设 allow、deny、ask | 本机能访问就能连；文档示例连的是 `mcp-oa.tapd.woa.com`（腾讯办公网域名，【推断】是内网服务） | 国内；厂商自述企业版支持私有化和代码不上云 |
| 文心快码 Comate | 本机插件 | STDIO、SSE、Streamable HTTP | 未查到请求头写法；默认每次调用要用户批准 | 本机能访问就能连 | 国内 |
| Cursor | 本机 | stdio、SSE、Streamable HTTP | `headers`、OAuth（动态注册或静态 client） | 本机能访问就能连 | 模型方不服务的地区直接不显示这些模型，自带 Key 也可能失败 |
| Claude Code | 本机（网页版在云上） | stdio、HTTP（Streamable）、SSE（已弃用）、WebSocket | `--header`、OAuth；项目级 `.mcp.json` 要逐个批准 | 本机能访问就能连 | Anthropic 不服务中国大陆；客户端可接国产兼容端点 |

来源：Trae（[MCP 概览](https://docs.trae.cn/ide_model-context-protocol.md)、[添加 MCP Server](https://docs.trae.cn/ide_add-mcp-servers.md)、[TraeWork MCP 概述](https://docs.trae.cn/work_mcp-overview.md)）；Qoder CN（[更名说明](https://help.aliyun.com/zh/lingma/product-overview/introduction-of-lingma)、[插件配置 MCP](https://help.aliyun.com/zh/lingma/user-guide/guide-for-using-mcp)、[QoderWork CN 接入钉钉 MCP](https://help.aliyun.com/zh/lingma/qoderwork-cn/user-guide/mcp)）；CodeBuddy（[CLI MCP](https://www.codebuddy.cn/docs/cli/mcp)、[llms.txt](https://www.codebuddy.cn/llms.txt)）；文心快码（[MCP](https://cloud.baidu.com/doc/COMATE/s/3msr9pbuy)，2026-08-14 更新）；Cursor（[MCP](https://cursor.com/docs/mcp)、[Regions](https://cursor.com/docs/account/regions)）；Claude Code（[MCP](https://code.claude.com/docs/en/mcp)）。

**模型可用性的几条原文**

- Cursor：「Some of our model providers have location-based restrictions」，不可用的模型「won't appear in Cursor」；自带 Key 时「If the provider blocks your region, calls may still fail even with your own key」（[Regions](https://cursor.com/docs/account/regions)）。
- Anthropic 的[支持地区列表](https://platform.claude.com/docs/en/api/supported-regions)不含中国大陆、香港、澳门。2025-09-04 起，又禁止「more than 50% owned, directly or indirectly, by companies headquartered in」不支持地区的企业使用（[Anthropic 公告](https://www.anthropic.com/news/updating-restrictions-of-sales-to-unsupported-regions)）。
- DeepSeek 官方提供 Anthropic 格式的接口，`base_url` 是 `https://api.deepseek.com/anthropic`，并单独写了「将 DeepSeek 模型接入 Claude Code」（[使用 Anthropic API](https://api-docs.deepseek.com/zh-cn/guides/anthropic_api)）。客户端技术上能用，是否合规需法务确认。

**几点观察**

- 六家都把 MCP 客户端放在开发者电脑上，内网 MCP 能不能连，只取决于这台电脑的网络。真正的限制在云端执行的形态：TRAE Work 云端任务、Claude Code 网页版、Cursor 的云端智能体（Background Agents）。
- 传输方式的最大公约数是 Streamable HTTP 加请求头鉴权。Qoder CN 插件是例外，文档只写了 SSE。
- 项目级配置文件（`.trae/mcp.json`、`.comate/mcp.json`、`.mcp.json`）已经是通用做法。也就是说，「把平台的 MCP 地址写进仓库」是集成工程师最自然的接入方式。

### 2.2 IM 里的 AI 助手

| | 飞书 aily（智能伙伴） | 钉钉 AI 助理（DEAP） | 企业微信智能机器人 |
| --- | --- | --- | --- |
| 能否添加外部 MCP | 能。对话框左侧「+ > 工具管理 > 添加工具 > 添加自定义 MCP 工具」，贴 URL，「传输方式选择 HTTPStreaming」；也能把飞书集成平台发布的 MCP 加进 aily 工作助手 | 能。DEAP 里「添加技能 > 新建MCP服务」，填名称、描述和 HTTP URL，「MCP检测」通过后发布；MCP 广场号称 6000 多个服务 | 普通模式能否挂外部 MCP：未查到。API 模式下消息转给你自己的 Agent，由它决定调什么 |
| 鉴权 | 飞书项目的例子把 `mcpKey`、`userKey` 放在查询参数里；aily 界面能否填请求头：未查到。集成平台发布的 MCP，凭证可以「开发者配置」或「使用者配置」 | DEAP 能否填请求头：未查到；钉钉自己的 MCP「一般无需额外配置」请求头（QoderWork CN 文档） | 不适用 |
| 能否碰到内网 | 直接不行，调用从飞书云上发起。飞书自己的路径是「自建连接器配合本地代理服务」，再封装成 MCP | MCP 不行。AI 助理的「自定义能力」可以在 OpenAPI 描述里写 `x-dingtalk-protocol: stream`，经 Stream 调到内网服务；「直通模式」把消息经 Stream 转给自己的 Agent | 能。长连接把消息拉进内网，内网的 Agent 再调内网 MCP |
| 反过来，IM 作为 MCP 服务端 | 飞书 OpenAPI MCP；远程飞书 MCP Server「内测中」 | 钉钉 MCP（文档、日历、通讯录、待办等） | 企业微信 MCP：成员按能力逐项授权，复制 Streamable HTTP URL 或 JSON 配置；「当前文档权限有效期为 7 天，到期需重新授权」；独立复现记录称 MCP 地址里的 apikey 不能当长连接 Secret 用，是两套凭证 |

来源：飞书 aily（[飞书项目：通过插件体系调用 MCP Server](https://project.feishu.cn/b/helpcenter/1p8d7djs/73n2upf3)、[aily：「集成平台」生成 MCP 服务](https://aily.feishu.cn/hc/1u7kleqg/1u2nhgav)、[飞书 MCP 文档索引](https://open.feishu.cn/llms-docs/zh-CN/llms-mcp.txt)）；钉钉（[MCP 服务概述](https://open.dingtalk.com/document/development/mcp-square-introduction)、[Deap 平台使用 MCP 服务](https://open.dingtalk.com/document/development/dingtalk-deap-platform-using-mcp-services)、[AI 助理直通模式教程](https://open-dingtalk.github.io/developerpedia/docs/explore/tutorials/assistant_ability/passthrough_mode/python/step-3-open_passthrough)）；企业微信（[MCP 概述](https://developer.work.weixin.qq.com/document/path/101763)、[快速入门](https://developer.work.weixin.qq.com/document/path/101785)、[一份 2026-09-20 的独立复现记录](https://gist.github.com/acmerfight/7b3c0d6dd58b62cd296b2756144983df)）。

**补充**

- aily 帮助文档里，集成平台封装的 MCP 控制可用范围这一项写着「本功能目前还未上线」；拿使用者身份，目前只能拿到飞书系连接器里的 `open_id`。
- 钉钉直通模式的限制：参数「必须且只能附带 `x-dingtalk-context` 属性来从上下文中获取，不能含有需要大模型提取的参数」，「AI 助理下面只能定义一个描述文件且只能定义一个接口」。这是转发通道，不是工具市场。
- 企业微信的「MCP」方向和我们要的相反：它是企业微信把自己的数据开放给外部 AI 工具，不是机器人去调用外部 MCP。

### 2.3 和我们 MCP 服务端的兼容性

现状（`packages/server/api/src/app/mcp-service/mcp-endpoint.controller.ts`、`mcp-service.service.ts` 的 `authenticate`）：

- 只接受 POST 的 JSON-RPC，GET、DELETE 返回 405，也就是无状态的 Streamable HTTP，没有 SSE。
- 凭证只能放在 `Authorization: Bearer` 头里，个人 Key（`mcp_sk_`）或服务令牌。地址里不放凭证。

下表是按各家文档和源码做的判断，都没有实测。

| 客户端 | 能否直接连上 | 卡点 |
| --- | --- | --- |
| Claude Code、Cursor、Trae CN、CodeBuddy、QoderWork CN | 应该能 | 文档都支持 Streamable HTTP 加请求头 |
| 文心快码 | 很可能能 | 请求头写法未查到，需实测 |
| Qoder CN 插件 | 不确定 | 文档只列 STDIO、SSE，需实测 |
| Dify（客户自托管） | 能，要改配置 | 只支持 HTTP 传输，支持 OAuth 和自定义请求头（[Dify Tools](https://docs.dify.ai/en/self-host/use-dify/workspace/tools)）；默认 squid 规则 `http_access deny to_private_networks`（[`squid.conf.template`](https://github.com/langgenius/dify/blob/main/docker/ssrf_proxy/squid.conf.template)），要放行平台的内网地址 |
| FastGPT（客户自托管） | 能 | 默认 `CHECK_INTERNAL_IP=false`（[`.env.template`](https://github.com/labring/FastGPT/blob/main/projects/app/.env.template)），不拦私网；但拦回环地址，而且「MCP requests through an HTTP proxy are not supported」（[`mcp.ts`](https://github.com/labring/FastGPT/blob/main/packages/service/core/app/mcp.ts)） |
| MaxKB（客户自托管） | 能 | 只允许 `transport=sse` 或 `streamable_http`，可带 headers（[`config.py`](https://github.com/1Panel-dev/MaxKB/blob/v2/apps/common/mcp/config.py)） |
| Coze Studio 开源版 | 不能 | MCP 调用未实现（见 3.1） |
| 飞书 aily、钉钉 DEAP | 只有 DMZ 部署才有可能 | 要公网可达；能否填请求头未查到，可能只接受地址里带 key |

### 对设计的含义

1. **把 MCP 的接入分成两条路。** 默认路径是内网客户端：编码助手，以及客户自己部署的 MaxKB、Dify、FastGPT。这条路零配置可用。另一条是 SaaS AI 助手（aily、DEAP），只在 DMZ 部署里作为可选项，并且默认只开放只读工具。
2. **补一个兼容层，但主路径不变。** Streamable HTTP 加 Bearer 头仍是主路径。对只能贴地址的客户端，提供一种受限形态：凭证在地址里，只含只读工具，可设到期时间、来源 IP 白名单，随时吊销，每次调用进审计。SSE 老传输要不要做，等 Qoder CN 插件实测后再定。
3. **身份要能透传。** 编码助手用个人 Key（已有，决定 000034）。AI 平台代表很多员工调用，学 FastGPT 的「身份代理」：服务 Key 加一个身份断言头（`x-fastgpt-auth-proxy-username` 那种），断言的身份要能对上平台成员或 IM 身份；没有身份断言时只给只读工具。
4. **写操作不靠 AI 客户端的确认弹窗。** 「补到位」被 AI 调用时，先返回预演结果，同时推一张 IM 确认卡（走长连接回传），由人点确认后才执行。审计记「经 AI · 客户端名 · 代谁」。客户端的确认行为差异太大：文心快码默认每次批准，CodeBuddy 可以设成 allow。
5. **「HR 在 IM 里问」先做成不需要模型的版本。** 机器人收到「查 E10231」这类确定性指令，直接回一张台账卡片；有模型连接，或客户已经有 MaxKB、Dify 时，再让它们当对话前端，调我们的 MCP。这样没配模型也能用（`.claude/rules/self-hosting.md`、ADR 0019）。
6. **搭建侧 AI 的验证对象要换。** 首发在 Trae CN、CodeBuddy、文心快码、Qoder CN 加国产模型（DeepSeek、通义千问、Kimi、GLM）上验证工作流的代码表示、校验和预演链路（`ai-native.md` 结论 3）。Claude Code 是开发者自选，不作为默认假设。
7. **接入文档按客户端写配置片段。** Dify 的 squid 放行规则、FastGPT 不能走代理、MaxKB 的传输名、项目级 `mcp.json` 的写法，都写成平台「MCP 服务 → 使用方式」页上能复制的内容。

---

## 3. 「工具层」方向：Dify、Coze Studio、FastGPT、MaxKB

### 3.1 工作流、插件和 MCP

| | Dify | Coze Studio 开源版 | FastGPT | MaxKB |
| --- | --- | --- | --- | --- |
| 许可 | 改版 Apache 2.0：「one tenant corresponds to one workspace」，运营多租户要商业授权；不能去掉前端 LOGO | Apache 2.0 | 改版 Apache 2.0：不能运营「similar to the FastGPT」的多租户 SaaS，不能去掉 LOGO | GPL-3.0 |
| 活跃度（截至 2026-10-01） | 2026 年 9 月单月提交 100 次以上，最新 1.17.1（2026-09-10） | 2026 年以来 17 次提交（2025 年下半年 100 次以上），最后一次 2026-07-29 | 仍在持续推送 | 2026-09-03 发 v2.10.6 LTS |
| 工作流和触发 | Workflow、Chatflow；触发器有定时、集成（插件）、Webhook；Human Input 节点经网页或邮件送达 | 工作流、插件、知识库、数据库；2025 Q4 路线图正文里，工作流导入导出、平台管理员角色都是「Not Started」（之后是否更新未核实） | 可视化工作流、HTTP 节点、系统工具 | 「高级智能体」就是工作流；工具有自定义 Python 脚本、MCP、Skills、数据源、工作流类工具；触发器有定时（Cron）和事件 |
| MCP 客户端 | 「Only MCP servers with HTTP transport are supported」；OAuth（默认动态注册）或自定义请求头，请求头还能透传触发请求里的值 | `invocation_mcp.go` 直接返回「mcp call not implemented」；路线图「Plugin Support for MCP Client」为 Not Started | v4.9.6 起有「MCP 工具集」；源码里 Streamable HTTP 连不上就回退 SSE，可带请求头 | 只允许远程的 `sse` 或 `streamable_http`，可带 headers 和超时 |
| MCP 服务端 | 每个应用一个 MCP 地址，「contains authentication credentials」 | 发布页有 MCP 配置按钮（前端），后端未核实 | 可把多个应用组成一个 MCP server；Streamable HTTP（私有化另有 SSE）；地址里的 key 就是执行凭证；有「身份代理」请求头 | 有 `/chat/api/mcp` 端点（发布说明里的修复记录） |
| 出站访问内网 | 默认 squid 拦私网，要改配置 | README 提醒公网部署有 SSRF 和 API 越权风险 | 默认不拦私网，拦回环；MCP 不能经 HTTP 代理 | MCP 在沙箱里调用；默认拦截策略未查到 |

来源：Dify（[Trigger](https://docs.dify.ai/en/self-host/use-dify/nodes/trigger/overview)、[Webhook Trigger](https://docs.dify.ai/en/self-host/use-dify/nodes/trigger/webhook-trigger)、[Publish as MCP Server](https://docs.dify.ai/en/self-host/use-dify/publish/publish-mcp)、[Tools · MCP](https://docs.dify.ai/en/self-host/use-dify/workspace/tools)、[LICENSE](https://github.com/langgenius/dify/blob/main/LICENSE)）；Coze Studio（[README](https://github.com/coze-dev/coze-studio)、[Q4 2025 Roadmap](https://github.com/coze-dev/coze-studio/issues/2218)、[`invocation_mcp.go`](https://github.com/coze-dev/coze-studio/blob/main/backend/domain/plugin/service/tool/invocation_mcp.go)）；FastGPT（[MCP 工具集](https://github.com/labring/FastGPT/blob/main/document/content/guide/build/tools/mcp_tools.mdx)、[MCP 发布](https://github.com/labring/FastGPT/blob/main/document/content/guide/build/publish/mcp_server.mdx)、[LICENSE](https://github.com/labring/FastGPT/blob/main/LICENSE)）；MaxKB（[README](https://github.com/1Panel-dev/MaxKB)、[Releases](https://github.com/1Panel-dev/MaxKB/releases)）。活跃度来自 GitHub API 的提交和发布记录。

另外，Dify 的 Webhook 触发器和集成触发器都要求 `TRIGGER_URL`「Point it to a public domain or IP address reachable by the external systems」（[Webhook Trigger](https://docs.dify.ai/en/self-host/use-dify/nodes/trigger/webhook-trigger)、[Integration Trigger](https://docs.dify.ai/en/self-host/use-dify/nodes/trigger/plugin-trigger)）。它们在「能出网不能入网」下面对的入站问题，和我们一样。

### 3.2 幂等、重放、对账、审计上的空白

| | 幂等 | 重放 | 对账 | 审计和保留 |
| --- | --- | --- | --- | --- |
| Dify | 触发器去重、幂等键：未查到。HTTP 节点失败自动重试「up to 10 times」、间隔最多 5000ms，对不幂等的写接口会重复写 | 日志里的「Test With Params」只是在编辑器里用这次运行的输入重跑；生产环境重放、批量重跑：未查到 | 无 | 「Operation logs of each individual workspace member」只在企业版（[Dify Enterprise](https://dify.ai/pricing/dify-enterprise)）。运行日志「retained indefinitely by default」，开启清理后默认留 30 天（[Logs](https://docs.dify.ai/en/self-host/use-dify/monitor/logs)） |
| Coze Studio | 未查到 | 未查到 | 无 | 未查到；平台管理员角色还没开始做 |
| FastGPT | 未查到 | 未查到 | 无 | 「运行日志看板」「团队空间 & 权限」「SSO 登录」只在商业版（[商业版说明](https://github.com/labring/FastGPT/blob/main/document/content/guide/version/commercial.mdx)）；审计日志未查到 |
| MaxKB | 未查到 | 工具有「执行记录」，重放未查到 | 无 | 「系统操作日志」「完整的 RBAC」、扫码登录和单点登录只在专业版（[价格页](https://maxkb.cn/price)） |

Dify 的错误处理只有三种：停下、给默认值、走失败分支（[Handle Errors](https://docs.dify.ai/en/self-host/use-dify/build/predefined-error-handling-logic)）。没有「结果未知」，也没有「先读目标再决定写不写」的语义。

**安全上的旁证**：MaxKB 2026 年的发布说明里修过几个和工具层直接相关的漏洞：

- MCP 服务器配置缺校验导致 Shell 命令注入的远程代码执行（CVE-2026-39417）。
- 「MCP permission bypass」导致的认证后远程代码执行。
- Webhook 触发器端点缺认证，可以「trigger arbitrary tasks」。
- 「horizontal privilege escalation caused by defective MCP tool authorization logic」。

（[MaxKB Releases](https://github.com/1Panel-dev/MaxKB/releases)）

把企业系统写权限交给这类平台，风险是真实存在的。

### 3.3 国内自托管 AI 场景里，买方怎么比较它们和集成平台

**能直接看到的证据（都来自厂商）**

- MaxKB 官网专门做了[与 n8n 的对比页](https://maxkb.cn/maxkb-vs-n8n)，开头就把两类东西分开：「MaxKB 更适合知识库问答、智能客服、业务 Copilot 和内部助手等企业业务型场景。n8n 更适合跨系统自动化、流程编排、API 连接与集成建设，AI 往往是流程中的一部分。」它给买方的决定因素是「案例验证、售后支持、价格透明和权限治理」。
- [与 Dify 的对比页](https://maxkb.cn/maxkb-vs-dify)把差异定为「企业交付闭环与治理深度」，Dify 被定位为「通用 AI 应用开发平台」。
- 价格锚点：
  - MaxKB 专业版「￥4.8万 元 / 套（永久授权）」，含一年维保，第二年起每年 9600 元；企业版加多租户、集群和 7x24 支持（[价格页](https://maxkb.cn/price)）。
  - 「接入第三方应用（企业微信智能机器人、企业微信应用、钉钉、飞书应用…）」也在专业版。
  - FastGPT 商业版 Sealos 全托管「10000 元起/月」，自有服务器部署要询价（[商业版说明](https://github.com/labring/FastGPT/blob/main/document/content/guide/version/commercial.mdx)）。
- 一体机：MaxKB 和超聚变一起卖[一体机](https://maxkb.cn/appliance)，GB10 硬件，本地跑 Qwen3.6-35B-A3B，软件是 MaxKB 专业版加 1Panel 企业版，卖点是「数据不出域」。MaxKB 自称「1000+ 付费客户数」「100万+ 免费安装量」（[官网](https://maxkb.cn/)）。
- 第一轮调研里，iPaaS 的选型坑第一条就是一致性：「只会重试不够，要验证幂等、补偿、写入后比对」（`users-and-scenarios.md` §4.3，S35）。

**【推断】买方的比较方式**

1. 两类东西在不同的预算、不同的问题下被比较。AI 平台（常常和一体机、国产模型一起）按「知识问答和智能体能不能落地、治理、原厂服务、价格」来比；集成平台按「连接器、一致性、权限、高可用、五年总成本」来比。
2. AI 平台能调 HTTP、Python 和 MCP，POC 时「能接上业务系统」就算过关。「接得稳」（幂等、重放、对账）不在它们的比较表里，买方也不会拿这一项去考它们。
3. 所以买方很可能会问「Dify 都能调接口了，为什么还要集成平台？」。能回答这个问题的，是第一轮的「到位」证据：本月入职 32 人全部开通、离职 5 人全部停用、差异为 0。而不是工具数量。
4. 治理在这些产品里是付费档：Dify 企业版的成员操作日志，FastGPT 商业版的运行日志看板和团队权限，MaxKB 专业版的系统操作日志和 RBAC。我们没有版本之分（ADR 0002），审计、角色、保留期都在核心，在这类比较里是看得见的差异。

这几条都需要访谈验证，见文末清单。

### 3.4 互补还是替代

**结论：互补。但「受治理的企业系统工具层」只能做结果台账的出口，不能单独成为方向。**

**为什么不能单独成为方向**

- **工具层本身正在被商品化。**
  - 飞书集成平台把「140+ 连接器」和工作流封装成 MCP，加进 aily；内网系统用「自建连接器配合本地代理服务」接进来（[aily 帮助](https://aily.feishu.cn/hc/1u7kleqg/1u2nhgav)）。
  - 钉钉 MCP 广场有 6000 多个服务。企业微信把文档、日程、会议、通讯录开放成了 MCP。
  - Dify、FastGPT、MaxKB 自带 HTTP 节点、Python 工具、插件和 MCP 客户端。
  - 「把北森、飞书的接口包成 MCP 工具」没有护城河，比下去就是比工具数量。而工具多了反而有害，单个服务器超过 15 到 20 个工具，选择准确率明显下降（`ai-native.md` 结论 5）。
- **这些平台缺的，恰好是工具层自己补不上的东西。** 幂等、重放、对账、审计（3.2）都要「按业务键记住每条记录的应有结果和经过」，这正是台账。只做工具层，等于给它们一把能写企业系统、但写了不知道结果的钥匙，MaxKB 的那几个漏洞说明这把钥匙本身也不安全。

**为什么是互补，而不是两个东西各做各的**

- **工具的价值来自台账。**
  - 最适合交给智能体的写工具，是「对这个业务键补到位」：读源的当前状态，再走一遍处理工作流，天然幂等，可以先预演（`design-inputs.md` 原则 7）。
  - 最适合交给 HR 的读工具，是「这个人的结果到位没有、卡在谁手里、等了多久」。
  - 没有台账，工具只能是「调一次飞书创建用户」：重试会撞 41001，失败了没人知道。
- **台账需要这些平台当入口。**
  - 它们已经在客户内网里，已经接了 IM 机器人（MaxKB 专业版接企业微信、钉钉、飞书）。HR 和 IT 本来就在那里提问。
  - 「能出网不能入网」的客户，IM 消息要靠长连接拉进内网，最可能接住这些消息的，就是客户已经部署的 MaxKB、Dify、FastGPT（第 2 节）。
- **买方的两份预算也不冲突。** AI 平台的钱花在「对话和判断」，集成平台的钱花在「结果到位并留下证据」【推断】。

**会变成替代的条件（要避免）**

- 我们去做知识库、对话界面或智能体编排：那是 MaxKB、Dify 的主场，也违背 ADR 0019 的边界。
- 我们把工具做成连接器操作的平铺：和 IM 厂商、AI 平台自带的工具正面重叠。
- 我们的写工具没有预演、确认和审计：买方分不出我们和「Dify 里的一个 HTTP 节点」有什么区别。

### 对设计的含义

1. **在方向 C 里写明「对外出口」。** MCP 工具就是台账的读写接口，数量控制在 10 个以内：
   - 按业务键查结果和经过；
   - 列出未到位并按到期排序；
   - 解释原因和谁能修；
   - 预演补到位；
   - 执行补到位（要人在 IM 卡片上确认）；
   - 查问题和「等待对方」的状态。
   
   单个连接器操作默认不开放成工具。ADR 0019 写的是「单个连接器操作要先包成工作流再开放」，但现在的代码允许直接把连接器操作做成工具（`mcp-tool-sources.ts` 按 `connectorName`、`actionName` 加载），需要收口。
2. **首发验证「AI 平台 → 我们」这条路，而不是画聊天界面。** 第四版原型画一条路径：HR 在企业微信里问「张三怎么没账号」，客户内网的 MaxKB 调我们的「查结果」工具，回一张台账卡片（等待飞书管理员开权限范围，已等 2 小时）；HR 点「再处理一次」，弹出预演和确认，执行后台账变成「已到位」。
3. **给三家 AI 平台各写一份接入说明。** Dify 放行私网段，FastGPT 不能走代理，MaxKB 用 `streamable_http` 加请求头。这些放进平台「MCP 服务 → 使用方式」，不只放在文档站。
4. **定价和包装上，把治理放在明面。** 对比 MaxKB 专业版、Dify 企业版、FastGPT 商业版里付费才有的操作日志、RBAC、SSO，我们的说法是「让你已经买的 AI 平台，安全地动企业系统，并且每一次都有证据」。
5. **用台账的数据证明工具层的价值。** 经 AI 发起的补到位次数、被预演或确认拦下的次数、AI 查询命中的业务键数，进月度到位报告。这比「接了多少个工具」有说服力。
6. **不要把 AI 平台的工作流当竞争对象。** 它们是处理工作流之外的调用方。台账要能把「经 AI 调用」和「经人调用」一视同仁地记进经过时间线。

---

## 未查到与需实测

**部署与网络**

1. 目标客户里三种部署形态各占多少，「能出网不能入网」是不是多数（访谈）。
2. 企业 HTTP 代理是否放行到飞书、钉钉、企业微信的 WebSocket 长连接；三家 SDK 在代理下能否稳定重连（实测）。飞书 Node SDK 接受 `agent` 参数，钉钉、企业微信的 Node SDK 未核实。
3. 飞书私有化、专有钉钉、政务微信这类私有化 IM，是否支持长连接和卡片回调（未查到）。
4. 企业微信：新建自建应用的回调 URL 有没有域名主体校验；配置企业可信 IP 是否必须先验证可信域名或接收消息 URL；出口 IP 变化时除了 60020 还有什么表现（实测）。
5. 企业微信群机器人（消息推送）的模板卡片能否回调：文档目录里有「消息推送回调说明（内测）」，未读到正文（实测）。
6. 钉钉 Stream 返回 `LATER` 后的重推间隔和次数、断线期间事件是否保留、卡片回调的响应时限（实测）。
7. 手机装了企业 VPN 或零信任客户端时，飞书、钉钉、企业微信的内置浏览器能否访问内网地址（实测，可能因 VPN 产品而异）。

**AI 客户端**

8. aily 自定义 MCP 能否填请求头，能否在 IP 白名单后面工作（aily 的出口 IP 未查到）；DEAP「新建MCP服务」支持哪些鉴权方式（实测）。
9. Qoder CN 插件是否已支持 Streamable HTTP（文档只写 STDIO、SSE）；文心快码的请求头配置写法（实测）。
10. 国产模型（DeepSeek、通义千问、Kimi、GLM）在我们的 MCP 工具上的调用准确率，特别是带业务键、要先预演再确认的两步写操作（实测）。
11. 用 Claude Code 客户端加国产模型端点，在国内企业里是否被法务接受（访谈、法务）。
12. 企业微信智能机器人普通模式能否挂外部工具或 MCP（未查到）。

**「工具层」与买方**

13. 自托管 AI 平台的买方，是否把系统对接单独立项、单独预算；一体机采购时是否顺带要求「对接业务系统」（访谈）。
14. 客户现有的 MaxKB、Dify、FastGPT 部署有多普遍，是否已经接了 IM 机器人（访谈）。
15. 买方在比较 AI 平台时，会不会问幂等、重放、对账；还是只问「能不能接上」（访谈）。
16. Coze Studio 开源版 2026 年活跃度明显下降，是否已不再作为国内自托管的主流选择（访谈；本轮只有提交数据）。
