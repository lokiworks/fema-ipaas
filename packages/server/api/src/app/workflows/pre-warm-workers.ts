import { isNil } from '@fema-ipaas/core-utils'
import { PrewarmDataRequest, PrewarmDataResponse, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { accessTokenManager } from '../authentication/lib/access-token-manager'
import { distributedLock, distributedStore } from '../database/redis-connections'
import Paginator from '../helper/pagination/paginator'
import { projectService } from '../project/project-service'
import { tenantService } from '../tenant/tenant.service'
import { workflowService } from './workflow/workflow.service'


const SHARED_CACHE_KEY = '__shared__'
const CACHE_TTL_SECONDS = 5 * 60
const LOCK_TIMEOUT_SECONDS = 30
const EMPTY_RESPONSE: PrewarmDataResponse = { workflows: [], tenantId: '', engineToken: '' }
const BASE_LIST_PARAMS = {
    status: [WorkflowStatus.ENABLED],
    versionState: WorkflowVersionState.LOCKED,
    limit: Paginator.NO_LIMIT,
    includeTriggerSource: false,
}

export const preWarmWorkersService = (log: FastifyBaseLogger) => ({
    async getPrewarmData(input: PrewarmDataRequest): Promise<PrewarmDataResponse> {
        // Targeted prewarm (workflowPublished): the workflow is already known, so skip listing (and the cache) and just mint a token for its project.
        if (!isNil(input.workflow)) {
            const tenantId = await projectService(log).getTenantId(input.workflow.projectId)
            const engineToken = await accessTokenManager(log).generateEngineToken({ projectId: input.workflow.projectId, tenantId })
            return { workflows: [input.workflow], tenantId, engineToken }
        }

        const scope = await resolveCachedScope(input, log)
        if (isNil(scope)) {
            return EMPTY_RESPONSE
        }
        const engineToken = await accessTokenManager(log).generateEngineToken({
            projectId: scope.tokenProjectId,
            tenantId: scope.tenantId,
        })
        return { workflows: scope.workflows, tenantId: scope.tenantId, engineToken }
    },
})

async function resolveCachedScope(input: PrewarmDataRequest, log: FastifyBaseLogger): Promise<PrewarmScope | null> {
    const scopeId = input.workerGroupId ?? SHARED_CACHE_KEY
    const cacheKey = `prewarm:scope:${scopeId}`
    const cached = await distributedStore.get<PrewarmScope>(cacheKey)
    if (!isNil(cached)) {
        return cached
    }
    // Workers (re)connect in a herd on deploy; serialize the compute so only the first one lists workflows
    // and the rest wait for the lock, then read the populated cache below.
    return distributedLock(log).runExclusive({
        key: `${cacheKey}:lock`,
        timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
        fn: async () => {
            const cachedAfterLock = await distributedStore.get<PrewarmScope>(cacheKey)
            if (!isNil(cachedAfterLock)) {
                return cachedAfterLock
            }
            const scope = await computeScope(input, log)
            if (!isNil(scope)) {
                await distributedStore.put(cacheKey, scope, CACHE_TTL_SECONDS)
            }
            return scope
        },
    })
}

async function computeScope(input: PrewarmDataRequest, log: FastifyBaseLogger): Promise<PrewarmScope | null> {
    const tenant = await tenantService(log).getOldestTenant()
    if (isNil(tenant)) {
        return null
    }
    const tenantId = tenant.id

    const activeWorkflows = await workflowService(log).list({ ...BASE_LIST_PARAMS, tenantId })
    const workflows = activeWorkflows.data.map((workflow) => ({ id: workflow.id, versionId: workflow.version.id, projectId: workflow.projectId }))
    const tokenProjectId = (await projectService(log).getProjectIdsByTenant(tenantId))[0]
    return { workflows, tenantId, tokenProjectId }
}


type PrewarmScope = {
    workflows: PrewarmDataResponse['workflows']
    tenantId: string
    tokenProjectId: string
}
