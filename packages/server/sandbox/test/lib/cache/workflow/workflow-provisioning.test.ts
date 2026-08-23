import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { type ApLogger } from '@fema-ipaas/server-utils'
import { WorkflowActionType, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState, LATEST_WORKFLOW_SCHEMA_VERSION, PackageType, ConnectorType, WorkerToApiContract } from '@fema-ipaas/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workflowProvisioning } from '../../../../src/lib/cache/workflow/workflow-provisioning'

const folders: string[] = []

function uniqueBasePath(): string {
    const folder = join(tmpdir(), `workflow-provisioning-test-${randomUUID()}`)
    folders.push(folder)
    return folder
}

const fakeLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() } as unknown as ApLogger

const getSettings = () => ({
    EXECUTION_MODE: 'UNSANDBOXED',
    DEV_CONNECTORS: [] as string[],
    ENVIRONMENT: 'production',
    REUSE_SANDBOX: undefined,
    WORKFLOW_TIMEOUT_SECONDS: 600,
    MAX_FILE_SIZE_MB: 10,
    MAX_EXECUTION_LOG_SIZE_MB: 10,
    NETWORK_MODE: 'UNRESTRICTED' as never,
    SANDBOX_MEMORY_LIMIT: '1048576',
    SANDBOX_PROPAGATED_ENV_VARS: [] as string[],
    SSRF_ALLOW_LIST: [] as string[],
})

function workflowWithConnector(overrides: Partial<WorkflowVersion> = {}): WorkflowVersion {
    return {
        id: 'fv1', created: '2026-01-01T00:00:00.000Z', updated: '2026-01-01T00:00:00.000Z',
        workflowId: 'workflow1', displayName: 'Test', updatedBy: null, valid: true,
        schemaVersion: LATEST_WORKFLOW_SCHEMA_VERSION, agentIds: [], state: WorkflowVersionState.LOCKED,
        connectionIds: [], backupFiles: null, notes: [],
        trigger: {
            name: 'trigger', type: WorkflowTriggerType.EMPTY, displayName: 'Trigger', valid: true, settings: {},
            nextAction: {
                name: 'step_1', type: WorkflowActionType.CONNECTOR, displayName: 'HTTP', valid: true,
                settings: { connectorName: '@fema-ipaas/connector-http', connectorVersion: '^1.0.0', actionName: 'send', input: {}, inputUiInfo: {} },
            },
        },
        ...overrides,
    } as unknown as WorkflowVersion
}

const httpConnector = { packageType: PackageType.REGISTRY, name: '@fema-ipaas/connector-http', version: '1.0.5', connectorType: ConnectorType.OFFICIAL }

const workflow = { id: 'workflow1', versionId: 'fv1', workspaceId: 'p1' }

afterEach(async () => {
    for (const f of folders) {
        await rm(f, { recursive: true, force: true })
    }
    folders.length = 0
    vi.clearAllMocks()
})

describe('workflowProvisioning.resolve', () => {
    it('bundle hit → ready with no codeSteps and no publish (zero workflow/connector resolution)', async () => {
        const manifest = { workflowVersion: workflowWithConnector(), connectors: [httpConnector], codes: [] }
        const getWorkflowVersion = vi.fn()
        const getConnector = vi.fn()
        const apiClient = {
            async getWorkflowBundle() { return { kind: 'inline', data: Buffer.from(JSON.stringify(manifest), 'utf8') } },
            getWorkflowVersion, getConnector,
        } as unknown as WorkerToApiContract

        const resolved = await workflowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ workflow, tenantId: 'plat1' })

        expect(resolved.kind).toBe('ready')
        if (resolved.kind === 'ready') {
            expect(resolved.code).toEqual({ kind: 'materialized' })
            expect(resolved.publishBundle).toBeNull()
            expect(resolved.connectors).toEqual([httpConnector])
        }
        expect(getWorkflowVersion).not.toHaveBeenCalled()
        expect(getConnector).not.toHaveBeenCalled()
    })

    it('bundle fetch error → falls back to resolve (never fails the run)', async () => {
        const getWorkflowVersion = vi.fn(async () => workflowWithConnector())
        const apiClient = {
            async getWorkflowBundle() { throw new Error('rpc/s3 down') },
            getWorkflowVersion,
            async getConnector() { return httpConnector },
        } as unknown as WorkerToApiContract

        const resolved = await workflowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ workflow, tenantId: 'plat1' })

        expect(resolved.kind).toBe('ready')
        expect(getWorkflowVersion).toHaveBeenCalled()
    })

    it('miss + workflow not found → workflow-not-found', async () => {
        const apiClient = {
            async getWorkflowBundle() { return null },
            async getWorkflowVersion() { return null },
        } as unknown as WorkerToApiContract

        const resolved = await workflowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ workflow, tenantId: 'plat1' })
        expect(resolved.kind).toBe('workflow-not-found')
    })

    it('miss + LOCKED workflow with resolvable connector → ready, connectors resolved, needsPublish=true', async () => {
        const apiClient = {
            async getWorkflowBundle() { return null },
            async getWorkflowVersion() { return workflowWithConnector() },
            async getConnector() { return httpConnector },
        } as unknown as WorkerToApiContract

        const resolved = await workflowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ workflow, tenantId: 'plat1' })

        expect(resolved.kind).toBe('ready')
        if (resolved.kind === 'ready') {
            expect(resolved.publishBundle).not.toBeNull()
            expect(resolved.code.kind).toBe('source')
            expect(resolved.connectors).toHaveLength(1)
            expect(resolved.connectors[0].connectorVersion).toBe('1.0.5')
        }
    })

    it('miss + DRAFT workflow → ready but no publish handle', async () => {
        const apiClient = {
            async getWorkflowBundle() { return null },
            async getWorkflowVersion() { return workflowWithConnector({ state: WorkflowVersionState.DRAFT }) },
            async getConnector() { return httpConnector },
        } as unknown as WorkerToApiContract

        const resolved = await workflowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ workflow, tenantId: 'plat1' })
        expect(resolved.kind === 'ready' && resolved.publishBundle === null).toBe(true)
    })

    it('miss + missing connector → disabled and the workflow is disabled via apiClient', async () => {
        const disableWorkflow = vi.fn(async () => undefined)
        const apiClient = {
            async getWorkflowBundle() { return null },
            async getWorkflowVersion() { return workflowWithConnector() },
            async getConnector() { return null },
            disableWorkflow,
        } as unknown as WorkerToApiContract

        const resolved = await workflowProvisioning(fakeLog, apiClient, uniqueBasePath(), getSettings).resolve({ workflow, tenantId: 'plat1' })

        expect(resolved.kind).toBe('disabled')
        expect(disableWorkflow).toHaveBeenCalledWith({ workflowId: 'workflow1', workspaceId: 'p1' })
        if (resolved.kind === 'disabled') {
            expect(resolved.failedStep?.name).toBe('step_1')
            expect(resolved.failedStep?.displayName).toBe('HTTP')
            expect(resolved.failedStep?.message).toContain('@fema-ipaas/connector-http@^1.0.0')
            expect(resolved.failedStep?.message).toContain('turned off')
        }
    })
})
