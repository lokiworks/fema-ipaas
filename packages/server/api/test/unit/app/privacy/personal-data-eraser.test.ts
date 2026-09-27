import { ErasureSubjectKind, StepOutputType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { personalDataEraser } from '../../../../src/app/privacy/personal-data-eraser'

describe('personalDataEraser', () => {
    it('builds hints that do not reveal the value', () => {
        expect(personalDataEraser.hintOf({ kind: ErasureSubjectKind.PHONE, value: '13812345678' })).toBe('138****5678')
        expect(personalDataEraser.hintOf({ kind: ErasureSubjectKind.EMAIL, value: 'tangkexin@xinghe.tech' })).toBe('t***@xinghe.tech')
        expect(personalDataEraser.hintOf({ kind: ErasureSubjectKind.EMPLOYEE_ID, value: 'XH20210311' })).toBe('XH******11')
        expect(personalDataEraser.maskName('许诺')).toBe('许*')
        expect(personalDataEraser.maskName('  ')).toBeNull()
    })

    it('clears only the steps that mention the value and keeps status', () => {
        const { steps, erased } = personalDataEraser.eraseSteps({
            steps: {
                trigger: { status: 'SUCCEEDED', input: {}, output: { email: 'Tang@Xinghe.tech', dept: 'R&D' } },
                other: { status: 'SUCCEEDED', input: { a: 1 }, output: { b: 2 } },
                failed: { status: 'FAILED', input: { x: 1 }, output: null, errorMessage: 'user tang@xinghe.tech not found' },
            },
            value: 'tang@xinghe.tech',
            hitSliceFileIds: new Set(),
        })
        expect(erased).toBe(2)
        expect(steps.trigger).toEqual({ status: 'SUCCEEDED', input: {}, output: null, outputType: undefined, errorMessage: undefined, personalDataErased: true })
        expect(steps.other).toEqual({ status: 'SUCCEEDED', input: { a: 1 }, output: { b: 2 } })
        expect(steps.failed).toMatchObject({ status: 'FAILED', input: { x: 1 }, errorMessage: 'user ****** not found', personalDataErased: true })
    })

    it('erases inside loops and drops sliced outputs that matched', () => {
        const { steps, erased } = personalDataEraser.eraseSteps({
            steps: {
                loop: { status: 'SUCCEEDED', input: {}, output: { item: 1, iterations: [{ inner: { status: 'SUCCEEDED', input: { phone: '13812345678' }, output: {} } }] } },
                big: { status: 'SUCCEEDED', input: {}, output: { fileId: 'slice-1', size: 1 }, outputType: StepOutputType.SLICE },
            },
            value: '13812345678',
            hitSliceFileIds: new Set(['slice-1']),
        })
        expect(erased).toBe(3)
        expect(steps.loop).toMatchObject({ output: { iterations: [{ inner: { input: null, personalDataErased: true } }] }, personalDataErased: true })
        expect(steps.big).toMatchObject({ output: null, outputType: undefined, personalDataErased: true })
    })

    it('finds slice references inside loops', () => {
        expect(personalDataEraser.sliceRefs({
            a: { output: { fileId: 'f1' }, outputType: StepOutputType.SLICE },
            loop: { output: { iterations: [{ b: { output: { fileId: 'f2' }, outputType: StepOutputType.SLICE } }] } },
        })).toEqual([{ stepName: 'a', fileId: 'f1' }, { stepName: 'b', fileId: 'f2' }])
    })
})
