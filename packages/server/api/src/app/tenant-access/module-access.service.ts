import { ApplicationError, ErrorCode, generateId, isNil } from '@fema-ipaas/core-utils'
import { CreateModuleAccessRequestBody, DEFAULT_MODULE_ACCESS_SETTINGS, ModuleAccessContact, ModuleAccessRequest, ModuleAccessRequestStatus, ModuleAccessRequestWithUsers, ModuleAccessSettings, MyModuleAccess, PermissionDeniedHint, TenantModule, TenantRole, UserStatus } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { tenantRepo } from '../tenant/tenant.service'
import { userRepo, userService } from '../user/user-service'
import { ModuleAccessRequestEntity } from './module-access-request.entity'
import { tenantAccessUtils } from './tenant-access.utils'

const moduleAccessRequestRepo = repoFactory(ModuleAccessRequestEntity)

export const moduleAccessService = (log: FastifyBaseLogger) => ({
    async getSettings({ tenantId }: TenantParams): Promise<ModuleAccessSettings> {
        const tenant = await tenantRepo().findOneByOrFail({ id: tenantId })
        return { ...DEFAULT_MODULE_ACCESS_SETTINGS, ...(tenant.moduleAccessSettings ?? {}) }
    },

    async updateSettings({ tenantId, settings }: UpdateSettingsParams): Promise<ModuleAccessSettings> {
        if (!isNil(settings.personUserId)) {
            const person = await userRepo().findOneBy({ id: settings.personUserId, tenantId })
            if (isNil(person)) {
                throw validation('The selected person is not a user of this tenant')
            }
        }
        const next: ModuleAccessSettings = {
            ...settings,
            notice: settings.notice.trim(),
            url: settings.url?.trim() || null,
            rulesUrl: settings.rulesUrl?.trim() || null,
        }
        await tenantRepo().update({ id: tenantId }, { moduleAccessSettings: next })
        return next
    },

    async getMyAccess({ tenantId, userId }: UserParams): Promise<MyModuleAccess> {
        const [user, settings] = await Promise.all([
            userRepo().findOneByOrFail({ id: userId, tenantId }),
            this.getSettings({ tenantId }),
        ])
        const pending = await moduleAccessRequestRepo().find({ where: { tenantId, userId, status: ModuleAccessRequestStatus.PENDING } })
        return {
            modules: tenantAccessUtils.effectiveModules({ tenantRole: user.tenantRole, storedModules: user.modules ?? [] }),
            pendingModules: pending.map((request) => request.module),
            deniedHint: settings.deniedHint,
            contacts: await resolveContacts({ tenantId, settings }),
            url: settings.url ?? null,
            allowRequests: settings.allowRequests,
            notice: settings.notice,
            rulesUrl: settings.rulesUrl ?? null,
        }
    },

    async createRequest({ tenantId, userId, request }: CreateRequestParams): Promise<ModuleAccessRequest> {
        const settings = await this.getSettings({ tenantId })
        if (!settings.allowRequests) {
            throw validation('Permission requests are turned off for this tenant')
        }
        const user = await userRepo().findOneByOrFail({ id: userId, tenantId })
        if (tenantAccessUtils.hasModule({ tenantRole: user.tenantRole, storedModules: user.modules ?? [], module: request.module })) {
            throw validation('You already have access to this module')
        }
        const existing = await moduleAccessRequestRepo().findOneBy({ tenantId, userId, module: request.module, status: ModuleAccessRequestStatus.PENDING })
        if (!isNil(existing)) {
            return existing
        }
        const now = dayjs().toISOString()
        return moduleAccessRequestRepo().save({
            id: generateId(),
            created: now,
            updated: now,
            tenantId,
            userId,
            module: request.module,
            reason: request.reason,
            status: ModuleAccessRequestStatus.PENDING,
            decidedBy: null,
            decidedAt: null,
        })
    },

    async listRequests({ tenantId, status }: ListRequestsParams): Promise<ModuleAccessRequestWithUsers[]> {
        const requests = await moduleAccessRequestRepo().find({
            where: { tenantId, ...(isNil(status) ? {} : { status }) },
            order: { created: 'DESC' },
            take: REQUEST_LIST_CAP,
        })
        const userIds = [...new Set(requests.flatMap((request) => [request.userId, request.decidedBy]).filter((id): id is string => !isNil(id)))]
        const users = userIds.length === 0 ? [] : await userRepo().find({ where: { id: In(userIds), tenantId }, relations: { identity: true } })
        const byId = new Map(users.map((user) => [user.id, user]))
        return requests.map((request) => {
            const requester = byId.get(request.userId)
            const decider = isNil(request.decidedBy) ? undefined : byId.get(request.decidedBy)
            return {
                ...request,
                userEmail: requester?.identity?.email ?? null,
                userName: isNil(requester?.identity) ? null : fullName(requester.identity),
                decidedByName: isNil(decider?.identity) ? null : fullName(decider.identity),
            }
        })
    },

    async decide({ tenantId, requestId, actorId, approve }: DecideParams): Promise<ModuleAccessRequest> {
        const request = await moduleAccessRequestRepo().findOneBy({ id: requestId, tenantId })
        if (isNil(request)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'module_access_request', entityId: requestId },
            })
        }
        if (request.status !== ModuleAccessRequestStatus.PENDING) {
            throw validation('This request has already been decided')
        }
        const requester = await userRepo().findOneBy({ id: request.userId, tenantId })
        if (isNil(requester)) {
            throw validation('The requester is no longer a user of this tenant')
        }
        if (approve) {
            await grantModule({ tenantId, user: requester, module: request.module, log })
        }
        const decided = {
            ...request,
            status: approve ? ModuleAccessRequestStatus.APPROVED : ModuleAccessRequestStatus.REJECTED,
            decidedBy: actorId,
            decidedAt: dayjs().toISOString(),
        }
        await moduleAccessRequestRepo().update({ id: request.id, tenantId }, {
            status: decided.status,
            decidedBy: decided.decidedBy,
            decidedAt: decided.decidedAt,
        })
        return decided
    },

    async countPending({ tenantId }: TenantParams): Promise<number> {
        return moduleAccessRequestRepo().countBy({ tenantId, status: ModuleAccessRequestStatus.PENDING })
    },
})

