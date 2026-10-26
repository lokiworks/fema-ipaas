import { z } from 'zod'

function attach({ message, owner }: { message: string, owner: FixOwner }): string {
    return `${strip(message)}\n[fix-owner=${owner}]`
}

function parse(message: string | null | undefined): FixOwner | null {
    const last = [...(message ?? '').matchAll(MARKER_PATTERN)].at(-1)
    const parsed = FixOwner.safeParse(last?.[1])
    return parsed.success ? parsed.data : null
}

function strip(message: string): string {
    return message.replace(MARKER_STRIP_PATTERN, '').trimEnd()
}

const MARKER_PATTERN = /\[fix-owner=([^\]\s]+)\]/g
const MARKER_STRIP_PATTERN = /\n?\[fix-owner=[^\]\s]+\]/g

export const fixOwnerMarker = { attach, parse, strip }
export const FixOwner = z.enum(['CONNECTION_OWNER', 'TARGET_ADMIN', 'SOURCE_DATA_OWNER', 'MAPPING_OWNER', 'WORKFLOW_OWNER', 'WAIT'])
export type FixOwner = z.infer<typeof FixOwner>
