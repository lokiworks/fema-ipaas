import { isNil } from '@fema-ipaas/core-utils'
import { AccountSecurityStatus, TenantMfaPolicy, UserIdentity } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { tenantLookup } from '../authentication/lib/tenant-lookup'
import { mfaService } from '../authentication/mfa/mfa.service'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { repoFactory } from '../core/db/repo-factory'
import { ExternalIdentityEntity } from '../federation/external-identity.entity'
import { userService } from './user-service'

const externalIdentityRepo = repoFactory(ExternalIdentityEntity)

export const accountSecurityService = (log: FastifyBaseLogger) => ({
    async getStatus({ identityId, tenantId }: GetStatusParams): Promise<AccountSecurityStatus> {
        const identity = await userIdentityService(log).getOneOrFail({ id: identityId })
        return this.statusOf({ identity, tenantId })
    },

    async statusOf({ identity, tenantId }: StatusOfParams): Promise<AccountSecurityStatus> {
        const [tenant, externalIdentities, remaining] = await Promise.all([
            tenantLookup.find({ tenantId }),
            externalIdentityRepo().find({ where: { identityId: identity.id } }),
            identity.mfaEnabled ? mfaService(log).recoveryCodesRemaining({ identityId: identity.id }) : Promise.resolve(0),
        ])
        return {
            email: identity.email,
            emailVerified: !isNil(identity.email) && identity.verified,
            phone: identity.phone,
            phoneVerified: !isNil(identity.phone) && identity.phoneVerified,
            mfaEnabled: identity.mfaEnabled,
            mfaRequiredByTenant: tenant?.mfaPolicy === TenantMfaPolicy.REQUIRED,
            recoveryCodesRemaining: remaining,
            externalLogins: externalIdentities.map((external) => ({
                issuer: external.issuer,
                label: external.displayName ?? external.email ?? external.issuer,
            })),
        }
    },

    async identityIdOf({ userId }: IdentityIdOfParams): Promise<string> {
        const user = await userService(log).getOneOrFail({ id: userId })
        return user.identityId
    },
})

type GetStatusParams = {
    identityId: string
    tenantId: string
}

type StatusOfParams = {
    identity: UserIdentity
    tenantId: string
}

type IdentityIdOfParams = {
    userId: string
}
