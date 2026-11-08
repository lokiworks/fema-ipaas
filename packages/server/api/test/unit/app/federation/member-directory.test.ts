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

    describe('reading the directory', () => {
        it('asks for a page of members and searches the name and the username on the member card', async () => {
            const call = respond(success({ items: [], hasNext: false, total: 0 }))
            await memberDirectory.search({ apiUrl: 'https://fema.test', accessToken: 'tok', keyword: '  Li  ', page: 2, limit: 20 })
            expect(call).toHaveBeenCalledWith({
                apiUrl: 'https://fema.test',
                path: '/iam-identity/member/find-all',
                method: 'POST',
                accessToken: 'tok',
                body: { filter: { $or: [{ 'card.displayName': { like: 'Li' } }, { 'card.username': { like: 'Li' } }] }, sort: ['createdAt'], page: 2, size: 20 },
            })
        })

        it('sends no filter without a keyword', async () => {
            const call = respond(success({ items: [] }))
            await memberDirectory.search({ apiUrl: 'https://fema.test', accessToken: 'tok', keyword: ' ', page: 1, limit: 20 })
            expect(call.mock.calls[0]?.[0].body).toEqual({ filter: undefined, sort: ['createdAt'], page: 1, size: 20 })
        })

        it('turns the card into a name, falling back to the username and then the member id, and tells who is in good standing', async () => {
            respond(success({
                items: [
                    { id: 'm1', status: { code: 'ACTIVE', name: '正常' }, card: { displayName: '李雷', username: 'lilei' } },
                    { id: 102, status: 'PENDING', card: { displayName: ' ', username: 'hanmeimei' } },
                    { id: 'm3', status: { code: 'SUSPENDED' }, card: null },
                    { status: 'ACTIVE' },
                ],
                hasNext: true,
                total: 41,
            }))
            const page = await memberDirectory.search({ apiUrl: 'https://fema.test', accessToken: 'tok', keyword: undefined, page: 1, limit: 3 })
            expect(page).toEqual({
                entries: [
                    { subject: 'm1', name: '李雷', username: 'lilei', status: 'ACTIVE', inGoodStanding: true },
                    { subject: '102', name: 'hanmeimei', username: 'hanmeimei', status: 'PENDING', inGoodStanding: true },
                    { subject: 'm3', name: 'm3', username: null, status: 'SUSPENDED', inGoodStanding: false },
                ],
                page: 1,
                hasNext: true,
                total: 41,
            })
        })

        it('fails on an answer that is not a successful page', async () => {
            respond({ kind: 'response', status: 403, code: 'OPERATION_FORBIDDEN', data: null, message: null })
            await expect(memberDirectory.search({ apiUrl: 'https://fema.test', accessToken: 't', keyword: undefined, page: 1, limit: 20 })).rejects.toThrow()
            respond({ kind: 'unreachable', detail: 'timeout' })
            await expect(memberDirectory.search({ apiUrl: 'https://fema.test', accessToken: 't', keyword: undefined, page: 1, limit: 20 })).rejects.toThrow()
            respond(success({ items: 'nope' }))
            await expect(memberDirectory.search({ apiUrl: 'https://fema.test', accessToken: 't', keyword: undefined, page: 1, limit: 20 })).rejects.toThrow()
        })

        it('looks members up by id and keeps only the ids that were asked for', async () => {
            const call = respond(success({ items: [{ id: 'm1', status: 'ACTIVE' }, { id: 'other', status: 'ACTIVE' }] }))
            const entries = await memberDirectory.findByIds({ apiUrl: 'https://fema.test', accessToken: 'tok', ids: ['m1', 'm2', 'm1'] })
            expect(call.mock.calls[0]?.[0].body).toEqual({ filter: { id: { in: ['m1', 'm2'] } }, page: 1, size: 2 })
            expect(entries.map((entry) => entry.subject)).toEqual(['m1'])
        })

        it('does not call fema for an empty lookup', async () => {
            const call = respond(success({ items: [] }))
            expect(await memberDirectory.findByIds({ apiUrl: 'https://fema.test', accessToken: 'tok', ids: [] })).toEqual([])
            expect(call).not.toHaveBeenCalled()
        })
    })
})
