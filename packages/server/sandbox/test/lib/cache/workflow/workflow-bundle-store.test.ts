import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { type ApLogger } from '@fema-ipaas/server-utils'
import { WorkflowActionType, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState, LATEST_WORKFLOW_SCHEMA_VERSION, PackageType, ConnectorType, WorkerToApiContract } from '@fema-ipaas/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheUtils } from '../../../../src/lib/cache/cache-paths'
import { codeCache } from '../../../../src/lib/cache/workflow/code/code-cache'
import { workflowBundleStore } from '../../../../src/lib/cache/workflow/workflow-bundle-store'
import { bundleHttp } from '../../../../src/lib/utils/bundle-http'

vi.mock('../../../../src/lib/utils/bundle-http', () => ({
    bundleHttp: { getBuffer: vi.fn(), put: vi.fn() },
}))

const folders: string[] = []

function uniqueBasePath(): string {
    const folder = join(tmpdir(), `workflow-bundle-store-test-${randomUUID()}`)
    folders.push(folder)
    return folder
}

const fakeLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() } as unknown as ApLogger

function buildWorkflowVersion(overrides: Partial<WorkflowVersion> = {}): WorkflowVersion {
    return {
        id: 'fv1',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        workflowId: 'workflow1',
        displayName: 'Test Workflow',
        updatedBy: null,
        valid: true,
        schemaVersion: LATEST_WORKFLOW_SCHEMA_VERSION,
        agentIds: [],
        state: WorkflowVersionState.LOCKED,
        connectionIds: [],
        backupFiles: null,
        notes: [],
        trigger: {
            name: 'trigger',
            type: WorkflowTriggerType.EMPTY,
            displayName: 'Trigger',
            valid: true,
            settings: {},
            nextAction: {
                name: 'step_1',
                type: WorkflowActionType.CODE,
                displayName: 'Code',
                valid: true,
                settings: { sourceCode: { code: 'x', packageJson: '{}' }, input: {}, inputUiInfo: {} },
            },
        },
        ...overrides,
    } as unknown as WorkflowVersion
}

const connector = { packageType: PackageType.REGISTRY, connectorType: ConnectorType.OFFICIAL, connectorName: '@fema-ipaas/connector-http', connectorVersion: '1.0.0' }

function inMemoryApiClient(): { apiClient: WorkerToApiContract, getWorkflowBundle: ReturnType<typeof vi.fn> } {
    let stored: Buffer | null = null
    const getWorkflowBundle = vi.fn(async () => (isNil(stored) ? null : { kind: 'inline', data: stored }))
    const apiClient = {
        getWorkflowBundle,
        async prepareWorkflowBundleUpload() {
            return { kind: 'inline' }
        },
        async uploadWorkflowBundle({ data }: { data: Buffer }) {
            stored = data
        },
    } as unknown as WorkerToApiContract
    return { apiClient, getWorkflowBundle }
}

afterEach(async () => {
    for (const f of folders) {
        await rm(f, { recursive: true, force: true })
    }
    folders.length = 0
    vi.clearAllMocks()
})

