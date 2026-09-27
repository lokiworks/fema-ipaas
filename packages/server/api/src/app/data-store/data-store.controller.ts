import { EntityId, Permission } from '@fema-ipaas/core-utils'
import {
    ApplicationEventName,
    CreateDataStoreRequestBody,
    DataStore,
    DataStoreRecord,
    DataStoreRecordsPage,
    DataStoreSummary,
    DeleteDataStoreRecordRequestQuery,
    ListDataStoreRecordsRequestQuery,
    ListDataStoresRequestQuery,
    PrincipalType,
    UpdateDataStoreRequestBody,
    UpsertDataStoreRecordRequestBody,
} from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { dataStoreRecordService } from './data-store-record.service'
import { DataStoreEntity } from './data-store.entity'
import { dataStoreService } from './data-store.service'

export const dataStoreController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<DataStoreSummary[]> => {
        return dataStoreService(request.log).list({ projectId: request.projectId })
    })

    app.post('/', CreateRequest, async (request, reply) => {
        const store = await dataStoreService(request.log).create({ request: request.body, ownerId: request.principal.id })
        audit({ request, action: ApplicationEventName.DATA_STORE_CREATED, store })
        await reply.status(StatusCodes.CREATED).send(store)
    })

    app.post('/:id', UpdateRequest, async (request): Promise<DataStore> => {
        const store = await dataStoreService(request.log).update({ id: request.params.id, projectId: request.projectId, request: request.body })
        audit({ request, action: ApplicationEventName.DATA_STORE_UPDATED, store })
        return store
    })

    app.delete('/:id', DeleteRequest, async (request, reply) => {
        const store = await dataStoreService(request.log).delete({ id: request.params.id, projectId: request.projectId })
        audit({ request, action: ApplicationEventName.DATA_STORE_DELETED, store })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.get('/:id/records', ListRecordsRequest, async (request): Promise<DataStoreRecordsPage> => {
        const store = await dataStoreService(request.log).getOneOrThrow({ id: request.params.id, projectId: request.projectId })
        return dataStoreRecordService(request.log).list({ store, search: request.query.search, limit: request.query.limit })
    })

    app.post('/:id/records', UpsertRecordRequest, async (request): Promise<DataStoreRecord> => {
        const store = await dataStoreService(request.log).getOneOrThrow({ id: request.params.id, projectId: request.projectId })
        return dataStoreRecordService(request.log).upsert({ store, request: request.body })
    })

    app.delete('/:id/records', DeleteRecordRequest, async (request, reply) => {
        const store = await dataStoreService(request.log).getOneOrThrow({ id: request.params.id, projectId: request.projectId })
        const deleted = await dataStoreRecordService(request.log).delete({ store, key: request.query.key })
        if (deleted) {
            audit({ request, action: ApplicationEventName.DATA_STORE_RECORD_DELETED, store, key: request.query.key })
        }
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.post('/:id/clear', ClearRequest, async (request): Promise<{ count: number }> => {
        const store = await dataStoreService(request.log).getOneOrThrow({ id: request.params.id, projectId: request.projectId })
        const count = await dataStoreRecordService(request.log).clear({ store })
        audit({ request, action: ApplicationEventName.DATA_STORE_CLEARED, store, count })
        return { count }
    })
}

function audit({ request, action, store, key, count }: AuditParams): void {
    applicationEvents(request.log).sendUserEvent(request, {
        action,
        data: {
            dataStore: { id: store.id, name: store.name },
            ...(key === undefined ? {} : { key }),
            ...(count === undefined ? {} : { count }),
        },
    })
}

const IdParams = z.object({ id: EntityId })

const readStore = securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.TABLE, tableName: DataStoreEntity })
const writeStore = securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.TABLE, tableName: DataStoreEntity })

const ListRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['data-stores'], querystring: ListDataStoresRequestQuery },
}

const CreateRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['data-stores'], body: CreateDataStoreRequestBody },
}

const UpdateRequest = {
    config: { security: writeStore },
    schema: { tags: ['data-stores'], params: IdParams, body: UpdateDataStoreRequestBody },
}

const DeleteRequest = {
    config: { security: writeStore },
    schema: { tags: ['data-stores'], params: IdParams },
}

const ListRecordsRequest = {
    config: { security: readStore },
    schema: { tags: ['data-stores'], params: IdParams, querystring: ListDataStoreRecordsRequestQuery },
}

const UpsertRecordRequest = {
    config: { security: writeStore },
    schema: { tags: ['data-stores'], params: IdParams, body: UpsertDataStoreRecordRequestBody },
}

const DeleteRecordRequest = {
    config: { security: writeStore },
    schema: { tags: ['data-stores'], params: IdParams, querystring: DeleteDataStoreRecordRequestQuery },
}

const ClearRequest = {
    config: { security: writeStore },
    schema: { tags: ['data-stores'], params: IdParams },
}

type AuditParams = {
    request: FastifyRequest
    action: ApplicationEventName.DATA_STORE_CREATED
    | ApplicationEventName.DATA_STORE_UPDATED
    | ApplicationEventName.DATA_STORE_DELETED
    | ApplicationEventName.DATA_STORE_CLEARED
    | ApplicationEventName.DATA_STORE_RECORD_DELETED
    store: DataStore
    key?: string
    count?: number
}
