import { ApplicationError, ErrorCode, isNil, sanitizeObjectForPostgresql, tryCatch } from '@fema-ipaas/core-utils'
import {
    AddDirectoryMembersRequestBody,
    AddDirectoryMembersResponse,
    DirectorySkipReason,
    ListTenantDirectoryRequestQuery,
    SsoMatchBy,
    StoredMemberSubscription,
    TenantDirectoryPage,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { ExternalIdentityRecord, externalIdentityService } from '../federation/external-identity.service'
import { DirectoryEntry, memberDirectory } from '../federation/member-directory'
import { memberSubscriptionService } from '../federation/member-subscription.service'
import { tenantService } from '../tenant/tenant.service'
import { userRepo } from '../user/user-service'
import { tenantAccessUtils } from './tenant-access.utils'
import { DirectoryUser, tenantDirectoryUtils } from './tenant-directory.utils'

export const tenantDirectoryService = (log: FastifyBaseLogger) => ({
    async isAvailable({ tenantId }: TenantParams): Promise<boolean> {
        return !isNil(await sourceOf({ log, tenantId }))
    },

    async list({ tenantId, query }: ListParams): Promise<TenantDirectoryPage> {
        const source = await requireSource({ log, tenantId })
        const accessToken = await accessTokenOf({ log, tenantId, source })
        const page = await readDirectory({
            log,
            tenantId,
            read: () => memberDirectory.search({ apiUrl: source.subscription.apiUrl, accessToken, keyword: query.keyword, page: query.page, limit: query.limit }),
        })
        const subjects = page.entries.map((entry) => entry.subject)
        const bindings = await externalIdentityService(log).listBySubjects({ tenantId, issuer: source.issuer, subjects })
        const users = await usersOf({ tenantId, bindings })
        const bindingBySubject = new Map(bindings.map((binding) => [binding.subject, binding]))
        return {
            items: page.entries.map((entry) => {
                const binding = bindingBySubject.get(entry.subject) ?? null
                const userId = binding?.userId ?? null
                const user = isNil(userId) ? null : users.get(userId) ?? null
                return tenantDirectoryUtils.toDirectoryMember({ entry, binding, user })
            }),
            page: page.page,
            hasNext: page.hasNext,
            total: page.total,
        }
    },

    async add({ tenantId, request }: AddParams): Promise<AddDirectoryMembersResponse> {
        const source = await requireSource({ log, tenantId })
        const accessToken = await accessTokenOf({ log, tenantId, source })
        const subjects = [...new Set(request.subjects)]
        const entries = await readDirectory({
            log,
            tenantId,
            read: () => memberDirectory.findByIds({ apiUrl: source.subscription.apiUrl, accessToken, ids: subjects }),
        })
        const bindings = await externalIdentityService(log).listBySubjects({ tenantId, issuer: source.issuer, subjects })
        const entryBySubject = new Map(entries.map((entry) => [entry.subject, entry]))
        const bindingBySubject = new Map(bindings.map((binding) => [binding.subject, binding]))
        const modules = tenantAccessUtils.assignableModules(request.modules)
        const outcomes = await subjects.reduce<Promise<AddOutcome[]>>(async (previous, subject) => {
            const done = await previous
            const entry = entryBySubject.get(subject) ?? null
            const reason = tenantDirectoryUtils.skipReasonOf({ entry, binding: bindingBySubject.get(subject) ?? null })
            if (isNil(entry) || !isNil(reason)) {
                return [...done, { kind: 'skipped', subject, name: entry?.name ?? null, reason: reason ?? DirectorySkipReason.NOT_IN_DIRECTORY }]
            }
            const outcome = await prebindEntry({ log, tenantId, issuer: source.issuer, entry, request, modules })
            return [...done, outcome]
        }, Promise.resolve([]))
        log.info({ tenant: { id: tenantId }, addedCount: outcomes.filter((outcome) => outcome.kind === 'added').length, skippedCount: outcomes.filter((outcome) => outcome.kind === 'skipped').length }, '[tenantDirectory] members added from the directory')
        return {
            added: outcomes.flatMap((outcome) => outcome.kind === 'added' ? [{ subject: outcome.subject, name: outcome.name }] : []),
            skipped: outcomes.flatMap((outcome) => outcome.kind === 'skipped' ? [{ subject: outcome.subject, name: outcome.name, reason: outcome.reason }] : []),
        }
    },

    async removePending({ tenantId, bindingId }: RemovePendingParams): Promise<ExternalIdentityRecord> {
        const removed = await externalIdentityService(log).deletePending({ id: bindingId, tenantId })
        if (isNil(removed)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'member', entityId: bindingId },
            })
        }
        log.info({ tenant: { id: tenantId } }, '[tenantDirectory] a member who had not signed in yet was removed')
        return removed
    },
})

