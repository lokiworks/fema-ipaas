import { PropertyType } from '@fema-ipaas/connector-sdk'
import { describe, expect, it } from 'vitest'
import { connectionPrefillUtils } from '../../../../src/app/connection/connection-service/connection-prefill'

describe('connectionPrefillUtils.publicProps', () => {
    it('keeps plain fields and drops secrets, unknown keys and objects', () => {
        expect(connectionPrefillUtils.publicProps({
            values: { host: 'db.internal', port: 5432, ssl: true, password: 'p@ss', extra: 'x', options: { a: 1 } },
            definitions: {
                host: PropertyType.SHORT_TEXT,
                port: PropertyType.NUMBER,
                ssl: PropertyType.CHECKBOX,
                password: PropertyType.SECRET_TEXT,
                options: PropertyType.SHORT_TEXT,
            },
        })).toEqual({ host: 'db.internal', port: 5432, ssl: true })
    })
})
