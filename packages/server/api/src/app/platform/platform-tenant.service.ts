import { ApplicationError, ErrorCode, isNil, TenantId } from '@fema-ipaas/core-utils'
import {
    ConnectionScope,
    ConnectionType,
    OAuth2GrantType,
    PlatformTenant,
    PlatformUpdateTenantRequestBody,
    ProvisionConnectionInput,
    ProvisionMemberEventsResult,
    ProvisionTenantRequestBody,
    ProvisionTenantResponse,
    Tenant,
    TenantExternalRef,
    TenantLimits,
    TenantRole,
    TenantStatus,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectionService } from '../connection/connection-service/connection-service'
import { externalIdentityService } from '../federation/external-identity.service'
import { memberSubscriptionService } from '../federation/member-subscription.service'
import { domainHelper } from '../helper/domain-helper'
import { tenantOwnerService } from '../tenant/tenant-owner.service'
import { tenantRepo, tenantService } from '../tenant/tenant.service'
import { tenantUtils } from '../tenant/tenant.utils'
import { platformAccessUtils } from './platform-access.utils'
import { PlatformCaller } from './platform-auth'
import { platformClientUtils } from './platform-client.utils'

export const platformTenantService = (log: FastifyBaseLogger) => ({
    async provision({ request, caller }: ProvisionParams): Promise<ProvisionTenantResponse> {
        assertIssuerAllowed({ caller, issuer: request.externalRef.issuer })
        const existing = await tenantService(log).getByExternalRef(request.externalRef)
        const base = isNil(existing) ? await this.createNew({ request }) : await this.reuseExisting({ request, existing })
        await this.configureOidc({ request, tenantId: base.tenantId })
        const connections = await this.provisionConnections({ request, tenantId: base.tenantId, projectId: base.projectId, ownerUserId: base.ownerUserId })
        const memberEvents = isNil(request.memberEvents)
            ? null
            : await memberSubscriptionService(log).ensure({ tenantId: base.tenantId, projectId: base.projectId, input: request.memberEvents })
        return this.buildResponse({ tenantId: base.tenantId, projectId: base.projectId, created: base.created, hasOidc: !isNil(request.oidc), connections, memberEvents })
    },

    async createNew({ request }: { request: ProvisionTenantRequestBody }): Promise<ProvisionBase> {
        const { identityId } = await tenantOwnerService(log).ensureIdentity({ owner: request.owner })
        const provisioned = await tenantService(log).provisionTenant({
            identityId,
            name: request.name,
            slug: request.slug,
            externalRef: request.externalRef,
            limits: request.limits,
        })
        const issuer = memberIssuerOf({ request })
        if (!isNil(request.owner.subject)) {
            await externalIdentityService(log).bindToUser({
                tenantId: provisioned.tenant.id,
                issuer,
                subject: request.owner.subject,
                identityId,
                userId: provisioned.ownerUserId,
                email: request.owner.email,
                displayName: displayNameOf({ firstName: request.owner.firstName, lastName: request.owner.lastName }),
            })
        }
        return { tenantId: provisioned.tenant.id, projectId: provisioned.projectId, ownerUserId: provisioned.ownerUserId, created: true }
    },

    async reuseExisting({ request, existing }: { request: ProvisionTenantRequestBody, existing: Omit<Tenant, 'federatedAuthProviders'> }): Promise<ProvisionBase> {
        if (existing.name !== request.name) {
            await tenantService(log).rename({ tenantId: existing.id, name: request.name })
        }
        if (!isNil(request.limits)) {
            await tenantService(log).updateLimits({ tenantId: existing.id, limits: request.limits })
        }
        const project = await tenantService(log).ensureOwnerProject({ tenantId: existing.id, ownerId: existing.ownerId, name: request.name })
        if (!isNil(request.owner.subject)) {
            const issuer = memberIssuerOf({ request })
            const binding = await externalIdentityService(log).findBinding({ issuer, subject: request.owner.subject })
            if (isNil(binding)) {
                await externalIdentityService(log).prebind({
                    tenantId: existing.id,
                    issuer,
                    subject: request.owner.subject,
                    role: TenantRole.ADMIN,
                    email: request.owner.email,
                    displayName: displayNameOf({ firstName: request.owner.firstName, lastName: request.owner.lastName }),
                })
            }
        }
        return { tenantId: existing.id, projectId: project.id, ownerUserId: existing.ownerId, created: false }
    },

    async configureOidc({ request, tenantId }: { request: ProvisionTenantRequestBody, tenantId: TenantId }): Promise<void> {
        if (isNil(request.oidc)) {
            return
        }
        await externalIdentityService(log).upsertOidcConfigForProvisioning({
            tenantId,
            oidc: request.oidc,
        })
    },

    async provisionConnections({ request, tenantId, projectId, ownerUserId }: ProvisionConnectionsParams): Promise<Array<{ externalId: string, connectionId: string }>> {
        const inputs = request.connections ?? []
        const redirectUrl = await domainHelper.getPublicUrl({ path: '/redirect' })
        return inputs.reduce<Promise<Array<{ externalId: string, connectionId: string }>>>(async (previous, input) => {
            const done = await previous
            const connection = await connectionService(log).upsert(buildConnectionUpsert({ input, tenantId, projectId, ownerUserId, redirectUrl }))
            return [...done, { externalId: input.externalId, connectionId: connection.id }]
        }, Promise.resolve([]))
    },

    async buildResponse({ tenantId, projectId, created, hasOidc, connections, memberEvents }: BuildResponseParams): Promise<ProvisionTenantResponse> {
        const tenant = await tenantService(log).getOneOrThrow(tenantId)
        return {
            tenantId,
            slug: tenant.slug,
            projectId,
            created,
            loginUrl: await tenantUtils.getPublicTenantUrl({ slug: tenant.slug }),
            ssoStartUrl: hasOidc ? await ssoStartUrlOf({ slug: tenant.slug }) : null,
            memberEvents,
            connections,
        }
    },

    async getOrThrow({ tenantId, caller }: AccessParams): Promise<PlatformTenant> {
        const tenant = await loadAccessible({ tenantId, caller })
        return toPlatformTenant({ tenant })
    },

    async getByExternalRef({ ref, caller }: { ref: TenantExternalRef, caller: PlatformCaller }): Promise<PlatformTenant> {
        assertIssuerAllowed({ caller, issuer: ref.issuer })
        const tenant = await tenantService(log).getByExternalRef(ref)
        if (isNil(tenant)) {
            throw notFound({ tenantId: `${ref.issuer}#${ref.tenantId}` })
        }
        return this.getOrThrow({ tenantId: tenant.id, caller })
    },

    async update({ tenantId, caller, request }: AccessParams & { request: PlatformUpdateTenantRequestBody }): Promise<PlatformTenant> {
        await loadAccessible({ tenantId, caller })
        if (!isNil(request.name)) {
            await tenantService(log).rename({ tenantId, name: request.name })
        }
        if (!isNil(request.limits)) {
            await tenantService(log).updateLimits({ tenantId, limits: request.limits })
        }
        return this.getOrThrow({ tenantId, caller })
    },

    async setStatus({ tenantId, caller, status }: AccessParams & { status: TenantStatus }): Promise<PlatformTenant> {
        await loadAccessible({ tenantId, caller })
        await tenantService(log).setStatus({ tenantId, status })
        return this.getOrThrow({ tenantId, caller })
    },

    async loadAccessibleTenant({ tenantId, caller }: AccessParams): Promise<Tenant & TenantLimits> {
        return loadAccessible({ tenantId, caller })
    },
})

