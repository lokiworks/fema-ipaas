
import { FileType, GetWorkflowVersionForWorkerRequest, ListWorkflowsRequest, PrincipalType, SendWorkflowResponseRequest, UpdateStepProgressRequest, UploadRunLogsRequest, WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { entitiesMustBeOwnedByCurrentProject } from '../authentication/authorization'
import { connectorBundle } from '../connectors/connector-bundle'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { fileService } from '../file/file.service'
import { engineRunCallbackService } from '../workflows/execution/engine-run-callback-service'
import { workflowService } from '../workflows/workflow/workflow.service'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'

export const workflowEngineWorker: FastifyPluginAsyncZod = async (app) => {

    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentProject)

    app.get('/populated-workflows', GetAllWorkflowsByProjectParams, async (request) => {
        return workflowService(request.log).list({
            projectIds: [request.principal.projectId],
            limit: request.query.limit ?? 1000000,
            cursorRequest: request.query.cursor ?? null,
            folderId: request.query.folderId,
            status: request.query.status,
            name: request.query.name,
            versionState: request.query.versionState,
            connectionExternalIds: request.query.connectionExternalIds,
            agentExternalIds: request.query.agentExternalIds,
            externalIds: request.query.externalIds,
        })
    })

    app.get('/workflows', GetLockedVersionRequest, async (request) => {
        const workflowVersion = await workflowVersionService(request.log).getOneOrThrow(request.query.versionId)
        await workflowService(request.log).getOneOrThrow({
            id: workflowVersion.workflowId,
            projectId: request.principal.projectId,
        })
        return workflowVersion
    })

    // The pool downloads this with the engine token in the Authorization header (Bearer) and follows
    // the redirect. The engine token is tenant-scoped, which scopes custom-connector resolution.
    app.get('/connectors/bundle', ConnectorBundleRequest, async (request, reply) => {
        if (request.principal.type !== PrincipalType.ENGINE) {
            return reply.status(StatusCodes.UNAUTHORIZED).send()
        }
        const resolution = await connectorBundle(request.log).resolve({
            name: request.query.name,
            version: request.query.version,
            archiveId: request.query.archiveId,
            tenantId: request.principal.tenant.id,
            projectId: request.principal.projectId,
        })
        if (resolution.type === 'not-found') {
            return reply.status(StatusCodes.NOT_FOUND).send()
        }
        if (resolution.type === 'redirect') {
            return reply.status(StatusCodes.TEMPORARY_REDIRECT).header('Location', resolution.url).send()
        }
        const { data } = await fileService(request.log).getDataOrThrow({
            fileId: resolution.archiveId,
            projectId: undefined,
            type: FileType.PACKAGE_ARCHIVE,
        })
        return reply
            .status(StatusCodes.OK)
            .header('Content-Type', 'application/octet-stream')
            .send(data)
    })

    app.post('/run-progress', RunProgressRequest, async (request, reply) => {
        engineRunCallbackService(request.log).updateRunProgress({
            projectId: request.principal.projectId,
            request: request.body,
        })
        return reply.status(StatusCodes.OK).send()
    })

    app.post('/step-progress', StepProgressRequest, async (request, reply) => {
        engineRunCallbackService(request.log).updateStepProgress({
            projectId: request.principal.projectId,
            request: request.body,
        })
        return reply.status(StatusCodes.OK).send()
    })

    app.post('/run-logs', RunLogsRequest, async (request, reply) => {
        await engineRunCallbackService(request.log).uploadRunLog({
            projectId: request.principal.projectId,
            request: request.body,
        })
        return reply.status(StatusCodes.OK).send()
    })

    app.post('/workflow-response', WorkflowResponseRequest, async (request, reply) => {
        await engineRunCallbackService(request.log).sendWorkflowResponse({
            request: request.body,
        })
        return reply.status(StatusCodes.OK).send()
    })

}


const GetAllWorkflowsByProjectParams = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        querystring: ListWorkflowsRequest.omit({ projectId: true }),
    },
}

const GetLockedVersionRequest = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        querystring: GetWorkflowVersionForWorkerRequest,
        response: {
            [StatusCodes.OK]: WorkflowVersion,
        },
    },
}

const ConnectorBundleRequest = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        querystring: z.object({
            name: z.string().optional(),
            version: z.string().optional(),
            archiveId: z.string().optional(),
        }),
    },
}

const RunProgressRequest = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        body: z.unknown(),
    },
}

const StepProgressRequest = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        body: UpdateStepProgressRequest,
    },
}

const RunLogsRequest = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        body: UploadRunLogsRequest,
    },
}

const WorkflowResponseRequest = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        body: SendWorkflowResponseRequest,
    },
}