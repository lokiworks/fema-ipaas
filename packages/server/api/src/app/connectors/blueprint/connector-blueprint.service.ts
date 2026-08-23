import { apId, ApplicationError, ErrorCode, isNil, SeekPage } from '@fema-ipaas/core-utils'
import { apDayjs } from '@fema-ipaas/server-utils'
import { ConnectorBlueprint, ConnectorBlueprintDefinition } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { ConnectorBlueprintEntity } from './connector-blueprint.entity'

const blueprintRepo = repoFactory(ConnectorBlueprintEntity)

export const connectorBlueprintService = (_log: FastifyBaseLogger) => ({
    async upsert({ id, tenantId, definition }: UpsertParams): Promise<ConnectorBlueprint> {
        const now = apDayjs().toISOString()
        if (!isNil(id)) {
            const existing = await this.getOneOrThrow({ id, tenantId })
            await blueprintRepo().update(existing.id, { definition, updated: now })
            return this.getOneOrThrow({ id, tenantId })
        }
        const created: ConnectorBlueprint = {
            id: apId(),
            created: now,
            updated: now,
            tenantId,
            definition,
        }
        await blueprintRepo().insert(created)
        return created
    },

    async list(tenantId: string): Promise<SeekPage<ConnectorBlueprint>> {
        const data = await blueprintRepo().find({ where: { tenantId }, order: { created: 'DESC' } })
        return paginationHelper.createPage<ConnectorBlueprint>(data, null)
    },

    async getOneOrThrow({ id, tenantId }: GetParams): Promise<ConnectorBlueprint> {
        const blueprint = await blueprintRepo().findOneBy({ id, tenantId })
        if (isNil(blueprint)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'connector_blueprint', entityId: id },
            })
        }
        return blueprint
    },

    async delete({ id, tenantId }: GetParams): Promise<void> {
        await this.getOneOrThrow({ id, tenantId })
        await blueprintRepo().delete({ id, tenantId })
    },
})

type UpsertParams = {
    id?: string
    tenantId: string
    definition: ConnectorBlueprintDefinition
}

type GetParams = {
    id: string
    tenantId: string
}
