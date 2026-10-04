import { isNil } from '@fema-ipaas/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { searchableHash } from '../helper/searchable-hash'
import { executionRepo, executionService } from '../workflows/execution/execution-service'

export const runSearchIndexService = (log: FastifyBaseLogger) => ({
    async indexFromRawState({ execution }: { execution: IndexableRun }): Promise<number> {
        if (isNil(execution.logsFileId)) {
            return 0
        }
        const steps = await executionService(log).readStateSteps({ logsFileId: execution.logsFileId, projectId: execution.projectId })
        if (isNil(steps)) {
            return 0
        }
        return this.store({ executionId: execution.id, projectId: execution.projectId, steps, businessKey: execution.businessKey })
    },

    async store({ executionId, projectId, steps, businessKey }: StoreParams): Promise<number> {
        const hashes = await searchableHash.hashesOfRun({ steps, businessKey })
        await executionRepo().query('UPDATE execution SET "searchHashes" = $1 WHERE id = $2 AND "projectId" = $3', [hashes, executionId, projectId])
        return hashes.length
    },
})

export type IndexableRun = {
    id: string
    projectId: string
    logsFileId?: string | null
    businessKey?: string | null
}

type StoreParams = {
    executionId: string
    projectId: string
    steps: unknown
    businessKey: string | null | undefined
}
