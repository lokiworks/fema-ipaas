import { EntityId } from '@fema-ipaas/core-utils'
import {
    AddTenantUsersRequestBody,
    AddTenantUsersResponse,
    ApplicationEventName,
    CreateModuleAccessRequestBody,
    ListModuleAccessRequestsQuery,
    ListOwnedResourcesRequestQuery,
    ListOwnedResourcesResponse,
    ListTenantMembersResponse,
    LoginSecuritySettings,
    ModuleAccessRequest,
    ModuleAccessRequestWithUsers,
    ModuleAccessSettings,
    MyModuleAccess,
    PrincipalType,
    RemoveTenantMemberRequestQuery,
    ResetMemberPasswordResponse,
    TenantAdminEvent,
    TenantMember,
    TransferResourcesRequestBody,
    TransferResourcesResponse,
    UpdateLoginSecurityRequestBody,
    UpdateModuleAccessSettingsRequestBody,
    UpdateTenantMemberAccessRequestBody,
    UserStatus,
} from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { loginSecurityService } from './login-security.service'
import { moduleAccessService } from './module-access.service'
import { ownedResourcesService } from './owned-resources.service'
import { tenantMembersService } from './tenant-members.service'

export const tenantAccessController: FastifyPluginAsyncZod = async (app) => {
    app.get('/members', AdminRead(ListTenantMembersResponse), async (request) => {
        return tenantMembersService(request.log).list({ tenantId: request.principal.tenant.id })
    })

    app.post('/members/invite', InviteRequest, async (request, reply) => {
        const result = await tenantMembersService(request.log).invite({ tenantId: request.principal.tenant.id, request: request.body })
        audit({ request, action: ApplicationEventName.TENANT_USERS_INVITED, target: result.invited.map((invite) => invite.email).join(', '), detail: request.body.tenantRole })
        await reply.status(StatusCodes.CREATED).send(result)
    })

    app.post('/members/:id/access', UpdateAccessRequest, async (request): Promise<TenantMember> => {
        const member = await tenantMembersService(request.log).updateAccess({
            tenantId: request.principal.tenant.id,
            userId: request.params.id,
            actorId: request.principal.id,
            request: request.body,
        })
        audit({ request, action: ApplicationEventName.TENANT_USER_ACCESS_CHANGED, target: member.email, detail: `${member.tenantRole} ${member.modules.join(',')}` })
        return member
    })

    app.post('/members/:id/disable', MemberActionRequest(TenantMember), async (request): Promise<TenantMember> => {
        const member = await tenantMembersService(request.log).setStatus({
            tenantId: request.principal.tenant.id,
            userId: request.params.id,
            actorId: request.principal.id,
            status: UserStatus.INACTIVE,
        })
        audit({ request, action: ApplicationEventName.TENANT_USER_ACCESS_CHANGED, target: member.email, detail: 'disabled' })
        return member
    })

    app.post('/members/:id/enable', MemberActionRequest(TenantMember), async (request): Promise<TenantMember> => {
        const member = await tenantMembersService(request.log).setStatus({
            tenantId: request.principal.tenant.id,
            userId: request.params.id,
            actorId: request.principal.id,
            status: UserStatus.ACTIVE,
        })
        audit({ request, action: ApplicationEventName.TENANT_USER_ACCESS_CHANGED, target: member.email, detail: 'enabled' })
        return member
    })

    app.post('/members/:id/reset-password', MemberActionRequest(ResetMemberPasswordResponse), async (request): Promise<ResetMemberPasswordResponse> => {
        const temporaryPassword = await tenantMembersService(request.log).resetPassword({
            tenantId: request.principal.tenant.id,
            userId: request.params.id,
            actorId: request.principal.id,
        })
        audit({ request, action: ApplicationEventName.TENANT_USER_PASSWORD_RESET, target: request.params.id })
        return { temporaryPassword }
    })

    app.delete('/members/:id', RemoveRequest, async (request, reply) => {
        const { transferred } = await tenantMembersService(request.log).remove({
            tenantId: request.principal.tenant.id,
            userId: request.params.id,
            actorId: request.principal.id,
            transferToUserId: request.query.transferToUserId,
        })
        audit({ request, action: ApplicationEventName.TENANT_USER_REMOVED, target: request.params.id, detail: transferred > 0 ? `${transferred} resources to ${request.query.transferToUserId}` : undefined })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.get('/resources', ListResourcesRequest, async (request): Promise<ListOwnedResourcesResponse> => {
        return ownedResourcesService(request.log).list({ tenantId: request.principal.tenant.id, query: request.query })
    })

    app.post('/resources/transfer', TransferRequest, async (request): Promise<TransferResourcesResponse> => {
        const result = await ownedResourcesService(request.log).transfer({
            tenantId: request.principal.tenant.id,
            resources: request.body.resources,
            toUserId: request.body.toUserId,
            keepPreviousOwners: true,
        })
        audit({ request, action: ApplicationEventName.RESOURCES_OWNERSHIP_TRANSFERRED, target: request.body.toUserId, detail: `${result.transferred} resources` })
        return result
    })

    app.get('/module-settings', AdminRead(ModuleAccessSettings), async (request): Promise<ModuleAccessSettings> => {
        return moduleAccessService(request.log).getSettings({ tenantId: request.principal.tenant.id })
    })

    app.post('/module-settings', UpdateModuleSettingsRequest, async (request): Promise<ModuleAccessSettings> => {
        const settings = await moduleAccessService(request.log).updateSettings({ tenantId: request.principal.tenant.id, settings: request.body })
        audit({ request, action: ApplicationEventName.MODULE_ACCESS_SETTINGS_UPDATED, target: settings.deniedHint, detail: settings.allowRequests ? 'requests on' : 'requests off' })
        return settings
    })

    app.get('/requests', ListRequestsRequest, async (request): Promise<ModuleAccessRequestWithUsers[]> => {
        return moduleAccessService(request.log).listRequests({ tenantId: request.principal.tenant.id, status: request.query.status })
    })

    app.post('/requests/:id/approve', MemberActionRequest(ModuleAccessRequest), async (request): Promise<ModuleAccessRequest> => {
        const decided = await moduleAccessService(request.log).decide({ tenantId: request.principal.tenant.id, requestId: request.params.id, actorId: request.principal.id, approve: true })
        audit({ request, action: ApplicationEventName.MODULE_ACCESS_REQUEST_DECIDED, target: `${decided.userId} ${decided.module}`, detail: 'approved' })
        return decided
    })

    app.post('/requests/:id/reject', MemberActionRequest(ModuleAccessRequest), async (request): Promise<ModuleAccessRequest> => {
        const decided = await moduleAccessService(request.log).decide({ tenantId: request.principal.tenant.id, requestId: request.params.id, actorId: request.principal.id, approve: false })
        audit({ request, action: ApplicationEventName.MODULE_ACCESS_REQUEST_DECIDED, target: `${decided.userId} ${decided.module}`, detail: 'rejected' })
        return decided
    })

    app.get('/login-security', AdminRead(LoginSecuritySettings), async (request): Promise<LoginSecuritySettings> => {
        return loginSecurityService(request.log).get({ tenantId: request.principal.tenant.id })
    })

    app.post('/login-security', UpdateLoginSecurityRequest, async (request): Promise<LoginSecuritySettings> => {
        const settings = await loginSecurityService(request.log).update({ tenantId: request.principal.tenant.id, request: request.body })
        audit({ request, action: ApplicationEventName.LOGIN_SETTINGS_UPDATED, target: 'login', detail: `min ${settings.passwordMinLength}, session ${settings.sessionDurationDays}d` })
        return settings
    })

    app.get('/me', MyAccessRequest, async (request): Promise<MyModuleAccess> => {
        return moduleAccessService(request.log).getMyAccess({ tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.post('/me/requests', CreateMyRequest, async (request, reply) => {
        const created = await moduleAccessService(request.log).createRequest({ tenantId: request.principal.tenant.id, userId: request.principal.id, request: request.body })
        await reply.status(StatusCodes.CREATED).send(created)
    })
}

function audit({ request, action, target, detail }: AuditParams): void {
    applicationEvents(request.log).sendUserEvent(request, {
        action,
        data: { target, ...(detail === undefined ? {} : { detail }) },
    })
}

const adminOnly = securityAccess.tenantAdminOnly([PrincipalType.USER])
const anyUser = securityAccess.publicTenant([PrincipalType.USER])
const IdParams = z.object({ id: EntityId })

function AdminRead<T extends z.ZodType>(response: T) {
    return {
        config: { security: adminOnly },
        schema: { tags: ['tenant-access'], response: { [StatusCodes.OK]: response } },
    }
}

function MemberActionRequest<T extends z.ZodType>(response: T) {
    return {
        config: { security: adminOnly },
        schema: { tags: ['tenant-access'], params: IdParams, response: { [StatusCodes.OK]: response } },
    }
}

const InviteRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], body: AddTenantUsersRequestBody, response: { [StatusCodes.CREATED]: AddTenantUsersResponse } },
}

const UpdateAccessRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], params: IdParams, body: UpdateTenantMemberAccessRequestBody, response: { [StatusCodes.OK]: TenantMember } },
}

const RemoveRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], params: IdParams, querystring: RemoveTenantMemberRequestQuery },
}

const ListResourcesRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], querystring: ListOwnedResourcesRequestQuery, response: { [StatusCodes.OK]: ListOwnedResourcesResponse } },
}

const TransferRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], body: TransferResourcesRequestBody, response: { [StatusCodes.OK]: TransferResourcesResponse } },
}

const UpdateModuleSettingsRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], body: UpdateModuleAccessSettingsRequestBody, response: { [StatusCodes.OK]: ModuleAccessSettings } },
}

const ListRequestsRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], querystring: ListModuleAccessRequestsQuery, response: { [StatusCodes.OK]: z.array(ModuleAccessRequestWithUsers) } },
}

const UpdateLoginSecurityRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], body: UpdateLoginSecurityRequestBody, response: { [StatusCodes.OK]: LoginSecuritySettings } },
}

const MyAccessRequest = {
    config: { security: anyUser },
    schema: { tags: ['tenant-access'], response: { [StatusCodes.OK]: MyModuleAccess } },
}

const CreateMyRequest = {
    config: { security: anyUser },
    schema: { tags: ['tenant-access'], body: CreateModuleAccessRequestBody, response: { [StatusCodes.CREATED]: ModuleAccessRequest } },
}

type AuditParams = {
    request: FastifyRequest
    action: TenantAdminEvent['action']
    target: string
    detail?: string
}
