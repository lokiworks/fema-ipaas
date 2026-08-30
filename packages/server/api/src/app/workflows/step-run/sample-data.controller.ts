import { CreateStepRunRequestBody, GetSampleDataRequest, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { executionService } from '../execution/execution-service'
import { workflowService } from '../workflow/workflow.service'
import { sampleDataService } from './sample-data.service'

export const sampleDataController: FastifyPluginAsyncZod = async (fastify) => {

    fastify.post('/test-step', TestSampleDataRequestBody, async (request) => {
        return executionService(request.log).test({
            projectId: request.projectId,
            workflowVersionId: request.body.workflowVersionId,
            stepNameToTest: request.body.stepName,
            triggeredBy: request.principal.id,
        })
    })

    fastify.get('/', GetSampleDataRequestParams, async (request) => {
        const workflow = await workflowService(request.log).getOnePopulatedOrThrow({
            id: request.query.workflowId,
            projectId: request.projectId,
            versionId: request.query.workflowVersionId,
        })
        const sampleData = await sampleDataService(request.log).getOrReturnEmpty({
            projectId: request.projectId,
            workflowVersion: workflow.version,
            stepName: request.query.stepName,
            type: request.query.type,
        })
        return sampleData
    })
}

const GetSampleDataRequestParams = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            undefined, {
                type: ProjectResourceType.QUERY,
            }),
    },
    schema: {
        tags: ['sample-data'],
        querystring: GetSampleDataRequest,
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}

const TestSampleDataRequestBody = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            undefined, {
                type: ProjectResourceType.BODY,
            }),
    },
    schema: {
        tags: ['sample-data'],
        body: CreateStepRunRequestBody,
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}