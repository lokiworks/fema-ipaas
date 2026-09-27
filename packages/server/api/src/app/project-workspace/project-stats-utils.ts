import { ExecutionStatus } from '@fema-ipaas/shared'

export const projectStatsUtils = {
    FAILED_STATUSES: [
        ExecutionStatus.FAILED,
        ExecutionStatus.INTERNAL_ERROR,
        ExecutionStatus.TIMEOUT,
        ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
        ExecutionStatus.LOG_SIZE_EXCEEDED,
    ],
}
