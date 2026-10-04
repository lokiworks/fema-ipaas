import { generateId, isNil, ProjectId, SeekPage, TenantId } from '@fema-ipaas/core-utils'
import {
    ListReleaseChangesRequestQuery,
    ReleaseChange,
    ReleaseChangeAction,
    ReleaseChangeWithDetails,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { userRepo } from '../user/user-service'
import { workflowVersionRepo } from '../workflows/workflow-version/workflow-version.service'
import { releaseVersionNumbers } from './release-version-numbers'
import { ReleaseChangeEntity } from './release.entity'

export const releaseChangeRepo = repoFactory(ReleaseChangeEntity)

export const releaseChangeService = (log: FastifyBaseLogger) => ({
    async record({ projectId, actorId, action, workflowId, fromVersionId, toVersionId, restoredVersionId, note, comment, approverIds, releaseId, environmentsEnabled }: RecordParams): Promise<ReleaseChange> {
        const id = generateId()
        await releaseChangeRepo().insert({
            id,
            projectId,
            actorId,
            action,
            workflowId: workflowId ?? null,
            fromVersionId: fromVersionId ?? null,
            toVersionId: toVersionId ?? null,
            restoredVersionId: restoredVersionId ?? null,
            note: normalizeText(note),
            comment: normalizeText(comment),
            approverIds: approverIds ?? [],
            releaseId: releaseId ?? null,
            environmentsEnabled: environmentsEnabled ?? null,
        })
        log.info({ project: { id: projectId }, workflow: { id: workflowId }, user: { id: actorId } }, `[releaseChangeService#record] ${action}`)
        return releaseChangeRepo().findOneByOrFail({ id })
    },

    async list({ query, tenantId }: ListParams): Promise<SeekPage<ReleaseChangeWithDetails>> {
        const limit = query.limit ?? DEFAULT_PAGE_SIZE
        const offset = decodeOffset(query.cursor)
        const rows = await releaseChangeRepo().find({
            where: {
                projectId: query.projectId,
                ...(isNil(query.workflowId) ? {} : { workflowId: query.workflowId }),
            },
            order: { created: 'DESC', id: 'DESC' },
            skip: offset,
            take: limit + 1,
        })
        const page = rows.slice(0, limit)
        const details = await detailsFor({ changes: page, tenantId })
        return {
            data: details,
            next: rows.length > limit ? String(offset + limit) : null,
            previous: offset > 0 ? String(Math.max(0, offset - limit)) : null,
        }
    },
})

async function detailsFor({ changes, tenantId }: { changes: ReleaseChange[], tenantId: TenantId }): Promise<ReleaseChangeWithDetails[]> {
    if (changes.length === 0) {
        return []
    }
    const userIds = [...new Set(changes.flatMap((change) => [change.actorId, ...change.approverIds]))]
    const versionIds = [...new Set(changes.flatMap((change) => [change.fromVersionId, change.toVersionId, change.restoredVersionId]).filter((id): id is string => !isNil(id)))]
    const workflowIds = [...new Set(changes.map((change) => change.workflowId).filter((id): id is string => !isNil(id)))]
    const [users, versions, numbers] = await Promise.all([
        userRepo().find({ where: { tenantId, id: In(userIds) }, relations: { identity: true } }),
        versionIds.length === 0 ? Promise.resolve([]) : workflowVersionRepo().find({ where: { id: In(versionIds) }, select: ['id', 'displayName', 'workflowId'] }),
        releaseVersionNumbers.forWorkflows({ workflowIds }),
    ])
    const names = new Map(users.map((user) => [user.id, personName({ firstName: user.identity?.firstName, lastName: user.identity?.lastName, email: user.identity?.email })]))
    const versionName = new Map(versions.map((version) => [version.id, version.displayName]))
    return changes.map((change) => ({
        ...change,
        actorName: names.get(change.actorId) ?? '',
        approverNames: change.approverIds.map((id) => names.get(id) ?? ''),
        workflowDisplayName: [change.toVersionId, change.fromVersionId, change.restoredVersionId].map((id) => (isNil(id) ? undefined : versionName.get(id))).find((name) => !isNil(name)) ?? null,
        fromVersionNumber: numberOf({ numbers, versionId: change.fromVersionId }),
        toVersionNumber: numberOf({ numbers, versionId: change.toVersionId }),
        restoredVersionNumber: numberOf({ numbers, versionId: change.restoredVersionId }),
    }))
}

function numberOf({ numbers, versionId }: { numbers: Map<string, number>, versionId: string | null | undefined }): number | null {
    return isNil(versionId) ? null : numbers.get(versionId) ?? null
}

function personName({ firstName, lastName, email }: { firstName?: string, lastName?: string, email?: string }): string {
    const full = `${firstName ?? ''} ${lastName ?? ''}`.trim()
    return full.length > 0 ? full : email ?? ''
}

function normalizeText(value: string | null | undefined): string | null {
    const trimmed = value?.trim()
    return isNil(trimmed) || trimmed.length === 0 ? null : trimmed
}

function decodeOffset(cursor: string | undefined): number {
    const parsed = Number(cursor)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

const DEFAULT_PAGE_SIZE = 50

type RecordParams = {
    projectId: ProjectId
    actorId: string
    action: ReleaseChangeAction
    workflowId?: string
    fromVersionId?: string | null
    toVersionId?: string | null
    restoredVersionId?: string | null
    note?: string | null
    comment?: string | null
    approverIds?: string[]
    releaseId?: string | null
    environmentsEnabled?: boolean
}

type ListParams = {
    query: ListReleaseChangesRequestQuery
    tenantId: TenantId
}
