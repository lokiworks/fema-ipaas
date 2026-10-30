import { LATEST_WORKFLOW_SCHEMA_VERSION, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { runWorkflowSnapshotCodec } from '../../src/app/workflows/execution/run-workflow-snapshot'

const DATE = '2026-10-30T07:16:00.000Z'

const draft: WorkflowVersion = {
    id: 'version_draft_000000',
    created: DATE,
    updated: DATE,
    workflowId: 'workflow_0000000000',
    displayName: 'Employee changed',
    trigger: {
        name: 'trigger',
        type: WorkflowTriggerType.EMPTY,
        valid: true,
        displayName: 'Employee changed',
        lastUpdatedDate: DATE,
        settings: {},
    },
    updatedBy: null,
    valid: true,
    schemaVersion: LATEST_WORKFLOW_SCHEMA_VERSION,
    agentIds: [],
    state: WorkflowVersionState.DRAFT,
    connectionIds: [],
    backupFiles: null,
    notes: [],
    graph: null,
    publishNote: null,
}

describe('runWorkflowSnapshotCodec.shouldCapture', () => {
    it('captures a draft, because the draft keeps changing after the run', () => {
        expect(runWorkflowSnapshotCodec.shouldCapture({ state: WorkflowVersionState.DRAFT })).toBe(true)
    })

    it('skips a locked version, because it never changes and the run can read it directly', () => {
        expect(runWorkflowSnapshotCodec.shouldCapture({ state: WorkflowVersionState.LOCKED })).toBe(false)
    })
})

describe('runWorkflowSnapshotCodec.parse', () => {
    it('round-trips the structure the run executed', () => {
        const text = runWorkflowSnapshotCodec.serialize({ workflowVersion: draft })
        expect(runWorkflowSnapshotCodec.parse({ text })).toEqual(draft)
    })

    it('drops fields that are not part of a workflow version', () => {
        const text = JSON.stringify({ ...draft, updatedByUser: { id: 'user_1' } })
        expect(runWorkflowSnapshotCodec.parse({ text })).toEqual(draft)
    })

    it('returns null for text that is not JSON so the run falls back to the live version', () => {
        expect(runWorkflowSnapshotCodec.parse({ text: 'not json' })).toBeNull()
    })

    it('returns null for JSON that is not a workflow version', () => {
        expect(runWorkflowSnapshotCodec.parse({ text: JSON.stringify({ id: 'x' }) })).toBeNull()
    })
})
