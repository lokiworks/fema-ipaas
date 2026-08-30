import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    WorkflowActionType,
    WorkflowOperationType,
    WorkflowTriggerType,
    WorkflowVersionState,
    ConnectorTrigger,
    SampleDataSettings,
} from '@fema-ipaas/shared'
import type { WorkflowVersion } from '@fema-ipaas/shared'

const mockGetConnector = vi.fn()
const mockGetTenantId = vi.fn().mockResolvedValue('tenant-1')
const mockRepoFindOne = vi.fn()
const mockRepoSave = vi.fn()
const mockRepoExists = vi.fn()

vi.mock('../../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: vi.fn(() => () => ({
        findOne: mockRepoFindOne,
        save: mockRepoSave,
        exists: mockRepoExists,
    })),
}))

vi.mock('../../../../../src/app/connectors/metadata/connector-metadata-service', () => ({
    connectorMetadataService: vi.fn(() => ({
        get: mockGetConnector,
    })),
}))

vi.mock('../../../../../src/app/project/project-service', () => ({
    projectService: vi.fn(() => ({
        getTenantId: mockGetTenantId,
    })),
}))

vi.mock('../../../../../src/app/user/user-service', () => ({
    userService: vi.fn(() => ({
        getMetaInformation: vi.fn(),
    })),
}))

vi.mock('../../../../../src/app/workflows/step-run/sample-data.service', () => ({
    sampleDataService: vi.fn(() => ({
        saveSampleDataFileIdsInStep: vi.fn(),
    })),
}))

vi.mock('../../../../../src/app/workflows/workflow-version/workflow-version-migration.service', () => ({
    workflowVersionMigrationService: vi.fn(() => ({
        migrate: vi.fn((v: WorkflowVersion) => Promise.resolve(v)),
    })),
}))

vi.mock('../../../../../src/app/workflows/workflow-version/workflow-version-side-effects', () => ({
    workflowVersionSideEffects: vi.fn(() => ({
        preApplyOperation: vi.fn(),
    })),
}))

vi.mock('../../../../../src/app/workflows/workflow-version/workflow-version-validator-util', () => ({
    workflowVersionValidationUtil: vi.fn(() => ({
        prepareRequest: vi.fn(({ request }: { request: unknown }) => Promise.resolve(request)),
    })),
}))

import type { FastifyBaseLogger } from 'fastify'
import { workflowVersionService } from '../../../../../src/app/workflows/workflow-version/workflow-version.service'

const mockLog = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    level: 'info',
} as unknown as FastifyBaseLogger

function makeConnectorTriggerSettings(extras: Partial<ConnectorTrigger['settings']> = {}): ConnectorTrigger['settings'] {
    return {
        connectorName: '@fema-ipaas/connector-gmail',
        connectorVersion: '~0.1.0',
        triggerName: 'new_email',
        input: {},
        propertySettings: {},
        ...extras,
    }
}

function makeWorkflowVersion(overrides: { id?: string, trigger?: WorkflowVersion['trigger'] } = {}): WorkflowVersion {
    return {
        id: overrides.id ?? 'fv-1',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
        workflowId: 'workflow-1',
        displayName: 'Test Workflow',
        trigger: overrides.trigger ?? {
            name: 'trigger',
            valid: true,
            displayName: 'Gmail Trigger',
            lastUpdatedDate: '2024-01-01T00:00:00Z',
            type: WorkflowTriggerType.CONNECTOR,
            settings: makeConnectorTriggerSettings(),
            nextAction: {
                name: 'step_1',
                valid: true,
                displayName: 'Slack Action',
                lastUpdatedDate: '2024-01-01T00:00:00Z',
                type: WorkflowActionType.CONNECTOR,
                settings: {
                    connectorName: '@fema-ipaas/connector-slack',
                    connectorVersion: '~0.2.0',
                    actionName: 'send_message',
                    input: {},
                    propertySettings: {},
                },
            },
        },
        updatedBy: null,
        valid: true,
        schemaVersion: null,
        agentIds: [],
        state: WorkflowVersionState.DRAFT,
        connectionIds: [],
        backupFiles: null,
        notes: [],
    }
}

describe('workflowVersionService.applyOperation - USE_AS_DRAFT', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetTenantId.mockResolvedValue('tenant-1')
        mockRepoFindOne.mockResolvedValue(null)
        mockRepoSave.mockImplementation((v: WorkflowVersion) => Promise.resolve(v))
        mockRepoExists.mockResolvedValue(false)
    })

    it('preserves CONNECTOR trigger sample data from the previous version', async () => {
        const sampleData: SampleDataSettings = {
            sampleDataFileId: 'sd-file-1',
            sampleDataInputFileId: 'sdi-file-1',
            lastTestDate: '2024-01-01T00:00:00Z',
        }
        const currentDraft = makeWorkflowVersion()
        const previousVersion = makeWorkflowVersion({
            id: 'fv-prev',
            trigger: {
                ...makeWorkflowVersion().trigger,
                settings: makeConnectorTriggerSettings({ sampleData }),
            } as ConnectorTrigger,
        })
        mockRepoFindOne.mockResolvedValue(previousVersion)

        const result = await workflowVersionService(mockLog).applyOperation({
            projectId: 'proj-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            workflowVersion: currentDraft,
            userOperation: {
                type: WorkflowOperationType.USE_AS_DRAFT,
                request: { versionId: 'fv-prev' },
            },
        })

        expect(result.trigger.type).toBe(WorkflowTriggerType.CONNECTOR)
        const settings = (result.trigger as ConnectorTrigger).settings
        expect(settings.sampleData?.sampleDataFileId).toBe(sampleData.sampleDataFileId)
        expect(settings.sampleData?.sampleDataInputFileId).toBe(sampleData.sampleDataInputFileId)
    })

    it('does not set trigger sample data when previous version has no sampleData', async () => {
        const currentDraft = makeWorkflowVersion()
        const previousVersion = makeWorkflowVersion({ id: 'fv-prev' })
        mockRepoFindOne.mockResolvedValue(previousVersion)

        const result = await workflowVersionService(mockLog).applyOperation({
            projectId: 'proj-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            workflowVersion: currentDraft,
            userOperation: {
                type: WorkflowOperationType.USE_AS_DRAFT,
                request: { versionId: 'fv-prev' },
            },
        })

        expect(result.trigger.type).toBe(WorkflowTriggerType.CONNECTOR)
        expect((result.trigger as ConnectorTrigger).settings.sampleData).toBeUndefined()
    })

    it('skips the sample data preservation when previous version has an EMPTY trigger', async () => {
        const currentDraft = makeWorkflowVersion()
        const previousVersion = makeWorkflowVersion({
            id: 'fv-prev',
            trigger: {
                name: 'trigger',
                valid: false,
                displayName: 'Select Trigger',
                lastUpdatedDate: '2024-01-01T00:00:00Z',
                type: WorkflowTriggerType.EMPTY,
                settings: {},
            },
        })
        mockRepoFindOne.mockResolvedValue(previousVersion)

        const result = await workflowVersionService(mockLog).applyOperation({
            projectId: 'proj-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            workflowVersion: currentDraft,
            userOperation: {
                type: WorkflowOperationType.USE_AS_DRAFT,
                request: { versionId: 'fv-prev' },
            },
        })

        expect(result.trigger.type).toBe(WorkflowTriggerType.EMPTY)
    })
})
