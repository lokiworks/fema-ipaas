import { ApplicationError, ErrorCode, generateId, isNil, spreadIfDefined, spreadIfNotUndefined, TenantId, UserId } from '@fema-ipaas/core-utils'
import { AuthenticationResponse, InstanceRole, ProjectType, SsoDomainVerification, SYSTEM_LIMITS, Tenant, TENANT_ACCESS_LIMITS, TenantExternalRef, TenantLimits, TenantLimitsUpdate, TenantMfaPolicy, TenantRole, TenantStatus, TenantWithoutFederatedAuth, TenantWithoutSensitiveData, UpdateTenantRequestBody, User, UserStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { nanoid } from 'nanoid'
import { authenticationUtils } from '../authentication/authentication-utils'
import { signupNames } from '../authentication/lib/signup-names'
import { userIdentityRepository, userIdentityService } from '../authentication/user-identity/user-identity-service'
import { repoFactory } from '../core/db/repo-factory'
import { distributedLock } from '../database/redis-connections'
import { defaultTheme } from '../flags/theme'
import { instanceSettingsStore } from '../operator/instance-settings.store'
import { projectService } from '../project/project-service'
import { userService } from '../user/user-service'
import { tenantLimitsService } from './tenant-limits.service'
import { tenantLimitsUtils } from './tenant-limits.utils'
import { tenantSlugUtils } from './tenant-slug.utils'
import { tenantStatusGuard } from './tenant-status-guard'
import { TenantEntity } from './tenant.entity'

export const tenantRepo = repoFactory<Tenant & TenantLimits>(TenantEntity)

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
            externalRef,
            limits,
        } = params

        const newTenant: NewTenant = {
            id: generateId(),
            ownerId,
            name,
            slug: await this.allocateSlug({ name, requested: params.slug }),
            status: TenantStatus.ACTIVE,
            externalIssuer: externalRef?.issuer ?? null,
            externalTenantId: externalRef?.tenantId ?? null,
            mfaPolicy: TenantMfaPolicy.OPTIONAL,
            phoneAuthEnabled: true,
            usersLimit: limits?.usersLimit ?? null,
            projectsLimit: limits?.projectsLimit ?? null,
            activeWorkflowsLimit: limits?.activeWorkflowsLimit ?? null,
            concurrentExecutionsLimit: limits?.concurrentExecutionsLimit ?? null,
            workerGroupId: limits?.workerGroupId ?? null,
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
            welcomeText: null,
            passwordMinLength: TENANT_ACCESS_LIMITS.defaultPasswordMinLength,
            sessionDurationDays: TENANT_ACCESS_LIMITS.defaultSessionDurationDays,
            moduleAccessSettings: null,
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
                    if (isFirstTenant && await tenantRepo().count() === 1) {
                        await userIdentityRepository().update({ id: identityId }, { instanceRole: InstanceRole.OPERATOR })
                    }
                    return linkOwnerToTenant({ ownerId: ownerWithoutTenant.id, tenantId: unlinkedTenant.id, identityId, name, invalidatePreviousTokens, log })
                }
                const firstOfInstance = isFirstTenant && await tenantRepo().count() === 0
                if (isFirstTenant) {
                    await assertOnboardingMayCreateTenant()
                }
                await beforeProvision?.()
                const owner = ownerWithoutTenant
                    ?? await userService(log).create({
                        identityId,
                        tenantRole: TenantRole.ADMIN,
                        tenantId: null,
                    })
                const tenant = await this.create({ ownerId: owner.id, name })
                if (firstOfInstance) {
                    await userIdentityRepository().update({ id: identityId }, { instanceRole: InstanceRole.OPERATOR })
                }
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
    async provisionTenant({ identityId, name, slug, externalRef, limits }: ProvisionTenantParams): Promise<ProvisionTenantResult> {
        const lockKey = isNil(externalRef) ? `provision-tenant-${identityId}` : `provision-tenant-ref-${externalRef.issuer}-${externalRef.tenantId}`
        return distributedLock(log).runExclusive({
            key: lockKey,
            timeoutInSeconds: 30,
            fn: async () => {
                const owner = await userService(log).create({
                    identityId,
                    tenantRole: TenantRole.ADMIN,
                    tenantId: null,
                })
                const tenant = await this.create({ ownerId: owner.id, name, slug, externalRef, limits })
                const project = await this.ensureOwnerProject({ tenantId: tenant.id, ownerId: owner.id, name })
                return { tenant, ownerUserId: owner.id, projectId: project.id }
            },
        })
    },
    async ensureOwnerProject({ tenantId, ownerId, name }: EnsureOwnerProjectParams): Promise<{ id: string }> {
        const existing = await projectService(log).getOneByOwnerAndTenant({ ownerId, tenantId })
        if (!isNil(existing)) {
            return existing
        }
        return projectService(log).create({
            displayName: signupNames.personalProjectName({ ownerName: name }),
            ownerId,
            tenantId,
            type: ProjectType.PERSONAL,
        })
    },
    async allocateSlug({ name, requested }: AllocateSlugParams): Promise<string> {
        if (!isNil(requested) && requested.trim().length > 0) {
            const slug = tenantSlugUtils.normalise({ slug: requested })
            await assertSlugAvailable({ slug })
            return slug
        }
        for (const candidate of tenantSlugUtils.candidates({ name })) {
            if (!(await tenantRepo().existsBy({ slug: candidate }))) {
                return candidate
            }
        }
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'tenantSlugUnavailable' },
        })
    },
    async updateSlug({ tenantId, slug }: UpdateSlugParams): Promise<TenantWithoutFederatedAuth> {
        const normalised = tenantSlugUtils.normalise({ slug })
        await assertSlugAvailable({ slug: normalised, excludeTenantId: tenantId })
        await tenantRepo().update({ id: tenantId }, { slug: normalised })
        log.info({ tenant: { id: tenantId }, slug: normalised }, 'Tenant slug updated')
        return this.getOneOrThrow(tenantId)
    },
    async setStatus({ tenantId, status }: SetStatusParams): Promise<TenantWithoutFederatedAuth> {
        await tenantRepo().update({ id: tenantId }, { status })
        tenantStatusGuard.invalidate({ tenantId })
        log.info({ tenant: { id: tenantId }, status }, 'Tenant status changed')
        return this.getOneOrThrow(tenantId)
    },
    async updateLimits({ tenantId, limits }: UpdateLimitsParams): Promise<TenantWithoutFederatedAuth> {
        await this.getOneOrThrow(tenantId)
        await tenantRepo().update({ id: tenantId }, {
            ...(limits.usersLimit !== undefined ? { usersLimit: limits.usersLimit } : {}),
            ...(limits.projectsLimit !== undefined ? { projectsLimit: limits.projectsLimit } : {}),
            ...(limits.activeWorkflowsLimit !== undefined ? { activeWorkflowsLimit: limits.activeWorkflowsLimit } : {}),
            ...(limits.concurrentExecutionsLimit !== undefined ? { concurrentExecutionsLimit: limits.concurrentExecutionsLimit } : {}),
            ...(limits.workerGroupId !== undefined ? { workerGroupId: limits.workerGroupId } : {}),
        })
        await tenantLimitsService(log).invalidateConcurrentExecutionsLimit({ tenantId })
        return this.getOneOrThrow(tenantId)
    },
    async rename({ tenantId, name }: RenameParams): Promise<TenantWithoutFederatedAuth> {
        await tenantRepo().update({ id: tenantId }, { name })
        return this.getOneOrThrow(tenantId)
    },
    async getBySlug(slug: string): Promise<TenantWithoutFederatedAuth | null> {
        return tenantRepo().findOneBy({ slug: tenantSlugUtils.normalise({ slug }) })
    },
    async getBySlugOrId(slugOrId: string): Promise<TenantWithoutFederatedAuth | null> {
        const bySlug = await this.getBySlug(slugOrId)
        return bySlug ?? this.getOne(slugOrId)
    },
    async getByExternalRef({ issuer, tenantId }: TenantExternalRef): Promise<TenantWithoutFederatedAuth | null> {
        return tenantRepo().findOneBy({ externalIssuer: issuer, externalTenantId: tenantId })
    },
    async count(): Promise<number> {
        return tenantRepo().count()
    },
    async assertOnboardingAllowed(): Promise<void> {
        await assertOnboardingMayCreateTenant()
    },
    async getOnlyTenantId(): Promise<TenantId | null> {
        const rows = await tenantRepo().find({ select: ['id'], order: { created: 'ASC', id: 'ASC' }, take: 2 })
        return rows.length === 1 ? rows[0].id : null
    },
    async getAll(): Promise<TenantWithoutFederatedAuth[]> {
        return tenantRepo().find()
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
            ...spreadIfNotUndefined('welcomeText', normalizeWelcomeText(params.welcomeText)),
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
        const tenant = await tenantRepo().findOneBy({ id })
        if (isNil(tenant)) {
            return null
        }
        return {
            ...tenant,
            federatedAuthProviders: { saml: null },
            limits: effectiveLimitsOf(tenant),
        }
    },
    async getOneWithLimitsOrThrow(id: TenantId): Promise<TenantWithoutSensitiveData> {
        const tenant = await tenantRepo().findOneByOrFail({ id })
        return {
            ...tenant,
            federatedAuthProviders: { saml: null },
            limits: effectiveLimitsOf(tenant),
        }
    },
})

