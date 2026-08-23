import type { ApId, TenantId, WorkspaceId } from '@fema-ipaas/core-utils'
import { PrincipalType } from './principal-type'

export type WorkerPrincipal = {
    id: ApId
    type: PrincipalType.WORKER
}

export type AnnonymousPrincipal = {
    id: ApId
    type: PrincipalType.UNKNOWN
}

export type ServicePrincipal = {
    id: ApId
    type: PrincipalType.SERVICE
    tenant: {
        id: ApId
    }
}

export type UserPrincipal = {
    id: ApId
    type: PrincipalType.USER
    tenant: {
        id: ApId
    }
    tokenVersion?: string
}

export type EnginePrincipal = {
    id: ApId
    type: PrincipalType.ENGINE
    workspaceId: WorkspaceId
    tenant: {
        id: TenantId
    }
}


export type OnboardingPrincipal = {
    id: ApId
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
