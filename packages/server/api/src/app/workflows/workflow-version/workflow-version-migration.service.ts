import { ErrorCode, isNil, spreadIfDefined, tryCatch, WorkspaceId } from '@fema-ipaas/core-utils'
import { onCallService } from '@fema-ipaas/server-utils'
import { LATEST_WORKFLOW_SCHEMA_VERSION, WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { workflowMigrations } from './migrations'
import { workflowVersionBackupService } from './workflow-version-backup.service'
import { workflowVersionRepo } from './workflow-version.service'

export const workflowVersionMigrationService = (log: FastifyBaseLogger) => ({
    async migrate(workflowVersion: WorkflowVersion, workspaceId?: WorkspaceId): Promise<WorkflowVersion> {
        // Early exit if already at latest version
        if (workflowVersion.schemaVersion === LATEST_WORKFLOW_SCHEMA_VERSION) {
            return workflowVersion
        }

        log.info('Starting workflow version migration')

        const backupFiles = workflowVersion.backupFiles ?? {}
        if (!isNil(workflowVersion.schemaVersion)) {
            backupFiles[workflowVersion.schemaVersion] = await workflowVersionBackupService(log).store(workflowVersion)
        }

        const { data: migratedWorkflowVersion, error: migrationError } = await tryCatch(() => workflowMigrations.apply(workflowVersion, { log, workspaceId }))
        if (migrationError) {
            log.error({ migrationError }, '[workflowVersionMigration] Failed to migrate workflow version')
            onCallService(log, system.get(AppSystemProp.PAGE_ONCALL_WEBHOOK)).page({
                code: ErrorCode.WORKFLOW_MIGRATION_FAILED,
                message: migrationError.message,
                params: { workflowVersionId: workflowVersion.id },
            }).catch((pageError) => {
                log.error({ pageError }, '[workflowVersionMigration] Failed to send on-call page')
            })
            throw migrationError
        }

        await workflowVersionRepo().update(workflowVersion.id, {
            schemaVersion: migratedWorkflowVersion.schemaVersion,
            ...spreadIfDefined('trigger', migratedWorkflowVersion.trigger),
            connectionIds: migratedWorkflowVersion.connectionIds,
            agentIds: migratedWorkflowVersion.agentIds,
            backupFiles,
        })
        log.info('Workflow version migration completed')
        return migratedWorkflowVersion
    },
})