import { PieceMetadataModel, PieceMetadataModelSummary } from '@activepieces/pieces-framework'
import { FastifyBaseLogger } from 'fastify'
import { PieceMetadataSchema } from './metadata/piece-metadata-entity'

export async function resolveVisibility(_params: ResolveVisibilityParams): Promise<VisibilityPolicy | null> {
    return null
}

export type VisibilityPolicy = {
    isPieceVisible(name: string): boolean
    filterPieces(pieces: PieceMetadataSchema[]): PieceMetadataSchema[]
    filterComponents(summaries: PieceMetadataModelSummary[]): PieceMetadataModelSummary[]
    filterPieceComponents(piece: PieceMetadataModel): PieceMetadataModel
}

type ResolveVisibilityParams = {
    platformId: string | undefined
    projectId: string | undefined
    log: FastifyBaseLogger
}
