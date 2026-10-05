import { isNil } from '@fema-ipaas/core-utils'
import { SsoLoginErrorCode, TenantRole } from '@fema-ipaas/shared'
import { SsoLoginError } from './sso-errors'

function claimValue({ claims, path }: ClaimValueParams): unknown {
    if (path in claims) {
        return claims[path]
    }
    return path.split('.').reduce<unknown>((current, segment) => {
        if (isRecord(current)) {
            return current[segment]
        }
        return undefined
    }, claims)
}

function claimStrings({ claims, path }: ClaimValueParams): string[] {
    const value = claimValue({ claims, path })
    if (typeof value === 'string') {
        return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
    }
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter((item) => item.length > 0)
    }
    return []
}

function fromClaims({ claims, emailClaim, groupsClaim }: FromClaimsParams): SsoProfile {
    const subject = claims['sub']
    if (typeof subject !== 'string' || subject.length === 0) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'The identity provider returned no subject' })
    }
    const emailValue = claimValue({ claims, path: emailClaim })
    const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : ''
    const verifiedValue = claims['email_verified']
    const emailVerified = verifiedValue === true || verifiedValue === 'true'
    const fullName = typeof claims['name'] === 'string' ? claims['name'] : ''
    const givenName = typeof claims['given_name'] === 'string' ? claims['given_name'] : ''
    const familyName = typeof claims['family_name'] === 'string' ? claims['family_name'] : ''
    return {
        subject,
        email,
        emailVerified,
        fullName,
        givenName,
        familyName,
        groups: isNil(groupsClaim) ? [] : claimStrings({ claims, path: groupsClaim }),
    }
}

function assertUsable({ profile, requireVerifiedEmail }: AssertUsableParams): void {
    if (profile.email.length === 0 || !profile.email.includes('@')) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.EMAIL_MISSING, detail: 'The identity provider returned no email address' })
    }
    if (requireVerifiedEmail && !profile.emailVerified) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.EMAIL_NOT_VERIFIED, detail: `The email ${profile.email} is not verified at the identity provider` })
    }
}

function assertDomainListed({ email, allowedDomains }: AssertDomainListedParams): void {
    const normalized = allowedDomains.map((domain) => domain.trim().toLowerCase()).filter((domain) => domain.length > 0)
    if (normalized.length === 0) {
        return
    }
    const domain = email.split('@')[1]?.toLowerCase()
    if (isNil(domain) || !normalized.includes(domain)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.DOMAIN_NOT_ALLOWED, detail: `The email domain ${domain ?? ''} is not on the allowed list` })
    }
}

function resolveRole({ groups, roleMapping, defaultRole }: ResolveRoleParams): TenantRole {
    if (isNil(roleMapping)) {
        return defaultRole
    }
    const matched = roleMapping.rules.filter((rule) => groups.includes(rule.value)).map((rule) => rule.role)
    const best = ROLE_PRIORITY.find((role) => matched.includes(role))
    return best ?? defaultRole
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const ROLE_PRIORITY: TenantRole[] = [TenantRole.ADMIN, TenantRole.OPERATOR, TenantRole.MEMBER]

export const ssoProfile = {
    claimValue,
    claimStrings,
    fromClaims,
    assertUsable,
    assertDomainListed,
    resolveRole,
}

export type SsoProfile = {
    subject: string
    email: string
    emailVerified: boolean
    fullName: string
    givenName: string
    familyName: string
    groups: string[]
}

type ClaimValueParams = {
    claims: Record<string, unknown>
    path: string
}

type FromClaimsParams = {
    claims: Record<string, unknown>
    emailClaim: string
    groupsClaim: string | null
}

type AssertUsableParams = {
    profile: SsoProfile
    requireVerifiedEmail: boolean
}

type AssertDomainListedParams = {
    email: string
    allowedDomains: string[]
}

type ResolveRoleParams = {
    groups: string[]
    roleMapping: { rules: { value: string, role: TenantRole }[] } | null | undefined
    defaultRole: TenantRole
}
