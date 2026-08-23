import { apId, ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil, SeekPage, spreadIfDefined } from '@fema-ipaas/core-utils'
import { DefaultWorkspaceRole, InvitationStatus, InvitationType, TenantRole, UserInvitation, UserInvitationWithLink } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { EntityManager, IsNull, ObjectLiteral, SelectQueryBuilder } from 'typeorm'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { repoFactory } from '../core/db/repo-factory'
import { domainHelper } from '../helper/domain-helper'
import { emailService } from '../helper/email/email-service'
import { JwtAudience, jwtUtils } from '../helper/jwt-utils'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { userService } from '../user/user-service'
import { workspaceMemberService } from '../workspace/workspace-member.service'
import { UserInvitationEntity } from './user-invitation.entity'

export const userInvitationRepo = repoFactory(UserInvitationEntity)
const repo = userInvitationRepo

export const userInvitationsService = (log: FastifyBaseLogger) => ({
    async getOneByInvitationTokenOrThrow(invitationToken: string): Promise<UserInvitation> {
        const decodedToken = await jwtUtils.decodeAndVerify<UserInvitationToken>({
            jwt: invitationToken,
            key: await jwtUtils.getJwtSecret(),
            audience: JwtAudience.USER_INVITATION,
        })
        const invitation = await repo().findOneBy({
            id: decodedToken.id,
        })
        if (isNil(invitation)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: `id=${decodedToken.id}`,
                    entityType: 'UserInvitation',
                },
            })
        }
        return invitation
    },
    async provisionUserInvitation({ email }: ProvisionUserInvitationParams): Promise<void> {
        const invitations = await repo().createQueryBuilder('user_invitation')
            .where('LOWER("user_invitation"."email") = :email', { email: email.toLowerCase().trim() })
            .andWhere({
                status: InvitationStatus.ACCEPTED,
            })
            .getMany()

        if (invitations.length === 0) return

        const identity = await userIdentityService(log).getIdentityByEmail(email)
        if (isNil(identity)) return

        log.info({ count: invitations.length }, '[provisionUserInvitation] list invitations')
        for (const invitation of invitations) {
            log.info({ invitation }, '[provisionUserInvitation] provision')
            const user = await userService(log).getOrCreateWithWorkspace({
                identity,
                tenantId: invitation.tenantId,
            })
            switch (invitation.type) {
                case InvitationType.TENANT: {
                    assertNotNullOrUndefined(invitation.tenantRole, 'tenantRole')
                    await userService(log).update({
                        id: user.id,
                        tenantId: invitation.tenantId,
                        tenantRole: invitation.tenantRole,
                    })
                    break
                }
                case InvitationType.WORKSPACE: {
                    const { workspaceId } = invitation
                    assertNotNullOrUndefined(workspaceId, 'workspaceId')
                    await workspaceMemberService(log).upsert({
                        workspaceId,
                        userId: user.id,
                        role: toWorkspaceRole(invitation.workspaceRoleId),
                    })
                    break
                }
            }
            await repo().delete({
                id: invitation.id,
            })
        }
    },
    async createInvitationRecord({
        email,
        tenantId,
        workspaceId,
        type,
        workspaceRoleId,
        tenantRole,
        status,
        entityManager,
    }: CreateInvitationRecordParams): Promise<UserInvitation> {
        const id = apId()
        await repo(entityManager).upsert({
            id,
            status,
            type,
            email: email.toLowerCase().trim(),
            tenantId,
            workspaceRoleId: type === InvitationType.TENANT ? undefined : workspaceRoleId!,
            tenantRole: type === InvitationType.WORKSPACE ? undefined : tenantRole!,
            workspaceId: type === InvitationType.TENANT ? undefined : workspaceId!,
        }, ['email', 'tenantId', 'workspaceId'])

        return this.getOneOrThrow({
            id,
            tenantId,
            entityManager,
        })
    },
    async finalizeInvitation({
        userInvitation,
        invitationExpirySeconds,
    }: FinalizeInvitationParams): Promise<UserInvitationWithLink> {
        if (userInvitation.status === InvitationStatus.ACCEPTED) {
            await this.accept({
                invitationId: userInvitation.id,
                tenantId: userInvitation.tenantId,
            })
            if (emailService(log).isConfigured()) {
                await emailService(log).sendWorkspaceMemberAdded({
                    userInvitation,
                })
            }
            return userInvitation
        }
        return enrichWithInvitationLink(userInvitation, invitationExpirySeconds, log)
    },
    async wouldAddNewUser({ email, tenantId }: { email: string, tenantId: string }): Promise<boolean> {
        const identity = await userIdentityService(log).getIdentityByEmail(email)
        if (isNil(identity)) {
            return true
        }
        const existingUser = await userService(log).getOneByIdentityAndTenant({ identityId: identity.id, tenantId })
        return isNil(existingUser)
    },
    async countReservedSeats({ tenantId, entityManager }: CountReservedSeatsParams): Promise<number> {
        const query = repo(entityManager)
            .createQueryBuilder('invitation')
            .select('COUNT(DISTINCT LOWER(invitation.email))', 'count')
        const result = await withinReservationWindow(query, tenantId)
            .andWhere(EMAIL_IS_NOT_ALREADY_A_TENANT_USER)
            .getRawOne<{ count: string }>()
        return Number(result?.count ?? 0)
    },
    async countAdditionalSeatsNeeded({
        email,
        tenantId,
        entityManager,
    }: CountAdditionalSeatsNeededParams): Promise<number> {
        const addsNewUser = await this.wouldAddNewUser({ email, tenantId })
        if (!addsNewUser) {
            return 0
        }
        const alreadyReserved = await withinReservationWindow(repo(entityManager).createQueryBuilder('invitation'), tenantId)
            .andWhere('LOWER(invitation.email) = :email', { email: email.toLowerCase().trim() })
            .getExists()
        return alreadyReserved ? 0 : 1
    },
    async list(params: ListUserParams): Promise<SeekPage<UserInvitation>> {
        const decodedCursor = paginationHelper.decodeCursor(params.cursor ?? null)
        const paginator = buildPaginator({
            entity: UserInvitationEntity,
            query: {
                limit: params.limit,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const queryBuilder = repo().createQueryBuilder('user_invitation')
            .where({
                tenantId: params.tenantId,
                ...spreadIfDefined('workspaceId', params.workspaceId),
                ...spreadIfDefined('status', params.status),
                ...spreadIfDefined('type', params.type),
            })
        const { data, cursor } = await paginator.paginate(queryBuilder)
        const enrichedData = await Promise.all(data.map(async (invitation) => {
            return {
                workspaceRole: null,
                ...invitation,
            }
        }))
        return paginationHelper.createPage<UserInvitation>(await Promise.all(enrichedData), cursor)
    },
    async delete({ id, tenantId }: TenantAndIdParams): Promise<void> {
        const invitation = await this.getOneOrThrow({ id, tenantId })
        await repo().delete({
            id: invitation.id,
            tenantId,
        })
    },
    async getOneOrThrow({ id, tenantId, entityManager }: TenantAndIdParams): Promise<UserInvitation> {
        const invitation = await repo(entityManager).findOne({
            where: {
                id,
                tenantId,
            },
        })
        if (isNil(invitation)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: `id=${id}`,
                    entityType: 'UserInvitation',
                },
            })
        }
        return invitation
    },
    async accept({ invitationId, tenantId }: AcceptParams): Promise<AcceptResult> {
        const invitation = await this.getOneOrThrow({ id: invitationId, tenantId })
        await repo().update(invitation.id, {
            status: InvitationStatus.ACCEPTED,
        })
        const identity = await userIdentityService(log).getIdentityByEmail(invitation.email)
        if (isNil(identity)) {
            return { registered: false }
        }
        await this.provisionUserInvitation({
            email: invitation.email,
        })
        return { registered: true }
    },
    async hasAnyAcceptedInvitationsForEmail({ email }: { email: string }): Promise<boolean> {
        const count = await repo().createQueryBuilder('user_invitation')
            .where('LOWER("user_invitation"."email") = :email', { email: email.toLowerCase().trim() })
            .andWhere({ status: InvitationStatus.ACCEPTED })
            .getCount()
        return count > 0
    },
    async hasAnyAcceptedInvitations({
        email,
        tenantId,
    }: HasAnyAcceptedInvitationsParams): Promise<boolean> {
        const invitations = await repo().createQueryBuilder().where({
            tenantId,
            status: InvitationStatus.ACCEPTED,
        }).andWhere('LOWER(user_invitation.email) = :email', { email: email.toLowerCase().trim() })
            .getMany()
        return invitations.length > 0
    },
    async getByEmailAndTenantIdOrThrow({
        email,
        tenantId,
        workspaceId,
    }: GetOneByTenantIdAndEmailParams): Promise<UserInvitation | null> {
        return repo().findOneBy({
            email,
            tenantId,
            workspaceId: isNil(workspaceId) ? IsNull() : workspaceId,
        })
    },
})

