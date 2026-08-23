import { ConnectorMetadata, ConnectorMetadataModel } from '@fema-ipaas/connector-sdk'
import { ApplicationError, ErrorCode, isNil, TenantId, WorkspaceId } from '@fema-ipaas/core-utils'
import { AddConnectorRequestBody, ConnectorPackage, ConnectorSource, ConnectorType, EngineResponse, EngineResponseStatus, ExecuteExtractConnectorMetadata, FileCompression, FileId, FileType, PackageType, WorkerJobType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { fileService } from '../file/file.service'
import { userInteractionWatcher } from '../workers/user-interaction-watcher'
import { connectorIntegrity } from './integrity/connector-integrity'
import { connectorMetadataService } from './metadata/connector-metadata-service'

export const connectorInstallService = (log: FastifyBaseLogger) => ({
    async installConnector(
        tenantId: string,
        params: AddConnectorRequestBody,
    ): Promise<ConnectorMetadataModel> {
        try {
            const archive = params.packageType === PackageType.ARCHIVE && Buffer.isBuffer(params.connectorArchive.data)
                ? params.connectorArchive.data
                : undefined
            const checksum = isNil(archive) ? undefined : verifyArchive({ archive, params })
            const connectorPackage = await saveConnectorPackage(tenantId, params, log)
            const connectorInformation = await extractConnectorInformation({
                ...connectorPackage,
                tenantId,
            }, log)
            const archiveId = connectorPackage.packageType === PackageType.ARCHIVE ? connectorPackage.archiveId : undefined
            const savedConnector = await connectorMetadataService(log).create({
                connectorMetadata: {
                    ...connectorInformation,
                    minimumSupportedRelease:
                        connectorInformation.minimumSupportedRelease ?? '0.0.0',
                    maximumSupportedRelease:
                        connectorInformation.maximumSupportedRelease ?? '999.999.999',
                    name: connectorInformation.name,
                    version: connectorInformation.version,
                    i18n: connectorInformation.i18n,
                },
                packageType: params.packageType,
                tenantId,
                connectorType: ConnectorType.CUSTOM,
                source: ConnectorSource.PRIVATE,
                checksum,
                archiveId,
            })
            // Reconcile tool-search for this tenant only (async, never blocking the install) so the new
            // custom connector's actions/triggers become searchable. Scoped → the shared catalog is untouched.
            // Gated on the flag so an install never enqueues a reconcile while tool-search is disabled.
            return savedConnector
        }
        catch (error) {
            log.error({ error }, '[connectorInstallService#add] Failed to add connector')

            if (error instanceof ApplicationError && error.error.code === ErrorCode.VALIDATION) {
                throw error
            }
            throw new ApplicationError({
                code: ErrorCode.ENGINE_OPERATION_FAILURE,
                params: {
                    message: error instanceof Error ? error.message : String(error),
                },
            })
        }
    },
})


function verifyArchive({ archive, params }: { archive: Buffer, params: AddConnectorRequestBody }): string {
    const declaredChecksum = 'checksum' in params ? params.checksum : undefined
    const signature = 'signature' in params ? params.signature : undefined
    connectorIntegrity.assertSignatureValid({ archive, signature })
    return connectorIntegrity.assertChecksumMatches({ archive, expected: declaredChecksum })
}

async function saveConnectorPackage(tenantId: string | undefined, params: AddConnectorRequestBody, log: FastifyBaseLogger): Promise<ConnectorPackage> {

    switch (params.packageType) {
        case PackageType.ARCHIVE: {
            const archiveId = await saveArchive({
                workspaceId: undefined,
                tenantId,
                archive: params.connectorArchive.data as Buffer,
            }, log)
            return {
                ...params,
                connectorType: ConnectorType.CUSTOM,
                archiveId,
                tenantId: tenantId!,
                packageType: params.packageType,
            }
        }

        case PackageType.REGISTRY: {
            return {
                ...params,
                connectorType: ConnectorType.CUSTOM,
                tenantId: tenantId!,
            }
        }
    }
}

const extractConnectorInformation = async (request: ExecuteExtractConnectorMetadata, log: FastifyBaseLogger): Promise<ConnectorMetadata> => {
    const engineResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ConnectorMetadata>>({
        jobType: WorkerJobType.EXECUTE_EXTRACT_CONNECTOR_INFORMATION,
        tenantId: request.tenantId,
        connector: request,
        workspaceId: undefined,
    }, log)

    if (engineResponse.status !== EngineResponseStatus.OK) {
        throw new Error(engineResponse.error)
    }
    return engineResponse.response
}

const saveArchive = async (
    params: GetConnectorArchivePackageParams,
    log: FastifyBaseLogger,
): Promise<FileId> => {
    const { workspaceId, tenantId, archive } = params

    const archiveFile = await fileService(log).save({
        workspaceId: isNil(tenantId) ? workspaceId : undefined,
        tenantId,
        data: archive,
        size: archive.length,
        type: FileType.PACKAGE_ARCHIVE,
        compression: FileCompression.NONE,
    })

    return archiveFile.id
}

type GetConnectorArchivePackageParams = {
    archive: Buffer
    workspaceId?: WorkspaceId
    tenantId?: TenantId
}

