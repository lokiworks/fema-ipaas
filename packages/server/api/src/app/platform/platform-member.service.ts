import { ApplicationError, ErrorCode, isNil, TenantId } from '@fema-ipaas/core-utils'
import {
    ExternalIdentityStatus,
    PlatformAddMemberRequestBody,
    PlatformMember,
    PlatformMemberRef,
    PlatformMemberStatus,
    SAAS_LIMITS,
    TenantRole,
    UserStatus,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { userIdentityRepository, userIdentityService } from '../authentication/user-identity/user-identity-service'
import { ExternalIdentityRecord, externalIdentityService } from '../federation/external-identity.service'
import { identityContact } from '../helper/identity-contact'
import { tenantOwnerService } from '../tenant/tenant-owner.service'
import { tenantService } from '../tenant/tenant.service'
import { userRepo, userService } from '../user/user-service'

export const platformMemberService = (log: FastifyBaseLogger) => ({
    async list({ tenantId }: TenantParams): Promise<PlatformMember[]> {
        const [users, bindings] = await Promise.all([
            userRepo().find({ where: { tenantId } }),
            externalIdentityService(log).listForTenant({ tenantId }),
        ])
        const identities = await userIdentityRepository().find({ where: { id: In(users.map((user) => user.identityId)) } })
        const identityById = new Map(identities.map((identity) => [identity.id, identity]))
        const bindingByUserId = new Map(bindings.flatMap((binding) => isNil(binding.userId) ? [] : [[binding.userId, binding] as const]))
        const existing = users.map((user): PlatformMember => {
            const identity = identityById.get(user.identityId)
            const binding = bindingByUserId.get(user.id)
            return {
                userId: user.id,
                subject: binding?.subject ?? null,
                email: identityContact.emailOrNull(identity) ?? binding?.email ?? null,
                phone: identity?.phone ?? null,
                name: isNil(identity) ? '' : identityContact.fullName(identity),
                role: user.tenantRole,
                status: user.status === UserStatus.ACTIVE && binding?.status !== ExternalIdentityStatus.REVOKED ? PlatformMemberStatus.ACTIVE : PlatformMemberStatus.INACTIVE,
            }
        })
        const pending = bindings.filter((binding) => isNil(binding.userId)).map(toPendingMember)
        return [...existing, ...pending]
    },

    async add({ tenantId, request }: { tenantId: TenantId, request: PlatformAddMemberRequestBody }): Promise<PlatformMember[]> {
        if (!isNil(request.subject)) {
            await this.addBySubject({ tenantId, request, subject: request.subject })
            return this.list({ tenantId })
        }
        await this.addByContact({ tenantId, request })
        return this.list({ tenantId })
    },

    async addBySubject({ tenantId, request, subject }: { tenantId: TenantId, request: PlatformAddMemberRequestBody, subject: string }): Promise<void> {
        const issuer = await memberIssuerOf({ tenantId, log })
        const displayName = `${request.firstName ?? ''} ${request.lastName ?? ''}`.trim()
        const binding = await externalIdentityService(log).prebind({
            tenantId,
            issuer,
            subject,
            role: request.role,
            email: request.email,
            displayName: displayName.length === 0 ? null : displayName,
        })
        if (binding.status === ExternalIdentityStatus.REVOKED) {
            await externalIdentityService(log).restoreBySubject({ issuer, subject })
        }
        if (!isNil(binding.userId)) {
            await userService(log).update({ id: binding.userId, tenantId, tenantRole: request.role, status: UserStatus.ACTIVE })
        }
    },

    async addByContact({ tenantId, request }: { tenantId: TenantId, request: PlatformAddMemberRequestBody }): Promise<void> {
        const phone = request.phone?.trim()
        if (!isNil(phone) && !SAAS_LIMITS.phonePattern.test(phone)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'invalidPhone' },
            })
        }
        const { identityId } = await tenantOwnerService(log).ensureIdentity({
            owner: { email: request.email, phone, firstName: request.firstName, lastName: request.lastName },
        })
        const identity = await userIdentityService(log).getOneOrFail({ id: identityId })
        const user = await userService(log).getOrCreateWithProject({ identity, tenantId })
        await userService(log).update({ id: user.id, tenantId, tenantRole: request.role, status: UserStatus.ACTIVE })
    },

    async remove({ tenantId, ref }: { tenantId: TenantId, ref: PlatformMemberRef }): Promise<void> {
        if (isNil(ref.subject) && isNil(ref.userId)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'memberReferenceRequired' },
            })
        }
        const tenant = await tenantService(log).getOneOrThrow(tenantId)
        const bindings = await externalIdentityService(log).listForTenant({ tenantId })
        const matching = bindings.filter((binding) => binding.subject === ref.subject || (!isNil(ref.userId) && binding.userId === ref.userId))
        const userId = ref.userId ?? matching.find((binding) => !isNil(binding.userId))?.userId ?? null
        if (isNil(userId) && matching.length === 0) {
            throw notFound({ memberRef: ref.subject ?? ref.userId ?? '' })
        }
        if (!isNil(userId) && userId === tenant.ownerId) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'Tenant owner cannot be removed' },
            })
        }
        await Promise.all(matching.map((binding) => externalIdentityService(log).revokeBySubject({ issuer: binding.issuer, subject: binding.subject })))
        if (!isNil(userId)) {
            await assertUserBelongs({ userId, tenantId })
            await userRepo().update({ id: userId, tenantId }, { status: UserStatus.INACTIVE })
            log.info({ tenant: { id: tenantId }, user: { id: userId } }, '[platformMember] member deactivated')
        }
    },
})

async function memberIssuerOf({ tenantId, log }: { tenantId: TenantId, log: FastifyBaseLogger }): Promise<string> {
    const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
    const issuer = tenant.federatedAuthProviders.oidc?.issuer ?? tenant.externalIssuer
    if (isNil(issuer)) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'tenantHasNoExternalIssuer' },
        })
    }
    return issuer
}

async function assertUserBelongs({ userId, tenantId }: { userId: string, tenantId: TenantId }): Promise<void> {
    const exists = await userRepo().existsBy({ id: userId, tenantId })
    if (!exists) {
        throw notFound({ memberRef: userId })
    }
}

function toPendingMember(binding: ExternalIdentityRecord): PlatformMember {
    return {
        userId: null,
        subject: binding.subject,
        email: binding.email,
        phone: null,
        name: binding.displayName ?? '',
        role: binding.prebindRole ?? TenantRole.MEMBER,
        status: binding.status === ExternalIdentityStatus.REVOKED ? PlatformMemberStatus.INACTIVE : PlatformMemberStatus.PENDING_BINDING,
    }
}

function notFound({ memberRef }: { memberRef: string }): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.ENTITY_NOT_FOUND,
        params: { entityType: 'member', entityId: memberRef },
    })
}

export const platformMemberUtils = {
    toPendingMember,
}

type TenantParams = {
    tenantId: TenantId
}
