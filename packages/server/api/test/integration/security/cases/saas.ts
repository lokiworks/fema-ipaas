import { TenantMfaPolicy, TenantRole } from '@fema-ipaas/shared'
import { identitySeed } from '../support/identity-seed'
import { MatrixCase } from '../support/matrix'
import { DomainModule, Review } from '../support/route-review'

const uniqueDomain = (): string => `matrix${Date.now()}${Math.floor(Math.random() * 1_000_000)}.test`

const ssoCommonBody = (): Record<string, unknown> => ({
    enabled: false,
    displayName: '',
    allowedDomains: [],
    autoCreateUsers: true,
    defaultRole: TenantRole.MEMBER,
    roleMapping: null,
    defaultProject: null,
})

const saasCases: MatrixCase[] = [
    {
        id: 'POST /v1/tenant-access/sso/wecom',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'POST', url: '/v1/tenant-access/sso/wecom', body: { ...ssoCommonBody(), corpId: 'ww_matrix', agentId: '1000001', secret: 'matrix-secret' } } }),
    },
    {
        id: 'POST /v1/tenant-access/sso/dingtalk',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'POST', url: '/v1/tenant-access/sso/dingtalk', body: { ...ssoCommonBody(), appKey: 'ding_matrix', appSecret: 'matrix-secret', corpId: null } } }),
    },
    {
        id: 'POST /v1/tenant-access/login-security/mfa-policy',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'POST', url: '/v1/tenant-access/login-security/mfa-policy', body: { mfaPolicy: TenantMfaPolicy.OPTIONAL } } }),
    },
    {
        id: 'POST /v1/tenant-access/members/:id/reset-mfa',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => {
            const user = await identitySeed.tenantUser({ world, scope })
            return { request: { method: 'POST', url: `/v1/tenant-access/members/${user.id}/reset-mfa` }, state: { userId: user.id } }
        },
    },
    {
        id: 'GET /v1/users/me/security',
        access: { type: 'authenticated' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/users/me/security' } }),
    },
    {
        id: 'GET /v1/tenant-domains',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/tenant-domains' } }),
    },
    {
        id: 'POST /v1/tenant-domains',
        access: { type: 'tenantAdminSelf' },
        prepare: async () => ({ request: { method: 'POST', url: '/v1/tenant-domains', body: { domain: uniqueDomain(), purpose: 'LOGIN_DISCOVERY' } } }),
    },
    {
        id: 'POST /v1/tenants/:id/slug',
        access: { type: 'tenantAdmin' },
        prepare: async ({ world, scope }) => ({
            request: { method: 'POST', url: `/v1/tenants/${world.scopes[scope].tenant.id}/slug`, body: { slug: `matrix-${Date.now()}-${Math.floor(Math.random() * 1000)}` } },
        }),
    },
]

const operatorReview = (note: string): Review => ({ verdict: 'ok', note })
const OPERATOR_ONLY = '路由挂 preHandler 调 instanceOperator.assert：令牌必须是 USER 且其身份 instanceRole 为 OPERATOR，其他一律 403；不取任何客户端传来的租户作安全边界'
const PLATFORM_ONLY = '路由 public，自带 preHandler platformAuth：Bearer 必须是未吊销的 fpk_ 密钥或受信 issuer 的已验签 JWT，且持有该路由的 PlatformScope，否则 401；受信 issuer 只能操作 externalIssuer 与自己一致的租户（platform-access.utils）'

const PUBLIC_AUTH_FLOW = '未登录的认证流程接口，带认证限流'

