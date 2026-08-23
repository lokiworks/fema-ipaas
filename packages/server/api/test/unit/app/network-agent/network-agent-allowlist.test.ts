import { networkAgentAllowlist } from '../../../../src/app/network-agent/network-agent-allowlist'

function assert(url: string, hostAllowlist: string[] = [], cidrAllowlist: string[] = []) {
    return () => networkAgentAllowlist.assertAllowed({ url, hostAllowlist, cidrAllowlist })
}

describe('networkAgentAllowlist', () => {
    it('refuses everything when the allowlist is empty', () => {
        expect(assert('https://sap.internal/api')).toThrow(/empty allowlist/)
    })

    it('allows an exact host match, case-insensitively', () => {
        expect(assert('https://SAP.internal/api', ['sap.internal'])).not.toThrow()
    })

    it('refuses a host that is not listed', () => {
        expect(assert('https://evil.example/api', ['sap.internal'])).toThrow(/not in this network agent/)
    })

    it('allows a wildcard subdomain but not the bare domain', () => {
        expect(assert('https://a.corp.internal/x', ['*.corp.internal'])).not.toThrow()
        expect(assert('https://corp.internal/x', ['*.corp.internal'])).toThrow()
    })

    it('does not let a suffix match a different domain', () => {
        expect(assert('https://notcorp.internal/x', ['*.corp.internal'])).toThrow()
    })

    it('allows an address inside a CIDR range', () => {
        expect(assert('http://10.1.2.3/api', [], ['10.1.0.0/16'])).not.toThrow()
    })

    it('refuses an address outside the CIDR range', () => {
        expect(assert('http://10.2.2.3/api', [], ['10.1.0.0/16'])).toThrow(/not in this network agent/)
    })

    it('handles a /32 as a single host', () => {
        expect(assert('http://10.1.2.3/api', [], ['10.1.2.3/32'])).not.toThrow()
        expect(assert('http://10.1.2.4/api', [], ['10.1.2.3/32'])).toThrow()
    })

    it('treats /0 as everything, since that is what it means', () => {
        expect(assert('http://8.8.8.8/api', [], ['0.0.0.0/0'])).not.toThrow()
    })

    it('does not match a hostname against a CIDR entry', () => {
        expect(assert('https://sap.internal/api', [], ['10.0.0.0/8'])).toThrow(/not in this network agent/)
    })

    it('ignores a malformed CIDR entry rather than allowing everything', () => {
        expect(assert('http://10.1.2.3/api', [], ['not-a-cidr', '10.1.2.3/99'])).toThrow(/not in this network agent/)
    })

    it('rejects a url it cannot read a host from', () => {
        expect(assert('not-a-url', ['sap.internal'])).toThrow(/Could not read a host/)
    })

    it('accepts when either list matches', () => {
        expect(assert('http://10.1.2.3/api', ['other.internal'], ['10.1.0.0/16'])).not.toThrow()
        expect(assert('https://other.internal/api', ['other.internal'], ['10.1.0.0/16'])).not.toThrow()
    })
})
