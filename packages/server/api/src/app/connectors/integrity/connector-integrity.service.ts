import { isNil } from '@fema-ipaas/core-utils'
import { FileType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { fileService } from '../../file/file.service'
import { connectorRepos } from '../metadata/connector-metadata-service'
import { connectorIntegrity } from './connector-integrity'

export const connectorIntegrityService = (log: FastifyBaseLogger) => ({
    async verifyAll(tenantId: string): Promise<IntegrityReport> {
        const connectors = await connectorRepos().find({ where: { tenantId } })
        const results: IntegrityResult[] = []
        for (const connector of connectors) {
            results.push(await verifyOne({ log, connector }))
        }
        return {
            checked: results.length,
            verified: results.filter((result) => result.status === 'VERIFIED').length,
            mismatched: results.filter((result) => result.status === 'MISMATCH').length,
            unverifiable: results.filter((result) => result.status === 'UNVERIFIABLE').length,
            results,
        }
    },
})

async function verifyOne({ log, connector }: VerifyOneParams): Promise<IntegrityResult> {
    const identity = { name: connector.name, version: connector.version }
    if (isNil(connector.checksum)) {
        return { ...identity, status: 'UNVERIFIABLE', reason: 'no checksum was recorded at install' }
    }
    if (isNil(connector.archiveId)) {
        return { ...identity, status: 'UNVERIFIABLE', reason: 'no archive is stored for this connector' }
    }
    const archive = await fileService(log).getDataOrUndefined({
        fileId: connector.archiveId,
        type: FileType.PACKAGE_ARCHIVE,
    })
    if (isNil(archive)) {
        return { ...identity, status: 'UNVERIFIABLE', reason: 'the stored archive could not be read' }
    }
    const actual = connectorIntegrity.checksumOf(archive.data)
    if (actual !== connector.checksum) {
        return { ...identity, status: 'MISMATCH', reason: `recorded ${connector.checksum}, archive hashes to ${actual}` }
    }
    return { ...identity, status: 'VERIFIED' }
}

type VerifyOneParams = {
    log: FastifyBaseLogger
    connector: { name: string, version: string, checksum?: string, archiveId?: string }
}

export type IntegrityResult = {
    name: string
    version: string
    status: 'VERIFIED' | 'MISMATCH' | 'UNVERIFIABLE'
    reason?: string
}

export type IntegrityReport = {
    checked: number
    verified: number
    mismatched: number
    unverifiable: number
    results: IntegrityResult[]
}
