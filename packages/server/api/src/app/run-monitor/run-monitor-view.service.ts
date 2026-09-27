import { ApplicationError, ErrorCode, generateId, isNil } from '@fema-ipaas/core-utils'
import {
    CreateRunMonitorViewRequestBody,
    RUN_MONITOR_MAX_VIEWS_PER_USER,
    RunMonitorView,
    UpdateRunMonitorViewRequestBody,
} from '@fema-ipaas/shared'
import { repoFactory } from '../core/db/repo-factory'
import { RunMonitorViewEntity } from './run-monitor-view.entity'

export const runMonitorViewRepo = repoFactory(RunMonitorViewEntity)

export const runMonitorViewService = {
    async list({ tenantId, userId }: Owner): Promise<RunMonitorView[]> {
        return runMonitorViewRepo().find({ where: { tenantId, userId }, order: { created: 'ASC' } })
    },

    async create({ tenantId, userId, request }: Owner & { request: CreateRunMonitorViewRequestBody }): Promise<RunMonitorView> {
        const count = await runMonitorViewRepo().countBy({ tenantId, userId })
        if (count >= RUN_MONITOR_MAX_VIEWS_PER_USER) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'Too many saved views' } })
        }
        await assertNameAvailable({ tenantId, userId, name: request.name, excludeId: null })
        const view = {
            id: generateId(),
            tenantId,
            userId,
            name: request.name,
            config: request.config,
        }
        await runMonitorViewRepo().insert(view)
        return getOneOrThrow({ tenantId, userId, id: view.id })
    },

    async update({ tenantId, userId, id, request }: Owner & { id: string, request: UpdateRunMonitorViewRequestBody }): Promise<RunMonitorView> {
        const existing = await getOneOrThrow({ tenantId, userId, id })
        if (!isNil(request.name) && request.name !== existing.name) {
            await assertNameAvailable({ tenantId, userId, name: request.name, excludeId: id })
        }
        await runMonitorViewRepo().update({ id, tenantId, userId }, {
            name: request.name ?? existing.name,
            config: request.config ?? existing.config,
        })
        return getOneOrThrow({ tenantId, userId, id })
    },

    async delete({ tenantId, userId, id }: Owner & { id: string }): Promise<void> {
        await getOneOrThrow({ tenantId, userId, id })
        await runMonitorViewRepo().delete({ id, tenantId, userId })
    },
}

async function getOneOrThrow({ tenantId, userId, id }: Owner & { id: string }): Promise<RunMonitorView> {
    const view = await runMonitorViewRepo().findOneBy({ id, tenantId, userId })
    if (isNil(view)) {
        throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: 'RunMonitorView' } })
    }
    return view
}

async function assertNameAvailable({ tenantId, userId, name, excludeId }: Owner & { name: string, excludeId: string | null }): Promise<void> {
    const existing = await runMonitorViewRepo().findOneBy({ tenantId, userId, name })
    if (!isNil(existing) && existing.id !== excludeId) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'A view with this name already exists' } })
    }
}

type Owner = {
    tenantId: string
    userId: string
}
