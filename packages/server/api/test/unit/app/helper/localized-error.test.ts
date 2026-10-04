import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { describe, expect, it } from 'vitest'
import { localizedError } from '../../../../src/app/helper/localized-error'

function caught(run: () => never): ApplicationError {
    try {
        run()
    }
    catch (error) {
        if (error instanceof ApplicationError) {
            return error
        }
    }
    throw new Error('expected an ApplicationError')
}

describe('localizedError', () => {
    it('keeps the template as the key and fills the English message', () => {
        const error = caught(() => localizedError.validation({
            key: '{name} is editing this workflow',
            params: { name: 'Alice' },
        }))
        expect(error.error.code).toBe(ErrorCode.VALIDATION)
        expect(error.error.params).toEqual({
            message: 'Alice is editing this workflow',
            messageKey: '{name} is editing this workflow',
            messageParams: { name: 'Alice' },
        })
    })

    it('leaves messages without params untouched', () => {
        const error = caught(() => localizedError.validation({ key: 'This version is already published' }))
        expect(error.error.params).toEqual({
            message: 'This version is already published',
            messageKey: 'This version is already published',
        })
    })

    it('raises authorization errors with the key', () => {
        const error = caught(() => localizedError.authorization({ key: 'You are not an approver of this release' }))
        expect(error.error.code).toBe(ErrorCode.AUTHORIZATION)
        expect(error.error.params).toEqual({
            message: 'You are not an approver of this release',
            messageKey: 'You are not an approver of this release',
        })
    })
})
