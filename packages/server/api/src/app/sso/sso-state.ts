import { createHash } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { SSO_LIMITS, SsoLoginErrorCode, SsoProvider, SsoScope } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { distributedStore } from '../database/redis-connections'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { oidcClient } from './oidc-client'
import { SsoLoginError } from './sso-errors'

async function begin({ tenantId, scope, provider, mode, actorUserId }: BeginParams): Promise<BeginResult> {
    const state = oidcClient.randomToken()
    const binding = oidcClient.randomToken()
    const record: SsoStateRecord = {
        tenantId,
        scope,
        provider,
        mode,
        actorUserId,
        samlRequestId: provider === SsoProvider.SAML ? `_${oidcClient.randomToken()}` : null,
        nonce: oidcClient.randomToken(),
        codeVerifier: oidcClient.randomToken(),
        bindingHash: hashOf(binding),
    }
    await distributedStore.put(stateKey(state), record, SSO_LIMITS.stateTtlSeconds)
    return { state, binding, record }
}

async function peek({ state }: { state: string | undefined }): Promise<SsoStateRecord> {
    if (isNil(state) || state.length === 0) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.STATE_INVALID, detail: 'The callback carries no state' })
    }
    const record = await distributedStore.get<SsoStateRecord>(stateKey(state))
    if (isNil(record)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.STATE_INVALID, detail: 'The state is unknown or has expired' })
    }
    return record
}

async function storeSamlResult({ state, result }: { state: string, result: SamlResult }): Promise<void> {
    await distributedStore.put(samlResultKey(state), result, SSO_LIMITS.stateTtlSeconds)
}

async function takeSamlResult({ state }: { state: string | undefined }): Promise<SamlResult> {
    const key = samlResultKey(state ?? '')
    const result = isNil(state) ? null : await distributedStore.get<SamlResult>(key)
    if (isNil(result)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.CODE_REJECTED, detail: 'No SAML response was received for this sign-in' })
    }
    await distributedStore.delete(key)
    return result
}

async function consume({ state, binding }: ConsumeParams): Promise<SsoStateRecord> {
    if (isNil(state) || state.length === 0) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.STATE_INVALID, detail: 'The callback carries no state' })
    }
    const record = await distributedStore.get<SsoStateRecord>(stateKey(state))
    if (isNil(record)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.STATE_INVALID, detail: 'The state is unknown or has expired' })
    }
    const claimed = await distributedStore.putIfAbsent(usedStateKey(state), '1', SSO_LIMITS.stateTtlSeconds)
    if (!claimed) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.STATE_REPLAYED, detail: 'The state was already used by an earlier callback' })
    }
    if (isNil(binding) || hashOf(binding) !== record.bindingHash) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.BROWSER_MISMATCH, detail: 'The callback arrived in a different browser than the one that started the sign-in' })
    }
    return record
}

async function issueTicket({ userId, tenantId, sessionSeconds }: TicketParams): Promise<string> {
    const ticket = oidcClient.randomToken()
    await distributedStore.put(ticketKey(ticket), { userId, tenantId, sessionSeconds }, SSO_LIMITS.ticketTtlSeconds)
    return ticket
}

async function redeemTicket({ ticket }: { ticket: string }): Promise<TicketParams> {
    const record = await distributedStore.get<TicketParams>(ticketKey(ticket))
    if (isNil(record)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TICKET_INVALID, detail: 'The sign-in ticket is unknown or has expired' })
    }
    const claimed = await distributedStore.putIfAbsent(usedTicketKey(ticket), '1', SSO_LIMITS.ticketTtlSeconds)
    if (!claimed) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TICKET_INVALID, detail: 'The sign-in ticket was already used' })
    }
    return record
}

function buildBindingCookie({ binding }: { binding: string }): string {
    const secure = isHttps() ? '; Secure' : ''
    return `${BINDING_COOKIE}=${binding}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${SSO_LIMITS.stateTtlSeconds}${secure}`
}

function buildClearedBindingCookie(): string {
    return `${BINDING_COOKIE}=; Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=0`
}

function readBinding({ request }: { request: FastifyRequest }): string | null {
    const header = request.headers.cookie
    if (isNil(header)) {
        return null
    }
    const pair = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${BINDING_COOKIE}=`))
    return isNil(pair) ? null : pair.slice(BINDING_COOKIE.length + 1)
}

function isHttps(): boolean {
    const frontend = system.get(AppSystemProp.FRONTEND_URL)
    return !isNil(frontend) && frontend.startsWith('https://')
}

function hashOf(value: string): string {
    return createHash('sha256').update(value).digest('hex')
}

function stateKey(state: string): string {
    return `sso:state:${state}`
}

function usedStateKey(state: string): string {
    return `sso:state-used:${state}`
}

function samlResultKey(state: string): string {
    return `sso:saml-result:${state}`
}

function ticketKey(ticket: string): string {
    return `sso:ticket:${ticket}`
}

function usedTicketKey(ticket: string): string {
    return `sso:ticket-used:${ticket}`
}

const BINDING_COOKIE = 'fema_sso_binding'
const COOKIE_PATH = '/api/v1/authn/sso'

export const ssoState = {
    begin,
    peek,
    consume,
    storeSamlResult,
    takeSamlResult,
    issueTicket,
    redeemTicket,
    buildBindingCookie,
    buildClearedBindingCookie,
    readBinding,
}

export type SsoStateRecord = {
    tenantId: string | null
    scope: SsoScope
    provider: SsoProvider
    mode: SsoMode
    actorUserId: string | null
    nonce: string
    codeVerifier: string
    bindingHash: string
    samlRequestId: string | null
}

export type SsoMode = 'login' | 'test' | 'bind'

export type SamlResult =
    | { ok: true, nameId: string, attributes: Record<string, string[]> }
    | { ok: false, code: SsoLoginErrorCode, detail: string }

type BeginParams = {
    tenantId: string | null
    scope: SsoScope
    provider: SsoProvider
    mode: SsoMode
    actorUserId: string | null
}

type BeginResult = {
    state: string
    binding: string
    record: SsoStateRecord
}

type ConsumeParams = {
    state: string | undefined
    binding: string | null
}

type TicketParams = {
    userId: string
    tenantId: string
    sessionSeconds?: number
}
