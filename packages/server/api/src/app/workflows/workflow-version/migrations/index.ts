import { WorkspaceId } from '@fema/core-utils'
import { WorkflowVersion, WorkflowVersionState, WorkflowVersionTemplate } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'

export type MigrationContext = {
    log: FastifyBaseLogger
    workspaceId?: WorkspaceId
}

export type Migration = {
    targetSchemaVersion: string | undefined
    migrate: (workflowVersion: WorkflowVersion, context?: MigrationContext) => Promise<WorkflowVersion>
}

// The fork baseline starts at LATEST_WORKFLOW_SCHEMA_VERSION, so there is no historical
// workflow JSON to upgrade. New migrations are appended here as the schema evolves.
const migrations: Migration[] = []

export const workflowMigrations = {
    apply: async (workflowVersion: WorkflowVersion, context?: MigrationContext): Promise<WorkflowVersion> => {
        for (const migration of migrations) {
            if (workflowVersion.schemaVersion === migration.targetSchemaVersion) {
                workflowVersion = await migration.migrate(workflowVersion, context)
            }
        }
        return workflowVersion
    },
}

export const migrateWorkflowVersionTemplate = async ({ trigger, schemaVersion, notes, valid, displayName }: Pick<WorkflowVersionTemplate, 'trigger' | 'schemaVersion' | 'notes' | 'valid' | 'displayName'>): Promise<WorkflowVersionTemplate> => {
    return workflowMigrations.apply({
        agentIds: [],
        connectionIds: [],
        created: new Date().toISOString(),
        displayName,
        workflowId: '',
        id: '',
        updated: new Date().toISOString(),
        updatedBy: '',
        valid,
        trigger,
        state: WorkflowVersionState.DRAFT,
        schemaVersion,
        notes: notes ?? [],
    })
}

export const migrateWorkflowVersionTemplateList = async (workflowVersions: WorkflowVersionTemplate[]): Promise<WorkflowVersionTemplate[]> => {
    return Promise.all(workflowVersions.map(async (workflowVersion) => {
        return migrateWorkflowVersionTemplate(workflowVersion)
    }))
}

