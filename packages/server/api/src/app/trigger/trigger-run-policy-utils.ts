import { isNil } from '@fema-ipaas/core-utils'
import { ConnectorTriggerSettings, Execution, RunConcurrencyTicket, triggerRunSettingsUtils } from '@fema-ipaas/shared'
import { DedupeClaim, DuplicatePayload } from './dedupe-service'

export const triggerRunPolicyUtils = {
    ticketFor,
    firstExecutionIdOf,
    businessKeyOf,
}

function businessKeyOf({ settings, payload }: { settings: ConnectorTriggerSettings | undefined, payload: unknown }): string | null {
    const keyPath = settings?.dedupe?.keyPath
    if (isNil(keyPath)) {
        return null
    }
    const key = triggerRunSettingsUtils.readKey({ payload, keyPath })
    return isNil(key) ? null : key.slice(0, MAX_BUSINESS_KEY_LENGTH)
}

const MAX_BUSINESS_KEY_LENGTH = 255

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
