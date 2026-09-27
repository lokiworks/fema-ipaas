import { describe, expect, it } from 'vitest'
import { dataStoreUtils } from '../../../../src/app/data-store/data-store-utils'

describe('dataStoreUtils.parseEngineKey', () => {
    it('leaves ordinary keys in the implicit project store', () => {
        expect(dataStoreUtils.parseEngineKey('cursor')).toEqual({ type: 'implicit' })
        expect(dataStoreUtils.parseEngineKey('workflow_abc/datastore:x/y')).toEqual({ type: 'implicit' })
        expect(dataStoreUtils.parseEngineKey('DataStore:x/y')).toEqual({ type: 'implicit' })
    })

    it('splits the store name from the key at the first slash', () => {
        expect(dataStoreUtils.parseEngineKey('datastore:入职去重/XH20260918')).toEqual({ type: 'named', storeName: '入职去重', key: 'XH20260918' })
        expect(dataStoreUtils.parseEngineKey('datastore:sync/cursor/2026/09')).toEqual({ type: 'named', storeName: 'sync', key: 'cursor/2026/09' })
    })

    it('rejects a prefixed key without a store name or a key', () => {
        expect(dataStoreUtils.parseEngineKey('datastore:')).toEqual({ type: 'invalid' })
        expect(dataStoreUtils.parseEngineKey('datastore:sync')).toEqual({ type: 'invalid' })
        expect(dataStoreUtils.parseEngineKey('datastore:/key')).toEqual({ type: 'invalid' })
        expect(dataStoreUtils.parseEngineKey('datastore:sync/')).toEqual({ type: 'invalid' })
    })
})

describe('dataStoreUtils expiry', () => {
    const now = new Date('2026-09-27T08:00:00.000Z')

    it('adds the store TTL in whole days to the write time', () => {
        expect(dataStoreUtils.computeExpiresAt({ now, ttlDays: 30 }).toISOString()).toBe('2026-10-27T08:00:00.000Z')
        expect(dataStoreUtils.computeExpiresAt({ now, ttlDays: 1 }).toISOString()).toBe('2026-09-28T08:00:00.000Z')
        expect(dataStoreUtils.computeExpiresAt({ now, ttlDays: 365 }).toISOString()).toBe('2027-09-27T08:00:00.000Z')
    })

    it('treats entries at or past their expiry as expired and entries without expiry as live', () => {
        expect(dataStoreUtils.isExpired({ expiresAt: '2026-09-27T08:00:00.000Z', now })).toBe(true)
        expect(dataStoreUtils.isExpired({ expiresAt: new Date('2026-09-26T08:00:00.000Z'), now })).toBe(true)
        expect(dataStoreUtils.isExpired({ expiresAt: '2026-09-27T08:00:01.000Z', now })).toBe(false)
        expect(dataStoreUtils.isExpired({ expiresAt: null, now })).toBe(false)
        expect(dataStoreUtils.isExpired({ expiresAt: undefined, now })).toBe(false)
    })
})

describe('dataStoreUtils helpers', () => {
    it('measures strings by characters and other values by their JSON form', () => {
        expect(dataStoreUtils.valueLength('你好')).toBe(2)
        expect(dataStoreUtils.valueLength(['a'])).toBe(5)
        expect(dataStoreUtils.valueLength(undefined)).toBe(4)
    })

    it('escapes LIKE wildcards in search terms', () => {
        expect(dataStoreUtils.escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\')
    })
})
