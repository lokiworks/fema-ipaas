import { isNil } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { femaApiClient } from './fema-api-client'

async function readState({ apiUrl, accessToken, memberId }: ReadStateParams): Promise<MemberState> {
    const result = await femaApiClient.call({
        apiUrl,
        path: MEMBER_PATH,
        method: 'GET',
        accessToken,
        query: { id: memberId },
    })
    if (femaApiClient.isNotFound(result)) {
        return 'GONE'
    }
    if (!femaApiClient.isSuccess(result) || result.kind !== 'response') {
        throw new Error(`The member could not be read (${femaApiClient.describe(result)})`)
    }
    if (isNil(result.data)) {
        return 'GONE'
    }
    const status = statusOf({ data: result.data })
    if (isNil(status)) {
        throw new Error('The member answer carries no status')
    }
    return IN_GOOD_STANDING.includes(status) ? 'ACTIVE' : 'INACTIVE'
}

async function search({ apiUrl, accessToken, keyword, page, limit }: SearchParams): Promise<DirectoryPage> {
    const trimmed = keyword?.trim() ?? ''
    const filter = trimmed.length === 0
        ? undefined
        : { $or: [{ 'card.displayName': { like: trimmed } }, { 'card.username': { like: trimmed } }] }
    const data = await findAll({ apiUrl, accessToken, body: { filter, sort: DIRECTORY_SORT, page, size: limit } })
    return {
        entries: entriesOf({ data }),
        page,
        hasNext: data.hasNext ?? false,
        total: data.total ?? null,
    }
}

async function findByIds({ apiUrl, accessToken, ids }: FindByIdsParams): Promise<DirectoryEntry[]> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) {
        return []
    }
    const data = await findAll({ apiUrl, accessToken, body: { filter: { id: { in: unique } }, page: 1, size: unique.length } })
    return entriesOf({ data }).filter((entry) => unique.includes(entry.subject))
}

async function findAll({ apiUrl, accessToken, body }: FindAllParams): Promise<WirePage> {
    const result = await femaApiClient.call({ apiUrl, path: MEMBER_LIST_PATH, method: 'POST', accessToken, body })
    if (!femaApiClient.isSuccess(result) || result.kind !== 'response') {
        throw new Error(`The member directory could not be read (${femaApiClient.describe(result)})`)
    }
    const parsed = WirePage.safeParse(result.data ?? {})
    if (!parsed.success) {
        throw new Error('The member directory answer is not a page')
    }
    return parsed.data
}

function entriesOf({ data }: { data: WirePage }): DirectoryEntry[] {
    return data.items.flatMap((item) => {
        const parsed = WireMember.safeParse(item)
        if (!parsed.success) {
            return []
        }
        const status = femaApiClient.enumCode(parsed.data.status)
        const displayName = nonEmpty(parsed.data.card?.displayName)
        const username = nonEmpty(parsed.data.card?.username)
        return [{
            subject: parsed.data.id,
            name: displayName ?? username ?? parsed.data.id,
            username,
            status,
            inGoodStanding: !isNil(status) && IN_GOOD_STANDING.includes(status),
        }]
    })
}

function nonEmpty(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? ''
    return trimmed.length === 0 ? null : trimmed
}

function statusOf({ data }: { data: unknown }): string | null {
    if (typeof data !== 'object' || data === null) {
        return null
    }
    const record: Record<string, unknown> = { ...data }
    return femaApiClient.enumCode(record['status'])
}

const MEMBER_PATH = '/iam-identity/member/find-by-id'
const MEMBER_LIST_PATH = '/iam-identity/member/find-all'
const IN_GOOD_STANDING = ['ACTIVE', 'PENDING']
const DIRECTORY_SORT = ['createdAt']

const WireMember = z.object({
    id: z.union([z.string().min(1), z.number()]).transform((value) => String(value)),
    status: z.unknown().optional(),
    card: z.object({
        displayName: z.string().nullish(),
        username: z.string().nullish(),
    }).nullish(),
})

const WirePage = z.object({
    items: z.array(z.unknown()).default([]),
    hasNext: z.boolean().nullish(),
    total: z.number().nullish(),
})

export const memberDirectory = {
    readState,
    statusOf,
    search,
    findByIds,
}

export type MemberState = 'ACTIVE' | 'INACTIVE' | 'GONE'

export type DirectoryEntry = {
    subject: string
    name: string
    username: string | null
    status: string | null
    inGoodStanding: boolean
}

export type DirectoryPage = {
    entries: DirectoryEntry[]
    page: number
    hasNext: boolean
    total: number | null
}

type WirePage = z.infer<typeof WirePage>

type SearchParams = {
    apiUrl: string
    accessToken: string
    keyword: string | undefined
    page: number
    limit: number
}

type FindByIdsParams = {
    apiUrl: string
    accessToken: string
    ids: string[]
}

type FindAllParams = {
    apiUrl: string
    accessToken: string
    body: Record<string, unknown>
}

type ReadStateParams = {
    apiUrl: string
    accessToken: string
    memberId: string
}
