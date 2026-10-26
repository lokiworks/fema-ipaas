import { ApplicationError, EntityId, ErrorCode, MappingCoverageSource, MappingTableData, Permission } from '@fema-ipaas/core-utils'
import {
    ListMappingTablesRequestQuery,
    MAPPING_TABLE_MAX_ROWS,
    MappingTable,
    MappingTableReference,
    MappingTableRow,
    MappingTableSummary,
    PrincipalType,
    UpsertMappingRowsRequest,
    UpsertMappingRowsResult,
    UpsertMappingTableRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { mappingTableCoverageService } from './mapping-table-coverage.service'
import { MappingTableEntity } from './mapping-table.entity'
import { mappingTableService } from './mapping-table.service'

export const mappingTableController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<MappingTableSummary[]> => {
        return mappingTableService(request.log).list({ projectId: request.projectId })
    })

    app.post('/', CreateRequest, async (request, reply) => {
        const table = await mappingTableService(request.log).create({ request: request.body, actorId: request.principal.id })
        await reply.status(StatusCodes.CREATED).send(table)
    })

    app.get('/coverage', WorkflowCoverageRequest, async (request): Promise<MappingCoverageSource[]> => {
        return mappingTableCoverageService(request.log).forWorkflow({ workflowId: request.query.workflowId, projectId: request.projectId })
    })

    app.get('/:id', GetRequest, async (request): Promise<MappingTable> => {
        return mappingTableService(request.log).getOneOrThrow({ id: request.params.id, projectId: request.projectId })
    })

    app.post('/:id', UpdateRequest, async (request): Promise<MappingTable> => {
        return mappingTableService(request.log).update({ id: request.params.id, request: request.body, actorId: request.principal.id })
    })

    app.get('/:id/coverage', GetRequest, async (request): Promise<MappingCoverageSource[]> => {
        return mappingTableCoverageService(request.log).forTable({ tableId: request.params.id, projectId: request.projectId })
    })

    app.post('/:id/rows', AddRowsRequest, async (request): Promise<MappingTable> => {
        return mappingTableService(request.log).addRows({ id: request.params.id, projectId: request.projectId, rows: request.body.rows, actorId: request.principal.id })
    })

    app.delete('/:id', DeleteRequest, async (request, reply) => {
        await mappingTableService(request.log).delete({ id: request.params.id, projectId: request.projectId })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.get('/:id/references', GetRequest, async (request): Promise<MappingTableReference[]> => {
        return mappingTableService(request.log).references({ id: request.params.id, projectId: request.projectId })
    })
}

export const mappingTableWorkerController: FastifyPluginAsyncZod = async (app) => {
    app.get('/:id', WorkerGetRequest, async (request): Promise<MappingTableData> => {
        if (request.principal.type !== PrincipalType.ENGINE) {
            throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Engine credentials required' } })
        }
        return mappingTableService(request.log).getForWorker({ id: request.params.id, projectId: request.principal.projectId })
    })
    app.post('/:id/rows', WorkerUpsertRowsRequest, async (request): Promise<UpsertMappingRowsResult> => {
        if (request.principal.type !== PrincipalType.ENGINE) {
            throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Engine credentials required' } })
        }
        return mappingTableService(request.log).upsertRows({ id: request.params.id, projectId: request.principal.projectId, request: request.body })
    })
}

const IdParams = z.object({ id: EntityId })

const ListRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['mapping-tables'], querystring: ListMappingTablesRequestQuery },
}

const CreateRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['mapping-tables'], body: UpsertMappingTableRequestBody },
}

const GetRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.TABLE, tableName: MappingTableEntity }) },
    schema: { tags: ['mapping-tables'], params: IdParams },
}

const UpdateRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.TABLE, tableName: MappingTableEntity }) },
    schema: { tags: ['mapping-tables'], params: IdParams, body: UpsertMappingTableRequestBody },
}

const DeleteRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.TABLE, tableName: MappingTableEntity }) },
    schema: { tags: ['mapping-tables'], params: IdParams },
}

const WorkflowCoverageQuery = z.object({
    projectId: z.string(),
    workflowId: z.string(),
})

const AddRowsBody = z.object({
    rows: z.array(MappingTableRow).min(1).max(MAPPING_TABLE_MAX_ROWS),
})

const WorkflowCoverageRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['mapping-tables'], querystring: WorkflowCoverageQuery },
}

const AddRowsRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.TABLE, tableName: MappingTableEntity }) },
    schema: { tags: ['mapping-tables'], params: IdParams, body: AddRowsBody },
}

const WorkerGetRequest = {
    config: { security: securityAccess.engine() },
    schema: { params: IdParams },
}

const WorkerUpsertRowsRequest = {
    config: { security: securityAccess.engine() },
    schema: { params: IdParams, body: UpsertMappingRowsRequest, response: { 200: UpsertMappingRowsResult } },
}
