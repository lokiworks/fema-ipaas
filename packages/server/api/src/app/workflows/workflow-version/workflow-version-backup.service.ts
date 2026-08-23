import { spreadIfDefined } from '@fema-ipaas/core-utils'
import { FileCompression, FileType, WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { fileService } from '../../file/file.service'

export const workflowVersionBackupService = (log: FastifyBaseLogger) => ({
    async store(workflowVersion: WorkflowVersion): Promise<string> {
        const data = Buffer.from(JSON.stringify(workflowVersion))
        const file = await fileService(log).save({
            type: FileType.WORKFLOW_VERSION_BACKUP,
            data,
            size: data.length,
            metadata: {
                workflowVersionId: workflowVersion.id,
                ...spreadIfDefined('schemaVersion', workflowVersion.schemaVersion),
            },
            compression: FileCompression.NONE,
        })

        log.info({
            workflowVersion: { id: workflowVersion.id },
            schemaVersion: workflowVersion.schemaVersion,
        }, 'Stored backup version for workflow version')

        return file.id
    },
    
    async get(params: GetBackupVersionParams): Promise<WorkflowVersion | null> {
        const { workflowVersion, schemaVersion } = params
        const backupFileId = workflowVersion.backupFiles?.[schemaVersion]
        if (!backupFileId) {
            return null
        }
        
        const fileData = await fileService(log).getDataOrThrow({
            fileId: backupFileId,
            type: FileType.WORKFLOW_VERSION_BACKUP,
        })
        
        const backupWorkflowVersion: WorkflowVersion = JSON.parse(fileData.data.toString('utf-8'))

        log.info({
            workflowVersion: { id: workflowVersion.id },
            schemaVersion,
        }, 'Backup version retrieved for workflow version')
        return backupWorkflowVersion
    },
})

type GetBackupVersionParams = {
    workflowVersion: WorkflowVersion
    schemaVersion: string
}