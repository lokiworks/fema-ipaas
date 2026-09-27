import { isNil } from '@fema-ipaas/core-utils'
import dayjs from 'dayjs'

function decide({ projectUsed, projectLimit, instanceUsed, instanceLimit }: DecideParams): RunQuotaVerdict {
    if (!isNil(projectLimit) && projectUsed >= projectLimit) {
        return { allowed: false, scope: RunQuotaScope.PROJECT, used: projectUsed, limit: projectLimit }
    }
    if (instanceUsed >= instanceLimit) {
        return { allowed: false, scope: RunQuotaScope.INSTANCE, used: instanceUsed, limit: instanceLimit }
    }
    return { allowed: true }
}

function monthOf(date: dayjs.Dayjs): string {
    return date.format('YYYY-MM')
}

function monthStart(date: dayjs.Dayjs): string {
    return date.startOf('month').toISOString()
}

function monthStartOf(month: string): string {
    return dayjs(`${month}-01T00:00:00`).startOf('month').toISOString()
}

function rejectionMessage(verdict: RunQuotaVerdict): string {
    if (verdict.allowed) {
        return ''
    }
    const scope = verdict.scope === RunQuotaScope.PROJECT ? 'this project' : 'this instance'
    return `The monthly run limit of ${verdict.limit.toLocaleString('en-US')} runs for ${scope} is reached, so this run was not started. It resumes at the start of next month or after an administrator raises the limit.`
}

function usageRatio({ used, limit }: { used: number, limit: number | null }): number | null {
    if (isNil(limit) || limit <= 0) {
        return null
    }
    return used / limit
}

function crossedThreshold({ used, limit, thresholdPercent }: { used: number, limit: number | null, thresholdPercent: number }): boolean {
    const ratio = usageRatio({ used, limit })
    return !isNil(ratio) && ratio * 100 >= thresholdPercent
}

export const runQuotaUtils = { decide, monthOf, monthStart, monthStartOf, rejectionMessage, usageRatio, crossedThreshold }

export enum RunQuotaScope {
    PROJECT = 'PROJECT',
    INSTANCE = 'INSTANCE',
}

export type RunQuotaVerdict =
    | { allowed: true }
    | { allowed: false, scope: RunQuotaScope, used: number, limit: number }

type DecideParams = {
    projectUsed: number
    projectLimit: number | null
    instanceUsed: number
    instanceLimit: number
}
