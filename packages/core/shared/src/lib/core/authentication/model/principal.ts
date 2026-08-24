import type { EntityId, TenantId, WorkspaceId } from '@fema-ipaas/core-utils'
import { PrincipalType } from './principal-type'

export type WorkerPrincipal = {
    id: EntityId
    type: PrincipalType.WORKER
}

export type AnnonymousPrincipal = {
    id: EntityId
    type: PrincipalType.UNKNOWN
}

export type ServicePrincipal = {
    id: EntityId
    type: PrincipalType.SERVICE
    tenant: {
        id: EntityId
    }
}

export type UserPrincipal = {
    id: EntityId
    type: PrincipalType.USER
    tenant: {
        id: EntityId
    }
    tokenVersion?: string
}

export type EnginePrincipal = {
    id: EntityId
    type: PrincipalType.ENGINE
    workspaceId: WorkspaceId
    tenant: {
        id: TenantId
    }
}


export type OnboardingPrincipal = {
    id: EntityId
    type: PrincipalType.ONBOARDING
    tokenVersion?: string
}

export type PrincipalForType<T extends PrincipalType> = Extract<Principal, { type: T }>

export type PrincipalForTypes<R extends readonly PrincipalType[]> = PrincipalForType<R[number]>

export type Principal =
    | WorkerPrincipal
    | AnnonymousPrincipal
    | ServicePrincipal
    | UserPrincipal
    | EnginePrincipal
    | OnboardingPrincipal
