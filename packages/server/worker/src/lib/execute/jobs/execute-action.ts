import { spreadIfDefined, tryCatch } from '@fema/core-utils'
import { actionRunCache, CodeArtifact } from '@fema/sandbox'
import { cryptoUtils } from '@fema/server-utils'
import { DEFAULT_MCP_DATA, EngineOperationType, EngineResponseStatus, ExecuteActionJobData, WorkerJobType, WorkflowActionType } from '@fema/shared'
import { JobContext, JobHandler, JobResultKind, SynchronousJobResult } from '../types'
import { isSandboxTimeout } from '../utils/sandbox-helpers'
import { buildSynchronousResult } from '../utils/synchronous-result'

export const executeActionJob: JobHandler<ExecuteActionJobData, SynchronousJobResult> = {
    jobType: WorkerJobType.EXECUTE_ACTION,
    async execute(ctx: JobContext, data: ExecuteActionJobData): Promise<SynchronousJobResult> {
        const { codes, namespace: codeNamespace } = await resolveCodeStep({ step: data.step, platformId: data.platformId })
        const resolved = await ctx.resolver.resolve({ platformId: data.platformId, publicApiUrl: ctx.publicApiUrl, engineToken: ctx.engineToken, connectors: data.connector ? [data.connector] : [], codes })
        if (resolved.kind !== 'ready') {
            throw new Error(`Unexpected resolve outcome "${resolved.kind}" for action-run action job`)
        }

        const timeoutInSeconds = Math.ceil((data.expiresAt - Date.now()) / 1000)
        const { data: result, error } = await tryCatch(async () => {
            return ctx.runtime.execute({
                workerIndex: ctx.workerIndex,
                log: ctx.log,
                operationType: EngineOperationType.EXECUTE_ACTION,
                operation: {
                    step: data.step,
                    workspaceId: data.workspaceId,
                    platformId: data.platformId,
                    engineToken: ctx.engineToken,
                    internalApiUrl: ctx.internalApiUrl,
                    publicApiUrl: ctx.publicApiUrl,
                    timeoutInSeconds,
                    ...spreadIfDefined('workflowVersionId', codeNamespace),
                },
                timeoutInSeconds,
                expiresAt: data.expiresAt,
                provision: { ...resolved.provision, ...spreadIfDefined('workflowVersionId', codeNamespace) },
            })
        })

        if (error) {
            if (isSandboxTimeout(error)) {
                return {
                    kind: JobResultKind.SYNCHRONOUS,
                    status: EngineResponseStatus.TIMEOUT,
                    response: { success: false, input: {}, output: null, neverStarted: error.error.params.neverStarted === true },
                }
            }
            throw error
        }

        return buildSynchronousResult(result)
    },
}

async function resolveCodeStep({ step, platformId }: ResolveCodeStepParams): Promise<{ codes: CodeArtifact[], namespace?: string }> {
    if (step.type !== WorkflowActionType.CODE) {
        return { codes: [] }
    }
    const sourceHash = await cryptoUtils.hashObject(step.settings.sourceCode)
    const namespace = actionRunCache.namespace({ platformId, sourceHash })
    return {
        namespace,
        codes: [{
            name: step.name,
            sourceCode: step.settings.sourceCode,
            workflowVersionId: namespace,
            workflowVersionState: DEFAULT_MCP_DATA.workflowVersionState,
        }],
    }
}

type ResolveCodeStepParams = {
    step: ExecuteActionJobData['step']
    platformId: string
}
