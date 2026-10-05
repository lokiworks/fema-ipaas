const JWT_SECRET_MIN_LENGTH = 32
const MIN_DISTINCT_CHARACTERS = 10
const MAX_REPEATING_BLOCK_LENGTH = 16

function distinctCharacters({ value }: { value: string }): number {
    return new Set(value).size
}

function isRepeatedBlock({ value }: { value: string }): boolean {
    const lastBlockLength = Math.min(MAX_REPEATING_BLOCK_LENGTH, Math.floor(value.length / 2))
    return Array.from({ length: lastBlockLength }, (_, index) => index + 1).some((blockLength) => {
        return value.length % blockLength === 0 && value.slice(0, blockLength).repeat(value.length / blockLength) === value
    })
}

function weaknessOf({ name, value, minLength }: { name: string, value: string, minLength: number }): string[] {
    const tooShort = value.length < minLength ? [`${name} must be at least ${minLength} characters`] : []
    const lowEntropy = distinctCharacters({ value }) < MIN_DISTINCT_CHARACTERS || isRepeatedBlock({ value })
        ? [`${name} looks like a placeholder or a repeated pattern, generate a random one`]
        : []
    return [...tooShort, ...lowEntropy]
}

function assess({ jwtSecret, encryptionKey }: AssessParams): string[] {
    const jwtProblems = jwtSecret === undefined ? [] : weaknessOf({ name: 'FEMA_JWT_SECRET', value: jwtSecret, minLength: JWT_SECRET_MIN_LENGTH })
    const encryptionProblems = encryptionKey === undefined ? [] : weaknessOf({ name: 'FEMA_ENCRYPTION_KEY', value: encryptionKey, minLength: 1 })
    return [...jwtProblems, ...encryptionProblems]
}

export const secretStrength = {
    assess,
}

type AssessParams = {
    jwtSecret: string | undefined
    encryptionKey: string | undefined
}
