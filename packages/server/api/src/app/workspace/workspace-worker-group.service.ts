import { isNil, spreadIfDefined } from '@fema-ipaas/core-utils'
import { dayjsDuration } from '@fema-ipaas/server-utils'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../database/redis-connections'
import { workspaceRepo } from './workspace-repo'

const NO_WORKER_GROUP_SENTINEL = '__none__'
const CACHE_TTL_SECONDS = dayjsDuration(5, 'minute').asSeconds()
const getWorkspaceWorkerGroupCacheKey = (workspaceId: string): string => `workspace:${workspaceId}:worker_group`

export const workspaceWorkerGroupService = (_log: FastifyBaseLogger) => ({
    async getWorkspaceWorkerGroup({ workspaceId, tenantId }: { workspaceId: string, tenantId?: string | null }): Promise<string | null> {
        const cached = await distributedStore.get<string>(getWorkspaceWorkerGroupCacheKey(workspaceId))
        if (!isNil(cached)) {
            return cached === NO_WORKER_GROUP_SENTINEL ? null : cached
        }

        const workspace = await workspaceRepo().findOne({
            select: ['workerGroupId'],
            where: { id: workspaceId, ...spreadIfDefined('tenantId', tenantId ?? undefined) },
        })

        const workerGroupId = workspace?.workerGroupId ?? null
        await distributedStore.put(getWorkspaceWorkerGroupCacheKey(workspaceId), workerGroupId ?? NO_WORKER_GROUP_SENTINEL, CACHE_TTL_SECONDS)
        return workerGroupId
    },
    async getWorkerGroupWorkspaces({ workerGroupId }: { workerGroupId: string }): Promise<string[]> {
        const workspaces = await workspaceRepo().find({
            select: ['id'],
            where: { workerGroupId },
        })
        return workspaces.map((p) => p.id)
    },

    async invalidate({ workspaceId }: { workspaceId: string }): Promise<void> {
        await distributedStore.delete(getWorkspaceWorkerGroupCacheKey(workspaceId))
    },
})