function effectiveLimitsOf(tenant: TenantLimits): TenantLimits {
    return tenantLimitsUtils.effective({ row: tenant, system: SYSTEM_LIMITS })
}

async function assertSlugAvailable({ slug, excludeTenantId }: { slug: string, excludeTenantId?: TenantId }): Promise<void> {
    if (!tenantSlugUtils.isValid({ slug })) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'tenantSlugInvalid' },
        })
    }
    const existing = await tenantRepo().findOne({ where: { slug }, select: ['id'] })
    if (!isNil(existing) && existing.id !== excludeTenantId) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'tenantSlugTaken' },
        })
    }
}

async function assertOnboardingMayCreateTenant(): Promise<void> {
    const existingTenants = await tenantRepo().count()
    if (existingTenants === 0) {
        return
    }
    const settings = await instanceSettingsStore.get()
    if (!settings.tenantSelfSignup) {
        throw new ApplicationError({
            code: ErrorCode.INVITATION_ONLY_SIGN_UP,
            params: { message: 'tenantSelfSignupDisabled' },
        })
    }
}

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

function normalizeWelcomeText(welcomeText: string | undefined): string | null | undefined {
    if (welcomeText === undefined) {
        return undefined
    }
    const trimmed = welcomeText.trim()
    return trimmed.length === 0 ? null : trimmed
}

