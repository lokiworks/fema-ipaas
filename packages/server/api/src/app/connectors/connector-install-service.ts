import { ConnectorMetadata, ConnectorMetadataModel } from '@fema/connector-sdk'
import { ErrorCode, isNil, PlatformError, PlatformId, WorkspaceId } from '@fema/core-utils'
import { AddConnectorRequestBody, ConnectorPackage, ConnectorType, EngineResponse, EngineResponseStatus, ExecuteExtractConnectorMetadata, FileCompression, FileId, FileType, PackageType, WorkerJobType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { fileService } from '../file/file.service'
import { userInteractionWatcher } from '../workers/user-interaction-watcher'
import { connectorMetadataService } from './metadata/connector-metadata-service'

export const connectorInstallService = (log: FastifyBaseLogger) => ({
    async installConnector(
        platformId: string,
        params: AddConnectorRequestBody,
    ): Promise<ConnectorMetadataModel> {
        try {
            const connectorPackage = await saveConnectorPackage(platformId, params, log)
            const connectorInformation = await extractConnectorInformation({
                ...connectorPackage,
                platformId,
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
                platformId,
                connectorType: ConnectorType.CUSTOM,
                archiveId,
            })
            // Reconcile tool-search for this tenant only (async, never blocking the install) so the new
            // custom connector's actions/triggers become searchable. Scoped → the shared catalog is untouched.
            // Gated on the flag so an install never enqueues a reconcile while tool-search is disabled.
            return savedConnector
        }
        catch (error) {
            log.error({ error }, '[connectorInstallService#add] Failed to add connector')

            if (error instanceof PlatformError && error.error.code === ErrorCode.VALIDATION) {
                throw error
            }
            throw new PlatformError({
                code: ErrorCode.ENGINE_OPERATION_FAILURE,
                params: {
                    message: error instanceof Error ? error.message : String(error),
                },
            })
        }
    },
})


async function saveConnectorPackage(platformId: string | undefined, params: AddConnectorRequestBody, log: FastifyBaseLogger): Promise<ConnectorPackage> {

    switch (params.packageType) {
        case PackageType.ARCHIVE: {
            const archiveId = await saveArchive({
                workspaceId: undefined,
                platformId,
                archive: params.connectorArchive.data as Buffer,
            }, log)
            return {
                ...params,
                connectorType: ConnectorType.CUSTOM,
                archiveId,
                platformId: platformId!,
                packageType: params.packageType,
            }
        }

        case PackageType.REGISTRY: {
            return {
                ...params,
                connectorType: ConnectorType.CUSTOM,
                platformId: platformId!,
            }
        }
    }
}

const extractConnectorInformation = async (request: ExecuteExtractConnectorMetadata, log: FastifyBaseLogger): Promise<ConnectorMetadata> => {
    const engineResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ConnectorMetadata>>({
        jobType: WorkerJobType.EXECUTE_EXTRACT_CONNECTOR_INFORMATION,
        platformId: request.platformId,
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
    const { workspaceId, platformId, archive } = params

    const archiveFile = await fileService(log).save({
        workspaceId: isNil(platformId) ? workspaceId : undefined,
        platformId,
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
    platformId?: PlatformId
}

