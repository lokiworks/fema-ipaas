function escape(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export const likePatternUtils = { escape }
