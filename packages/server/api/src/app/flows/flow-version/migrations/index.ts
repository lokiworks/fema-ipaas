import { WorkspaceId } from '@fema/core-utils'
import { FlowVersion, FlowVersionState, FlowVersionTemplate } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'

export type MigrationContext = {
    log: FastifyBaseLogger
    workspaceId?: WorkspaceId
}

export type Migration = {
    targetSchemaVersion: string | undefined
    migrate: (flowVersion: FlowVersion, context?: MigrationContext) => Promise<FlowVersion>
}

// The fork baseline starts at LATEST_FLOW_SCHEMA_VERSION, so there is no historical
// flow JSON to upgrade. New migrations are appended here as the schema evolves.
const migrations: Migration[] = []

export const flowMigrations = {
    apply: async (flowVersion: FlowVersion, context?: MigrationContext): Promise<FlowVersion> => {
        for (const migration of migrations) {
            if (flowVersion.schemaVersion === migration.targetSchemaVersion) {
                flowVersion = await migration.migrate(flowVersion, context)
            }
        }
        return flowVersion
    },
}

export const migrateFlowVersionTemplate = async ({ trigger, schemaVersion, notes, valid, displayName }: Pick<FlowVersionTemplate, 'trigger' | 'schemaVersion' | 'notes' | 'valid' | 'displayName'>): Promise<FlowVersionTemplate> => {
    return flowMigrations.apply({
        agentIds: [],
        connectionIds: [],
        created: new Date().toISOString(),
        displayName,
        flowId: '',
        id: '',
        updated: new Date().toISOString(),
        updatedBy: '',
        valid,
        trigger,
        state: FlowVersionState.DRAFT,
        schemaVersion,
        notes: notes ?? [],
    })
}

export const migrateFlowVersionTemplateList = async (flowVersions: FlowVersionTemplate[]): Promise<FlowVersionTemplate[]> => {
    return Promise.all(flowVersions.map(async (flowVersion) => {
        return migrateFlowVersionTemplate(flowVersion)
    }))
}

