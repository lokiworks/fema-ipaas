import { PayloadLevel, privacyMasking } from '@fema-ipaas/core-utils'
import { describe, expect, it } from 'vitest'
import { logRedaction } from '../../src/lib/execution/log-redaction'
import { StepOutputType } from '../../src/lib/execution/state/step-output'
import { WorkflowActionType } from '../../src/lib/workflows/actions/action'

const privacy = (payloadLevel: PayloadLevel) => ({
    payloadLevel,
    maskRules: privacyMasking.defaultMaskRules(),
    displayLogsFileId: 'display',
})

describe('logRedaction.redactSteps', () => {
    it('masks inputs, outputs and error messages and keeps status', () => {
        const { steps, maskedCount } = logRedaction.redactSteps({
            steps: {
                step_1: {
                    type: WorkflowActionType.CONNECTOR,
                    status: 'FAILED',
                    input: { mobile: '13812345678', api_token: 'sk_live_1' },
                    output: { id_card: '310101199203051234', name: 'x' },
                    errorMessage: 'user 13812345678 not found',
                },
            },
            privacy: privacy(PayloadLevel.FULL),
        })
        expect(steps.step_1).toEqual({
            type: WorkflowActionType.CONNECTOR,
            status: 'FAILED',
            input: { mobile: '138****5678', api_token: '******' },
            output: { id_card: '310***********1234', name: 'x' },
            outputType: undefined,
            errorMessage: 'user 138****5678 not found',
        })
        expect(maskedCount).toBe(4)
    })

    it('hides sliced outputs instead of pointing at the unmasked slice', () => {
        const { steps } = logRedaction.redactSteps({
            steps: { big: { type: WorkflowActionType.CONNECTOR, status: 'SUCCEEDED', input: {}, output: { fileId: 'f', size: 40_000, url: 'u' }, outputType: StepOutputType.SLICE } },
            privacy: privacy(PayloadLevel.FULL),
        })
        expect(steps.big).toMatchObject({ output: 'Output hidden in the masked log. View the original to see it. Size: 40 KB', outputType: undefined })
    })

    it('masks steps inside loop iterations', () => {
        const { steps } = logRedaction.redactSteps({
            steps: {
                loop: {
                    type: WorkflowActionType.LOOP_ON_ITEMS,
                    status: 'SUCCEEDED',
                    input: {},
                    output: { item: { phone: '13900000000' }, index: 1, iterations: [{ inner: { type: WorkflowActionType.CODE, status: 'SUCCEEDED', input: { phone: '13900000000' }, output: null } }] },
                },
            },
            privacy: privacy(PayloadLevel.FULL),
        })
        expect(steps.loop).toMatchObject({
            output: { item: { phone: '139****0000' }, index: 1, iterations: [{ inner: { input: { phone: '139****0000' } } }] },
        })
    })

    it('drops payloads for metadata-only and error text for none', () => {
        const step = { type: WorkflowActionType.CODE, status: 'FAILED', input: { a: 1 }, output: { b: 2 }, errorMessage: 'boom' }
        expect(logRedaction.redactSteps({ steps: { s: step }, privacy: privacy(PayloadLevel.METADATA) }).steps.s).toMatchObject({ input: null, output: null, errorMessage: 'boom', status: 'FAILED' })
        expect(logRedaction.redactSteps({ steps: { s: step }, privacy: privacy(PayloadLevel.NONE) }).steps.s).toMatchObject({ input: null, output: null, errorMessage: undefined })
    })

    it('masks the whole output of a step marked sensitive and scrubs its values from other steps', () => {
        const { steps } = logRedaction.redactSteps({
            steps: {
                trigger: { type: 'CONNECTOR_TRIGGER', status: 'SUCCEEDED', input: {}, output: { body: { name: 'x' } } },
                pay: { type: WorkflowActionType.CODE, status: 'SUCCEEDED', input: {}, output: { salary: 32000, grade: 'Level-P7', nested: { bonus: 'twelve thousand' } } },
                notify: { type: WorkflowActionType.CODE, status: 'FAILED', input: { text: 'grade Level-P7 salary 32000' }, output: { ok: 'twelve thousand yuan' }, errorMessage: 'bad Level-P7' },
            },
            privacy: { ...privacy(PayloadLevel.FULL), sensitiveStepNames: ['pay'] },
        })
        expect(steps.pay).toMatchObject({ output: { salary: '******', grade: '******', nested: { bonus: '******' } } })
        expect(steps.notify).toMatchObject({
            input: { text: 'grade ****** salary ******' },
            output: { ok: '****** yuan' },
            errorMessage: 'bad ******',
        })
        expect(steps.trigger).toMatchObject({ output: { body: { name: 'x' } } })
    })

    it('masks numbers hidden in a raw request body string and in free text', () => {
        const rawBody = JSON.stringify({ employee: { mobile: '13912345678', apiToken: 'sk-live-abcdef123456' } })
        const { steps } = logRedaction.redactSteps({
            steps: { trigger: { type: 'CONNECTOR_TRIGGER', status: 'SUCCEEDED', input: {}, output: { rawBody, note: 'backup 138 0013 8001 mail a.b@corp.com' } } },
            privacy: privacy(PayloadLevel.FULL),
        })
        const serialized = JSON.stringify(steps)
        expect(serialized).not.toContain('13912345678')
        expect(serialized).not.toContain('sk-live-abcdef123456')
        expect(serialized).not.toContain('138 0013 8001')
        expect(serialized).not.toContain('a.b@corp.com')
    })
})
