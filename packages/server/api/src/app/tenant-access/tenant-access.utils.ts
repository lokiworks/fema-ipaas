import { randomInt } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { ASSIGNABLE_TENANT_MODULES, LOGIN_METHOD_ORDER, LoginMethod, LoginMethodStatus, TENANT_ACCESS_LIMITS, TenantModule, TenantRole } from '@fema-ipaas/shared'

function emailDomain(email: string): string | null {
    const at = email.lastIndexOf('@')
    if (at < 0 || at === email.length - 1) {
        return null
    }
    return email.slice(at + 1).trim().toLowerCase()
}

function homeDomains({ allowedAuthDomains, ownerEmail }: HomeDomainsParams): string[] {
    const allowed = allowedAuthDomains.map((domain) => domain.trim().toLowerCase()).filter((domain) => domain.length > 0)
    if (allowed.length > 0) {
        return [...new Set(allowed)]
    }
    const ownerDomain = isNil(ownerEmail) ? null : emailDomain(ownerEmail)
    return isNil(ownerDomain) ? [] : [ownerDomain]
}

function isExternal({ email, domains }: IsExternalParams): boolean {
    const domain = emailDomain(email)
    if (isNil(domain) || domains.length === 0) {
        return false
    }
    return !domains.includes(domain)
}

function assignableModules(modules: readonly string[]): TenantModule[] {
    return ASSIGNABLE_TENANT_MODULES.filter((module) => modules.includes(module))
}

function effectiveModules({ tenantRole, storedModules }: EffectiveModulesParams): TenantModule[] {
    if (tenantRole === TenantRole.ADMIN) {
        return Object.values(TenantModule)
    }
    return [TenantModule.BUSINESS_INTEGRATION, ...assignableModules(storedModules)]
}

function hasModule({ tenantRole, storedModules, module }: HasModuleParams): boolean {
    return effectiveModules({ tenantRole, storedModules }).includes(module)
}

function generateTemporaryPassword(length: number): string {
    const size = Math.max(length, 2)
    const letters = Array.from({ length: size - 1 }, () => pick(LETTERS))
    const digitPosition = randomInt(size)
    const digit = pick(DIGITS)
    return [...letters.slice(0, digitPosition), digit, ...letters.slice(digitPosition)].join('')
}

function temporaryPasswordLength(passwordMinLength: number): number {
    return Math.max(TENANT_ACCESS_LIMITS.temporaryPasswordLength, passwordMinLength)
}

function loginMethods({ emailAuthEnabled }: LoginMethodsParams): LoginMethodStatus[] {
    return LOGIN_METHOD_ORDER.map((method) => {
        const available = method === LoginMethod.EMAIL_PASSWORD
        return {
            method,
            available,
            configured: available,
            enabled: available && emailAuthEnabled,
        }
    })
}

function countEnabledLoginMethods(methods: LoginMethodStatus[]): number {
    return methods.filter((method) => method.enabled).length
}

function pick(alphabet: string): string {
    return alphabet[randomInt(alphabet.length)]
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const DIGITS = '23456789'

export const tenantAccessUtils = {
    emailDomain,
    homeDomains,
    isExternal,
    assignableModules,
    effectiveModules,
    hasModule,
    generateTemporaryPassword,
    temporaryPasswordLength,
    loginMethods,
    countEnabledLoginMethods,
}

type HomeDomainsParams = {
    allowedAuthDomains: string[]
    ownerEmail: string | null
}

type IsExternalParams = {
    email: string
    domains: string[]
}

type EffectiveModulesParams = {
    tenantRole: TenantRole
    storedModules: readonly string[]
}

type HasModuleParams = EffectiveModulesParams & {
    module: TenantModule
}

type LoginMethodsParams = {
    emailAuthEnabled: boolean
}
