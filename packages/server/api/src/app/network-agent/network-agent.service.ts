import { randomBytes } from 'node:crypto'
import { apId, ApplicationError, ErrorCode, isNil, SeekPage } from '@fema-ipaas/core-utils'
import { apDayjs } from '@fema-ipaas/server-utils'
import { NetworkAgent, NetworkAgentStatus, NetworkAgentWithToken } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { encryptUtils } from '../helper/encryption'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { Order } from '../helper/pagination/paginator'
import { NetworkAgentEntity } from './network-agent.entity'
import { networkAgentRepo } from './network-agent.repo'

const TOKEN_BYTES = 32

export const networkAgentService = (_log: FastifyBaseLogger) => ({
    async create(params: CreateParams): Promise<NetworkAgentWithToken> {
        const token = randomBytes(TOKEN_BYTES).toString('hex')
        const now = apDayjs().toISOString()
        const agent = {
            id: apId(),
            created: now,
            updated: now,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId ?? null,
            displayName: params.displayName,
            status: NetworkAgentStatus.PENDING,
            tokenHash: await encryptUtils.hmacString(token),
            hostAllowlist: params.hostAllowlist,
            cidrAllowlist: params.cidrAllowlist,
            lastSeenAt: null,
        }
        await networkAgentRepo().insert(agent)
        return { ...toDto(agent), token }
    },

    async list(params: ListParams): Promise<SeekPage<NetworkAgent>> {
        const decodedCursor = paginationHelper.decodeCursor(params.cursor)
        const paginator = buildPaginator({
            entity: NetworkAgentEntity,
            query: {
                limit: params.limit,
                order: Order.DESC,
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const query = networkAgentRepo().createQueryBuilder('network_agent').where({
            tenantId: params.tenantId,
            ...(isNil(params.workspaceId) ? {} : { workspaceId: params.workspaceId }),
        })
        const { data, cursor } = await paginator.paginate(query)
        return paginationHelper.createPage<NetworkAgent>(data.map(toDto), cursor)
    },

    async getOneOrThrow(params: GetParams): Promise<NetworkAgent> {
        return toDto(await findOrThrow(params))
    },

    async update(params: UpdateParams): Promise<NetworkAgent> {
        const agent = await findOrThrow({ id: params.id, tenantId: params.tenantId })
        await networkAgentRepo().update(agent.id, {
            ...(isNil(params.displayName) ? {} : { displayName: params.displayName }),
            ...(isNil(params.status) ? {} : { status: params.status }),
            ...(isNil(params.hostAllowlist) ? {} : { hostAllowlist: params.hostAllowlist }),
            ...(isNil(params.cidrAllowlist) ? {} : { cidrAllowlist: params.cidrAllowlist }),
            updated: apDayjs().toISOString(),
        })
        return this.getOneOrThrow({ id: params.id, tenantId: params.tenantId })
    },

    async delete(params: GetParams): Promise<void> {
        const agent = await findOrThrow(params)
        await networkAgentRepo().delete({ id: agent.id })
    },
})

async function findOrThrow({ id, tenantId }: GetParams) {
    const agent = await networkAgentRepo().findOneBy({ id, tenantId })
    if (isNil(agent)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityType: 'network_agent', entityId: id },
        })
    }
    return agent
}

function toDto({ tokenHash: _tokenHash, ...dto }: { tokenHash: string } & NetworkAgent): NetworkAgent {
    return dto
}

type CreateParams = {
    tenantId: string
    workspaceId?: string
    displayName: string
    hostAllowlist: string[]
    cidrAllowlist: string[]
}

type ListParams = {
    tenantId: string
    workspaceId?: string
    cursor: string | null
    limit: number
}

type GetParams = {
    id: string
    tenantId: string
}

type UpdateParams = GetParams & {
    displayName?: string
    status?: NetworkAgentStatus
    hostAllowlist?: string[]
    cidrAllowlist?: string[]
}
