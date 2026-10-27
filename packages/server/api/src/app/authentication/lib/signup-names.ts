import { isNil, LocalesEnum } from '@fema-ipaas/core-utils'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'

const MAX_NAME_PART_LENGTH = 50
const FALLBACK_FIRST_NAME = 'there'
const SAFE_STRING_CHARS = /[./]/g
const CJK_PATTERN = /[㐀-鿿豈-﫿]/

const NAME_FORMS: Record<LocalesEnum, NameForms> = {
    [LocalesEnum.ENGLISH]: {
        tenant: (name) => `${possessive(name)} Tenant`,
        project: (name) => `${possessive(name)} Project`,
        fallbackTenant: 'My Tenant',
        tenantPattern: /^(.+) Tenant$/,
    },
    [LocalesEnum.CHINESE_SIMPLIFIED]: {
        tenant: (name) => `${spacedBeforeChinese(name)}的租户`,
        project: (name) => `${spacedBeforeChinese(name)}的项目`,
        fallbackTenant: '我的租户',
        tenantPattern: /^(.+?)\s*的租户$/,
    },
}

function nameForms(): NameForms {
    const configured = system.get(AppSystemProp.DEFAULT_LANGUAGE)
    const locale = Object.values(LocalesEnum).find((candidate) => candidate === configured)
    return NAME_FORMS[locale ?? LocalesEnum.CHINESE_SIMPLIFIED]
}

function localPartTokens(email: string): string[] {
    const at = email.indexOf('@')
    const localPart = at >= 0 ? email.slice(0, at) : email
    return localPart
        .split(/[._+-]+/)
        .map((token) => token.replace(/[^a-zA-Z0-9]/g, ''))
        .filter((token) => token.length > 0)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
}

function firstNameFromEmail(email: string): string {
    const [first] = localPartTokens(email)
    return first ?? FALLBACK_FIRST_NAME
}

function tenantNameFromPerson({ firstName, email }: TenantNameFromPersonParams): string {
    const [given] = firstName.replace(SAFE_STRING_CHARS, '').trim().split(/\s+/)
    if (isNil(given) || given.length === 0) {
        const [fromEmail] = localPartTokens(email)
        return isNil(fromEmail) ? nameForms().fallbackTenant : tenantNameFor(fromEmail)
    }
    return tenantNameFor(given)
}

function tenantNameFor(name: string): string {
    return nameForms().tenant(name.slice(0, MAX_NAME_PART_LENGTH))
}

function personalProjectName({ ownerName }: PersonalProjectNameParams): string {
    const forms = nameForms()
    const trimmed = ownerName.trim()
    const withoutSuffix = Object.values(NAME_FORMS)
        .map((candidate) => candidate.tenantPattern.exec(trimmed)?.[1])
        .find((stripped) => !isNil(stripped)) ?? trimmed
    return forms.project(withoutSuffix.replace(/['’]s$/, ''))
}

function fullNameOf({ firstName, lastName }: FullNameOfParams): string {
    const first = firstName.trim()
    const last = lastName.trim()
    if (CJK_PATTERN.test(`${first}${last}`)) {
        return `${last}${first}`
    }
    return [first, last].filter((part) => part.length > 0).join(' ')
}

function spacedBeforeChinese(name: string): string {
    return CJK_PATTERN.test(name.slice(-1)) ? name : `${name} `
}

function possessive(name: string): string {
    return /['’]s$/.test(name) ? name : `${name}'s`
}

function splitFullName({ fullName, email }: SplitFullNameParams): SplitName {
    const tokens = fullName
        .split(/\s+/)
        .map((token) => token.replace(SAFE_STRING_CHARS, ''))
        .filter((token) => token.length > 0)
    const [first, ...rest] = tokens
    if (isNil(first)) {
        return { firstName: firstNameFromEmail(email), lastName: '' }
    }
    if (CJK_PATTERN.test(tokens.join(''))) {
        return { firstName: tokens.join('').slice(0, MAX_NAME_PART_LENGTH), lastName: '' }
    }
    return {
        firstName: first.slice(0, MAX_NAME_PART_LENGTH),
        lastName: rest.join(' ').slice(0, MAX_NAME_PART_LENGTH),
    }
}

export const signupNames = {
    firstNameFromEmail,
    tenantNameFromPerson,
    personalProjectName,
    fullNameOf,
    splitFullName,
}

type NameForms = {
    tenant: (name: string) => string
    project: (name: string) => string
    fallbackTenant: string
    tenantPattern: RegExp
}

type FullNameOfParams = {
    firstName: string
    lastName: string
}

type PersonalProjectNameParams = {
    ownerName: string
}

type TenantNameFromPersonParams = {
    firstName: string
    email: string
}

type SplitFullNameParams = {
    fullName: string
    email: string
}

type SplitName = {
    firstName: string
    lastName: string
}
