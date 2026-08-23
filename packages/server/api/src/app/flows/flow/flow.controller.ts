import { ApId, Permission, SeekPage, UserId } from '@fema/core-utils'
import { CountFlowsRequest, CreateFlowRequest, FlowOperationRequest, FlowOperationType, flowStructureUtil, FlowTrigger, GetFlowQueryParamsRequest, GetFlowTemplateRequestQuery, ListFlowsRequest, PopulatedFlow, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, SharedTemplate } from '@fema/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { entitiesMustBeOwnedByCurrentWorkspace } from '../../authentication/authorization'
import { WorkspaceResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { networkUtils } from '../../helper/network-utils'
import { userService } from '../../user/user-service'
import { migrateFlowVersionTemplate } from '../flow-version/migrations'
import { FlowEntity } from './flow.entity'
import { flowService } from './flow.service'

const DEFAULT_PAGE_SIZE = 10

export const flowController: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentWorkspace)
    app.post('/', CreateFlowRequestOptions, async (request, reply) => {
        const newFlow = await flowService(request.log).create({
            workspaceId: request.workspaceId,
            request: request.body,
            ownerId: actorUserId(request),
            templateId: request.body.templateId,
            ip: networkUtils.clientIp(request),
        })

        return reply.status(StatusCodes.CREATED).send(newFlow)
    })

    app.post('/:id', {
        config: {
            security: securityAccess.workspace(
                [PrincipalType.USER, PrincipalType.SERVICE], 
                Permission.UPDATE_FLOW_STATUS, {
                    type: WorkspaceResourceType.TABLE,
                    tableName: FlowEntity,
                }),
        },
        schema: {
            tags: ['flows'],
            description: 'Apply an operation to a flow',
            security: [SERVICE_KEY_SECURITY_OPENAPI],
            body: FlowOperationRequest,
            params: z.object({
                id: ApId,
            }),
        },
        preValidation: async (request) => {
            if (request.body?.type === FlowOperationType.IMPORT_FLOW) {
                const migratedFlowTemplate = await migrateFlowVersionTemplate({
                    displayName: request.body.request.displayName,
                    trigger: request.body.request.trigger,
                    //because the target for the first migraiton is undefined not null
                    schemaVersion: request.body.request.schemaVersion ?? undefined,
                    notes: request.body.request.notes ?? [],
                    valid: false,
                })
                request.body.request = {
                    ...request.body.request,
                    displayName: migratedFlowTemplate.displayName,
                    trigger: migratedFlowTemplate.trigger,
                    schemaVersion: migratedFlowTemplate.schemaVersion,
                    notes: migratedFlowTemplate.notes,
                }
            }
        },
    }, async (request) => {
        const flow = await flowService(request.log).getOnePopulatedOrThrow({
            id: request.params.id,
            workspaceId: request.workspaceId,
        })

        return flowService(request.log).update({
            id: request.params.id,
            userId: actorUserId(request),
            platformId: request.principal.platform.id,
            workspaceId: request.workspaceId,
            operation: cleanOperation(request.body),
            previousFlow: flow,
            ip: networkUtils.clientIp(request),
        })
    })

    app.get('/', ListFlowsRequestOptions, async (request) => {
        return flowService(request.log).list({
            workspaceIds: [request.workspaceId],
            folderId: request.query.folderId,
            folderIds: request.query.folderIds,
            cursorRequest: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
            status: request.query.status,
            name: request.query.name,
            versionState: request.query.versionState,
            externalIds: request.query.externalIds,
            connectionExternalIds: request.query.connectionExternalIds,
            agentExternalIds: request.query.agentExternalIds,
        })
    })

    app.get('/count', CountFlowsRequestOptions, async (request) => {
        return flowService(request.log).count({
            folderId: request.query.folderId,
            workspaceId: request.workspaceId,
        })
    })

    app.get('/:id/template', GetFlowTemplateRequestOptions, async (request) => {
        const userMetadata = request.principal.type === PrincipalType.USER ? await userService(request.log).getMetaInformation({ id: request.principal.id }) : null
        return flowService(request.log).getTemplate({
            flowId: request.params.id,
            userMetadata,
            workspaceId: request.workspaceId,
            versionId: undefined,
        })
    })

    app.get('/:id', GetFlowRequestOptions, async (request) => {
        return flowService(request.log).getOnePopulatedOrThrow({
            id: request.params.id,
            workspaceId: request.workspaceId,
            versionId: request.query.versionId,
        })
    })

    app.delete('/:id', DeleteFlowRequestOptions, async (request, reply) => {
        const flow = await flowService(request.log).getOnePopulatedOrThrow({
            id: request.params.id,
            workspaceId: request.workspaceId,
        })
        await flowService(request.log).delete({
            id: request.params.id,
            workspaceId: request.workspaceId,
            previousFlow: flow,
            userId: actorUserId(request),
            ip: networkUtils.clientIp(request),
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

function actorUserId(request: FastifyRequest): UserId | undefined {
    return request.principal.type === PrincipalType.USER ? request.principal.id : undefined
}

function cleanOperation(operation: FlowOperationRequest): FlowOperationRequest {
    if (operation.type === FlowOperationType.IMPORT_FLOW) {
        const clearSampleData = {
            sampleDataFileId: undefined,
            sampleDataInputFileId: undefined,
            lastTestDate: undefined,
        }
        const trigger = flowStructureUtil.transferStep(operation.request.trigger, (step) => ({
            ...step,
            settings: {
                ...step.settings,
                sampleData: {
                    ...step.settings.sampleData,
                    ...clearSampleData,
                },
            },
        })) as FlowTrigger
        return {
            ...operation,
            request: {
                ...operation.request,
                trigger,
            },
        }
    }
    return operation
}

const CreateFlowRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.WRITE_FLOW, {
                type: WorkspaceResourceType.BODY,
            }),
    },
    schema: {
        tags: ['flows'],
        description: 'Create a flow',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        body: CreateFlowRequest,
        response: {
            [StatusCodes.CREATED]: PopulatedFlow,
        },
    },
}


const ListFlowsRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_FLOW, {
                type: WorkspaceResourceType.QUERY,
            }),
    },
    schema: {
        tags: ['flows'],
        description: 'List flows',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: ListFlowsRequest,
        response: {
            [StatusCodes.OK]: SeekPage(PopulatedFlow),
        },
    },
}

const CountFlowsRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_FLOW, {
                type: WorkspaceResourceType.QUERY,
            }),
    },
    schema: {
        querystring: CountFlowsRequest,
    },
}

const GetFlowTemplateRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_FLOW, {
                type: WorkspaceResourceType.TABLE,
                tableName: FlowEntity,
            }),
    },
    schema: {
        tags: ['flows'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Export flow as template',
        params: z.object({
            id: ApId,
        }),
        querystring: GetFlowTemplateRequestQuery,
        response: {
            [StatusCodes.OK]: SharedTemplate,
        },
    },
}

const GetFlowRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_FLOW, {
                type: WorkspaceResourceType.TABLE,
                tableName: FlowEntity,
            }),
    },
    schema: {
        tags: ['flows'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Get a flow by id',
        params: z.object({
            id: ApId,
        }),
        querystring: GetFlowQueryParamsRequest,
        response: {
            [StatusCodes.OK]: PopulatedFlow,
        },
    },
}

const DeleteFlowRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.WRITE_FLOW, {
                type: WorkspaceResourceType.TABLE,
                tableName: FlowEntity,
            }),
    },
    schema: {
        tags: ['flows'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Delete a flow',
        params: z.object({
            id: ApId,
        }),
        response: {
            [StatusCodes.NO_CONTENT]: z.never(),
        },
    },
}
