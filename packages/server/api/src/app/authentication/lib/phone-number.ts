import { isNil } from '@fema-ipaas/core-utils'
import { SAAS_LIMITS } from '@fema-ipaas/shared'

function normalize({ value }: NormalizeParams): string | null {
    const compact = value.trim().replace(/[\s\-()]/gu, '')
    const candidate = toCandidate({ compact })
    return isNil(candidate) || !SAAS_LIMITS.phonePattern.test(candidate) ? null : candidate
}

function toCandidate({ compact }: ToCandidateParams): string | null {
    if (compact.startsWith('+')) {
        return compact
    }
    if (compact.startsWith('00')) {
        return `+${compact.slice(2)}`
    }
    return /^\d{6,14}$/u.test(compact) ? `${DEFAULT_COUNTRY_CODE}${compact.replace(/^0+/u, '')}` : null
}

function mask({ phone }: MaskParams): string {
    return phone.length <= 8 ? phone : `${phone.slice(0, phone.length - 8)}****${phone.slice(-4)}`
}

const DEFAULT_COUNTRY_CODE = '+86'

export const phoneNumber = {
    normalize,
    mask,
}

type MaskParams = {
    phone: string
}

type NormalizeParams = {
    value: string
}

type ToCandidateParams = {
    compact: string
}
