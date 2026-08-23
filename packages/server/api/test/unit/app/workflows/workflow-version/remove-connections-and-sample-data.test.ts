import { CodeAction, WorkflowAction, WorkflowActionType, workflowStructureUtil, WorkflowTrigger, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { workflowVersionService } from '../../../../../src/app/workflows/workflow-version/workflow-version.service'

const mockLog = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
} as unknown as FastifyBaseLogger

function buildCodeAction(name: string, nextAction?: WorkflowAction): CodeAction {
    return {
        name,
        type: WorkflowActionType.CODE,
        valid: true,
        displayName: name,
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: {
            sourceCode: { code: '', packageJson: '{}' },
            input: {
                url: 'https://example.com',
                token: '{{connections.my_connection}}',
            },
            sampleData: {
                sampleDataFileId: 'file-1',
                sampleDataInputFileId: 'file-2',
                lastTestDate: '2026-05-02T00:00:00.000Z',
            },
            errorHandlingOptions: {
                continueOnFailure: { value: false },
                retryOnFailure: { value: false },
            },
        },
        nextAction,
    }
}

function buildChainedWorkflowVersion(stepCount: number): WorkflowVersion {
    let nextAction: WorkflowAction | undefined = undefined
    for (let i = stepCount; i >= 1; i--) {
        nextAction = buildCodeAction(`step_${i}`, nextAction)
    }
    const trigger: WorkflowTrigger = {
        name: 'trigger',
        type: WorkflowTriggerType.EMPTY,
        valid: false,
        displayName: 'Select Trigger',
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: {},
        nextAction,
    }
    return {
        id: 'workflow-version-id',
        created: '2026-05-02T00:00:00.000Z',
        updated: '2026-05-02T00:00:00.000Z',
        workflowId: 'workflow-id',
        displayName: 'quadratic clone regression',
        trigger,
        valid: false,
        state: WorkflowVersionState.DRAFT,
        schemaVersion: '1',
        connectionIds: [],
        agentIds: [],
    }
}

function removeAll(workflowVersion: WorkflowVersion): WorkflowVersion {
    return workflowVersionService(mockLog).removeConnectionsAndSampleDataFromWorkflowVersion(workflowVersion, true, true)
}

describe('removeConnectionsAndSampleDataFromWorkflowVersion', () => {
    it('strips connection references and sample data from every step in the chain', () => {
        const result = removeAll(buildChainedWorkflowVersion(25))

        const codeSteps = workflowStructureUtil.getAllSteps(result.trigger).filter((step) => step.type === WorkflowActionType.CODE)
        expect(codeSteps).toHaveLength(25)
        for (const step of codeSteps) {
            expect(step.settings.input.token).toBeUndefined()
            expect(step.settings.input.url).toBe('https://example.com')
            expect(step.settings.sampleData?.sampleDataFileId).toBeUndefined()
            expect(step.settings.sampleData?.sampleDataInputFileId).toBeUndefined()
            expect(step.settings.sampleData?.lastTestDate).toBeUndefined()
        }
    })

    it('leaves the input workflow version untouched', () => {
        const workflowVersion = buildChainedWorkflowVersion(5)
        const before = JSON.stringify(workflowVersion)

        removeAll(workflowVersion)

        expect(JSON.stringify(workflowVersion)).toBe(before)
    })

    it('clones the workflow a constant number of times regardless of step count', () => {
        const measure = (stepCount: number): number => {
            const workflowVersion = buildChainedWorkflowVersion(stepCount)
            const spy = vi.spyOn(JSON, 'stringify')
            removeAll(workflowVersion)
            const calls = spy.mock.calls.length
            spy.mockRestore()
            return calls
        }

        expect(measure(200)).toBe(measure(20))
    })
})
