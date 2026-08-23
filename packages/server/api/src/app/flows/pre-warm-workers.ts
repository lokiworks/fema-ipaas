import { isNil } from '@fema/core-utils'
import { FlowStatus, FlowVersionState, PrewarmDataRequest, PrewarmDataResponse } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { accessTokenManager } from '../authentication/lib/access-token-manager'
import { distributedLock, distributedStore } from '../database/redis-connections'
import Paginator from '../helper/pagination/paginator'
import { platformService } from '../platform/platform.service'
import { workspaceService } from '../workspace/workspace-service'
import { flowService } from './flow/flow.service'


const SHARED_CACHE_KEY = '__shared__'
const CACHE_TTL_SECONDS = 5 * 60
const LOCK_TIMEOUT_SECONDS = 30
const EMPTY_RESPONSE: PrewarmDataResponse = { flows: [], platformId: '', engineToken: '' }
const BASE_LIST_PARAMS = {
    status: [FlowStatus.ENABLED],
    versionState: FlowVersionState.LOCKED,
    limit: Paginator.NO_LIMIT,
    includeTriggerSource: false,
}

export const preWarmWorkersService = (log: FastifyBaseLogger) => ({
    async getPrewarmData(input: PrewarmDataRequest): Promise<PrewarmDataResponse> {
        // Targeted prewarm (flowPublished): the flow is already known, so skip listing (and the cache) and just mint a token for its workspace.
        if (!isNil(input.flow)) {
            const platformId = await workspaceService(log).getPlatformId(input.flow.workspaceId)
            const engineToken = await accessTokenManager(log).generateEngineToken({ workspaceId: input.flow.workspaceId, platformId })
            return { flows: [input.flow], platformId, engineToken }
        }

        const scope = await resolveCachedScope(input, log)
        if (isNil(scope)) {
            return EMPTY_RESPONSE
        }
        const engineToken = await accessTokenManager(log).generateEngineToken({
            workspaceId: scope.tokenWorkspaceId,
            platformId: scope.platformId,
        })
        return { flows: scope.flows, platformId: scope.platformId, engineToken }
    },
})

async function resolveCachedScope(input: PrewarmDataRequest, log: FastifyBaseLogger): Promise<PrewarmScope | null> {
    const scopeId = input.workerGroupId ?? SHARED_CACHE_KEY
    const cacheKey = `prewarm:scope:${scopeId}`
    const cached = await distributedStore.get<PrewarmScope>(cacheKey)
    if (!isNil(cached)) {
        return cached
    }
    // Workers (re)connect in a herd on deploy; serialize the compute so only the first one lists flows
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
    const platform = await platformService(log).getOldestPlatform()
    if (isNil(platform)) {
        return null
    }
    const platformId = platform.id

    const activeFlows = await flowService(log).list({ ...BASE_LIST_PARAMS, platformId })
    const flows = activeFlows.data.map((flow) => ({ id: flow.id, versionId: flow.version.id, workspaceId: flow.workspaceId }))
    const tokenWorkspaceId = (await workspaceService(log).getWorkspaceIdsByPlatform(platformId))[0]
    return { flows, platformId, tokenWorkspaceId }
}


type PrewarmScope = {
    flows: PrewarmDataResponse['flows']
    platformId: string
    tokenWorkspaceId: string
}
