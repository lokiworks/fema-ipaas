import { randomBytes } from 'node:crypto'
import { isNil, tryCatchSync } from '@fema-ipaas/core-utils'
import { SAAS_LIMITS, TenantDomainVerificationRecord } from '@fema-ipaas/shared'

const VALUE_PREFIX = 'fema-ipaas-verification='

function buildVerificationRecord({ domain, token }: { domain: string, token?: string }): TenantDomainVerificationRecord {
    return {
        type: 'TXT',
        name: `${SAAS_LIMITS.domainVerificationRecordPrefix}.${domain}`,
        value: `${VALUE_PREFIX}${token ?? randomBytes(16).toString('hex')}`,
    }
}

function txtMatches({ answers, expected }: { answers: string[][], expected: TenantDomainVerificationRecord }): boolean {
    return answers.some((chunks) => chunks.join('').trim() === expected.value)
}

function emailDomain({ email }: { email: string }): string | null {
    const parts = email.trim().toLowerCase().split('@')
    if (parts.length !== 2 || parts[1].length === 0) {
        return null
    }
    return parts[1]
}

function hostWithoutPort({ host }: { host: string }): string {
    const trimmed = host.trim().toLowerCase()
    if (trimmed.startsWith('[')) {
        return trimmed
    }
    return trimmed.split(':')[0]
}

function subdomainSlug({ host, baseDomain }: { host: string, baseDomain: string | undefined }): string | null {
    if (isNil(baseDomain) || baseDomain.trim().length === 0) {
        return null
    }
    const cleanHost = hostWithoutPort({ host })
    const cleanBase = hostWithoutPort({ host: baseDomain })
    const suffix = `.${cleanBase}`
    if (!cleanHost.endsWith(suffix)) {
        return null
    }
    const label = cleanHost.slice(0, cleanHost.length - suffix.length)
    const isSingleLabel = label.length > 0 && !label.includes('.')
    return isSingleLabel ? label : null
}

function hostOfUrl({ url }: { url: string }): string | null {
    const { data } = tryCatchSync(() => new URL(url))
    return isNil(data) ? null : data.hostname.toLowerCase()
}

export const tenantDomainUtils = {
    buildVerificationRecord,
    txtMatches,
    emailDomain,
    hostWithoutPort,
    subdomainSlug,
    hostOfUrl,
}