describe('workflowBundleStore', () => {
    it('publish then tryFetch round-trips workflow + connectors and materializes compiled code on disk', async () => {
        const basePath = uniqueBasePath()
        const { apiClient } = inMemoryApiClient()
        const workflowVersion = buildWorkflowVersion()
        const codes = codeCache(cacheUtils(basePath).getGlobalCodeCachePath())
        await codes.writeCompiledStep({ workflowVersionId: workflowVersion.id, stepName: 'step_1', compiledJs: 'exports.code = () => 1' })

        await workflowBundleStore(fakeLog, apiClient, basePath).publish({ workflowVersion, connectors: [connector], workspaceId: 'p1', tenantId: 'plat1' })

        const fetchBasePath = uniqueBasePath()
        const fetched = await workflowBundleStore(fakeLog, apiClient, fetchBasePath).tryFetch({ workflowVersionId: workflowVersion.id, workspaceId: 'p1' })

        expect(fetched?.workflowVersion.id).toBe('fv1')
        expect(fetched?.connectors).toEqual([connector])
        const fetchedCodes = codeCache(cacheUtils(fetchBasePath).getGlobalCodeCachePath())
        expect(await fetchedCodes.readCompiledStep({ workflowVersionId: workflowVersion.id, stepName: 'step_1' })).toBe('exports.code = () => 1')
    })

    it('tryFetch is local-first: a second fetch is served from the local cache with no further RPC', async () => {
        const basePath = uniqueBasePath()
        const { apiClient, getWorkflowBundle } = inMemoryApiClient()
        const workflowVersion = buildWorkflowVersion()
        const codes = codeCache(cacheUtils(basePath).getGlobalCodeCachePath())
        await codes.writeCompiledStep({ workflowVersionId: workflowVersion.id, stepName: 'step_1', compiledJs: 'exports.code = () => 1' })
        await workflowBundleStore(fakeLog, apiClient, basePath).publish({ workflowVersion, connectors: [connector], workspaceId: 'p1', tenantId: 'plat1' })

        const first = await workflowBundleStore(fakeLog, apiClient, basePath).tryFetch({ workflowVersionId: workflowVersion.id, workspaceId: 'p1' })
        const second = await workflowBundleStore(fakeLog, apiClient, basePath).tryFetch({ workflowVersionId: workflowVersion.id, workspaceId: 'p1' })

        expect(first?.workflowVersion.id).toBe('fv1')
        expect(second?.workflowVersion.id).toBe('fv1')
        expect(getWorkflowBundle).toHaveBeenCalledTimes(1)
    })

    it('tryFetch returns null when no bundle is stored', async () => {
        const basePath = uniqueBasePath()
        const apiClient = { async getWorkflowBundle() { return null } } as unknown as WorkerToApiContract
        expect(await workflowBundleStore(fakeLog, apiClient, basePath).tryFetch({ workflowVersionId: 'fv1', workspaceId: 'p1' })).toBeNull()
    })

    it('tryFetch ignores a bundle whose schemaVersion is stale (self-heals via rebuild)', async () => {
        const basePath = uniqueBasePath()
        const { apiClient } = inMemoryApiClient()
        const staleWorkflowVersion = buildWorkflowVersion({ schemaVersion: '1' })
        const codes = codeCache(cacheUtils(basePath).getGlobalCodeCachePath())
        await codes.writeCompiledStep({ workflowVersionId: staleWorkflowVersion.id, stepName: 'step_1', compiledJs: 'old' })

        await workflowBundleStore(fakeLog, apiClient, basePath).publish({ workflowVersion: staleWorkflowVersion, connectors: [connector], workspaceId: 'p1', tenantId: 'plat1' })

        expect(await workflowBundleStore(fakeLog, apiClient, basePath).tryFetch({ workflowVersionId: staleWorkflowVersion.id, workspaceId: 'p1' })).toBeNull()
    })

    it('publish uploads via signed PUT (no inline RPC) when prepare returns a url', async () => {
        const basePath = uniqueBasePath()
        const put = vi.mocked(bundleHttp.put).mockResolvedValue(undefined)
        const apiClient = {
            async prepareWorkflowBundleUpload() { return { kind: 'url', url: 'https://s3/put' } },
            async uploadWorkflowBundle() { throw new Error('inline upload must not be called') },
        } as unknown as WorkerToApiContract
        const workflowVersion = buildWorkflowVersion()
        const codes = codeCache(cacheUtils(basePath).getGlobalCodeCachePath())
        await codes.writeCompiledStep({ workflowVersionId: workflowVersion.id, stepName: 'step_1', compiledJs: 'exports.code = () => 1' })

        await workflowBundleStore(fakeLog, apiClient, basePath).publish({ workflowVersion, connectors: [connector], workspaceId: 'p1', tenantId: 'plat1' })

        expect(put).toHaveBeenCalledOnce()
        expect(put.mock.calls[0][0]).toBe('https://s3/put')
    })

    it('publish does nothing (no inline RPC, no PUT) when prepare returns skip', async () => {
        const basePath = uniqueBasePath()
        const put = vi.mocked(bundleHttp.put).mockResolvedValue(undefined)
        const apiClient = {
            async prepareWorkflowBundleUpload() { return { kind: 'skip' } },
            async uploadWorkflowBundle() { throw new Error('inline upload must not be called') },
        } as unknown as WorkerToApiContract
        const workflowVersion = buildWorkflowVersion()
        const codes = codeCache(cacheUtils(basePath).getGlobalCodeCachePath())
        await codes.writeCompiledStep({ workflowVersionId: workflowVersion.id, stepName: 'step_1', compiledJs: 'exports.code = () => 1' })

        await workflowBundleStore(fakeLog, apiClient, basePath).publish({ workflowVersion, connectors: [connector], workspaceId: 'p1', tenantId: 'plat1' })

        expect(put).not.toHaveBeenCalled()
    })

    it('tryFetch downloads from a signed URL and materializes compiled code', async () => {
        const basePath = uniqueBasePath()
        const workflowVersion = buildWorkflowVersion()
        const manifest = { workflowVersion, connectors: [connector], codes: [{ stepName: 'step_1', compiledJs: 'exports.code = () => 1' }] }
        vi.mocked(bundleHttp.getBuffer).mockResolvedValue(Buffer.from(JSON.stringify(manifest), 'utf8'))
        const apiClient = {
            getWorkflowBundle: vi.fn(async () => ({ kind: 'url', url: 'https://s3/get' })),
        } as unknown as WorkerToApiContract

        const fetched = await workflowBundleStore(fakeLog, apiClient, basePath).tryFetch({ workflowVersionId: workflowVersion.id, workspaceId: 'p1' })

        expect(fetched?.workflowVersion.id).toBe('fv1')
        expect(bundleHttp.getBuffer).toHaveBeenCalledWith('https://s3/get')
        const fetchedCodes = codeCache(cacheUtils(basePath).getGlobalCodeCachePath())
        expect(await fetchedCodes.readCompiledStep({ workflowVersionId: workflowVersion.id, stepName: 'step_1' })).toBe('exports.code = () => 1')
    })

    it('tryFetch returns null and does not cache when the signed-URL download fails (retries next run)', async () => {
        const basePath = uniqueBasePath()
        vi.mocked(bundleHttp.getBuffer).mockRejectedValue(new Error('network down'))
        const getWorkflowBundle = vi.fn(async () => ({ kind: 'url', url: 'https://s3/get' }))
        const apiClient = { getWorkflowBundle } as unknown as WorkerToApiContract

        const first = await workflowBundleStore(fakeLog, apiClient, basePath).tryFetch({ workflowVersionId: 'fv1', workspaceId: 'p1' })
        const second = await workflowBundleStore(fakeLog, apiClient, basePath).tryFetch({ workflowVersionId: 'fv1', workspaceId: 'p1' })

        expect(first).toBeNull()
        expect(second).toBeNull()
        expect(getWorkflowBundle).toHaveBeenCalledTimes(2)
    })
})
