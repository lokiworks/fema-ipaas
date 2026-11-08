import { afterEach, describe, expect, it, vi } from 'vitest'
import { femaApiClient } from '../../../../src/app/federation/fema-api-client'
import { memberDirectory } from '../../../../src/app/federation/member-directory'

function respond(result: Awaited<ReturnType<typeof femaApiClient.call>>) {
    return vi.spyOn(femaApiClient, 'call').mockResolvedValue(result)
}

function success(data: unknown) {
    return { kind: 'response' as const, status: 200, code: 'SUCCESS', data, message: null }
}

describe('member directory', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('asks for the member by id with the integration application token', async () => {
        const call = respond(success({ id: 'm1', status: 'ACTIVE' }))
        await memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 'tok', memberId: 'm1' })
        expect(call).toHaveBeenCalledWith({ apiUrl: 'https://fema.test', path: '/iam-identity/member/find-by-id', method: 'GET', accessToken: 'tok', query: { id: 'm1' } })
    })

    it('treats an active member as in good standing', async () => {
        respond(success({ id: 'm1', status: { '@type': 'member-status', code: 'ACTIVE', name: '正常' } }))
        expect(await memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).toBe('ACTIVE')
    })

    it('treats a member waiting for activation as in good standing, as fema does', async () => {
        respond(success({ id: 'm1', status: { '@type': 'member-status', code: 'PENDING', name: '待激活' } }))
        expect(await memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).toBe('ACTIVE')
    })

    it.each(['SUSPENDED', 'REMOVED'])('treats %s as not in good standing', async (code) => {
        respond(success({ id: 'm1', status: { '@type': 'member-status', code, name: 'x' } }))
        expect(await memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).toBe('INACTIVE')
    })

    it('also reads a bare string status, in any case', async () => {
        respond(success({ status: 'Active' }))
        expect(await memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).toBe('ACTIVE')
        respond(success({ status: 'suspended' }))
        expect(await memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).toBe('INACTIVE')
    })

    it('treats a success answer with no data as a member that is not found, as fema answers for a missing id', async () => {
        respond(success(null))
        expect(await memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).toBe('GONE')
    })

    it('treats a 404 not found as gone too', async () => {
        respond({ kind: 'response', status: 404, code: 'NOT_FOUND', data: null, message: null })
        expect(await memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).toBe('GONE')
    })

    it('fails, rather than guesses, on a forbidden answer, a server error, an unreachable server or an answer without status', async () => {
        respond({ kind: 'response', status: 403, code: 'OPERATION_FORBIDDEN', data: null, message: null })
        await expect(memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).rejects.toThrow()
        respond({ kind: 'response', status: 500, code: 'INTERNAL_ERROR', data: null, message: null })
        await expect(memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).rejects.toThrow()
        respond({ kind: 'unreachable', detail: 'timeout' })
        await expect(memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).rejects.toThrow()
        respond(success({ id: 'm1' }))
        await expect(memberDirectory.readState({ apiUrl: 'https://fema.test', accessToken: 't', memberId: 'm1' })).rejects.toThrow()
    })
})
