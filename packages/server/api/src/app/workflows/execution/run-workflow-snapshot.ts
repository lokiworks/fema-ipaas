import { isNil, ProjectId, tryCatch, tryCatchSync } from '@fema-ipaas/core-utils'
import { FileCompression, FileType, LATEST_WORKFLOW_SCHEMA_VERSION, WorkflowVersion, WorkflowVersionState } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { fileCompressor } from '../../file/file-compressor'
import { fileService } from '../../file/file.service'
import { workflowMigrations } from '../workflow-version/migrations'

export const runWorkflowSnapshot = (log: FastifyBaseLogger) => ({
    async capture({ projectId, tenantId, workflowVersion }: CaptureParams): Promise<string | null> {
        if (!runWorkflowSnapshotCodec.shouldCapture({ state: workflowVersion.state })) {
            return null
        }
        const { data: file, error } = await tryCatch(async () => {
            const data = await fileCompressor.compress({
                data: Buffer.from(runWorkflowSnapshotCodec.serialize({ workflowVersion })),
                compression: FileCompression.ZSTD,
            })
            return fileService(log).save({
                projectId,
                tenantId,
                data,
                size: data.length,
                type: FileType.RUN_WORKFLOW_SNAPSHOT,
                compression: FileCompression.ZSTD,
                metadata: { workflowVersionId: workflowVersion.id },
            })
        })
        if (error) {
            log.warn({ error, workflowVersion: { id: workflowVersion.id } }, '[runWorkflowSnapshot#capture] Could not store the run workflow snapshot')
            return null
        }
        return file.id
    },
    async read({ projectId, fileId }: ReadParams): Promise<WorkflowVersion | null> {
        const stored = await fileService(log).getDataOrUndefined({ projectId, fileId, type: FileType.RUN_WORKFLOW_SNAPSHOT })
        if (isNil(stored)) {
            return null
        }
        const snapshot = runWorkflowSnapshotCodec.parse({ text: stored.data.toString('utf-8') })
        if (isNil(snapshot)) {
            log.warn({ file: { id: fileId } }, '[runWorkflowSnapshot#read] Stored run workflow snapshot is not a valid workflow version')
            return null
        }
        if (snapshot.schemaVersion === LATEST_WORKFLOW_SCHEMA_VERSION) {
            return snapshot
        }
        const { data: migrated, error } = await tryCatch(() => workflowMigrations.apply(snapshot, { log, projectId }))
        if (error) {
            log.warn({ error, file: { id: fileId } }, '[runWorkflowSnapshot#read] Could not migrate the run workflow snapshot')
            return null
        }
        return migrated
    },
})

export const runWorkflowSnapshotCodec = {
    shouldCapture({ state }: { state: WorkflowVersionState }): boolean {
        return state === WorkflowVersionState.DRAFT
    },
    serialize({ workflowVersion }: { workflowVersion: WorkflowVersion }): string {
        return JSON.stringify(workflowVersion)
    },
    parse({ text }: { text: string }): WorkflowVersion | null {
        const { data: json, error } = tryCatchSync((): unknown => JSON.parse(text))
        if (error) {
            return null
        }
        const parsed = WorkflowVersion.safeParse(json)
        return parsed.success ? parsed.data : null
    },
}

type CaptureParams = {
    projectId: ProjectId
    tenantId: string
    workflowVersion: WorkflowVersion
}

type ReadParams = {
    projectId: ProjectId
    fileId: string
}
