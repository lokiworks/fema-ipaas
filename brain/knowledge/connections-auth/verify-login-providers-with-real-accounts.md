---
icon: 🧪
---

# 用真实账号验证登录方式

短信、企业微信、钉钉、平台扫码应用和 SAML 目前只在模拟服务上测过。拿到真实账号后，按下面的步骤各走一遍。每一步都要留截图，一旦失败，把 API 日志里 `sso` 或 `sms` 开头的错误一并记下来。

所有回调地址都以 `FEMA_FRONTEND_URL` 开头：

- **单点登录回调**：`<FEMA_FRONTEND_URL>/api/v1/authn/sso/callback`。飞书、企业微信、钉钉、OIDC 共用这一个地址，要原样登记在对方后台。
- **SAML ACS**：`<FEMA_FRONTEND_URL>/api/v1/authn/sso/saml/acs`。
- **SAML SP 元数据**：`<FEMA_FRONTEND_URL>/api/v1/authn/sso/saml/metadata/<租户 id>`。

## 短信（阿里云、腾讯云）

1. 在服务商后台申请签名和验证码模板。模板必须**恰好一个变量**，就是验证码；多一个变量，服务商会拒绝发送。
2. 运营后台 → 实例设置 → 短信：填好 AccessKey、签名、模板编号。腾讯云还要填 SdkAppId 和地域。
3. 点「测试发送」，填自己的手机号，确认能收到。只有测试通过，登录页才会显示短信登录。
4. 退出登录，用手机号登录：收到验证码，进入工作台。
5. 再验证两种拒绝：
   - 同一个号码 60 秒内重发，会被拒。
   - 租户关闭手机号登录后，登录页提示"没有开启手机号登录"。

## 企业微信、钉钉（租户自建应用）

1. **企业微信**：在管理后台建一个自建应用，记下 CorpID、AgentId、Secret。再把「网页授权及 JS-SDK」的可信域名，以及「企业微信授权登录」的回调域，设成 `FEMA_FRONTEND_URL` 的域名。
2. **钉钉**：在开放平台建一个企业内部应用，记下 AppKey、AppSecret。在「登录与分享」里，把回调地址登记成上面的单点登录回调。
3. 租户管理后台 → 单点登录：填好对应的卡片，点「测试登录」，用自己的账号走完全程。只有测试通过，才能把它打开。
4. 退出登录，从登录页的按钮进入，确认落在正确的租户里，账号姓名也和对方一致。

## 平台扫码应用（飞书、企业微信、钉钉）

1. 先在各平台以服务商身份建好应用。企业微信走「服务商扫码登录」，`appId` 填服务商的 CorpID。
2. 运营后台 → 实例设置 → 平台登录应用：填写并打开。如果允许扫码自助建租户，还要同时打开实例的「开放自助注册」。
3. 验证三条路径：
   - **已绑定的企业**：先在某个租户的单点登录页点「关联你的企业」，扫码完成绑定；之后用这个企业的另一个人扫码，应该直接进入这个租户。
   - **没绑定、允许自助注册**：用新企业的人扫码，会新建一个租户，扫码人成为属主。
   - **没绑定、不允许自助注册**：扫码会被拒绝。
4. 还没核实的两件事：
   - 钉钉回调参数名到底是 `authCode` 还是 `code`。
   - 企业微信服务商接口 `get_login_info` 的返回字段。
   这两处在模拟服务里是按官方文档写的，跟真实返回对不上时，以真实返回为准去改 `sso/` 下对应的 client。

## SAML 2.0

1. 在身份提供方（Okta、Azure AD、Keycloak 等）新建 SAML 应用：Entity ID 用 SP 元数据地址，ACS 用上面的地址。
2. 租户管理后台 → 单点登录 → SAML：粘贴 IdP 元数据，配置邮箱属性。subject 可以用 NameID，也可以指定一个属性。
3. 点「测试登录」并走完全程，然后打开。
4. 再验证三种拒绝：
   - 换一个不属于这个应用的 IdP 用户。
   - 断言过期。
   - 元数据里的证书被换掉。
5. 签名 AuthnRequest 暂不支持，因为没有 SP 证书，所以不要在 IdP 侧强制要求签名请求。

## fema-iam（平台开通）

fema-iam 不需要为 ipaas 另开接口，开通方（比如 rental-saas 的租户初始化）在 fema-iam 里按下面的顺序替这家租户登记，再把结果交给 `POST /v1/platform/tenants`：

1. **ipaas 登录客户端**：
   - 在这家租户名下建应用，类型 `THIRD_PARTY_APP`，再由全局租户审批（租户自己审批会被拒）。
   - 建 `oauth-client`，设置如下：
     - 回调地址填上面的单点登录回调。
     - `requireAuthorizationConsent: false`。这个类型默认要同意页，不关的话每个成员首次登录都会被问一次。
     - 受众保持缺省的 `OWNER_TENANT`，即只接纳本租户。
   - 用 `oauth-client-credential/rotate` 取 `plainSecret`。这个类型带 refresh_token，ipaas 的会话复核要靠它。
2. **集成服务应用**：
   - 同样在这家租户名下建应用，类型 `CONFIDENTIAL_SERVICE`（`client_credentials`）。审批、建客户端、轮换密钥的步骤同上。
   - ipaas 的连接带 `tenant=<租户编码>` 换票。成员事件订阅也用它，所以它要能读成员对象，否则 fema 会把成员事件列进 `withheldEvents`。应用的读权限只能由平台在全局租户签（LICENSE 行），在租户名下授给应用会被拒（`OPERATION_FORBIDDEN`）。
   - 订阅请求体里的 `events` 是 fema 的列表字段，wire 形状是 `{"value":[...]}`，写成裸数组会被拒（400 `FEMA_RUNTIME_REQUEST_BODY_MALFORMED`）。
3. **重试**：
   - 应用编码全局唯一，重复建应用会返回「已存在」，这时改为读取已有的那条。
   - 密钥只在轮换时出现一次，所以每次重试都要轮换，并把新密钥交给 ipaas。ipaas 以最后一次为准。

fema-iam 的 id_token 和 userinfo 只在申请了 `email` 范围、并且邮箱已验证时，才给 `email` 和 `email_verified`。ipaas 开通时默认申请 `openid email profile`。成员被移出后，fema-iam 续期时返回 `invalid_grant`，ipaas 的复核据此让会话失效。
