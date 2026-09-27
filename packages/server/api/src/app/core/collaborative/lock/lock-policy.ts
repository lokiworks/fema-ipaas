import { isNil } from '@fema-ipaas/shared'

function decide({ existing, userId, force, now }: DecideParams): LockDecision {
    if (isNil(existing)) {
        return { kind: LockDecisionKind.ACQUIRE }
    }
    if (existing.userId === userId) {
        return { kind: LockDecisionKind.RENEW }
    }
    if (isExpired({ lock: existing, now })) {
        return { kind: LockDecisionKind.ACQUIRE, previousUserId: existing.userId }
    }
    if (force) {
        return { kind: LockDecisionKind.TAKE_OVER, previousUserId: existing.userId }
    }
    return { kind: LockDecisionKind.DENY }
}

function nextValue({ existing, decision, userId, userDisplayName, active, now }: NextValueParams): EditLockValue {
    const keepActivity = decision.kind === LockDecisionKind.RENEW && !active && !isNil(existing?.lastActiveAt)
    return {
        userId,
        userDisplayName,
        lastActiveAt: keepActivity && !isNil(existing?.lastActiveAt) ? existing.lastActiveAt : new Date(now).toISOString(),
    }
}

function isExpired({ lock, now }: { lock: EditLockValue, now: number }): boolean {
    if (isNil(lock.lastActiveAt)) {
        return false
    }
    return now - new Date(lock.lastActiveAt).getTime() > EDIT_LOCK_VALIDITY_MS
}

function expiresAt(lock: EditLockValue): string | undefined {
    if (isNil(lock.lastActiveAt)) {
        return undefined
    }
    return new Date(new Date(lock.lastActiveAt).getTime() + EDIT_LOCK_VALIDITY_MS).toISOString()
}

export const lockPolicy = {
    decide,
    nextValue,
    isExpired,
    expiresAt,
}

export const EDIT_LOCK_VALIDITY_MS = 2 * 60 * 60 * 1000

export enum LockDecisionKind {
    ACQUIRE = 'ACQUIRE',
    RENEW = 'RENEW',
    TAKE_OVER = 'TAKE_OVER',
    DENY = 'DENY',
}

export type EditLockValue = {
    userId: string
    userDisplayName: string
    lastActiveAt?: string
}

export type LockDecision = {
    kind: LockDecisionKind
    previousUserId?: string
}

type DecideParams = {
    existing: EditLockValue | null
    userId: string
    force: boolean
    now: number
}

type NextValueParams = {
    existing: EditLockValue | null
    decision: LockDecision
    userId: string
    userDisplayName: string
    active: boolean
    now: number
}
