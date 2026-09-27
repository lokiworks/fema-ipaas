import { ApplicationError, ErrorCode, generateId, isNil, TenantId, UserId } from '@fema-ipaas/core-utils'
import {
    NotificationChannel,
    NotificationChannelStatus,
    NotificationChannelType,
    TestNotificationChannelResponse,
    UpsertNotificationChannelRequestBody,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { emailService } from '../helper/email/email-service'
import { encryptUtils } from '../helper/encryption'
import { AlertPolicyEntity, NotificationChannelConfig, NotificationChannelEntity, NotificationChannelSchema } from './alert.entity'
import { AlertMessage, notificationChannelSender } from './notification-channel-sender'

export const notificationChannelRepo = repoFactory(NotificationChannelEntity)
const alertPolicyRepo = repoFactory(AlertPolicyEntity)

export const notificationChannelService = (log: FastifyBaseLogger) => ({
    async list({ tenantId }: TenantScope): Promise<NotificationChannel[]> {
        const channels = await notificationChannelRepo().find({ where: { tenantId }, order: { created: 'ASC' } })
        const usage = await policyUsageByChannel({ tenantId })
        return channels.map((channel) => toResponse({ channel, usedByPolicies: usage.get(channel.id) ?? 0, log }))
    },

    async create({ tenantId, request, actorId }: CreateParams): Promise<NotificationChannel> {
        await assertNameAvailable({ tenantId, name: request.name, excludeId: null })
        const id = generateId()
        const config = configFrom({ request, previous: null })
        if (request.type !== NotificationChannelType.EMAIL && isNil(config.url)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'Channel URL is required' },
            })
        }
        await notificationChannelRepo().insert({
            id,
            tenantId,
            name: request.name,
            type: request.type,
            target: describeTarget({ type: request.type, config }),
            config: await encryptUtils.encryptObject(config),
            hasSecret: !isNil(config.secret),
            createdById: actorId,
        })
        return this.getOneOrThrow({ id, tenantId })
    },

    async update({ id, tenantId, request }: UpdateParams): Promise<NotificationChannel> {
        const existing = await getOneOrThrow({ id, tenantId })
        await assertNameAvailable({ tenantId, name: request.name, excludeId: id })
        const previous = await decryptConfig(existing)
        const config = configFrom({ request, previous })
        await notificationChannelRepo().update({ id, tenantId }, {
            name: request.name,
            type: request.type,
            target: describeTarget({ type: request.type, config }),
            config: await encryptUtils.encryptObject(config),
            hasSecret: !isNil(config.secret),
        })
        return this.getOneOrThrow({ id, tenantId })
    },

    async delete({ id, tenantId }: ChannelRef): Promise<void> {
        await getOneOrThrow({ id, tenantId })
        const usage = (await policyUsageByChannel({ tenantId })).get(id) ?? 0
        if (usage > 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: `Channel is used by ${usage} alert policies` },
            })
        }
        await notificationChannelRepo().delete({ id, tenantId })
    },

    async getOneOrThrow({ id, tenantId }: ChannelRef): Promise<NotificationChannel> {
        const channel = await getOneOrThrow({ id, tenantId })
        const usage = await policyUsageByChannel({ tenantId })
        return toResponse({ channel, usedByPolicies: usage.get(id) ?? 0, log })
    },

    async test({ id, tenantId }: ChannelRef): Promise<TestNotificationChannelResponse> {
        const channel = await getOneOrThrow({ id, tenantId })
        return this.deliver({
            channel,
            message: { title: '告警渠道测试', body: `这是一条来自「${channel.name}」的测试消息，收到即表示配置正确。`, link: null },
        })
    },

    async deliver({ channel, message }: DeliverParams): Promise<TestNotificationChannelResponse> {
        const config = await decryptConfig(channel)
        return notificationChannelSender(log).send({ tenantId: channel.tenantId, type: channel.type, config, message })
    },

    async findByIds({ ids, tenantId }: { ids: string[], tenantId: TenantId }): Promise<NotificationChannelSchema[]> {
        if (ids.length === 0) {
            return []
        }
        const channels = await notificationChannelRepo().find({ where: { tenantId } })
        return channels.filter((channel) => ids.includes(channel.id))
    },

    isAvailable(channel: Pick<NotificationChannelSchema, 'type'>): boolean {
        return channel.type !== NotificationChannelType.EMAIL || emailService(log).isConfigured()
    },
})