function toWorkspaceRole(workspaceRoleId: string | null | undefined): DefaultWorkspaceRole {
    const roles: string[] = Object.values(DefaultWorkspaceRole)
    if (!isNil(workspaceRoleId) && roles.includes(workspaceRoleId)) {
        return workspaceRoleId as DefaultWorkspaceRole
    }
    return DefaultWorkspaceRole.VIEWER
}

export const INVITATION_EXPIRY_SECONDS = dayjs.duration(7, 'days').asSeconds()

export function getInvitationExpiryCutoff(): string {
    return dayjs().subtract(INVITATION_EXPIRY_SECONDS, 'seconds').toISOString()
}

function withinReservationWindow<T extends ObjectLiteral>(query: SelectQueryBuilder<T>, tenantId: string): SelectQueryBuilder<T> {
    return query
        .where('invitation.tenantId = :tenantId', { tenantId })
        .andWhere('invitation.status IN (:...statuses)', { statuses: [InvitationStatus.PENDING, InvitationStatus.ACCEPTED] })
        .andWhere('invitation.updated > :expiryCutoff', { expiryCutoff: getInvitationExpiryCutoff() })
}

const EMAIL_IS_NOT_ALREADY_A_TENANT_USER = `NOT EXISTS (
    SELECT 1
    FROM user_identity identity
    INNER JOIN "user" existing_user
        ON existing_user."identityId" = identity.id
        AND existing_user."tenantId" = invitation."tenantId"
    WHERE LOWER(identity.email) = LOWER(invitation.email)
)`

