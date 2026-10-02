import { isNil } from '@fema-ipaas/core-utils'
import { ConnectionStatus } from '@fema-ipaas/shared'

function sameAccountError({ existingStatus, existingIdentifier, resolvedIdentifier }: SameAccountParams): string | null {
    if (isNil(existingStatus) || existingStatus === ConnectionStatus.MISSING) {
        return null
    }
    if (typeof existingIdentifier !== 'string' || isNil(resolvedIdentifier)) {
        return null
    }
    if (normalize(existingIdentifier) === normalize(resolvedIdentifier)) {
        return null
    }
    return `This connection was authorized as ${existingIdentifier}, but the new credentials belong to ${resolvedIdentifier}. Reauthorize with the same account, or create a new connection for the other account`
}

function normalize(identifier: string): string {
    return identifier.trim().toLowerCase()
}

export const connectionIdentityUtils = { sameAccountError }

type SameAccountParams = {
    existingStatus: ConnectionStatus | undefined
    existingIdentifier: unknown
    resolvedIdentifier: string | undefined
}
