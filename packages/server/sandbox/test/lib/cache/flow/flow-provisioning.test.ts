import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { type ApLogger } from '@fema/server-utils'
import { FlowActionType, FlowTriggerType, FlowVersion, FlowVersionState, LATEST_FLOW_SCHEMA_VERSION, PackageType, ConnectorType, WorkerToApiContract } from '@fema/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flowProvisioning } from '../../../../src/lib/cache/flow/flow-provisioning'

const folders: string[] = []

function uniqueBasePath(): string {
    const folder = join(tmpdir(), `flow-provisioning-test-${randomUUID()}`)
    folders.push(folder)
    return folder
}

const fakeLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() } as unknown as ApLogger

const getSettings = () => ({
    EXECUTION_MODE: 'UNSANDBOXED',
    DEV_CONNECTORS: [] as string[],
    ENVIRONMENT: 'production',
    REUSE_SANDBOX: undefined,
    FLOW_TIMEOUT_SECONDS: 600,
    MAX_FILE_SIZE_MB: 10,
    MAX_FLOW_RUN_LOG_SIZE_MB: 10,
    NETWORK_MODE: 'UNRESTRICTED' as never,
    SANDBOX_MEMORY_LIMIT: '1048576',
    SANDBOX_PROPAGATED_ENV_VARS: [] as string[],
    SSRF_ALLOW_LIST: [] as string[],
})

function flowWithConnector(overrides: Partial<FlowVersion> = {}): FlowVersion {
    return {
        id: 'fv1', created: '2026-01-01T00:00:00.000Z', updated: '2026-01-01T00:00:00.000Z',
        flowId: 'flow1', displayName: 'Test', updatedBy: null, valid: true,
        schemaVersion: LATEST_FLOW_SCHEMA_VERSION, agentIds: [], state: FlowVersionState.LOCKED,
        connectionIds: [], backupFiles: null, notes: [],
        trigger: {
            name: 'trigger', type: FlowTriggerType.EMPTY, displayName: 'Trigger', valid: true, settings: {},
            nextAction: {
                name: 'step_1', type: FlowActionType.CONNECTOR, displayName: 'HTTP', valid: true,
                settings: { connectorName: '@fema/connector-http', connectorVersion: '^1.0.0', actionName: 'send', input: {}, inputUiInfo: {} },
            },
        },
        ...overrides,
    } as unknown as FlowVersion
}

const httpConnector = { packageType: PackageType.REGISTRY, name: '@fema/connector-http', version: '1.0.5', connectorType: ConnectorType.OFFICIAL }

const flow = { id: 'flow1', versionId: 'fv1', projectId: 'p1' }

afterEach(async () => {
    for (const f of folders) {
        await rm(f, { recursive: true, force: true })
    }
    folders.length = 0
    vi.clearAllMocks()
})

describe('flowProvisioning.resolve', () => {
    it('bundle hit → ready with no codeSteps and no publish (zero flow/connector resolution)', async () => {
        const manifest = { flowVersion: flowWithConnector(), connectors: [httpConnector], codes: [] }
        const getFlowVersion = vi.fn()
        const getConnector = vi.fn()
        const apiClient = {
            async getFlowBundle() { return { kind: 'inline', data: Buffer.from(JSON.stringify(manifest), 'utf8') } },
            getFlowVersion, getConnector,
        } as unknown as WorkerToApiContract

        const resolved = await flowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ flow, platformId: 'plat1' })

        expect(resolved.kind).toBe('ready')
        if (resolved.kind === 'ready') {
            expect(resolved.code).toEqual({ kind: 'materialized' })
            expect(resolved.publishBundle).toBeNull()
            expect(resolved.connectors).toEqual([httpConnector])
        }
        expect(getFlowVersion).not.toHaveBeenCalled()
        expect(getConnector).not.toHaveBeenCalled()
    })

    it('bundle fetch error → falls back to resolve (never fails the run)', async () => {
        const getFlowVersion = vi.fn(async () => flowWithConnector())
        const apiClient = {
            async getFlowBundle() { throw new Error('rpc/s3 down') },
            getFlowVersion,
            async getConnector() { return httpConnector },
        } as unknown as WorkerToApiContract

        const resolved = await flowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ flow, platformId: 'plat1' })

        expect(resolved.kind).toBe('ready')
        expect(getFlowVersion).toHaveBeenCalled()
    })

    it('miss + flow not found → flow-not-found', async () => {
        const apiClient = {
            async getFlowBundle() { return null },
            async getFlowVersion() { return null },
        } as unknown as WorkerToApiContract

        const resolved = await flowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ flow, platformId: 'plat1' })
        expect(resolved.kind).toBe('flow-not-found')
    })

    it('miss + LOCKED flow with resolvable connector → ready, connectors resolved, needsPublish=true', async () => {
        const apiClient = {
            async getFlowBundle() { return null },
            async getFlowVersion() { return flowWithConnector() },
            async getConnector() { return httpConnector },
        } as unknown as WorkerToApiContract

        const resolved = await flowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ flow, platformId: 'plat1' })

        expect(resolved.kind).toBe('ready')
        if (resolved.kind === 'ready') {
            expect(resolved.publishBundle).not.toBeNull()
            expect(resolved.code.kind).toBe('source')
            expect(resolved.connectors).toHaveLength(1)
            expect(resolved.connectors[0].connectorVersion).toBe('1.0.5')
        }
    })

    it('miss + DRAFT flow → ready but no publish handle', async () => {
        const apiClient = {
            async getFlowBundle() { return null },
            async getFlowVersion() { return flowWithConnector({ state: FlowVersionState.DRAFT }) },
            async getConnector() { return httpConnector },
        } as unknown as WorkerToApiContract

        const resolved = await flowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ flow, platformId: 'plat1' })
        expect(resolved.kind === 'ready' && resolved.publishBundle === null).toBe(true)
    })

    it('miss + missing connector → disabled and the flow is disabled via apiClient', async () => {
        const disableFlow = vi.fn(async () => undefined)
        const apiClient = {
            async getFlowBundle() { return null },
            async getFlowVersion() { return flowWithConnector() },
            async getConnector() { return null },
            disableFlow,
        } as unknown as WorkerToApiContract

        const resolved = await flowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ flow, platformId: 'plat1' })

        expect(resolved.kind).toBe('disabled')
        expect(disableFlow).toHaveBeenCalledWith({ flowId: 'flow1', projectId: 'p1' })
        if (resolved.kind === 'disabled') {
            expect(resolved.failedStep?.name).toBe('step_1')
            expect(resolved.failedStep?.displayName).toBe('HTTP')
            expect(resolved.failedStep?.message).toContain('@fema/connector-http@^1.0.0')
            expect(resolved.failedStep?.message).toContain('turned off')
        }
    })
})
