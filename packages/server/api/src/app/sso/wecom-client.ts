import { isNil } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'
import { SsoLoginErrorCode } from '@fema-ipaas/shared'
import { z } from 'zod'
import { SsoLoginError } from './sso-errors'
import { ssoProviderErrors } from './sso-provider-errors'

function buildAuthorizationUrl({ corpId, agentId, redirectUri, state }: BuildAuthorizationUrlParams): string {
    const url = new URL(`${endpoints().loginBase}/wwlogin/sso/login`)
    url.searchParams.set('login_type', 'CorpApp')
    url.searchParams.set('appid', corpId)
    url.searchParams.set('agentid', agentId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    return url.toString()
}

function buildProviderAuthorizationUrl({ providerCorpId, redirectUri, state }: BuildProviderAuthorizationUrlParams): string {
    const url = new URL(`${endpoints().loginBase}/wwlogin/sso/login`)
    url.searchParams.set('login_type', 'ServiceApp')
    url.searchParams.set('appid', providerCorpId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    return url.toString()
}

async function fetchProfile({ corpId, secret, code }: FetchProfileParams): Promise<WecomProfile> {
    const { apiBase } = endpoints()
    const accessToken = await loadAccessToken({ apiBase, corpId, secret })
    const identity = await loadIdentity({ apiBase, accessToken, code })
    const detail = await loadMemberDetail({ apiBase, accessToken, userId: identity.userid })
    return {
        subject: identity.userid,
        email: (detail?.biz_mail ?? detail?.email ?? '').trim().toLowerCase(),
        fullName: detail?.name ?? '',
        enterpriseKey: corpId,
    }
}

async function fetchProviderProfile({ providerCorpId, providerSecret, authCode }: FetchProviderProfileParams): Promise<WecomProfile> {
    const { apiBase } = endpoints()
    const providerToken = await loadProviderToken({ apiBase, providerCorpId, providerSecret })
    try {
        const response = await safeHttp.axios.post<unknown>(`${apiBase}/cgi-bin/service/get_login_info`, { auth_code: authCode }, {
            params: { provider_access_token: providerToken },
            timeout: HTTP_TIMEOUT_MS,
            maxRedirects: 0,
        })
        const parsed = LoginInfoResponse.safeParse(response.data)
        if (!parsed.success) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'WeCom returned an unreadable login result' })
        }
        assertOk({ body: parsed.data, step: 'login info' })
        const userId = parsed.data.user_info?.userid
        const corpId = parsed.data.corp_info?.corpid
        if (isNil(userId) || isNil(corpId)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'WeCom returned no member or enterprise id' })
        }
        return {
            subject: userId,
            email: (parsed.data.user_info?.biz_mail ?? parsed.data.user_info?.email ?? '').trim().toLowerCase(),
            fullName: parsed.data.user_info?.name ?? '',
            enterpriseKey: corpId,
        }
    }
    catch (error) {
        throw ssoProviderErrors.map({ error, provider: 'WeCom', step: 'login info' })
    }
}

async function loadAccessToken({ apiBase, corpId, secret }: LoadAccessTokenParams): Promise<string> {
    try {
        const response = await safeHttp.axios.get<unknown>(`${apiBase}/cgi-bin/gettoken`, {
            params: { corpid: corpId, corpsecret: secret },
            timeout: HTTP_TIMEOUT_MS,
            maxRedirects: 0,
        })
        const parsed = TokenResponse.safeParse(response.data)
        if (!parsed.success) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'WeCom returned an unreadable access token answer' })
        }
        assertOk({ body: parsed.data, step: 'token' })
        if (isNil(parsed.data.access_token)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.CLIENT_REJECTED, detail: 'WeCom returned no access token' })
        }
        return parsed.data.access_token
    }
    catch (error) {
        throw ssoProviderErrors.map({ error, provider: 'WeCom', step: 'token' })
    }
}

async function loadProviderToken({ apiBase, providerCorpId, providerSecret }: LoadProviderTokenParams): Promise<string> {
    try {
        const response = await safeHttp.axios.post<unknown>(`${apiBase}/cgi-bin/service/get_provider_token`, {
            corpid: providerCorpId,
            provider_secret: providerSecret,
        }, { timeout: HTTP_TIMEOUT_MS, maxRedirects: 0 })
        const parsed = ProviderTokenResponse.safeParse(response.data)
        if (!parsed.success) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'WeCom returned an unreadable provider token answer' })
        }
        assertOk({ body: parsed.data, step: 'provider token' })
        if (isNil(parsed.data.provider_access_token)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.CLIENT_REJECTED, detail: 'WeCom returned no provider access token' })
        }
        return parsed.data.provider_access_token
    }
    catch (error) {
        throw ssoProviderErrors.map({ error, provider: 'WeCom', step: 'provider token' })
    }
}