async function generateInvitationLink(userInvitation: UserInvitation, expireyInSeconds: number): Promise<string> {
    const token = await jwtUtils.sign({
        payload: {
            id: userInvitation.id,
        },
        expiresInSeconds: expireyInSeconds,
        key: await jwtUtils.getJwtSecret(),
        audience: JwtAudience.USER_INVITATION,
    })

    return domainHelper.getPublicUrl({
        path: `invitation?token=${token}&email=${encodeURIComponent(userInvitation.email)}`,
    })
}
const enrichWithInvitationLink = async (userInvitation: UserInvitation, expireyInSeconds: number, log: FastifyBaseLogger) => {
    const invitationLink = await generateInvitationLink(userInvitation, expireyInSeconds)
    if (!emailService(log).isConfigured()) {
        return {
            ...userInvitation,
            link: invitationLink,
        }
    }
    await emailService(log).sendInvitation({
        userInvitation,
        invitationLink,
    })
    return userInvitation
}
type ListUserParams = {
    tenantId: string
    type: InvitationType
    workspaceId: string | null
    status?: InvitationStatus
    limit: number
    cursor: string | null
}

type HasAnyAcceptedInvitationsParams = {
    email: string
    tenantId: string
}
type ProvisionUserInvitationParams = {
    email: string
}

type TenantAndIdParams = {
    id: string
    tenantId: string
    entityManager?: EntityManager
}
export type UserInvitationToken = {
    id: string
}

type AcceptParams = {
    invitationId: string
    tenantId: string
}

type AcceptResult = {
    registered: boolean
}

export type CreateInvitationRecordParams = {
    email: string
    tenantId: string
    tenantRole: TenantRole | null
    workspaceId: string | null
    status: InvitationStatus
    type: InvitationType
    workspaceRoleId: string | null
    entityManager?: EntityManager
}

export type FinalizeInvitationParams = {
    userInvitation: UserInvitation
    invitationExpirySeconds: number
}

export type CountAdditionalSeatsNeededParams = {
    email: string
    tenantId: string
    entityManager?: EntityManager
}

export type CountReservedSeatsParams = {
    tenantId: string
    entityManager?: EntityManager
}

type GetOneByTenantIdAndEmailParams = {
    email: string
    tenantId: string
    workspaceId: string | null
}
