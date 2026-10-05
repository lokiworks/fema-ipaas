import { createHash } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { SSO_LIMITS, SsoLoginErrorCode, SsoProvider } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { distributedStore } from '../database/redis-connections'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { oidcClient } from './oidc-client'
import { SsoLoginError } from './sso-errors'

async function begin({ tenantId, provider, mode, actorUserId }: BeginParams): Promise<BeginResult> {
    const state = oidcClient.randomToken()
    const binding = oidcClient.randomToken()
    const record: SsoStateRecord = {
        tenantId,
        provider,
        mode,
        actorUserId,
        nonce: oidcClient.randomToken(),
        codeVerifier: oidcClient.randomToken(),
        bindingHash: hashOf(binding),
    }
    await distributedStore.put(stateKey(state), record, SSO_LIMITS.stateTtlSeconds)
    return { state, binding, record }
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

async function issueTicket({ userId, tenantId }: TicketParams): Promise<string> {
    const ticket = oidcClient.randomToken()
    await distributedStore.put(ticketKey(ticket), { userId, tenantId }, SSO_LIMITS.ticketTtlSeconds)
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
    consume,
    issueTicket,
    redeemTicket,
    buildBindingCookie,
    buildClearedBindingCookie,
    readBinding,
}

export type SsoStateRecord = {
    tenantId: string
    provider: SsoProvider
    mode: SsoMode
    actorUserId: string | null
    nonce: string
    codeVerifier: string
    bindingHash: string
}

export type SsoMode = 'login' | 'test'

type BeginParams = {
    tenantId: string
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
}
