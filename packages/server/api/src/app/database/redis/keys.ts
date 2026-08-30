import { ProjectId } from '@fema-ipaas/core-utils'

export const getProjectConcurrencyPoolKey = (projectId: ProjectId): string => `project:concurrency-pool:${projectId}`
export const getConcurrencyPoolLimitKey = (poolId: string): string => `concurrency-pool:limit:${poolId}`
export const getConcurrencyPoolSetKey = (poolId: string): string => `active_jobs_set:pool:${poolId}`
