import { ssrfIpClassifier, SsrfAddressKind } from '../src/lib/ssrf-ip-classifier'

describe('ssrfIpClassifier.isBlockedIp', () => {
    test.each([
        ['127.0.0.1'],
        ['::1'],
        ['0:0:0:0:0:0:0:1'],
        ['::ffff:127.0.0.1'],
        ['::ffff:7f00:1'],
        ['::ffff:a9fe:a9fe'],
        ['169.254.169.254'],
        ['fe80::1'],
        ['10.0.0.1'],
        ['64:ff9b::7f00:1'],
        ['2002:7f00:1::'],
        ['not-an-ip'],
        ['2130706433'],
        ['0x7f000001'],
    ])('blocks %s', (ip) => {
        expect(ssrfIpClassifier.isBlockedIp({ ip, allowList: [] })).toBe(true)
    })

    test.each([['8.8.8.8'], ['::ffff:8.8.8.8'], ['2001:4860:4860::8888']])('lets %s through', (ip) => {
        expect(ssrfIpClassifier.isBlockedIp({ ip, allowList: [] })).toBe(false)
    })

    test('an allowed IPv4 address is allowed in its IPv4-mapped IPv6 spelling too', () => {
        expect(ssrfIpClassifier.isBlockedIp({ ip: '::ffff:127.0.0.1', allowList: ['127.0.0.1'] })).toBe(false)
        expect(ssrfIpClassifier.isBlockedIp({ ip: '::ffff:7f00:1', allowList: ['127.0.0.1'] })).toBe(false)
        expect(ssrfIpClassifier.isBlockedIp({ ip: '::ffff:7f00:2', allowList: ['127.0.0.1'] })).toBe(true)
    })

    test('an allowed IPv6 address matches its other spellings', () => {
        expect(ssrfIpClassifier.isBlockedIp({ ip: '::1', allowList: ['0:0:0:0:0:0:0:1'] })).toBe(false)
        expect(ssrfIpClassifier.isBlockedIp({ ip: 'fd00::5', allowList: ['fd00:0:0:0:0:0:0:5'] })).toBe(false)
    })

    test('allowing one address does not allow its neighbours', () => {
        expect(ssrfIpClassifier.isBlockedIp({ ip: '127.0.0.2', allowList: ['127.0.0.1'] })).toBe(true)
        expect(ssrfIpClassifier.isBlockedIp({ ip: '169.254.169.254', allowList: ['127.0.0.1'] })).toBe(true)
    })

    test('a CIDR entry of the other address family never matches', () => {
        expect(ssrfIpClassifier.isBlockedIp({ ip: '::1', allowList: ['127.0.0.0/8'] })).toBe(true)
    })
})

describe('ssrfIpClassifier.classify', () => {
    test.each([
        ['127.0.0.1', SsrfAddressKind.LOOPBACK],
        ['127.9.9.9', SsrfAddressKind.LOOPBACK],
        ['::1', SsrfAddressKind.LOOPBACK],
        ['::', SsrfAddressKind.LOOPBACK],
        ['0.0.0.0', SsrfAddressKind.LOOPBACK],
        ['::ffff:127.0.0.1', SsrfAddressKind.LOOPBACK],
        ['::ffff:7f00:1', SsrfAddressKind.LOOPBACK],
        ['[::1]', SsrfAddressKind.LOOPBACK],
        ['169.254.169.254', SsrfAddressKind.LINK_LOCAL],
        ['::ffff:a9fe:a9fe', SsrfAddressKind.LINK_LOCAL],
        ['fe80::1', SsrfAddressKind.LINK_LOCAL],
        ['10.0.0.1', SsrfAddressKind.PRIVATE],
        ['100.64.0.1', SsrfAddressKind.PRIVATE],
        ['fd00::1', SsrfAddressKind.PRIVATE],
        ['64:ff9b::7f00:1', SsrfAddressKind.PRIVATE],
        ['8.8.8.8', SsrfAddressKind.PUBLIC],
        ['::ffff:8.8.8.8', SsrfAddressKind.PUBLIC],
        ['nope', SsrfAddressKind.INVALID],
    ])('classifies %s as %s', (ip, kind) => {
        expect(ssrfIpClassifier.classify({ ip })).toBe(kind)
    })
})

describe('ssrfIpClassifier.parseAllowList', () => {
    test('splits, trims and drops empty entries', () => {
        expect(ssrfIpClassifier.parseAllowList({ raw: ' 10.0.0.0/8, 127.0.0.1 ,, ' })).toEqual(['10.0.0.0/8', '127.0.0.1'])
        expect(ssrfIpClassifier.parseAllowList({ raw: undefined })).toEqual([])
        expect(ssrfIpClassifier.parseAllowList({ raw: '' })).toEqual([])
    })
})
