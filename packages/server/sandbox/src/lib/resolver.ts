import { isNil, tryCatch, unique } from '@fema/core-utils'
import { type ApLogger, fileSystemUtils } from '@fema/server-utils'
import { WorkerToApiContract, WorkflowVersion } from '@fema/shared'
import { cacheUtils } from './cache/cache-paths'
import { codeBuilder } from './cache/workflow/code/code-builder'
import { workflowProvisioning } from './cache/workflow/workflow-provisioning'
import { CodeArtifact, ProvisionInput, ResolveInput, Resolver, ResolveResult, SandboxSettings } from './types'

// The Resolver is the worker-side, Runtime-Kind-independent half of the seam. It owns the only
// apiClient and turns a job into a fully-materialized ProvisionInput before `execute` is ever called,
// so the pool only sees healthy, complete inputs. On a cold path it compiles the code and publishes
// the workflow bundle here (apiClient + bun build live on the worker); fetchArchive is bound to the
// apiClient and handed to the pool as an opaque thunk — the pool never imports WorkerToApiContract.
export function createResolver({ apiClient, basePath, getSettings, log }: CreateResolverParams): Resolver {
    return {
        async resolve(input: ResolveInput): Promise<ResolveResult> {
            let connectors = input.connectors ?? []
            let codes: CodeArtifact[] = input.codes ?? []
            let workflowVersion: WorkflowVersion | undefined

            if (!isNil(input.workflow)) {
                const resolved = await workflowProvisioning(log, apiClient, basePath, getSettings).resolve({ workflow: input.workflow, platformId: input.platformId })
                if (resolved.kind === 'workflow-not-found') {
                    return { kind: 'workflow-not-found' }
                }
                if (resolved.kind === 'disabled') {
                    return { kind: 'disabled', failedStep: resolved.failedStep }
                }
                workflowVersion = resolved.workflowVersion
                connectors = [...connectors, ...resolved.connectors]
                if (resolved.code.kind === 'source') {
                    codes = [...codes, ...resolved.code.steps]
                    // Cold path: compile here so the bundle can be published. Publish only when every
                    // code step built cleanly — a transient bun install failure must never be baked into
                    // the shared workflow bundle (GIT-1608). A failed compile/publish never fails the run;
                    // the pool recompiles from source.
                    const allStepsBuilt = await compileCodeSteps({ codes, basePath, getSettings, log })
                    if (allStepsBuilt && !isNil(resolved.publishBundle)) {
                        void resolved.publishBundle()
                    }
                }
            }

            const uniqueConnectors = unique(connectors)

            const provision: ProvisionInput = {
                platformId: input.platformId,
                workflowVersionId: workflowVersion?.id,
                connectors: uniqueConnectors,
                codes,
                publicApiUrl: input.publicApiUrl,
                engineToken: input.engineToken,
            }
            return { kind: 'ready', provision, workflowVersion }
        },
    }
}

async function compileCodeSteps({ codes, basePath, getSettings, log }: CompileCodeStepsParams): Promise<boolean> {
    const codeCachePath = cacheUtils(basePath).getGlobalCodeCachePath()
    const { data, error } = await tryCatch(async () => {
        await fileSystemUtils.threadSafeMkdir(codeCachePath)
        let allSucceeded = true
        for (const artifact of codes) {
            const status = await codeBuilder(log, getSettings).processCodeStep({ artifact, codesFolderPath: codeCachePath })
            allSucceeded = allSucceeded && status === 'success'
        }
        return allSucceeded
    })
    if (error) {
        log.warn({ error: String(error) }, 'Failed to pre-compile code steps for bundle publish, pool will recompile')
        return false
    }
    return data
}

type CreateResolverParams = {
    apiClient: WorkerToApiContract
    basePath: string
    getSettings: () => SandboxSettings
    log: ApLogger
}

type CompileCodeStepsParams = {
    codes: CodeArtifact[]
    basePath: string
    getSettings: () => SandboxSettings
    log: ApLogger
}
