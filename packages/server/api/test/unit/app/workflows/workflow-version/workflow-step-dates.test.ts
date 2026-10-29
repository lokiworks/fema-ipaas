import { WorkflowActionType, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import type { WorkflowVersion } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { workflowStepDates } from '../../../../../src/app/workflows/workflow-version/workflow-step-dates'

const OLD = '2024-01-01T00:00:00.000Z'
const NEW = '2026-10-28T00:00:00.000Z'

function versionWith({ date, extraStep = false, sampleData, stepDisplayName = 'Code' }: VersionWithParams): WorkflowVersion {
    const tail = extraStep
        ? {
            nextAction: {
                name: 'step_2',
                valid: true,
                displayName: 'Added',
                lastUpdatedDate: date,
                type: WorkflowActionType.CODE,
                settings: { sourceCode: { code: '', packageJson: '{}' }, input: {} },
            },
        }
        : {}
    return {
        id: 'fv-1',
        created: OLD,
        updated: OLD,
        workflowId: 'workflow-1',
        displayName: 'Flow',
        trigger: {
            name: 'trigger',
            valid: true,
            displayName: 'Trigger',
            lastUpdatedDate: date,
            type: WorkflowTriggerType.EMPTY,
            settings: {},
            nextAction: {
                name: 'step_1',
                valid: true,
                displayName: stepDisplayName,
                lastUpdatedDate: date,
                type: WorkflowActionType.CODE,
                settings: { sourceCode: { code: '', packageJson: '{}' }, input: {}, sampleData },
                ...tail,
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

describe('workflowStepDates.keepFrom', () => {
    it('restores lastUpdatedDate of steps that exist in the source version', () => {
        const result = workflowStepDates.keepFrom({
            workflowVersion: versionWith({ date: NEW }),
            source: versionWith({ date: OLD }),
        })

        expect(result.trigger.lastUpdatedDate).toBe(OLD)
        expect(result.trigger.nextAction?.lastUpdatedDate).toBe(OLD)
    })

    it('leaves steps that are not in the source version untouched', () => {
        const result = workflowStepDates.keepFrom({
            workflowVersion: versionWith({ date: NEW, extraStep: true }),
            source: versionWith({ date: OLD }),
        })

        expect(result.trigger.nextAction?.lastUpdatedDate).toBe(OLD)
        expect(result.trigger.nextAction?.nextAction?.lastUpdatedDate).toBe(NEW)
    })
})

describe('workflowStepDates.keepTestedFrom', () => {
    const SAMPLE = { sampleDataFileId: 'file-1', lastTestDate: OLD }

    it('restores the sample data and date of steps that did not change', () => {
        const result = workflowStepDates.keepTestedFrom({
            workflowVersion: versionWith({ date: NEW, extraStep: true }),
            source: versionWith({ date: OLD, sampleData: SAMPLE }),
        })

        expect(result.trigger.nextAction?.settings.sampleData).toEqual(SAMPLE)
        expect(result.trigger.nextAction?.lastUpdatedDate).toBe(OLD)
        expect(result.trigger.nextAction?.nextAction?.settings.sampleData).toBeUndefined()
        expect(result.trigger.nextAction?.nextAction?.lastUpdatedDate).toBe(NEW)
    })

    it('leaves a step that really changed untested', () => {
        const result = workflowStepDates.keepTestedFrom({
            workflowVersion: versionWith({ date: NEW, stepDisplayName: 'Renamed' }),
            source: versionWith({ date: OLD, sampleData: SAMPLE }),
        })

        expect(result.trigger.nextAction?.settings.sampleData).toBeUndefined()
        expect(result.trigger.nextAction?.lastUpdatedDate).toBe(NEW)
    })
})

type VersionWithParams = {
    date: string
    extraStep?: boolean
    sampleData?: { sampleDataFileId: string, lastTestDate: string }
    stepDisplayName?: string
}
