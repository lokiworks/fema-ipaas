import { WorkspaceId } from '@fema-ipaas/core-utils'

export const getWorkspaceConcurrencyPoolKey = (workspaceId: WorkspaceId): string => `workspace:concurrency-pool:${workspaceId}`
export const getConcurrencyPoolLimitKey = (poolId: string): string => `concurrency-pool:limit:${poolId}`
export const getConcurrencyPoolSetKey = (poolId: string): string => `active_jobs_set:pool:${poolId}`
