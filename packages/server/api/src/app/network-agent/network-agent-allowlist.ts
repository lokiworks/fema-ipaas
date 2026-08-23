import { isNil } from '@fema-ipaas/core-utils'

export const networkAgentAllowlist = {
    assertAllowed({ url, hostAllowlist, cidrAllowlist }: AssertAllowedParams): void {
        const host = hostOf(url)
        if (isNil(host)) {
            throw new Error(`Could not read a host out of "${url}"`)
        }
        if (hostAllowlist.length === 0 && cidrAllowlist.length === 0) {
            throw new Error(`Network agent has an empty allowlist, so "${host}" is not reachable. Add a host or CIDR entry first.`)
        }
        if (matchesHost({ host, hostAllowlist })) {
            return
        }
        if (matchesCidr({ host, cidrAllowlist })) {
            return
        }
        throw new Error(`"${host}" is not in this network agent's allowlist`)
    },
}

function hostOf(url: string): string | null {
    try {
        return new URL(url).hostname
    }
    catch {
        return null
    }
}

function matchesHost({ host, hostAllowlist }: { host: string, hostAllowlist: string[] }): boolean {
    return hostAllowlist.some((entry) => {
        const pattern = entry.trim().toLowerCase()
        if (pattern.length === 0) {
            return false
        }
        if (pattern.startsWith('*.')) {
            const suffix = pattern.slice(1)
            return host.toLowerCase().endsWith(suffix)
        }
        return host.toLowerCase() === pattern
    })
}

function matchesCidr({ host, cidrAllowlist }: { host: string, cidrAllowlist: string[] }): boolean {
    const address = toIpv4(host)
    if (isNil(address)) {
        return false
    }
    return cidrAllowlist.some((entry) => {
        const [range, bits] = entry.trim().split('/')
        const prefix = Number(bits)
        const rangeAddress = toIpv4(range)
        if (isNil(rangeAddress) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
            return false
        }
        if (prefix === 0) {
            return true
        }
        const mask = prefix === 32 ? 0xFFFFFFFF : ~((1 << (32 - prefix)) - 1) >>> 0
        return (address & mask) >>> 0 === (rangeAddress & mask) >>> 0
    })
}

function toIpv4(value: string): number | null {
    const parts = value.split('.')
    if (parts.length !== 4) {
        return null
    }
    let result = 0
    for (const part of parts) {
        const octet = Number(part)
        if (!Number.isInteger(octet) || octet < 0 || octet > 255 || part.trim() === '') {
            return null
        }
        result = (result << 8) + octet
    }
    return result >>> 0
}

type AssertAllowedParams = {
    url: string
    hostAllowlist: string[]
    cidrAllowlist: string[]
}
