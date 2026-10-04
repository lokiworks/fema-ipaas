import ipaddr from 'ipaddr.js'

function parseOrNull(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
    try {
        return ipaddr.parse(stripBrackets(ip.trim()))
    }
    catch {
        return null
    }
}

function stripBrackets(value: string): string {
    return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
}

function unwrapMapped(addr: ipaddr.IPv4 | ipaddr.IPv6): ipaddr.IPv4 | ipaddr.IPv6 {
    if (addr instanceof ipaddr.IPv6 && addr.isIPv4MappedAddress()) {
        return addr.toIPv4Address()
    }
    return addr
}

function isInAllowList({ ip, allowList }: { ip: string, allowList: string[] }): boolean {
    if (allowList.includes(ip)) return true
    const parsed = parseOrNull(ip)
    if (!parsed) return false
    const addr = unwrapMapped(parsed)
    return allowList.some((entry) => matchesEntry({ addr, entry: entry.trim() }))
}

function matchesEntry({ addr, entry }: { addr: ipaddr.IPv4 | ipaddr.IPv6, entry: string }): boolean {
    if (entry.includes('/')) {
        return matchesCidr({ addr, cidr: entry })
    }
    const parsedEntry = parseOrNull(entry)
    if (!parsedEntry) return false
    const normalized = unwrapMapped(parsedEntry)
    return normalized.kind() === addr.kind() && normalized.toNormalizedString() === addr.toNormalizedString()
}

function matchesCidr({ addr, cidr }: { addr: ipaddr.IPv4 | ipaddr.IPv6, cidr: string }): boolean {
    try {
        const range = ipaddr.parseCIDR(cidr)
        if (addr.kind() !== range[0].kind()) return false
        return addr.match(range)
    }
    catch {
        return false
    }
}

function isBlockedRange(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
    return unwrapMapped(addr).range() !== 'unicast'
}

function isBlockedIp({ ip, allowList }: { ip: string, allowList: string[] }): boolean {
    if (isInAllowList({ ip, allowList })) {
        return false
    }
    const addr = parseOrNull(ip)
    if (!addr) {
        return true
    }
    return isBlockedRange(addr)
}

function classify({ ip }: { ip: string }): SsrfAddressKind {
    const parsed = parseOrNull(ip)
    if (!parsed) {
        return SsrfAddressKind.INVALID
    }
    const addr = unwrapMapped(parsed)
    const range = addr.range()
    if (range === 'loopback' || range === 'unspecified') {
        return SsrfAddressKind.LOOPBACK
    }
    if (range === 'linkLocal') {
        return SsrfAddressKind.LINK_LOCAL
    }
    if (range === 'unicast') {
        return SsrfAddressKind.PUBLIC
    }
    return SsrfAddressKind.PRIVATE
}

function parseAllowList({ raw }: { raw: string | undefined }): string[] {
    if (!raw) return []
    return raw.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
}

export const ssrfIpClassifier = {
    isBlockedIp,
    isInAllowList,
    classify,
    parseAllowList,
}

export enum SsrfAddressKind {
    LOOPBACK = 'LOOPBACK',
    LINK_LOCAL = 'LINK_LOCAL',
    PRIVATE = 'PRIVATE',
    PUBLIC = 'PUBLIC',
    INVALID = 'INVALID',
}
