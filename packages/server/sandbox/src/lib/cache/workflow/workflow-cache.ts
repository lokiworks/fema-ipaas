import path from 'path'
import { isNil, WorkflowVersionId } from '@fema/core-utils'
import { type ApLogger, wideEvent } from '@fema/server-utils'
import { LATEST_WORKFLOW_SCHEMA_VERSION, WorkerToApiContract, WorkflowVersion, WorkflowVersionState } from '@fema/shared'
import { cacheUtils } from '../cache-paths'
import { cacheState } from '../cache-state'

export const workflowCache = (log: ApLogger, apiClient: WorkerToApiContract, basePath: string) => ({
    async getVersion({ workflowVersionId }: GetWorkflowRequest): Promise<WorkflowVersion | null> {
        try {
            const cache = cacheState(path.join(cacheUtils(basePath).getGlobalCacheWorkflowsPath(), workflowVersionId))

            const { state, cacheHit } = await cache.getOrSetCache({
                key: workflowVersionId,
                cacheMiss: (workflow: string) => {
                    if (isNil(workflow)) {
                        return true
                    }
                    const parsedWorkflow = workflow === 'null' ? null : JSON.parse(workflow) as WorkflowVersion
                    if (isNil(parsedWorkflow)) {
                        return false
                    }
                    return parsedWorkflow.schemaVersion !== LATEST_WORKFLOW_SCHEMA_VERSION
                },
                installFn: async () => {
                    return wideEvent.timed({
                        name: 'workflowFetch',
                        fn: async () => {
                            const workflowVersion = await apiClient.getWorkflowVersion({
                                versionId: workflowVersionId,
                            })
                            log.info({
                                workflowVersion: { id: workflowVersionId },
                                state: workflowVersion?.state,
                                found: !isNil(workflowVersion),
                            }, 'Fetched workflow version')
                            return JSON.stringify(workflowVersion)
                        },
                    })
                },
                skipSave: (workflow: string) => {
                    if (isNil(workflow)) {
                        return true
                    }
                    const parsedWorkflow = JSON.parse(workflow) as WorkflowVersion | null
                    if (isNil(parsedWorkflow)) {
                        return true
                    }
                    return parsedWorkflow.state !== WorkflowVersionState.LOCKED
                },
            })

            wideEvent.set({ workflowCacheHit: cacheHit })

            if (isNil(state)) {
                return null
            }
            return JSON.parse(state as string) as WorkflowVersion
        }
        catch (e) {
            if (e instanceof Error && 'status' in e && e.status === 404) {
                return null
            }
            throw e
        }
    },
})

type GetWorkflowRequest = {
    workflowVersionId: WorkflowVersionId
}