const saasReviews: Record<string, Review> = {
    'GET /v1/operator/sms-settings': operatorReview(`${OPERATOR_ONLY}；密钥只返回 hasAccessKeySecret`),
    'POST /v1/operator/sms-settings': operatorReview(`${OPERATOR_ONLY}；密钥 encryptUtils 加密后存 flag 表`),
    'POST /v1/operator/sms-settings/test': operatorReview(`${OPERATOR_ONLY}；只向运营者填写的号码发一条验证码，测试通过才写 verifiedAt`),
    'GET /v1/operator/platform-login-apps': operatorReview(`${OPERATOR_ONLY}；密钥只返回 hasAppSecret`),
    'POST /v1/operator/platform-login-apps/:kind': operatorReview(`${OPERATOR_ONLY}；密钥加密存 flag 表 PLATFORM_LOGIN_CONFIG`),
    'DELETE /v1/operator/platform-login-apps/:kind': operatorReview(OPERATOR_ONLY),
    'GET /v1/authentication/captcha/challenge': operatorReview(`${PUBLIC_AUTH_FLOW}；只发无状态的工作量证明题，签名由 JWT 密钥派生，用过的题记在 Redis 防重放`),
    'POST /v1/authentication/sms/request': operatorReview(`${PUBLIC_AUTH_FLOW}；先过人机验证，按号码 60 秒重发、每天 10 条；不论号码是否有账号都返回 204，不能用来探测账号`),
    'POST /v1/authentication/sms/verify': operatorReview(`${PUBLIC_AUTH_FLOW}；验证码哈希存储、5 分钟、错 5 次作废、一次性`),
    'POST /v1/authentication/mfa/verify': operatorReview(`${PUBLIC_AUTH_FLOW}；凭 5 分钟一次性挑战票据，每张票据错 5 次作废，同一身份 15 分钟内累计错 10 次后拒绝；TOTP 同一时间窗不可重放`),
    'POST /v1/authentication/mfa/enroll/start': operatorReview('要么带强制开启流程的一次性挑战票据，要么带登录会话，其余一律拒绝'),
    'POST /v1/authentication/mfa/enroll/confirm': operatorReview('同 enroll/start 的准入；待确认密钥加密存 Redis 10 分钟，确认码对不上不启用'),
    'POST /v1/authentication/mfa/disable': operatorReview('只接受 USER 会话，作用于本人身份，需要当前验证码或恢复码；租户要求两步验证时拒绝'),
    'POST /v1/authentication/select-tenant': operatorReview(`${PUBLIC_AUTH_FLOW}；凭 60 秒一次性票据，只能选票据身份确有成员关系且启用中的租户，之后照常走两步验证判定`),
    'POST /v1/authentication/select-tenant/options': operatorReview(`${PUBLIC_AUTH_FLOW}；凭票据（不消耗）只列出该身份自己的租户`),
    'GET /v1/authn/sso/saml/metadata/:tenantId': operatorReview('SP 元数据本就要交给身份提供方，只含实体 ID 与 ACS 地址，不含密钥或租户配置'),
    'POST /v1/authn/sso/saml/acs': operatorReview('身份提供方的跨站 POST：校验响应或断言签名、受众、有效期、InResponseTo 与颁发者，结果按 state 存 Redis 后 303 回 /callback，浏览器绑定 Cookie 在那里校验'),
    'POST /v1/federation/members/:tenantId': operatorReview('fema 业务事件推送：验证请求原样回显 challenge（不依赖已存密钥）；推送用登记时返回的 plainSecret 对原始请求体做 HMAC-SHA256 常量时间比较，签名不对、事件不在范围、tenantId 不是该租户的外部租户编码一律 2xx 丢弃；事件 id 去重 24 小时；不按事件类型改状态，只用该租户的集成服务应用读成员当前状态再停用或启用'),
    'GET /v1/users/me/security': operatorReview('只返回本人身份的安全状态（是否绑定手机、两步验证、外部登录），不含密钥或恢复码'),
    'POST /v1/users/me/mfa/recovery-codes': operatorReview('只为本人身份重新生成，旧恢复码同时作废；明文只在响应里出现一次，库里只存哈希'),
    'POST /v1/users/me/phone/request': operatorReview('只为本人身份发绑定验证码，先过人机验证并受短信频率限制'),
    'POST /v1/users/me/phone/confirm': operatorReview('只为本人身份绑定；号码已被其他身份占用时拒绝'),
    'GET /v1/operator/me': operatorReview('只回答当前用户是不是实例运营者，不含任何其他数据'),
    'GET /v1/operator/tenants': operatorReview(OPERATOR_ONLY),
    'GET /v1/operator/tenants/:id': operatorReview(OPERATOR_ONLY),
    'POST /v1/operator/tenants': operatorReview(OPERATOR_ONLY),
    'POST /v1/operator/tenants/:id/suspend': operatorReview(OPERATOR_ONLY),
    'POST /v1/operator/tenants/:id/resume': operatorReview(OPERATOR_ONLY),
    'POST /v1/operator/tenants/:id/limits': operatorReview(OPERATOR_ONLY),
    'POST /v1/operator/tenants/:id/slug': operatorReview(OPERATOR_ONLY),
    'GET /v1/operator/operators': operatorReview(OPERATOR_ONLY),
    'POST /v1/operator/operators': operatorReview(`${OPERATOR_ONLY}；只能授予已验证邮箱的现有账号`),
    'DELETE /v1/operator/operators/:identityId': operatorReview(`${OPERATOR_ONLY}；最后一位运营者不能被移除`),
    'GET /v1/operator/settings': operatorReview(`${OPERATOR_ONLY}；短信与平台登录应用的密钥只返回 hasSecret 标记`),
    'POST /v1/operator/settings': operatorReview(OPERATOR_ONLY),
    'GET /v1/operator/platform-clients': operatorReview(`${OPERATOR_ONLY}；不返回密钥哈希`),
    'POST /v1/operator/platform-clients': operatorReview(`${OPERATOR_ONLY}；密钥明文只在签发响应里出现一次，库里只存 sha256`),
    'POST /v1/operator/platform-clients/:id/revoke': operatorReview(OPERATOR_ONLY),
    'POST /v1/platform/tenants': operatorReview(PLATFORM_ONLY),
    'GET /v1/platform/tenants/by-external-ref': operatorReview(PLATFORM_ONLY),
    'GET /v1/platform/tenants/:id': operatorReview(PLATFORM_ONLY),
    'POST /v1/platform/tenants/:id': operatorReview(PLATFORM_ONLY),
    'POST /v1/platform/tenants/:id/suspend': operatorReview(PLATFORM_ONLY),
    'POST /v1/platform/tenants/:id/resume': operatorReview(PLATFORM_ONLY),
    'GET /v1/platform/tenants/:id/members': operatorReview(PLATFORM_ONLY),
    'POST /v1/platform/tenants/:id/members': operatorReview(PLATFORM_ONLY),
    'DELETE /v1/platform/tenants/:id/members': operatorReview(`${PLATFORM_ONLY}；租户所有者不能被移除`),
    'GET /v1/platform/usage': operatorReview(`${PLATFORM_ONLY}；受信 issuer 只看自己 issuer 的租户`),
    'GET /v1/tenants/public/:slugOrId': operatorReview('登录页需要的公开信息（名称、品牌、可用登录方式），不含成员、密钥或配置细节；限流同登录接口'),
    'POST /v1/tenants/discover': operatorReview('只认已通过 DNS TXT 验证的 LOGIN_DISCOVERY 域名，返回与公开租户信息相同的字段；未验证域名一律空列表；限流同登录接口'),
}