async function loadAccessible({ tenantId, caller }: AccessParams): Promise<Tenant & TenantLimits> {
    const tenant = await tenantRepo().findOneBy({ id: tenantId })
    if (isNil(tenant) || !platformAccessUtils.mayManageTenant({ callerIssuer: caller.issuer, tenantExternalIssuer: tenant.externalIssuer })) {
        throw notFound({ tenantId })
    }
    return tenant
}

function assertIssuerAllowed({ caller, issuer }: { caller: PlatformCaller, issuer: string }): void {
    if (isNil(caller.issuer)) {
        return
    }
    const sameIssuer = platformClientUtils.normalizeIssuer({ issuer: caller.issuer }) === platformClientUtils.normalizeIssuer({ issuer })
    if (!sameIssuer) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'The caller may only manage tenants of its own issuer' },
        })
    }
}

function memberIssuerOf({ request }: { request: ProvisionTenantRequestBody }): string {
    return request.oidc?.issuer ?? request.externalRef.issuer
}

function displayNameOf({ firstName, lastName }: { firstName: string | undefined, lastName: string | undefined }): string | null {
    const name = `${firstName ?? ''} ${lastName ?? ''}`.trim()
    return name.length === 0 ? null : name
}

async function ssoStartUrlOf({ slug }: { slug: string }): Promise<string> {
    return domainHelper.getPublicApiUrl({ path: `v1/authn/sso/start?provider=OIDC&tenant=${encodeURIComponent(slug)}` })
}

