import { ApplicationError, ErrorCode, generateId, isNil, SeekPage, tryCatch } from '@fema-ipaas/core-utils'
import { ConnectorDemand, ConnectorDemandStatus, CreateConnectorDemandRequestBody, ListConnectorDemandsRequestQuery, TenantRole, UserStatus } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { domainHelper } from '../../helper/domain-helper'
import { emailService } from '../../helper/email/email-service'
import { mailSender } from '../../helper/email/mail-sender'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { userService } from '../../user/user-service'
import { ConnectorDemandEntity, ConnectorDemandSchema } from './connector-demand.entity'

export const connectorDemandRepo = repoFactory(ConnectorDemandEntity)

export const connectorDemandService = (log: FastifyBaseLogger) => ({
    async create({ tenantId, requesterId, request }: CreateParams): Promise<ConnectorDemand> {
        const id = generateId()
        await connectorDemandRepo().insert({
            id,
            created: dayjs().toISOString(),
            updated: dayjs().toISOString(),
            tenantId,
            requesterId,
            appName: request.appName.trim(),
            capability: request.capability.trim(),
            status: ConnectorDemandStatus.OPEN,
        })
        const demand = await this.getOrThrow({ tenantId, id })
        await notifyAdmins({ log, tenantId, demand })
        log.info({ tenant: { id: tenantId }, connectorDemand: { id } }, '[connectorDemandService#create] Connector request submitted')
        return demand
    },

    async list({ tenantId, query }: ListParams): Promise<SeekPage<ConnectorDemand>> {
        const decoded = paginationHelper.decodeCursor(query.cursor ?? null)
        const paginator = buildPaginator({
            entity: ConnectorDemandEntity,
            alias: 'demand',
            query: {
                limit: query.limit ?? DEFAULT_LIMIT,
                order: 'DESC',
                afterCursor: decoded.nextCursor,
                beforeCursor: decoded.previousCursor,
            },
        })
        const builder = connectorDemandRepo()
            .createQueryBuilder('demand')
            .leftJoinAndSelect('demand.requester', 'requester')
            .leftJoinAndSelect('requester.identity', 'requester_identity')
            .where('demand."tenantId" = :tenantId', { tenantId })
        if (!isNil(query.status)) {
            builder.andWhere('demand.status = :status', { status: query.status })
        }
        const { data, cursor } = await paginator.paginate(builder)
        return paginationHelper.createPage(data.map(toModel), cursor)
    },

    async updateStatus({ tenantId, id, status }: UpdateStatusParams): Promise<ConnectorDemand> {
        await this.getOrThrow({ tenantId, id })
        await connectorDemandRepo().update({ id, tenantId }, { status })
        return this.getOrThrow({ tenantId, id })
    },

    async getOrThrow({ tenantId, id }: { tenantId: string, id: string }): Promise<ConnectorDemand> {
        const demand = await connectorDemandRepo().findOne({ where: { id, tenantId }, relations: { requester: { identity: true } } })
        if (isNil(demand)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'connector_demand', entityId: id } })
        }
        return toModel(demand)
    },
})

async function notifyAdmins({ log, tenantId, demand }: { log: FastifyBaseLogger, tenantId: string, demand: ConnectorDemand }): Promise<void> {
    if (!mailSender(log).isConfigured()) {
        return
    }
    const admins = await userService(log).getByTenantRole(tenantId, TenantRole.ADMIN)
    const recipients = admins.filter((admin) => admin.status === UserStatus.ACTIVE).flatMap((admin) => (isNil(admin.identity?.email) ? [] : [admin.identity.email]))
    if (recipients.length === 0) {
        return
    }
    const link = await domainHelper.getPublicUrl({ path: '/tenant/connectors/requests' })
    const requester = isNil(demand.requester) ? '' : `${demand.requester.firstName} ${demand.requester.lastName}`.trim() || demand.requester.email
    const { error } = await tryCatch(() => Promise.all(recipients.map((to) => emailService(log).sendAlert({
        tenantId,
        to,
        title: `【连接器需求】${demand.appName}`,
        body: [`需要的能力：${demand.capability}`, requester.length > 0 ? `提交人：${requester}` : ''].filter((line) => line.length > 0).join('\n'),
        link,
    }))))
    if (!isNil(error)) {
        log.warn({ error, connectorDemand: { id: demand.id } }, '[connectorDemandService#notifyAdmins] Could not email tenant admins')
    }
}

function toModel(demand: ConnectorDemandSchema): ConnectorDemand {
    const identity = demand.requester?.identity
    return {
        id: demand.id,
        created: demand.created,
        updated: demand.updated,
        tenantId: demand.tenantId,
        requesterId: demand.requesterId,
        requester: isNil(identity) || isNil(demand.requesterId) ? null : {
            id: demand.requesterId,
            email: identity.email,
            firstName: identity.firstName,
            lastName: identity.lastName,
        },
        appName: demand.appName,
        capability: demand.capability,
        status: demand.status,
    }
}

const DEFAULT_LIMIT = 20

type CreateParams = {
    tenantId: string
    requesterId: string
    request: CreateConnectorDemandRequestBody
}

type ListParams = {
    tenantId: string
    query: ListConnectorDemandsRequestQuery
}

type UpdateStatusParams = {
    tenantId: string
    id: string
    status: ConnectorDemandStatus
}
