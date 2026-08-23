import { ResumePayload } from '@fema-ipaas/connector-types'
import { ExecutionType, RunContext, ServerContext } from '@fema-ipaas/connector-sdk'

export type ComponentExecutionContext<Input> = {
    input: Input
    executionType: ExecutionType
    resumePayload?: ResumePayload
    run: RunContext
    server: ServerContext
    workspaceId: string
    tenantId: string
    step: {
        name: string
        displayName: string
    }
}
