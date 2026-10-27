import { isNil } from '@fema-ipaas/core-utils'

function format({ firstName, lastName }: { firstName: string | null | undefined, lastName: string | null | undefined }): string {
    const first = cleanPart(firstName)
    const last = cleanPart(lastName)
    if (CJK_PATTERN.test(`${first}${last}`)) {
        return `${last}${first}`
    }
    return [first, last].filter((part) => part.length > 0).join(' ')
}

function cleanPart(part: string | null | undefined): string {
    const trimmed = isNil(part) ? '' : part.trim()
    return trimmed === PLACEHOLDER_PART ? '' : trimmed
}

const PLACEHOLDER_PART = '-'
const CJK_PATTERN = /[㐀-鿿豈-﫿]/

export const personName = { format }