function buildConnectionUpsert({ input, tenantId, projectId, ownerUserId, redirectUrl }: BuildConnectionUpsertParams): ConnectionUpsertParams {
    return {
        tenantId,
        projectIds: [projectId],
        ownerId: ownerUserId,
        scope: ConnectionScope.TENANT,
        externalId: input.externalId,
        displayName: input.displayName,
        connectorName: input.connectorName,
        type: ConnectionType.OAUTH2,
        preSelectForNewProjects: true,
        value: {
            type: ConnectionType.OAUTH2,
            client_id: input.auth.clientId,
            client_secret: input.auth.clientSecret,
            grant_type: OAuth2GrantType.CLIENT_CREDENTIALS,
            code: CLIENT_CREDENTIALS_PLACEHOLDER_CODE,
            redirect_url: redirectUrl,
            scope: input.auth.scope ?? '',
            props: { tokenUrl: input.auth.tokenUrl, ...(input.auth.props ?? {}) },
        },
    }
}

function toPlatformTenant({ tenant }: { tenant: Tenant & TenantLimits }): PlatformTenant {
    const externalRef = isNil(tenant.externalIssuer) || isNil(tenant.externalTenantId)
        ? null
        : { issuer: tenant.externalIssuer, tenantId: tenant.externalTenantId }
    return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        externalRef,
        usersLimit: tenant.usersLimit,
        projectsLimit: tenant.projectsLimit,
        activeWorkflowsLimit: tenant.activeWorkflowsLimit,
        concurrentExecutionsLimit: tenant.concurrentExecutionsLimit,
        workerGroupId: tenant.workerGroupId,
    }
}

function notFound({ tenantId }: { tenantId: string }): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.ENTITY_NOT_FOUND,
        params: { entityType: 'tenant', entityId: tenantId },
    })
}

export const platformTenantUtils = {
    toPlatformTenant,
    buildConnectionUpsert,
    memberIssuerOf,
}

const CLIENT_CREDENTIALS_PLACEHOLDER_CODE = 'client_credentials'

type ConnectionUpsertParams = Parameters<ReturnType<typeof connectionService>['upsert']>[0]

type ProvisionParams = {
    request: ProvisionTenantRequestBody
    caller: PlatformCaller
}

type ProvisionBase = {
    tenantId: TenantId
    projectId: string
    ownerUserId: string
    created: boolean
}

type ProvisionConnectionsParams = {
    request: ProvisionTenantRequestBody
    tenantId: TenantId
    projectId: string
    ownerUserId: string
}

type BuildResponseParams = {
    tenantId: TenantId
    projectId: string
    created: boolean
    hasOidc: boolean
    connections: Array<{ externalId: string, connectionId: string }>
    memberEvents: ProvisionMemberEventsResult | null
}

type AccessParams = {
    tenantId: TenantId
    caller: PlatformCaller
}

type BuildConnectionUpsertParams = {
    input: ProvisionConnectionInput
    tenantId: TenantId
    projectId: string
    ownerUserId: string
    redirectUrl: string
}
