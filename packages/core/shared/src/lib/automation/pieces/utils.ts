import { assertNotNullOrUndefined, ErrorCode, PlatformError } from '@fema/core-utils'

/**
 * @param {string} pieceName - starts with `@fema/connector-`
 * @param {string} pieceVersion - the version of the piece
 * @returns {string} the package alias for the piece, e.g. `@fema/connector-activepieces-0.0.1`
 */
export const getPackageAliasForPiece = (params: GetPackageAliasForPieceParams): string => {
    const { pieceName, pieceVersion } = params
    return `${pieceName}-${pieceVersion}`
}

/**
 * @param {string} alias - e.g. connector-slack or @publisher/connector-slack or slack or @publisher/slack
 * @returns {string} the piece name, e.g. slack
 */
export const getPieceNameFromAlias = (alias: string): string => {
    const fullPieceName = alias.startsWith('@') ? alias.split('/').pop() : alias
    assertNotNullOrUndefined(fullPieceName, 'Full piece name')
    if (fullPieceName.startsWith('connector-')) {
        return fullPieceName.slice('connector-'.length)
    }
    return fullPieceName
}

/**
 * @param {string} alias - e.g. `@fema/connector-activepieces-0.0.1`
 * @returns {string} the piece name, e.g. `@fema/connector-activepieces`
 */
export const trimVersionFromAlias = (alias: string): string => {
    return alias.split('-').slice(0, -1).join('-')
}



export const extractPieceFromModule = <T>(params: ExtractPieceFromModuleParams): T => {
    const { module, pieceName, pieceVersion } = params
    const exports = Object.values(module)
    const constructors = []
    for (const e of exports) {
        if (e !== null && e !== undefined && e.constructor.name === 'Piece') {
            return e as T
        }
        constructors.push(e?.constructor?.name)
    }

    throw new PlatformError({
        code: ErrorCode.ENTITY_NOT_FOUND,
        params: {
            entityType: 'piece',
            entityId: pieceName,
            message: `Failed to extract piece from module (version: ${pieceVersion}), found constructors: ${constructors.join(', ')}`,
            extra: { pieceName, pieceVersion },
        },
    })
}

export { getPieceMajorAndMinorVersion } from './version-utils'

type GetPackageAliasForPieceParams = {
    pieceName: string
    pieceVersion: string
}

type ExtractPieceFromModuleParams = {
    module: Record<string, unknown>
    pieceName: string
    pieceVersion: string
}
export const MAX_KEY_LENGTH_FOR_CORWDIN = 512
