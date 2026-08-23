import { UserId, WorkspaceId } from '@fema/core-utils'
import { TelemetryEvent, User, UserIdentity } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'

export const telemetry = (_log: FastifyBaseLogger) => ({
    async identify(_identity: UserIdentity, _user?: User, _workspaceId?: WorkspaceId): Promise<void> {
        return
    },
    async trackTenant(_tenantId: WorkspaceId, _event: TelemetryEvent): Promise<void> {
        return
    },
    async trackWorkspace(_workspaceId: WorkspaceId, _event: TelemetryEvent): Promise<void> {
        return
    },
    async trackIdentity(_identityId: string, _event: TelemetryEvent): Promise<void> {
        return
    },
    async trackUser(_userId: UserId, _event: TelemetryEvent, _groups?: Record<string, string>): Promise<void> {
        return
    },
    isEnabled: () => false,
})

export async function shutdownTelemetry(): Promise<void> {
    return
}

function onceToday(_key: string): boolean {
    return false
}

export const telemetryDedupe = { onceToday }
