import { ApplicationError, ErrorCode, generateId, isNil, TenantId, UserId } from '@fema-ipaas/core-utils'
import { AlertPolicy, AlertTriggerEvent, UpsertAlertPolicyRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { projectRepo } from '../project/project-repo'
import { AlertPolicyEntity, AlertPolicySchema } from './alert.entity'
import { notificationChannelRepo } from './notification-channel.service'

export const alertPolicyRepo = repoFactory(AlertPolicyEntity)

export const alertPolicyService = (_log: FastifyBaseLogger) => ({
    async list({ tenantId }: TenantScope): Promise<AlertPolicy[]> {
        const policies = await alertPolicyRepo().find({ where: { tenantId }, order: { created: 'ASC' } })
        return policies.map(toResponse)
    },

    async create({ tenantId, request, actorId }: CreateParams): Promise<AlertPolicy> {
        await validate({ tenantId, request, excludeId: null })
        const id = generateId()
        await alertPolicyRepo().insert({ id, tenantId, ...normalize(request), updatedById: actorId })
        return toResponse(await getOneOrThrow({ id, tenantId }))
    },

    async update({ id, tenantId, request, actorId }: UpdateParams): Promise<AlertPolicy> {
        await getOneOrThrow({ id, tenantId })
        await validate({ tenantId, request, excludeId: id })
        await alertPolicyRepo().update({ id, tenantId }, { ...normalize(request), updatedById: actorId })
        return toResponse(await getOneOrThrow({ id, tenantId }))
    },

    async delete({ id, tenantId }: PolicyRef): Promise<void> {
        await getOneOrThrow({ id, tenantId })
        await alertPolicyRepo().delete({ id, tenantId })
    },

    async listEnabled({ tenantId }: TenantScope): Promise<AlertPolicySchema[]> {
        return alertPolicyRepo().find({ where: { tenantId, enabled: true } })
    },

    async listEnabledAcrossTenants(): Promise<AlertPolicySchema[]> {
        return alertPolicyRepo().find({ where: { enabled: true } })
    },
})

function normalize(request: UpsertAlertPolicyRequestBody): Omit<AlertPolicySchema, 'id' | 'created' | 'updated' | 'tenantId' | 'updatedById'> {
    const failureRate = request.events.includes(AlertTriggerEvent.FAILURE_RATE) ? request.failureRate : null
    return {
        name: request.name,
        enabled: request.enabled,
        projectIds: [...new Set(request.projectIds)],
        workflowIds: [...new Set(request.workflowIds)],
        events: [...new Set(request.events)],
        failureRate,
        groupWindowMinutes: request.groupWindowMinutes,
        quietHours: request.quietHours,
        escalation: request.escalation.enabled ? request.escalation : { ...request.escalation, channelId: null },
        channelIds: [...new Set(request.channelIds)],
    }
}

async function validate({ tenantId, request, excludeId }: ValidateParams): Promise<void> {
    const sameName = await alertPolicyRepo().findOneBy({ tenantId, name: request.name })
    if (!isNil(sameName) && sameName.id !== excludeId) {
        invalid('Alert policy name already used')
    }
    if (request.events.includes(AlertTriggerEvent.FAILURE_RATE) && isNil(request.failureRate)) {
        invalid('Failure rate threshold is required')
    }
    if (request.escalation.enabled && isNil(request.escalation.channelId)) {
        invalid('Escalation channel is required')
    }
    const channelIds = [...request.channelIds, ...(isNil(request.escalation.channelId) ? [] : [request.escalation.channelId])]
    const channels = await notificationChannelRepo().find({ where: { tenantId, id: In(channelIds) }, select: ['id'] })
    if (channels.length !== new Set(channelIds).size) {
        invalid('Some channels do not exist')
    }
    if (request.projectIds.length > 0) {
        const projects = await projectRepo().find({ where: { tenantId, id: In(request.projectIds) }, select: ['id'] })
        if (projects.length !== new Set(request.projectIds).size) {
            invalid('Some projects do not exist')
        }
    }
}

function invalid(message: string): never {
    throw new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

async function getOneOrThrow({ id, tenantId }: PolicyRef): Promise<AlertPolicySchema> {
    const policy = await alertPolicyRepo().findOneBy({ id, tenantId })
    if (isNil(policy)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityId: id, entityType: 'AlertPolicy' },
        })
    }
    return policy
}

function toResponse(policy: AlertPolicySchema): AlertPolicy {
    return {
        id: policy.id,
        created: policy.created,
        updated: policy.updated,
        tenantId: policy.tenantId,
        name: policy.name,
        enabled: policy.enabled,
        projectIds: policy.projectIds,
        workflowIds: policy.workflowIds,
        events: policy.events,
        failureRate: policy.failureRate,
        groupWindowMinutes: policy.groupWindowMinutes,
        quietHours: policy.quietHours,
        escalation: policy.escalation,
        channelIds: policy.channelIds,
        updatedById: policy.updatedById,
    }
}

type TenantScope = {
    tenantId: TenantId
}

type PolicyRef = {
    id: string
    tenantId: TenantId
}

type CreateParams = TenantScope & {
    request: UpsertAlertPolicyRequestBody
    actorId: UserId
}

type UpdateParams = PolicyRef & {
    request: UpsertAlertPolicyRequestBody
    actorId: UserId
}

type ValidateParams = TenantScope & {
    request: UpsertAlertPolicyRequestBody
    excludeId: string | null
}
