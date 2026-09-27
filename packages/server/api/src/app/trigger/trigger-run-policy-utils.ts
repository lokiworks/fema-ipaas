import { isNil } from '@fema-ipaas/core-utils'
import { ConnectorTriggerSettings, Execution, RunConcurrencyTicket, triggerRunSettingsUtils } from '@fema-ipaas/shared'
import { DedupeClaim, DuplicatePayload } from './dedupe-service'

export const triggerRunPolicyUtils = {
    ticketFor,
    firstExecutionIdOf,
}

function ticketFor({ settings, payload, enqueuedAt }: { settings: ConnectorTriggerSettings | undefined, payload: unknown, enqueuedAt: number }): RunConcurrencyTicket | undefined {
    if (isNil(settings)) {
        return undefined
    }
    const maxConcurrentRuns = triggerRunSettingsUtils.maxConcurrentRuns(settings)
    const orderKeyPath = triggerRunSettingsUtils.orderKeyPathOf(settings)
    const orderKey = isNil(orderKeyPath) ? null : triggerRunSettingsUtils.readKey({ payload, keyPath: orderKeyPath })
    if (maxConcurrentRuns <= 0 && isNil(orderKey)) {
        return undefined
    }
    return {
        maxConcurrentRuns,
        ...(isNil(orderKey) ? {} : { orderKey }),
        enqueuedAt,
    }
}

function firstExecutionIdOf({ duplicate, started }: { duplicate: DuplicatePayload, started: { execution: Execution, claim: DedupeClaim | null }[] }): string | null {
    if (!isNil(duplicate.firstExecutionId)) {
        return duplicate.firstExecutionId
    }
    return started.find(({ claim }) => claim?.keyHash === duplicate.keyHash)?.execution.id ?? null
}