function toResponse({ channel, usedByPolicies, log }: { channel: NotificationChannelSchema, usedByPolicies: number, log: FastifyBaseLogger }): NotificationChannel {
    const available = channel.type !== NotificationChannelType.EMAIL || emailService(log).isConfigured()
    return {
        id: channel.id,
        created: channel.created,
        updated: channel.updated,
        tenantId: channel.tenantId,
        name: channel.name,
        type: channel.type,
        target: channel.target,
        hasSecret: channel.hasSecret,
        status: available ? NotificationChannelStatus.ACTIVE : NotificationChannelStatus.UNAVAILABLE,
        createdById: channel.createdById,
        usedByPolicies,
    }
}

async function policyUsageByChannel({ tenantId }: TenantScope): Promise<Map<string, number>> {
    const policies = await alertPolicyRepo().find({ where: { tenantId }, select: ['id', 'channelIds', 'escalation'] })
    return policies.reduce((usage, policy) => {
        const ids = new Set([...policy.channelIds, ...(isNil(policy.escalation.channelId) ? [] : [policy.escalation.channelId])])
        return new Map([...usage, ...[...ids].map((id): [string, number] => [id, (usage.get(id) ?? 0) + 1])])
    }, new Map<string, number>())
}

async function getOneOrThrow({ id, tenantId }: ChannelRef): Promise<NotificationChannelSchema> {
    const channel = await notificationChannelRepo().findOneBy({ id, tenantId })
    if (isNil(channel)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityId: id, entityType: 'NotificationChannel' },
        })
    }
    return channel
}

async function assertNameAvailable({ tenantId, name, excludeId }: { tenantId: TenantId, name: string, excludeId: string | null }): Promise<void> {
    const existing = await notificationChannelRepo().findOneBy({ tenantId, name })
    if (!isNil(existing) && existing.id !== excludeId) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'Channel name already used' },
        })
    }
}

async function decryptConfig(channel: Pick<NotificationChannelSchema, 'config'>): Promise<NotificationChannelConfig> {
    return encryptUtils.decryptObject<NotificationChannelConfig>(channel.config)
}

function configFrom({ request, previous }: { request: UpsertNotificationChannelRequestBody, previous: NotificationChannelConfig | null }): NotificationChannelConfig {
    const secret = request.secret === undefined ? previous?.secret ?? null : request.secret.length === 0 ? null : request.secret
    return {
        url: request.type === NotificationChannelType.EMAIL ? null : isNil(request.url) || request.url.length === 0 ? previous?.url ?? null : request.url,
        secret,
        recipients: request.type === NotificationChannelType.EMAIL ? request.recipients ?? [] : [],
    }
}

function describeTarget({ type, config }: { type: NotificationChannelType, config: NotificationChannelConfig }): string {
    if (type === NotificationChannelType.EMAIL) {
        return config.recipients.join(', ')
    }
    if (isNil(config.url)) {
        return ''
    }
    const parsed = safeUrl(config.url)
    if (isNil(parsed)) {
        return ''
    }
    const token = parsed.searchParams.get('key') ?? parsed.searchParams.get('access_token') ?? parsed.pathname.split('/').pop() ?? ''
    const maskedToken = token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-2)}` : token
    return type === NotificationChannelType.WEBHOOK ? `${parsed.origin}${parsed.pathname}` : `${parsed.host} · ${maskedToken}`
}

function safeUrl(url: string): URL | null {
    try {
        return new URL(url)
    }
    catch {
        return null
    }
}

type TenantScope = {
    tenantId: TenantId
}

type ChannelRef = {
    id: string
    tenantId: TenantId
}

type CreateParams = TenantScope & {
    request: UpsertNotificationChannelRequestBody
    actorId: UserId
}

type UpdateParams = ChannelRef & {
    request: UpsertNotificationChannelRequestBody
}

type DeliverParams = {
    channel: NotificationChannelSchema
    message: AlertMessage
}
