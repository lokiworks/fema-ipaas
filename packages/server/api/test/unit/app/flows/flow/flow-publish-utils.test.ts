import { FlowTriggerType, FlowVersion, PropertyExecutionType } from '@fema/shared'
import { describe, expect, it } from 'vitest'
import { flowPublishUtils } from '../../../../../src/app/flows/flow/flow-publish-utils'

function connectorTrigger(overrides: { connectorName?: string, triggerName?: string, input?: Record<string, unknown> } = {}): FlowVersion['trigger'] {
    return {
        type: FlowTriggerType.CONNECTOR,
        settings: {
            connectorName: overrides.connectorName ?? '@fema/connector-jira-cloud',
            connectorVersion: '0.4.1',
            triggerName: overrides.triggerName ?? 'new_issue',
            input: overrides.input ?? { projectId: 'AP', maxResults: 50 },
            propertySettings: {
                projectId: { type: PropertyExecutionType.MANUAL },
            },
        },
        valid: true,
        name: 'trigger',
        displayName: 'New Issue',
        lastUpdatedDate: '2026-08-04T00:00:00.000Z',
    }
}

const emptyTrigger: FlowVersion['trigger'] = {
    type: FlowTriggerType.EMPTY,
    settings: {},
    valid: false,
    name: 'trigger',
    displayName: 'Select Trigger',
    lastUpdatedDate: '2026-08-04T00:00:00.000Z',
}

describe('flowPublishUtils.isSameTrigger', () => {
    it('is true when connector, trigger name and input all match', () => {
        expect(flowPublishUtils.isSameTrigger({
            published: connectorTrigger(),
            toPublish: connectorTrigger(),
        })).toBe(true)
    })

    it('ignores key order in the input', () => {
        expect(flowPublishUtils.isSameTrigger({
            published: connectorTrigger({ input: { projectId: 'AP', maxResults: 50 } }),
            toPublish: connectorTrigger({ input: { maxResults: 50, projectId: 'AP' } }),
        })).toBe(true)
    })

    it('is false when the trigger was swapped', () => {
        expect(flowPublishUtils.isSameTrigger({
            published: connectorTrigger({ triggerName: 'new_issue' }),
            toPublish: connectorTrigger({ triggerName: 'updated_issue' }),
        })).toBe(false)
    })

    it('is false when the connector was swapped', () => {
        expect(flowPublishUtils.isSameTrigger({
            published: connectorTrigger({ connectorName: '@fema/connector-jira-cloud' }),
            toPublish: connectorTrigger({ connectorName: '@fema/connector-linear' }),
        })).toBe(false)
    })

    it('is false when the input now points at a different resource', () => {
        expect(flowPublishUtils.isSameTrigger({
            published: connectorTrigger({ input: { projectId: 'AP', maxResults: 50 } }),
            toPublish: connectorTrigger({ input: { projectId: 'OPS', maxResults: 50 } }),
        })).toBe(false)
    })

    it('is false when a nested input value changed', () => {
        expect(flowPublishUtils.isSameTrigger({
            published: connectorTrigger({ input: { filter: { status: ['open'] } } }),
            toPublish: connectorTrigger({ input: { filter: { status: ['open', 'closed'] } } }),
        })).toBe(false)
    })

    it('is false for a non-connector trigger', () => {
        expect(flowPublishUtils.isSameTrigger({
            published: emptyTrigger,
            toPublish: emptyTrigger,
        })).toBe(false)
    })
})
