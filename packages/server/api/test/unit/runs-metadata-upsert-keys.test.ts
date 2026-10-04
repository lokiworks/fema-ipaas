import { ExecutionStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { runsMetadataQueueUtils } from '../../src/app/workers/job/runs-metadata-queue-factory'

describe('runsMetadataQueueUtils.stripToRunsMetadataUpsertData', () => {
    it('keeps the masked display log id so the run reads the masked log and the raw state can be purged', () => {
        const stripped = runsMetadataQueueUtils.stripToRunsMetadataUpsertData({
            id: 'run-1',
            projectId: 'project-1',
            status: ExecutionStatus.SUCCEEDED,
            logsFileId: 'raw-file',
            displayLogsFileId: 'display-file',
        })
        expect(stripped.displayLogsFileId).toBe('display-file')
        expect(stripped.logsFileId).toBe('raw-file')
    })

    it('drops fields that are not part of the run metadata', () => {
        const stripped = runsMetadataQueueUtils.stripToRunsMetadataUpsertData({
            id: 'run-1',
            projectId: 'project-1',
            ...{ unrelated: 'value' },
        })
        expect(stripped).toEqual({ id: 'run-1', projectId: 'project-1' })
    })
})
