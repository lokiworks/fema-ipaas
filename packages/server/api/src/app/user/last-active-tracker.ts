import { UserId } from '@fema-ipaas/core-utils'

const writtenAtByUser = new Map<UserId, number>()

function shouldWrite({ userId, now }: ShouldWriteParams): boolean {
    const previous = writtenAtByUser.get(userId)
    if (previous !== undefined && now - previous < LAST_ACTIVE_WRITE_INTERVAL_MS) {
        return false
    }
    writtenAtByUser.set(userId, now)
    return true
}

function reset(): void {
    writtenAtByUser.clear()
}

const LAST_ACTIVE_WRITE_INTERVAL_MS = 5 * 60 * 1000

export const lastActiveTracker = { shouldWrite, reset }

type ShouldWriteParams = {
    userId: UserId
    now: number
}
