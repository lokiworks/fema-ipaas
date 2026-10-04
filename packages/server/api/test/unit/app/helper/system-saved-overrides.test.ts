import { afterEach, describe, expect, it } from 'vitest'
import { savedOverrides } from '../../../../src/app/helper/system/saved-overrides'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'

const VARIABLE = 'FEMA_SMTP_HOST'

describe('saved service settings in system.get', () => {
    afterEach(() => {
        delete process.env[VARIABLE]
        savedOverrides.replace({ values: new Map() })
    })

    it('uses the saved value when no environment variable is set', () => {
        savedOverrides.replace({ values: new Map([[AppSystemProp.SMTP_HOST, 'saved.example.com']]) })
        expect(system.get(AppSystemProp.SMTP_HOST)).toBe('saved.example.com')
        expect(system.isFromEnvironment(AppSystemProp.SMTP_HOST)).toBe(false)
    })

    it('lets the environment variable win over the saved value', () => {
        process.env[VARIABLE] = 'env.example.com'
        savedOverrides.replace({ values: new Map([[AppSystemProp.SMTP_HOST, 'saved.example.com']]) })
        expect(system.get(AppSystemProp.SMTP_HOST)).toBe('env.example.com')
        expect(system.isFromEnvironment(AppSystemProp.SMTP_HOST)).toBe(true)
    })

    it('treats an empty environment variable as unset when a saved value exists', () => {
        process.env[VARIABLE] = ''
        savedOverrides.replace({ values: new Map([[AppSystemProp.SMTP_HOST, 'saved.example.com']]) })
        expect(system.get(AppSystemProp.SMTP_HOST)).toBe('saved.example.com')
        expect(system.isFromEnvironment(AppSystemProp.SMTP_HOST)).toBe(false)
    })

    it('has no value for an optional service nobody configured', () => {
        expect(system.get(AppSystemProp.SMTP_HOST)).toBeUndefined()
    })
})
