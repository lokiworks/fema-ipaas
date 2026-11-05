import { isNil } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'
import { SsoLoginErrorCode } from '@fema-ipaas/shared'
import { z } from 'zod'
import { SsoLoginError } from './sso-errors'
import { ssoProviderErrors } from './sso-provider-errors'

function buildAuthorizationUrl({ appKey, redirectUri, state, withCorpId }: BuildAuthorizationUrlParams): string {
    const url = new URL(`${endpoints().loginBase}/oauth2/auth`)
    url.searchParams.set('client_id', appKey)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', withCorpId ? 'openid corpid' : 'openid')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    url.searchParams.set('prompt', 'consent')
    return url.toString()
}

async function fetchProfile({ appKey, appSecret, code }: FetchProfileParams): Promise<DingtalkProfile> {
    const { apiBase } = endpoints()
    const token = await exchangeCode({ apiBase, appKey, appSecret, code })
    const info = await loadUserInfo({ apiBase, accessToken: token.accessToken })
    const subject = info.unionId ?? info.openId
    if (isNil(subject)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'DingTalk returned no user id' })
    }
    return {
        subject,
        email: (info.email ?? '').trim().toLowerCase(),
        fullName: info.nick ?? '',
        enterpriseKey: token.corpId,
    }
}

async function exchangeCode({ apiBase, appKey, appSecret, code }: ExchangeCodeParams): Promise<{ accessToken: string, corpId: string | null }> {
    try {
        const response = await safeHttp.axios.post<unknown>(`${apiBase}/v1.0/oauth2/userAccessToken`, {
            clientId: appKey,
            clientSecret: appSecret,
            code,
            grantType: 'authorization_code',
        }, { timeout: HTTP_TIMEOUT_MS, maxRedirects: 0 })
        const parsed = TokenResponse.safeParse(response.data)
        if (!parsed.success || isNil(parsed.data.accessToken)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.CODE_REJECTED, detail: 'DingTalk returned no access token' })
        }
        return { accessToken: parsed.data.accessToken, corpId: parsed.data.corpId ?? null }
    }
    catch (error) {
        throw ssoProviderErrors.map({ error, provider: 'DingTalk', step: 'token' })
    }
}

async function loadUserInfo({ apiBase, accessToken }: LoadUserInfoParams): Promise<UserInfo> {
    try {
        const response = await safeHttp.axios.get<unknown>(`${apiBase}/v1.0/contact/users/me`, {
            headers: { 'x-acs-dingtalk-access-token': accessToken },
            timeout: HTTP_TIMEOUT_MS,
            maxRedirects: 0,
        })
        const parsed = UserInfoResponse.safeParse(response.data)
        if (!parsed.success) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'DingTalk returned no user information' })
        }
        return parsed.data
    }
    catch (error) {
        throw ssoProviderErrors.map({ error, provider: 'DingTalk', step: 'user info' })
    }
}

function endpoints(): Endpoints {
    const override = process.env['FEMA_DINGTALK_BASE_URL']
    if (!isNil(override) && override.length > 0) {
        return { loginBase: override, apiBase: override }
    }
    return { loginBase: 'https://login.dingtalk.com', apiBase: 'https://api.dingtalk.com' }
}

const HTTP_TIMEOUT_MS = 10_000

const TokenResponse = z.object({
    accessToken: z.string().optional(),
    corpId: z.string().optional(),
})

const UserInfoResponse = z.object({
    nick: z.string().optional(),
    unionId: z.string().optional(),
    openId: z.string().optional(),
    email: z.string().optional(),
})

export const dingtalkClient = {
    buildAuthorizationUrl,
    fetchProfile,
}

export type DingtalkProfile = {
    subject: string
    email: string
    fullName: string
    enterpriseKey: string | null
}

type UserInfo = z.infer<typeof UserInfoResponse>

type Endpoints = {
    loginBase: string
    apiBase: string
}

type BuildAuthorizationUrlParams = {
    appKey: string
    redirectUri: string
    state: string
    withCorpId: boolean
}

type FetchProfileParams = {
    appKey: string
    appSecret: string
    code: string
}

type ExchangeCodeParams = {
    apiBase: string
    appKey: string
    appSecret: string
    code: string
}

type LoadUserInfoParams = {
    apiBase: string
    accessToken: string
}
