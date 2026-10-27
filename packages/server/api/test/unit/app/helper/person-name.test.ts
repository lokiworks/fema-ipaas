import { describe, expect, it } from 'vitest'
import { personName } from '../../../../src/app/helper/person-name'

describe('personName.format', () => {
    it('puts the family name first without a space for Chinese names', () => {
        expect(personName.format({ firstName: '晓', lastName: '林' })).toBe('林晓')
    })

    it('keeps the given name first for Latin names', () => {
        expect(personName.format({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace')
    })

    it('ignores empty and placeholder parts', () => {
        expect(personName.format({ firstName: '晓', lastName: '-' })).toBe('晓')
        expect(personName.format({ firstName: null, lastName: undefined })).toBe('')
    })
})
