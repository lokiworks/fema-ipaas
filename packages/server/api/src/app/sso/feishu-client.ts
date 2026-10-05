import { isNil } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'
import { SsoLoginErrorCode, SsoRegion } from '@fema-ipaas/shared'
import { isAxiosError } from 'axios'
import { z } from 'zod'
import { SsoLoginError } from './sso-errors'

function buildAuthorizationUrl({ region, appId, redirectUri, state, codeChallenge }: BuildAuthorizationUrlParams): string {
    const url = new URL(`${endpointsFor(region).accountsBase}/open-apis/authen/v1/authorize`)
    url.searchParams.set('client_id', appId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
}

async function fetchProfile({ region, appId, appSecret, code, redirectUri, codeVerifier }: FetchProfileParams): Promise<FeishuProfile> {
    const { apiBase } = endpointsFor(region)
    const accessToken = await exchangeCode({ apiBase, appId, appSecret, code, redirectUri, codeVerifier })
    return loadUserInfo({ apiBase, accessToken })
}

async function exchangeCode({ apiBase, appId, appSecret, code, redirectUri, codeVerifier }: ExchangeCodeParams): Promise<string> {
    try {
        const response = await safeHttp.axios.post<unknown>(`${apiBase}/open-apis/authen/v2/oauth/token`, {
            grant_type: 'authorization_code',
            client_id: appId,
            client_secret: appSecret,
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        }, { timeout: HTTP_TIMEOUT_MS, maxRedirects: 0 })
        const parsed = TokenResponse.safeParse(response.data)
        if (!parsed.success || parsed.data.code !== 0 || isNil(parsed.data.access_token)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.CODE_REJECTED, detail: 'Feishu returned no access token' })
        }
        return parsed.data.access_token
    }
    catch (error) {
        throw mapError({ error, step: 'token' })
    }
}

async function loadUserInfo({ apiBase, accessToken }: LoadUserInfoParams): Promise<FeishuProfile> {
    try {
        const response = await safeHttp.axios.get<unknown>(`${apiBase}/open-apis/authen/v1/user_info`, {
            headers: { authorization: `Bearer ${accessToken}` },
            timeout: HTTP_TIMEOUT_MS,
            maxRedirects: 0,
        })
        const parsed = UserInfoResponse.safeParse(response.data)
        if (!parsed.success || parsed.data.code !== 0 || isNil(parsed.data.data)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'Feishu returned no user information' })
        }
        const info = parsed.data.data
        const subject = info.union_id ?? info.open_id
        if (isNil(subject)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'Feishu returned no user id' })
        }
        return {
            subject,
            email: (info.enterprise_email ?? info.email ?? '').trim().toLowerCase(),
            fullName: info.name ?? '',
            enterpriseKey: info.tenant_key ?? null,
        }
    }
    catch (error) {
        throw mapError({ error, step: 'user info' })
    }
}

function endpointsFor(region: SsoRegion): Endpoints {
    const override = process.env['FEMA_FEISHU_BASE_URL']
    if (!isNil(override) && override.length > 0) {
        return { accountsBase: override, apiBase: override }
    }
    return region === SsoRegion.LARK
        ? { accountsBase: 'https://accounts.larksuite.com', apiBase: 'https://open.larksuite.com' }
        : { accountsBase: 'https://accounts.feishu.cn', apiBase: 'https://open.feishu.cn' }
}

function mapError({ error, step }: MapErrorParams): SsoLoginError {
    if (error instanceof SsoLoginError) {
        return error
    }
    if (!isAxiosError(error) || isNil(error.response)) {
        const reason = isAxiosError(error) ? error.message : 'unknown error'
        return new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_UNREACHABLE, detail: `Feishu ${step} request failed: ${reason}` })
    }
    const body: unknown = error.response.data
    const parsed = ErrorBody.safeParse(body)
    const description = parsed.success ? (parsed.data.error_description ?? parsed.data.msg ?? parsed.data.error ?? '') : ''
    const clientProblem = parsed.success && (parsed.data.error === 'invalid_client' || parsed.data.code === 20024 || parsed.data.code === 20002)
    return new SsoLoginError({
        code: clientProblem ? SsoLoginErrorCode.CLIENT_REJECTED : SsoLoginErrorCode.CODE_REJECTED,
        detail: `Feishu rejected the ${step} request (HTTP ${error.response.status}${description.length > 0 ? `, ${description}` : ''})`,
    })
}

const HTTP_TIMEOUT_MS = 10_000

const TokenResponse = z.object({
    code: z.number(),
    access_token: z.string().optional(),
})

const UserInfoResponse = z.object({
    code: z.number(),
    data: z.object({
        open_id: z.string().optional(),
        union_id: z.string().optional(),
        name: z.string().optional(),
        email: z.string().optional(),
        enterprise_email: z.string().optional(),
        tenant_key: z.string().optional(),
    }).optional(),
})

const ErrorBody = z.object({
    code: z.number().optional(),
    msg: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
})

export const feishuClient = {
    buildAuthorizationUrl,
    fetchProfile,
}

export type FeishuProfile = {
    subject: string
    email: string
    fullName: string
    enterpriseKey: string | null
}

type Endpoints = {
    accountsBase: string
    apiBase: string
}

type BuildAuthorizationUrlParams = {
    region: SsoRegion
    appId: string
    redirectUri: string
    state: string
    codeChallenge: string
}

type FetchProfileParams = {
    region: SsoRegion
    appId: string
    appSecret: string
    code: string
    redirectUri: string
    codeVerifier: string
}

type ExchangeCodeParams = {
    apiBase: string
    appId: string
    appSecret: string
    code: string
    redirectUri: string
    codeVerifier: string
}

type LoadUserInfoParams = {
    apiBase: string
    accessToken: string
}

type MapErrorParams = {
    error: unknown
    step: string
}