const SELF_ONLY = '只作用于令牌本人的身份（principal.id → identityId），请求里不接受任何用户、身份或租户参数，没有越权对象可测'

const saasExemptions: Record<string, string> = {
    'POST /v1/tenant-access/sso/saml': '与 POST /v1/tenant-access/sso/feishu 相同的 tenantAdminOnly 配置，写入令牌租户自己的 federatedAuthProviders；合法请求需要可解析的 IdP 元数据，元数据解析、签名与拒绝路径见 test/unit/app/sso 下的 SAML 用例',
    'POST /v1/tenant-access/sso/platform-bindings/:kind/start': '与其他 SSO 管理路由相同的 tenantAdminOnly 配置，只为令牌租户发起绑定；需要实例先配置平台登录应用，矩阵环境没有，覆盖见 test/unit/app/sso/sso-platform-login.test.ts',
    'DELETE /v1/tenant-access/sso/platform-bindings/:kind': '与其他 SSO 管理路由相同的 tenantAdminOnly 配置，只删除令牌租户自己的 platformAppBindings 条目',
    'POST /v1/users/me/mfa/recovery-codes': SELF_ONLY,
    'POST /v1/users/me/phone/request': SELF_ONLY,
    'POST /v1/users/me/phone/confirm': SELF_ONLY,
    'POST /v1/tenant-domains/:id/verify': '按 id + 令牌租户取域名（tenantDomainService.getOneOrThrow），别的租户 404；DNS 验证失败路径见 integration/saas/operator-and-platform.test.ts',
    'DELETE /v1/tenant-domains/:id': '按 id + 令牌租户取并删除，别的租户 404；与 GET/POST 同样的 tenantAdminOnly 配置',
}

export const saasDomain: DomainModule = {
    cases: saasCases,
    reviews: saasReviews,
    exemptions: saasExemptions,
}
