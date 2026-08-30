import { CancelTestTriggerRequestBody, PrincipalType, TestTriggerRequestBody } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { testTriggerService } from '../../trigger/test-trigger/test-trigger-service'

export const testTriggerController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', TestTriggerRequest, async (req) => {
        const { workflowId, workflowVersionId, testStrategy } = req.body

        const logWithContext = req.log.child({
            workflow: { id: workflowId },
            workflowVersion: { id: workflowVersionId },
            project: { id: req.projectId },
            testStrategy,
        })
        return testTriggerService(logWithContext).test({
            workflowId,
            workflowVersionId,
            projectId: req.projectId,
            testStrategy,
        })
    })
    app.delete('/', CancelTestTriggerRequest, async (req) => {
        const { workflowId } = req.body

        return testTriggerService(req.log).cancel({
            workflowId,
            projectId: req.projectId,
        })
    })
}

const TestTriggerRequest = {
    schema: {
        body: TestTriggerRequestBody,
    },
    config: {
        security: securityAccess.project([PrincipalType.USER], undefined, {
            type: ProjectResourceType.BODY,
        }),
    },
}

const CancelTestTriggerRequest = {
    schema: {
        body: CancelTestTriggerRequestBody,
    },
    config: {
        security: securityAccess.project([PrincipalType.USER], undefined, {
            type: ProjectResourceType.BODY,
        }),
    },
}