async function prebindEntry({ log, tenantId, issuer, entry, request, modules }: PrebindEntryParams): Promise<AddOutcome> {
    const { displayName } = sanitizeObjectForPostgresql({ displayName: entry.name })
    const { error } = await tryCatch(() => externalIdentityService(log).prebind({
        tenantId,
        issuer,
        subject: entry.subject,
        role: request.tenantRole,
        modules,
        displayName,
    }))
    if (!isNil(error)) {
        log.warn({ tenant: { id: tenantId }, error }, '[tenantDirectory] a member could not be added')
        return { kind: 'skipped', subject: entry.subject, name: entry.name, reason: DirectorySkipReason.NOT_IN_DIRECTORY }
    }
    return { kind: 'added', subject: entry.subject, name: entry.name }
}

async function sourceOf({ log, tenantId }: { log: FastifyBaseLogger, tenantId: string }): Promise<DirectorySource | null> {
    const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
    const oidc = tenant.federatedAuthProviders.oidc
    if (isNil(oidc) || oidc.matchBy !== SsoMatchBy.SUBJECT || isNil(oidc.memberSubscription)) {
        return null
    }
    return { issuer: oidc.issuer, subscription: oidc.memberSubscription }
}

async function requireSource({ log, tenantId }: { log: FastifyBaseLogger, tenantId: string }): Promise<DirectorySource> {
    const source = await sourceOf({ log, tenantId })
    if (isNil(source)) {
        throw directoryError({ message: 'memberDirectoryUnavailable' })
    }
    return source
}

async function accessTokenOf({ log, tenantId, source }: { log: FastifyBaseLogger, tenantId: string, source: DirectorySource }): Promise<string> {
    const result = await tryCatch(() => memberSubscriptionService(log).accessTokenFor({ tenantId, subscription: source.subscription }))
    if (result.error !== null) {
        log.warn({ tenant: { id: tenantId }, error: result.error }, '[tenantDirectory] the integration application has no usable token')
        throw directoryError({ message: 'memberDirectoryUnreachable' })
    }
    return result.data
}

async function readDirectory<T>({ log, tenantId, read }: ReadDirectoryParams<T>): Promise<T> {
    const result = await tryCatch(read)
    if (result.error !== null) {
        log.warn({ tenant: { id: tenantId }, error: result.error }, '[tenantDirectory] the member directory could not be read')
        throw directoryError({ message: 'memberDirectoryUnreachable' })
    }
    return result.data
}

async function usersOf({ tenantId, bindings }: { tenantId: string, bindings: ExternalIdentityRecord[] }): Promise<Map<string, DirectoryUser>> {
    const userIds = bindings.flatMap((binding) => isNil(binding.userId) ? [] : [binding.userId])
    if (userIds.length === 0) {
        return new Map()
    }
    const users = await userRepo().find({ where: { tenantId, id: In(userIds) }, select: ['id', 'status', 'tenantRole'] })
    return new Map(users.map((user) => [user.id, { status: user.status, tenantRole: user.tenantRole }]))
}

function directoryError({ message }: { message: string }): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message, messageKey: message },
    })
}

type TenantParams = {
    tenantId: string
}

type ListParams = TenantParams & {
    query: ListTenantDirectoryRequestQuery
}

type AddParams = TenantParams & {
    request: AddDirectoryMembersRequestBody
}

type RemovePendingParams = TenantParams & {
    bindingId: string
}

type DirectorySource = {
    issuer: string
    subscription: StoredMemberSubscription
}

type AddOutcome =
    | { kind: 'added', subject: string, name: string }
    | { kind: 'skipped', subject: string, name: string | null, reason: DirectorySkipReason }

type PrebindEntryParams = {
    log: FastifyBaseLogger
    tenantId: string
    issuer: string
    entry: DirectoryEntry
    request: AddDirectoryMembersRequestBody
    modules: ReturnType<typeof tenantAccessUtils.assignableModules>
}

type ReadDirectoryParams<T> = {
    log: FastifyBaseLogger
    tenantId: string
    read: () => Promise<T>
}