function stripFederatedAuth(tenant: Tenant): TenantWithoutFederatedAuth {
    const { federatedAuthProviders: _omitted, ...rest } = tenant
    return rest
}

function hasFederatedAuth(tenant: Tenant | TenantWithoutFederatedAuth): tenant is Tenant {
    return 'federatedAuthProviders' in tenant
}

type ProvisionTenantParams = {
    identityId: string
    name: string
    slug?: string
    externalRef?: TenantExternalRef
    limits?: TenantLimitsUpdate
}

type ProvisionTenantResult = {
    tenant: TenantWithoutFederatedAuth
    ownerUserId: UserId
    projectId: string
}

type EnsureOwnerProjectParams = {
    tenantId: TenantId
    ownerId: UserId
    name: string
}

type AllocateSlugParams = {
    name: string
    requested?: string
}

type UpdateSlugParams = {
    tenantId: TenantId
    slug: string
}

type SetStatusParams = {
    tenantId: TenantId
    status: TenantStatus
}

type UpdateLimitsParams = {
    tenantId: TenantId
    limits: TenantLimitsUpdate
}

type RenameParams = {
    tenantId: TenantId
    name: string
}

type AddParams = {
    ownerId: UserId
    name: string
    slug?: string
    externalRef?: TenantExternalRef
    limits?: TenantLimitsUpdate
    primaryColor?: string
    logoIconUrl?: string
    fullLogoUrl?: string
    favIconUrl?: string
}

type NewTenant = Omit<Tenant, 'created' | 'updated'> & TenantLimits

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
