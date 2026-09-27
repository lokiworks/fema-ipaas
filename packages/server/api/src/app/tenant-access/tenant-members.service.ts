import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { AddTenantUsersRequestBody, AddTenantUsersResponse, InvitationStatus, InvitationType, ListTenantMembersResponse, TenantMember, TenantMemberStatus, TenantModule, TenantRole, UpdateTenantMemberAccessRequestBody, UserIdentityProvider, UserStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { isDomainAllowed } from '../authentication/authentication-utils'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { emailService } from '../helper/email/email-service'
import { tenantRepo } from '../tenant/tenant.service'
import { userRepo, userService } from '../user/user-service'
import { INVITATION_EXPIRY_SECONDS, userInvitationRepo, userInvitationsService } from '../user-invitations/user-invitation.service'
import { ownedResourcesService } from './owned-resources.service'
import { tenantAccessUtils } from './tenant-access.utils'

const USER_KIND = 'USER'
const INVITATION_KIND = 'INVITATION'

export const tenantMembersService = (log: FastifyBaseLogger) => ({
    async list({ tenantId }: TenantParams): Promise<ListTenantMembersResponse> {
        const tenant = await tenantRepo().findOneByOrFail({ id: tenantId })
        const users = await userRepo().find({ where: { tenantId }, relations: { identity: true } })
        const invitations = await userInvitationRepo().find({ where: { tenantId, type: InvitationType.TENANT, status: InvitationStatus.PENDING } })
        const owner = users.find((user) => user.id === tenant.ownerId)
        const domains = tenantAccessUtils.homeDomains({ allowedAuthDomains: tenant.allowedAuthDomains, ownerEmail: owner?.identity?.email ?? null })
        const userEmails = new Set(users.map((user) => user.identity?.email?.toLowerCase()).filter((email): email is string => !isNil(email)))
        const members: TenantMember[] = [
            ...users.map((user): TenantMember => {
                const email = user.identity?.email ?? ''
                const tenantRole = user.id === tenant.ownerId ? TenantRole.ADMIN : user.tenantRole
                return {
                    id: user.id,
                    kind: USER_KIND,
                    email,
                    firstName: user.identity?.firstName ?? '',
                    lastName: user.identity?.lastName ?? '',
                    status: user.status === UserStatus.ACTIVE ? TenantMemberStatus.ACTIVE : TenantMemberStatus.DISABLED,
                    tenantRole,
                    isOwner: user.id === tenant.ownerId,
                    modules: tenantAccessUtils.effectiveModules({ tenantRole, storedModules: user.modules ?? [] }),
                    external: tenantAccessUtils.isExternal({ email, domains }),
                    lastActiveDate: user.lastActiveDate ?? null,
                    created: user.created,
                }
            }),
            ...invitations
                .filter((invitation) => !userEmails.has(invitation.email.toLowerCase()))
                .map((invitation): TenantMember => {
                    const tenantRole = invitation.tenantRole ?? TenantRole.MEMBER
                    return {
                        id: invitation.id,
                        kind: INVITATION_KIND,
                        email: invitation.email,
                        firstName: '',
                        lastName: '',
                        status: TenantMemberStatus.PENDING,
                        tenantRole,
                        isOwner: false,
                        modules: tenantAccessUtils.effectiveModules({ tenantRole, storedModules: invitation.modules ?? [] }),
                        external: tenantAccessUtils.isExternal({ email: invitation.email, domains }),
                        lastActiveDate: null,
                        created: invitation.created,
                    }
                }),
        ]
        return {
            members,
            homeDomains: domains,
            emailAuthEnabled: tenant.emailAuthEnabled,
            emailDelivery: emailService(log).isConfigured(),
        }
    },

    async invite({ tenantId, request }: InviteParams): Promise<AddTenantUsersResponse> {
        const tenant = await tenantRepo().findOneByOrFail({ id: tenantId })
        const emails = [...new Set(request.emails.map((email) => email.trim().toLowerCase()))]
        const { members, homeDomains } = await this.list({ tenantId })
        const existing = new Set(members.filter((member) => member.kind === USER_KIND).map((member) => member.email.toLowerCase()))
        const alreadyMembers = emails.filter((email) => existing.has(email))
        if (alreadyMembers.length > 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: `Already users of this tenant: ${alreadyMembers.join(', ')}` },
            })
        }
        const blocked = emails.filter((email) => !isDomainAllowed({ email, enforce: tenant.enforceAllowedAuthDomains, allowedDomains: tenant.allowedAuthDomains }))
        if (blocked.length > 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: `Email domain is not allowed to sign in: ${blocked.join(', ')}` },
            })
        }
        const modules = tenantAccessUtils.assignableModules(request.modules)
        const invited = []
        for (const email of emails) {
            const record = await userInvitationsService(log).createInvitationRecord({
                email,
                tenantId,
                type: InvitationType.TENANT,
                tenantRole: request.tenantRole,
                projectId: null,
                projectRoleId: null,
                status: InvitationStatus.PENDING,
                modules,
            })
            const finalized = await userInvitationsService(log).finalizeInvitation({
                userInvitation: record,
                invitationExpirySeconds: INVITATION_EXPIRY_SECONDS,
            })
            invited.push({
                email,
                link: 'link' in finalized && typeof finalized.link === 'string' ? finalized.link : null,
                external: tenantAccessUtils.isExternal({ email, domains: homeDomains }),
            })
        }
        return { invited, emailSent: emailService(log).isConfigured() }
    },

    async updateAccess({ tenantId, userId, actorId, request }: UpdateAccessParams): Promise<TenantMember> {
        const user = await this.assertEditable({ tenantId, userId, actorId })
        const tenantRole = request.tenantRole ?? user.tenantRole
        await userService(log).update({
            id: userId,
            tenantId,
            tenantRole,
            modules: isNil(request.modules) ? undefined : tenantAccessUtils.assignableModules(request.modules),
        })
        return this.getMemberOrThrow({ tenantId, userId })
    },

    async setStatus({ tenantId, userId, actorId, status }: SetStatusParams): Promise<TenantMember> {
        await this.assertEditable({ tenantId, userId, actorId })
        await userService(log).update({ id: userId, tenantId, status })
        return this.getMemberOrThrow({ tenantId, userId })
    },

    async resetPassword({ tenantId, userId, actorId }: MemberActionParams): Promise<string> {
        const user = await this.assertEditable({ tenantId, userId, actorId })
        const tenant = await tenantRepo().findOneByOrFail({ id: tenantId })
        if (!tenant.emailAuthEnabled) {
            throw validation('Email and password sign-in is disabled for this tenant')
        }
        if (user.status !== UserStatus.ACTIVE) {
            throw validation('Only active users can have their password reset')
        }
        const identity = await userIdentityService(log).getOneOrFail({ id: user.identityId })
        if (identity.provider !== UserIdentityProvider.EMAIL) {
            throw validation('This user signs in with an external identity provider and has no password here')
        }
        const memberships = await userService(log).getUsersByIdentityId({ identityId: user.identityId })
        const sharedWithOtherTenants = memberships.some((membership) => !isNil(membership.tenantId) && membership.tenantId !== tenantId)
        if (sharedWithOtherTenants) {
            throw validation('This account also belongs to another tenant, so its password cannot be reset from here')
        }
        const temporaryPassword = tenantAccessUtils.generateTemporaryPassword(tenantAccessUtils.temporaryPasswordLength(tenant.passwordMinLength))
        await userIdentityService(log).updatePassword({ id: identity.id, newPassword: temporaryPassword })
        log.info({ tenant: { id: tenantId }, user: { id: userId } }, '[tenantMembers] password reset by admin')
        return temporaryPassword
    },

    async remove({ tenantId, userId, actorId, transferToUserId }: RemoveParams): Promise<{ transferred: number }> {
        await this.assertEditable({ tenantId, userId, actorId })
        const owned = await ownedResourcesService(log).countOwnedBy({ tenantId, ownerId: userId })
        if (owned > 0 && isNil(transferToUserId)) {
            throw validation(`This user still owns ${owned} resources; choose who receives them before removing the user`)
        }
        if (!isNil(transferToUserId) && transferToUserId === userId) {
            throw validation('Resources cannot be transferred to the user being removed')
        }
        const result = owned > 0 && !isNil(transferToUserId)
            ? await ownedResourcesService(log).transferEverything({ tenantId, fromUserId: userId, toUserId: transferToUserId })
            : { transferred: 0, skipped: 0 }
        await userService(log).delete({ id: userId, tenantId })
        return { transferred: result.transferred }
    },

    async getMemberOrThrow({ tenantId, userId }: { tenantId: string, userId: string }): Promise<TenantMember> {
        const { members } = await this.list({ tenantId })
        const member = members.find((candidate) => candidate.kind === USER_KIND && candidate.id === userId)
        if (isNil(member)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'user', entityId: userId },
            })
        }
        return member
    },

    async assertEditable({ tenantId, userId, actorId }: MemberActionParams): Promise<EditableUser> {
        const tenant = await tenantRepo().findOneByOrFail({ id: tenantId })
        const user = await userRepo().findOneBy({ id: userId, tenantId })
        if (isNil(user)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'user', entityId: userId },
            })
        }
        if (user.id === tenant.ownerId) {
            throw validation('The tenant owner cannot be changed here')
        }
        if (user.id === actorId) {
            throw validation('You cannot change your own account here')
        }
        return {
            id: user.id,
            identityId: user.identityId,
            tenantRole: user.tenantRole,
            status: user.status,
            modules: user.modules ?? [],
        }
    },
})

function validation(message: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

type EditableUser = {
    id: string
    identityId: string
    tenantRole: TenantRole
    status: UserStatus
    modules: TenantModule[]
}

type TenantParams = {
    tenantId: string
}

type InviteParams = TenantParams & {
    request: AddTenantUsersRequestBody
}

type MemberActionParams = TenantParams & {
    userId: string
    actorId: string
}

type UpdateAccessParams = MemberActionParams & {
    request: UpdateTenantMemberAccessRequestBody
}

type SetStatusParams = MemberActionParams & {
    status: UserStatus
}

type RemoveParams = MemberActionParams & {
    transferToUserId: string | undefined
}
