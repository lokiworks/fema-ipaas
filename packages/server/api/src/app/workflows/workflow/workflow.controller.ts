import { ApId, Permission, SeekPage, UserId } from '@fema/core-utils'
import { CountWorkflowsRequest, CreateWorkflowRequest, GetWorkflowQueryParamsRequest, GetWorkflowTemplateRequestQuery, ListWorkflowsRequest, PopulatedWorkflow, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, SharedTemplate, WorkflowOperationRequest, WorkflowOperationType, workflowStructureUtil, WorkflowTrigger } from '@fema/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { entitiesMustBeOwnedByCurrentWorkspace } from '../../authentication/authorization'
import { WorkspaceResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { networkUtils } from '../../helper/network-utils'
import { userService } from '../../user/user-service'
import { migrateWorkflowVersionTemplate } from '../workflow-version/migrations'
import { WorkflowEntity } from './workflow.entity'
import { workflowService } from './workflow.service'

const DEFAULT_PAGE_SIZE = 10

export const workflowController: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentWorkspace)
    app.post('/', CreateWorkflowRequestOptions, async (request, reply) => {
        const newWorkflow = await workflowService(request.log).create({
            workspaceId: request.workspaceId,
            request: request.body,
            ownerId: actorUserId(request),
            templateId: request.body.templateId,
            ip: networkUtils.clientIp(request),
        })

        return reply.status(StatusCodes.CREATED).send(newWorkflow)
    })

    app.post('/:id', {
        config: {
            security: securityAccess.workspace(
                [PrincipalType.USER, PrincipalType.SERVICE], 
                Permission.UPDATE_WORKFLOW_STATUS, {
                    type: WorkspaceResourceType.TABLE,
                    tableName: WorkflowEntity,
                }),
        },
        schema: {
            tags: ['workflows'],
            description: 'Apply an operation to a workflow',
            security: [SERVICE_KEY_SECURITY_OPENAPI],
            body: WorkflowOperationRequest,
            params: z.object({
                id: ApId,
            }),
        },
        preValidation: async (request) => {
            if (request.body?.type === WorkflowOperationType.IMPORT_WORKFLOW) {
                const migratedWorkflowTemplate = await migrateWorkflowVersionTemplate({
                    displayName: request.body.request.displayName,
                    trigger: request.body.request.trigger,
                    //because the target for the first migraiton is undefined not null
                    schemaVersion: request.body.request.schemaVersion ?? undefined,
                    notes: request.body.request.notes ?? [],
                    valid: false,
                })
                request.body.request = {
                    ...request.body.request,
                    displayName: migratedWorkflowTemplate.displayName,
                    trigger: migratedWorkflowTemplate.trigger,
                    schemaVersion: migratedWorkflowTemplate.schemaVersion,
                    notes: migratedWorkflowTemplate.notes,
                }
            }
        },
    }, async (request) => {
        const workflow = await workflowService(request.log).getOnePopulatedOrThrow({
            id: request.params.id,
            workspaceId: request.workspaceId,
        })

        return workflowService(request.log).update({
            id: request.params.id,
            userId: actorUserId(request),
            tenantId: request.principal.tenant.id,
            workspaceId: request.workspaceId,
            operation: cleanOperation(request.body),
            previousWorkflow: workflow,
            ip: networkUtils.clientIp(request),
        })
    })

    app.get('/', ListWorkflowsRequestOptions, async (request) => {
        return workflowService(request.log).list({
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

    app.get('/count', CountWorkflowsRequestOptions, async (request) => {
        return workflowService(request.log).count({
            folderId: request.query.folderId,
            workspaceId: request.workspaceId,
        })
    })

    app.get('/:id/template', GetWorkflowTemplateRequestOptions, async (request) => {
        const userMetadata = request.principal.type === PrincipalType.USER ? await userService(request.log).getMetaInformation({ id: request.principal.id }) : null
        return workflowService(request.log).getTemplate({
            workflowId: request.params.id,
            userMetadata,
            workspaceId: request.workspaceId,
            versionId: undefined,
        })
    })

    app.get('/:id', GetWorkflowRequestOptions, async (request) => {
        return workflowService(request.log).getOnePopulatedOrThrow({
            id: request.params.id,
            workspaceId: request.workspaceId,
            versionId: request.query.versionId,
        })
    })

    app.delete('/:id', DeleteWorkflowRequestOptions, async (request, reply) => {
        const workflow = await workflowService(request.log).getOnePopulatedOrThrow({
            id: request.params.id,
            workspaceId: request.workspaceId,
        })
        await workflowService(request.log).delete({
            id: request.params.id,
            workspaceId: request.workspaceId,
            previousWorkflow: workflow,
            userId: actorUserId(request),
            ip: networkUtils.clientIp(request),
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

function actorUserId(request: FastifyRequest): UserId | undefined {
    return request.principal.type === PrincipalType.USER ? request.principal.id : undefined
}

function cleanOperation(operation: WorkflowOperationRequest): WorkflowOperationRequest {
    if (operation.type === WorkflowOperationType.IMPORT_WORKFLOW) {
        const clearSampleData = {
            sampleDataFileId: undefined,
            sampleDataInputFileId: undefined,
            lastTestDate: undefined,
        }
        const trigger = workflowStructureUtil.transferStep(operation.request.trigger, (step) => ({
            ...step,
            settings: {
                ...step.settings,
                sampleData: {
                    ...step.settings.sampleData,
                    ...clearSampleData,
                },
            },
        })) as WorkflowTrigger
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

const CreateWorkflowRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.WRITE_WORKFLOW, {
                type: WorkspaceResourceType.BODY,
            }),
    },
    schema: {
        tags: ['workflows'],
        description: 'Create a workflow',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        body: CreateWorkflowRequest,
        response: {
            [StatusCodes.CREATED]: PopulatedWorkflow,
        },
    },
}


const ListWorkflowsRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_WORKFLOW, {
                type: WorkspaceResourceType.QUERY,
            }),
    },
    schema: {
        tags: ['workflows'],
        description: 'List workflows',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: ListWorkflowsRequest,
        response: {
            [StatusCodes.OK]: SeekPage(PopulatedWorkflow),
        },
    },
}

const CountWorkflowsRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_WORKFLOW, {
                type: WorkspaceResourceType.QUERY,
            }),
    },
    schema: {
        querystring: CountWorkflowsRequest,
    },
}

const GetWorkflowTemplateRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_WORKFLOW, {
                type: WorkspaceResourceType.TABLE,
                tableName: WorkflowEntity,
            }),
    },
    schema: {
        tags: ['workflows'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Export workflow as template',
        params: z.object({
            id: ApId,
        }),
        querystring: GetWorkflowTemplateRequestQuery,
        response: {
            [StatusCodes.OK]: SharedTemplate,
        },
    },
}

const GetWorkflowRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_WORKFLOW, {
                type: WorkspaceResourceType.TABLE,
                tableName: WorkflowEntity,
            }),
    },
    schema: {
        tags: ['workflows'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Get a workflow by id',
        params: z.object({
            id: ApId,
        }),
        querystring: GetWorkflowQueryParamsRequest,
        response: {
            [StatusCodes.OK]: PopulatedWorkflow,
        },
    },
}

const DeleteWorkflowRequestOptions = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.WRITE_WORKFLOW, {
                type: WorkspaceResourceType.TABLE,
                tableName: WorkflowEntity,
            }),
    },
    schema: {
        tags: ['workflows'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        description: 'Delete a workflow',
        params: z.object({
            id: ApId,
        }),
        response: {
            [StatusCodes.NO_CONTENT]: z.never(),
        },
    },
}
