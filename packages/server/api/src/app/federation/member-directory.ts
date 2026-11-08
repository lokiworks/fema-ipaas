import { isNil } from '@fema-ipaas/core-utils'
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

function statusOf({ data }: { data: unknown }): string | null {
    if (typeof data !== 'object' || data === null) {
        return null
    }
    const record: Record<string, unknown> = { ...data }
    return femaApiClient.enumCode(record['status'])
}

const MEMBER_PATH = '/iam-identity/member/find-by-id'
const IN_GOOD_STANDING = ['ACTIVE', 'PENDING']

export const memberDirectory = {
    readState,
    statusOf,
}

export type MemberState = 'ACTIVE' | 'INACTIVE' | 'GONE'

type ReadStateParams = {
    apiUrl: string
    accessToken: string
    memberId: string
}
