import { CancelTestTriggerRequestBody, PrincipalType, TestTriggerRequestBody } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { WorkspaceResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { testTriggerService } from '../../trigger/test-trigger/test-trigger-service'

export const testTriggerController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', TestTriggerRequest, async (req) => {
        const { workflowId, workflowVersionId, testStrategy } = req.body

        const logWithContext = req.log.child({
            workflow: { id: workflowId },
            workflowVersion: { id: workflowVersionId },
            workspace: { id: req.workspaceId },
            testStrategy,
        })
        return testTriggerService(logWithContext).test({
            workflowId,
            workflowVersionId,
            workspaceId: req.workspaceId,
            testStrategy,
        })
    })
    app.delete('/', CancelTestTriggerRequest, async (req) => {
        const { workflowId } = req.body

        return testTriggerService(req.log).cancel({
            workflowId,
            workspaceId: req.workspaceId,
        })
    })
}

const TestTriggerRequest = {
    schema: {
        body: TestTriggerRequestBody,
    },
    config: {
        security: securityAccess.workspace([PrincipalType.USER], undefined, {
            type: WorkspaceResourceType.BODY,
        }),
    },
}

const CancelTestTriggerRequest = {
    schema: {
        body: CancelTestTriggerRequestBody,
    },
    config: {
        security: securityAccess.workspace([PrincipalType.USER], undefined, {
            type: WorkspaceResourceType.BODY,
        }),
    },
}