async function grantModule({ tenantId, user, module, log }: GrantModuleParams): Promise<void> {
    if (module === TenantModule.PLATFORM_ADMIN) {
        await userService(log).update({ id: user.id, tenantId, tenantRole: TenantRole.ADMIN })
        return
    }
    const modules = tenantAccessUtils.assignableModules([...(user.modules ?? []), module])
    await userService(log).update({ id: user.id, tenantId, modules })
}

async function resolveContacts({ tenantId, settings }: ResolveContactsParams): Promise<ModuleAccessContact[]> {
    if (settings.deniedHint === PermissionDeniedHint.PERSON && !isNil(settings.personUserId)) {
        const person = await userRepo().findOne({ where: { id: settings.personUserId, tenantId }, relations: { identity: true } })
        return isNil(person?.identity) ? [] : [{ name: fullName(person.identity), email: person.identity.email }]
    }
    const admins = await userRepo().find({
        where: { tenantId, tenantRole: TenantRole.ADMIN, status: UserStatus.ACTIVE },
        relations: { identity: true },
    })
    return admins
        .sort((a, b) => String(b.lastActiveDate ?? '').localeCompare(String(a.lastActiveDate ?? '')))
        .slice(0, ADMIN_CONTACTS)
        .filter((admin) => !isNil(admin.identity))
        .map((admin) => ({ name: fullName(admin.identity), email: admin.identity.email }))
}

function fullName(identity: { firstName: string, lastName: string, email: string }): string {
    const name = `${identity.firstName} ${identity.lastName}`.trim()
    return name.length > 0 ? name : identity.email
}

function validation(message: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

const REQUEST_LIST_CAP = 500
const ADMIN_CONTACTS = 2

type TenantParams = {
    tenantId: string
}

type UserParams = TenantParams & {
    userId: string
}

type UpdateSettingsParams = TenantParams & {
    settings: ModuleAccessSettings
}

type CreateRequestParams = UserParams & {
    request: CreateModuleAccessRequestBody
}

type ListRequestsParams = TenantParams & {
    status?: ModuleAccessRequestStatus
}

type DecideParams = TenantParams & {
    requestId: string
    actorId: string
    approve: boolean
}

type GrantModuleParams = {
    tenantId: string
    user: { id: string, modules?: TenantModule[] }
    module: TenantModule
    log: FastifyBaseLogger
}

type ResolveContactsParams = {
    tenantId: string
    settings: ModuleAccessSettings
}
