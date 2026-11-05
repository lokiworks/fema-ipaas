import { ApplicationError, ErrorCode, generateId, isNil } from '@fema-ipaas/core-utils'
import { CreatePlatformClientRequestBody, CreatePlatformClientResponse, PlatformClient, PlatformClientKind } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { PlatformClientEntity, PlatformClientSchema } from './platform-client.entity'
import { platformClientUtils } from './platform-client.utils'

export const platformClientRepo = repoFactory<PlatformClientSchema>(PlatformClientEntity)

export const platformClientService = (log: FastifyBaseLogger) => ({
    async list(): Promise<PlatformClient[]> {
        const clients = await platformClientRepo().find({ order: { created: 'DESC' } })
        return clients.map((client) => platformClientUtils.toPublicClient({ client }))
    },

    async create({ request, createdByIdentityId }: CreateParams): Promise<CreatePlatformClientResponse> {
        const now = dayjs().toISOString()
        const base = { id: generateId(), created: now, updated: now, name: request.name, scopes: request.scopes, lastUsedAt: null, revokedAt: null, createdByIdentityId }
        if (request.kind === PlatformClientKind.API_KEY) {
            const key = platformClientUtils.generateApiKey()
            const saved = await platformClientRepo().save({
                ...base,
                kind: PlatformClientKind.API_KEY,
                keyPrefix: key.keyPrefix,
                secretHash: key.secretHash,
                issuer: null,
                allowedSubjects: [],
            })
            log.info({ platformClient: { id: saved.id } }, '[platformClient] API key issued')
            return { client: platformClientUtils.toPublicClient({ client: saved }), secret: key.token }
        }
        const saved = await platformClientRepo().save({
            ...base,
            kind: PlatformClientKind.TRUSTED_ISSUER,
            keyPrefix: null,
            secretHash: null,
            issuer: platformClientUtils.normalizeIssuer({ issuer: request.issuer }),
            allowedSubjects: request.allowedSubjects,
        })
        log.info({ platformClient: { id: saved.id } }, '[platformClient] trusted issuer registered')
        return { client: platformClientUtils.toPublicClient({ client: saved }), secret: null }
    },

    async revoke({ id }: { id: string }): Promise<PlatformClient> {
        const client = await platformClientRepo().findOneBy({ id })
        if (isNil(client)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'platform_client', entityId: id },
            })
        }
        if (isNil(client.revokedAt)) {
            await platformClientRepo().update({ id }, { revokedAt: dayjs().toISOString() })
            log.info({ platformClient: { id } }, '[platformClient] revoked')
        }
        return platformClientUtils.toPublicClient({ client: await platformClientRepo().findOneByOrFail({ id }) })
    },

    async findActiveByKeyPrefix({ keyPrefix }: { keyPrefix: string }): Promise<PlatformClientSchema | null> {
        return platformClientRepo()
            .createQueryBuilder('client')
            .addSelect('client.secretHash')
            .where('client.keyPrefix = :keyPrefix', { keyPrefix })
            .andWhere('client.revokedAt IS NULL')
            .getOne()
    },

    async listActiveByIssuer({ issuer }: { issuer: string }): Promise<PlatformClientSchema[]> {
        return platformClientRepo().find({
            where: { issuer: platformClientUtils.normalizeIssuer({ issuer }), kind: PlatformClientKind.TRUSTED_ISSUER },
        }).then((clients) => clients.filter((client) => isNil(client.revokedAt)))
    },

    async touch({ id }: { id: string }): Promise<void> {
        const threshold = dayjs().subtract(TOUCH_INTERVAL_SECONDS, 'second').toISOString()
        await platformClientRepo()
            .createQueryBuilder()
            .update()
            .set({ lastUsedAt: dayjs().toISOString() })
            .where('id = :id', { id })
            .andWhere('("lastUsedAt" IS NULL OR "lastUsedAt" < :threshold)', { threshold })
            .execute()
    },
})

const TOUCH_INTERVAL_SECONDS = 60

type CreateParams = {
    request: CreatePlatformClientRequestBody
    createdByIdentityId: string | null
}
