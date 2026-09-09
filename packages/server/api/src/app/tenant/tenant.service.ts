import { ApplicationError, ErrorCode, generateId, isNil, spreadIfDefined, spreadIfNotUndefined, TenantId, UserId } from '@fema-ipaas/core-utils'
import { AuthenticationResponse, ProjectType, SsoDomainVerification, SYSTEM_LIMITS, Tenant, TenantLimits, TenantRole, TenantWithoutFederatedAuth, TenantWithoutSensitiveData, UpdateTenantRequestBody, User, UserStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { nanoid } from 'nanoid'
import { authenticationUtils } from '../authentication/authentication-utils'
import { signupNames } from '../authentication/lib/signup-names'
import { userIdentityRepository, userIdentityService } from '../authentication/user-identity/user-identity-service'
import { repoFactory } from '../core/db/repo-factory'
import { distributedLock } from '../database/redis-connections'
import { defaultTheme } from '../flags/theme'
import { projectService } from '../project/project-service'
import { userService } from '../user/user-service'
import { TenantEntity } from './tenant.entity'

export const tenantRepo = repoFactory<Tenant>(TenantEntity)

export const tenantService = (log: FastifyBaseLogger) => ({
    async listTenantsForIdentityWithAtleastProject(params: ListTenantsForIdentityParams): Promise<TenantWithoutSensitiveData[]> {
        const users = await userService(log).getByIdentityId({ identityId: params.identityId })

        const tenantsWithProjects = await Promise.all(users.map(async (user) => {
            if (isNil(user.tenantId) || user.status === UserStatus.INACTIVE) {
                return null
            }
            const hasProjects = await projectService(log).userHasProjects({
                tenantId: user.tenantId,
                userId: user.id,
                isPrivileged: userService(log).isUserPrivileged(user),
            })
            return hasProjects ? user.tenantId : null
        }))

        const tenants = await Promise.all(tenantsWithProjects.filter((tenantId) => !isNil(tenantId)).map((tenantId) => this.getOneWithLimitsOrThrow(tenantId)))
        return tenants
    },
    async create(params: AddParams): Promise<TenantWithoutFederatedAuth> {
        const {
            ownerId,
            name,
            primaryColor,
            logoIconUrl,
            fullLogoUrl,
            favIconUrl,
        } = params

        const newTenant: NewTenant = {
            id: generateId(),
            ownerId,
            name,
            primaryColor: primaryColor ?? defaultTheme.colors.primary.default,
            logoIconUrl: logoIconUrl ?? defaultTheme.logos.logoIconUrl,
            fullLogoUrl: fullLogoUrl ?? defaultTheme.logos.fullLogoUrl,
            favIconUrl: favIconUrl ?? defaultTheme.logos.favIconUrl,
            emailAuthEnabled: true,
            enforceAllowedAuthDomains: false,
            allowedAuthDomains: [],
            federatedAuthProviders: { saml: null },
            cloudAuthEnabled: true,
            pinnedConnectors: [],
            connectorSelectorConfig: null,
            allowedEmbedOrigins: [],
            googleAuthEnabled: true,
        }

        const savedTenant = await tenantRepo().save(newTenant)
        await userService(log).addOwnerToTenant({
            id: ownerId,
            tenantId: savedTenant.id,
        })

        log.info({ tenant: { id: savedTenant.id }, ownerId }, 'Tenant created')
        return stripFederatedAuth(savedTenant)
    },
    async createTenantWithProject({ identityId, name, invalidatePreviousTokens, isFirstTenant, callerTokenVersion, beforeProvision }: CreateTenantWithProjectParams): Promise<CreateTenantWithProjectResult> {
        return distributedLock(log).runExclusive({
            key: `create-tenant-${identityId}`,
            timeoutInSeconds: 30,
            fn: async () => {
                const existingUsers = isFirstTenant ? await userService(log).getByIdentityId({ identityId }) : []
                const provisionedOwner = findProvisionedOwner(existingUsers)
                const tenantAlreadyProvisioned = !isNil(provisionedOwner)
                if (tenantAlreadyProvisioned) {
                    return resumeProvisionedTenant({ owner: provisionedOwner, identityId, name, invalidatePreviousTokens, callerTokenVersion, log })
                }
                const ownerWithoutTenant = existingUsers.find((user) => isNil(user.tenantId))
                const unlinkedTenant = isNil(ownerWithoutTenant) ? null : await tenantRepo().findOneBy({ ownerId: ownerWithoutTenant.id })
                const provisioningStoppedBeforeLinkingTheOwner = !isNil(ownerWithoutTenant) && !isNil(unlinkedTenant)
                if (provisioningStoppedBeforeLinkingTheOwner) {
                    await beforeProvision?.()
                    return linkOwnerToTenant({ ownerId: ownerWithoutTenant.id, tenantId: unlinkedTenant.id, identityId, name, invalidatePreviousTokens, log })
                }
                await beforeProvision?.()
                const owner = ownerWithoutTenant
                    ?? await userService(log).create({
                        identityId,
                        tenantRole: TenantRole.ADMIN,
                        tenantId: null,
                    })
                const tenant = await this.create({ ownerId: owner.id, name })
                const personalProject = await projectService(log).create({
                    displayName: signupNames.personalProjectName({ ownerName: name }),
                    ownerId: owner.id,
                    tenantId: tenant.id,
                    type: ProjectType.PERSONAL,
                })
                if (invalidatePreviousTokens) {
                    await rotateTokenVersion(identityId)
                }
                await reportSignup({ identityId, user: owner, projectId: personalProject.id, log })
                const response = await authenticationUtils(log).getProjectAndToken({
                    userId: owner.id,
                    tenantId: tenant.id,
                    projectId: personalProject.id,
                })
                return { response, provisioned: true }
            },
        })
    },
    async getAll(): Promise<TenantWithoutFederatedAuth[]> {
        return tenantRepo().find()
    },
    async getOldestTenant(): Promise<TenantWithoutFederatedAuth | null> {
        return tenantRepo().findOne({
            where: {},
            order: {
                created: 'ASC',
            },
        })
    },
    async update(params: UpdateParams): Promise<TenantWithoutFederatedAuth> {
        if (params.federatedAuthProviders?.saml !== undefined) {
            throw new ApplicationError({
                code: ErrorCode.FEATURE_DISABLED,
                params: {
                    message: 'SAML SSO is not available in this build',
                },
            })
        }
        const tenant = params.federatedAuthProviders !== undefined
            ? await this.getOneWithFederatedAuthOrThrow(params.id)
            : await this.getOneOrThrow(params.id)
        const federatedAuthProviders = hasFederatedAuth(tenant)
            ? {
                ...tenant.federatedAuthProviders,
                ...(params.federatedAuthProviders ?? {}),
            }
            : undefined
        const updatedTenant = {
            ...tenant,
            ...spreadIfDefined('federatedAuthProviders', federatedAuthProviders),
            ...spreadIfDefined('name', params.name),
            ...spreadIfDefined('primaryColor', params.primaryColor),
            ...spreadIfNotUndefined('themeColors', params.themeColors),
            ...spreadIfDefined('logoIconUrl', params.logoIconUrl),
            ...spreadIfDefined('fullLogoUrl', params.fullLogoUrl),
            ...spreadIfDefined('favIconUrl', params.favIconUrl),
            ...spreadIfDefined('cloudAuthEnabled', params.cloudAuthEnabled),
            ...spreadIfDefined('googleAuthEnabled', params.googleAuthEnabled),
            ...spreadIfDefined('emailAuthEnabled', params.emailAuthEnabled),
            ...spreadIfDefined(
                'enforceAllowedAuthDomains',
                params.enforceAllowedAuthDomains,
            ),
            ...spreadIfDefined('allowedAuthDomains', params.allowedAuthDomains),
            ...spreadIfDefined('allowedEmbedOrigins', params.allowedEmbedOrigins),
            ...spreadIfDefined('ssoDomain', params.ssoDomain),
            ...spreadIfDefined('ssoDomainVerification', params.ssoDomainVerification),
            ...spreadIfDefined('pinnedConnectors', params.pinnedConnectors),
            ...spreadIfNotUndefined('connectorSelectorConfig', params.connectorSelectorConfig),
        }
        log.info({ tenant: { id: params.id } }, 'Tenant updated')
        const saved = await tenantRepo().save(updatedTenant)
        return stripFederatedAuth(saved)
    },
    async getOneOrThrow(id: TenantId): Promise<TenantWithoutFederatedAuth> {
        return tenantRepo().findOneByOrFail({ id })
    },
    async getOne(id: TenantId): Promise<TenantWithoutFederatedAuth | null> {
        return tenantRepo().findOneBy({ id })
    },
    async getOneWithFederatedAuthOrThrow(id: TenantId): Promise<Tenant> {
        return tenantRepo()
            .createQueryBuilder('tenant')
            .addSelect('tenant.federatedAuthProviders')
            .where({ id })
            .getOneOrFail()
    },
    async hasSamlConfigured(id: TenantId): Promise<boolean> {
        const result = await tenantRepo()
            .createQueryBuilder('tenant')
            .select('tenant."federatedAuthProviders"', 'federatedAuthProviders')
            .where({ id })
            .getRawOne<{ federatedAuthProviders: { saml?: unknown } | null }>()
        return !isNil(result?.federatedAuthProviders?.saml)
    },
    async getOneWithLimits(id: TenantId): Promise<TenantWithoutSensitiveData | null> {
        const tenant = await this.getOne(id)
        if (isNil(tenant)) {
            return null
        }
        return {
            ...tenant,
            federatedAuthProviders: { saml: null },
            limits: SYSTEM_LIMITS,
        }
    },
    async getOneWithLimitsOrThrow(id: TenantId): Promise<TenantWithoutSensitiveData> {
        const tenant = await this.getOneOrThrow(id)
        return {
            ...tenant,
            federatedAuthProviders: { saml: null },
            limits: SYSTEM_LIMITS,
        }
    },
})

function findProvisionedOwner(users: User[]): TenantOwner | undefined {
    return users.find((user): user is TenantOwner => !isNil(user.tenantId))
}

async function resumeProvisionedTenant({ owner, identityId, name, invalidatePreviousTokens, callerTokenVersion, log }: ResumeProvisionedTenantParams): Promise<CreateTenantWithProjectResult> {
    const identity = await userIdentityService(log).getOneOrFail({ id: identityId })
    const earlierAttemptNeverRotated = isSameTokenVersion(identity.tokenVersion, callerTokenVersion)
    const response = await finishExistingTenant({
        user: owner,
        tenantId: owner.tenantId,
        name,
        invalidatePreviousTokens: invalidatePreviousTokens && earlierAttemptNeverRotated,
        identityId,
        log,
    })
    return { response, provisioned: false }
}

async function linkOwnerToTenant({ ownerId, tenantId, identityId, name, invalidatePreviousTokens, log }: LinkOwnerToTenantParams): Promise<CreateTenantWithProjectResult> {
    await userService(log).addOwnerToTenant({ id: ownerId, tenantId })
    const owner = await userService(log).getOneOrFail({ id: ownerId })
    const response = await finishExistingTenant({
        user: owner,
        tenantId,
        name,
        invalidatePreviousTokens,
        identityId,
        log,
    })
    if (!isNil(response.projectId)) {
        await reportSignup({ identityId, user: owner, projectId: response.projectId, log })
    }
    return { response, provisioned: true }
}

async function reportSignup({ identityId, user, projectId, log }: ReportSignupParams): Promise<void> {
    await authenticationUtils(log).sendTelemetry({
        identity: await userIdentityService(log).getOneOrFail({ id: identityId }),
        user,
        projectId,
    })
}

function isSameTokenVersion(current: string | undefined, caller: string | undefined): boolean {
    const neitherHasBeenRotated = isNil(current) && isNil(caller)
    return neitherHasBeenRotated || current === caller
}

async function rotateTokenVersion(identityId: string): Promise<void> {
    await userIdentityRepository().update(identityId, {
        tokenVersion: nanoid(),
    })
}

async function finishExistingTenant({ user, tenantId, name, invalidatePreviousTokens, identityId, log }: FinishExistingTenantParams): Promise<AuthenticationResponse> {
    const hasProjects = await projectService(log).userHasProjects({
        tenantId,
        userId: user.id,
        isPrivileged: userService(log).isUserPrivileged(user),
    })
    const project = hasProjects
        ? null
        : await projectService(log).create({
            displayName: signupNames.personalProjectName({ ownerName: name }),
            ownerId: user.id,
            tenantId,
            type: ProjectType.PERSONAL,
        })
    if (invalidatePreviousTokens) {
        await rotateTokenVersion(identityId)
    }
    return authenticationUtils(log).getProjectAndToken({
        userId: user.id,
        tenantId,
        projectId: project?.id ?? null,
    })
}

function stripFederatedAuth(tenant: Tenant): TenantWithoutFederatedAuth {
    const { federatedAuthProviders: _omitted, ...rest } = tenant
    return rest
}

function hasFederatedAuth(tenant: Tenant | TenantWithoutFederatedAuth): tenant is Tenant {
    return 'federatedAuthProviders' in tenant
}

type AddParams = {
    ownerId: UserId
    name: string
    primaryColor?: string
    logoIconUrl?: string
    fullLogoUrl?: string
    favIconUrl?: string
}

type NewTenant = Omit<Tenant, 'created' | 'updated'>

type UpdateParams = UpdateTenantRequestBody & {
    id: TenantId
    plan?: Partial<TenantLimits>
    logoIconUrl?: string
    fullLogoUrl?: string
    favIconUrl?: string
    ssoDomain?: string | null
    ssoDomainVerification?: SsoDomainVerification | null
}

type CreateTenantWithProjectResult = {
    response: AuthenticationResponse
    provisioned: boolean
}

type CreateTenantWithProjectParams = {
    identityId: string
    name: string
    invalidatePreviousTokens: boolean
    isFirstTenant: boolean
    callerTokenVersion: string | undefined
    beforeProvision?: () => Promise<void>
}

type TenantOwner = User & {
    tenantId: TenantId
}
type ResumeProvisionedTenantParams = {
    owner: TenantOwner
    identityId: string
    name: string
    invalidatePreviousTokens: boolean
    callerTokenVersion: string | undefined
    log: FastifyBaseLogger
}
type LinkOwnerToTenantParams = {
    ownerId: UserId
    tenantId: TenantId
    identityId: string
    name: string
    invalidatePreviousTokens: boolean
    log: FastifyBaseLogger
}
type FinishExistingTenantParams = {
    user: User
    tenantId: TenantId
    name: string
    invalidatePreviousTokens: boolean
    identityId: string
    log: FastifyBaseLogger
}
type ReportSignupParams = {
    identityId: string
    user: User
    projectId: string
    log: FastifyBaseLogger
}

type ListTenantsForIdentityParams = {
    identityId: string
}