async function loadIdentity({ apiBase, accessToken, code }: LoadIdentityParams): Promise<{ userid: string }> {
    try {
        const response = await safeHttp.axios.get<unknown>(`${apiBase}/cgi-bin/auth/getuserinfo`, {
            params: { access_token: accessToken, code },
            timeout: HTTP_TIMEOUT_MS,
            maxRedirects: 0,
        })
        const parsed = IdentityResponse.safeParse(response.data)
        if (!parsed.success) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'WeCom returned an unreadable user answer' })
        }
        assertOk({ body: parsed.data, step: 'user info' })
        if (isNil(parsed.data.userid)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH, detail: 'The WeCom account is not a member of this enterprise' })
        }
        return { userid: parsed.data.userid }
    }
    catch (error) {
        throw ssoProviderErrors.map({ error, provider: 'WeCom', step: 'user info' })
    }
}

async function loadMemberDetail({ apiBase, accessToken, userId }: LoadMemberDetailParams): Promise<MemberDetail | null> {
    try {
        const response = await safeHttp.axios.get<unknown>(`${apiBase}/cgi-bin/user/get`, {
            params: { access_token: accessToken, userid: userId },
            timeout: HTTP_TIMEOUT_MS,
            maxRedirects: 0,
        })
        const parsed = MemberDetailResponse.safeParse(response.data)
        return parsed.success && (parsed.data.errcode ?? 0) === 0 ? parsed.data : null
    }
    catch {
        return null
    }
}

function assertOk({ body, step }: AssertOkParams): void {
    const errcode = body.errcode ?? 0
    if (errcode !== 0) {
        throw ssoProviderErrors.rejectBody({ provider: 'WeCom', step, errcode, message: body.errmsg, clientCodes: CLIENT_ERROR_CODES })
    }
}

function endpoints(): Endpoints {
    const override = process.env['FEMA_WECOM_BASE_URL']
    if (!isNil(override) && override.length > 0) {
        return { loginBase: override, apiBase: override }
    }
    return { loginBase: 'https://login.work.weixin.qq.com', apiBase: 'https://qyapi.weixin.qq.com' }
}

const HTTP_TIMEOUT_MS = 10_000
const CLIENT_ERROR_CODES = [40001, 40013, 40014, 42001, 40091, 301002, 60020]

const BaseBody = z.object({
    errcode: z.number().optional(),
    errmsg: z.string().optional(),
})

const TokenResponse = BaseBody.extend({
    access_token: z.string().optional(),
})

const ProviderTokenResponse = BaseBody.extend({
    provider_access_token: z.string().optional(),
})

const IdentityResponse = BaseBody.extend({
    userid: z.string().optional(),
})

const MemberDetailResponse = BaseBody.extend({
    name: z.string().optional(),
    email: z.string().optional(),
    biz_mail: z.string().optional(),
})

const LoginInfoResponse = BaseBody.extend({
    user_info: z.object({
        userid: z.string().optional(),
        name: z.string().optional(),
        email: z.string().optional(),
        biz_mail: z.string().optional(),
    }).optional(),
    corp_info: z.object({
        corpid: z.string().optional(),
    }).optional(),
})

export const wecomClient = {
    buildAuthorizationUrl,
    buildProviderAuthorizationUrl,
    fetchProfile,
    fetchProviderProfile,
}

export type WecomProfile = {
    subject: string
    email: string
    fullName: string
    enterpriseKey: string
}

type MemberDetail = z.infer<typeof MemberDetailResponse>

type Endpoints = {
    loginBase: string
    apiBase: string
}

type BuildAuthorizationUrlParams = {
    corpId: string
    agentId: string
    redirectUri: string
    state: string
}

type BuildProviderAuthorizationUrlParams = {
    providerCorpId: string
    redirectUri: string
    state: string
}

type FetchProfileParams = {
    corpId: string
    secret: string
    code: string
}

type FetchProviderProfileParams = {
    providerCorpId: string
    providerSecret: string
    authCode: string
}

type LoadAccessTokenParams = {
    apiBase: string
    corpId: string
    secret: string
}

type LoadProviderTokenParams = {
    apiBase: string
    providerCorpId: string
    providerSecret: string
}

type LoadIdentityParams = {
    apiBase: string
    accessToken: string
    code: string
}

type LoadMemberDetailParams = {
    apiBase: string
    accessToken: string
    userId: string
}

type AssertOkParams = {
    body: z.infer<typeof BaseBody>
    step: string
}
