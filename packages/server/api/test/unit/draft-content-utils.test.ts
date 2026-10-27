import { WorkflowActionType, WorkflowTrigger, WorkflowTriggerType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { draftContentUtils } from '../../src/app/project-workspace/draft-content-utils'

const DATE = '2026-05-02T00:00:00.000Z'

function versionWith({ displayName = 'Flow', stepSettings = {}, extraStep = false }: {
    displayName?: string
    stepSettings?: Record<string, unknown>
    extraStep?: boolean
}): { displayName: string, trigger: WorkflowTrigger } {
    const tail = extraStep
        ? {
            nextAction: {
                name: 'step_2',
                type: WorkflowActionType.CONNECTOR,
                valid: true,
                displayName: 'Second',
                lastUpdatedDate: DATE,
                settings: {},
            },
        }
        : {}
    return {
        displayName,
        trigger: {
            name: 'trigger',
            type: WorkflowTriggerType.EMPTY,
            valid: true,
            displayName: 'Trigger',
            lastUpdatedDate: DATE,
            settings: {},
            nextAction: {
                name: 'step_1',
                type: WorkflowActionType.CONNECTOR,
                valid: true,
                displayName: 'First',
                lastUpdatedDate: DATE,
                settings: {
                    connectorName: '@fema-ipaas/connector-feishu',
                    connectorVersion: '0.0.1',
                    actionName: 'send',
                    input: {},
                    propertySettings: {},
                    ...stepSettings,
                },
                ...tail,
            },
        },
    }
}

describe('draftContentUtils.hasContentChanges', () => {
    it('treats identical content as unchanged', () => {
        expect(draftContentUtils.hasContentChanges({ before: versionWith({}), after: versionWith({}) })).toBe(false)
    })

    it('ignores sample data, display numbers and key order', () => {
        const before = versionWith({ stepSettings: { sampleData: { a: 1 }, displayNumber: 1, input: { a: 1, b: 2 } } })
        const after = versionWith({ stepSettings: { sampleData: { a: 2 }, displayNumber: 4, input: { b: 2, a: 1 } } })
        expect(draftContentUtils.hasContentChanges({ before, after })).toBe(false)
    })

    it('detects a renamed workflow', () => {
        expect(draftContentUtils.hasContentChanges({ before: versionWith({}), after: versionWith({ displayName: 'Other' }) })).toBe(true)
    })

    it('detects changed step input', () => {
        const after = versionWith({ stepSettings: { input: { text: 'hi' } } })
        expect(draftContentUtils.hasContentChanges({ before: versionWith({}), after })).toBe(true)
    })

    it('detects an added step', () => {
        expect(draftContentUtils.hasContentChanges({ before: versionWith({}), after: versionWith({ extraStep: true }) })).toBe(true)
    })
})
