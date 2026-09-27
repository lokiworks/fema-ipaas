import { ApplicationError, ErrorCode, generateId, isNil, ProjectId } from '@fema-ipaas/core-utils'
import { ConnectionReplacement, UpsertConnectionReplacementRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { repoFactory } from '../core/db/repo-factory'
import { ConnectionReplacementEntity } from './release.entity'

export const connectionReplacementRepo = repoFactory(ConnectionReplacementEntity)

export const connectionReplacementService = (log: FastifyBaseLogger) => ({
    async list({ projectId }: { projectId: ProjectId }): Promise<ConnectionReplacement[]> {
        return connectionReplacementRepo().find({ where: { projectId }, order: { created: 'ASC' } })
    },

    async upsert({ request }: { request: UpsertConnectionReplacementRequestBody }): Promise<ConnectionReplacement> {
        const { projectId, sourceConnectionId, targetConnectionId } = request
        if (sourceConnectionId === targetConnectionId) {
            invalid('A connection cannot replace itself')
        }
        const [source, target] = await Promise.all([
            findProjectConnection({ projectId, id: sourceConnectionId }),
            findProjectConnection({ projectId, id: targetConnectionId }),
        ])
        if (isNil(source) || isNil(target)) {
            invalid('Both connections must be available in this project')
        }
        if (source.connectorName !== target.connectorName) {
            invalid('The test connection must use the same connector')
        }
        const existing = await connectionReplacementRepo().findOneBy({ projectId, sourceConnectionId })
        if (isNil(existing)) {
            const id = generateId()
            await connectionReplacementRepo().insert({ id, projectId, sourceConnectionId, targetConnectionId })
            log.info({ project: { id: projectId }, connection: { id: sourceConnectionId } }, '[connectionReplacementService#upsert] Replacement created')
            return connectionReplacementRepo().findOneByOrFail({ id })
        }
        await connectionReplacementRepo().update({ id: existing.id, projectId }, { targetConnectionId })
        return connectionReplacementRepo().findOneByOrFail({ id: existing.id })
    },

    async delete({ id, projectId }: { id: string, projectId: ProjectId }): Promise<void> {
        await connectionReplacementRepo().delete({ id, projectId })
    },

    async resolveExternalIdForTesting({ projectId, externalId }: { projectId: ProjectId, externalId: string }): Promise<string> {
        const source = await connectionsRepo().findOne({
            where: { externalId, projectIds: ArrayContains([projectId]) },
            select: ['id'],
        })
        if (isNil(source)) {
            return externalId
        }
        const replacement = await connectionReplacementRepo().findOneBy({ projectId, sourceConnectionId: source.id })
        if (isNil(replacement)) {
            return externalId
        }
        const target = await connectionsRepo().findOne({ where: { id: replacement.targetConnectionId }, select: ['id', 'externalId'] })
        return target?.externalId ?? externalId
    },
})

async function findProjectConnection({ projectId, id }: { projectId: ProjectId, id: string }): Promise<{ id: string, connectorName: string } | null> {
    return connectionsRepo().findOne({
        where: { id, projectIds: ArrayContains([projectId]) },
        select: ['id', 'connectorName'],
    })
}

function invalid(message: string): never {
    throw new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

