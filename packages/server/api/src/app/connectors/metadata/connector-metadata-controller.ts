import { ConnectorMetadataModel, ConnectorMetadataModelSummary } from '@fema/connector-sdk'
import { ErrorCode, isNil, LocalesEnum, PlatformError } from '@fema/core-utils'
import { ALL_PRINCIPAL_TYPES, ConnectorAudienceFilter, ConnectorCategory, ConnectorOptionRequest, EngineResponse, GetConnectorRequestParams, GetConnectorRequestQuery, GetConnectorRequestWithScopeParams, ListConnectorsRequestQuery, Principal, PrincipalType, RegistryConnectorsRequestQuery, SampleDataFileType, WorkerJobType } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { WorkspaceResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { flowService } from '../../flows/flow/flow.service'
import { sampleDataService } from '../../flows/step-run/sample-data.service'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { connectorSyncService } from '../connector-sync-service'
import { resolveVisibility } from '../connector-visibility'
import { connectorMetadataService, getConnectorPackageWithoutArchive } from './connector-metadata-service'
import { filterActionsByAudience } from './utils'

export const connectorModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(baseConnectorsController, { prefix: '/v1/connectors' })
}

const baseConnectorsController: FastifyPluginAsyncZod = async (app) => {

    app.get(
        '/categories',
        ListCategoriesRequest,
        async (): Promise<ConnectorCategory[]> => {
            return Object.values(ConnectorCategory)
        },
    )

    app.get('/', ListConnectorsRequest, async (req): Promise<ConnectorMetadataModelSummary[]> => {
        const query = req.query

        const oldSyncCall = !isNil(query.release)
        if (oldSyncCall) {
            throw new PlatformError({
                code: ErrorCode.CONNECTOR_SYNC_NOT_SUPPORTED,
                params: {
                    message: 'This endpoint is deprecated. Please use it without release parameter.',
                    release: query.release ?? '',
                },
            })
        }
        const platformId = getPlatformId(req.principal)
        const workspaceId = req.query.workspaceId
        const connectorMetadataSummary = await connectorMetadataService(req.log).list({
            includeHidden: query.includeHidden ?? false,
            workspaceId,
            platformId,
            categories: query.categories,
            searchQuery: query.searchQuery,
            sortBy: query.sortBy,
            orderBy: query.orderBy,
            suggestionType: query.suggestionType,
            locale: query.locale as LocalesEnum | undefined,
            audience: query.audience,
        })
        return connectorMetadataSummary.map((connector) => ({
            ...connector,
            i18n: undefined,
        }))
    })

    app.get(
        '/:scope/:name',
        GetConnectorParamsWithScopeRequest,
        async (req) => {
            const { name, scope } = req.params
            const { version } = req.query

            const decodeScope = decodeURIComponent(scope)
            const decodedName = decodeURIComponent(name)
            const platformId = getPlatformId(req.principal)
            const connector = await connectorMetadataService(req.log).getOrThrow({
                platformId,
                name: `${decodeScope}/${decodedName}`,
                version,
                locale: req.query.locale as LocalesEnum | undefined,
            })
            const policy = await resolveVisibility({ platformId, workspaceId: req.query.workspaceId, log: req.log })
            const visibleConnector = applyVisibilityPolicy({ policy, connector })
            return filterModelActionsByAudience(visibleConnector, req.query.audience)
        },
    )

    app.get(
        '/:name',
        GetConnectorParamsRequest,
        async (req): Promise<ConnectorMetadataModel> => {
            const { name } = req.params
            const { version } = req.query
            const decodedName = decodeURIComponent(name)
            const platformId = getPlatformId(req.principal)
            const connector = await connectorMetadataService(req.log).getOrThrow({
                platformId,
                name: decodedName,
                version,
                locale: req.query.locale as LocalesEnum | undefined,
            })
            const policy = await resolveVisibility({ platformId, workspaceId: req.query.workspaceId, log: req.log })
            const visibleConnector = applyVisibilityPolicy({ policy, connector })
            return filterModelActionsByAudience(visibleConnector, req.query.audience)
        },
    )

    app.get('/registry', RegistryConnectorsRequest, async (req) => {
        const connectors = await connectorMetadataService(req.log).registry({
            release: req.query.release,
            platformId: getPlatformId(req.principal),
        })
        return connectors
    })

    app.post('/sync', SyncConnectorsRequest, async (req) => connectorSyncService(req.log).sync({ publishCacheRefresh: true }))

    app.delete('/:id', DeleteConnectorRequest, async (req, reply) => {
        await connectorMetadataService(req.log).delete({
            id: req.params.id,
            platformId: req.principal.platform.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.post(
        '/options',
        OptionsConnectorRequest,
        async (req) => {
            const workspaceId = req.workspaceId
            const platform = req.principal.platform
            const flow = await flowService(req.log).getOnePopulatedOrThrow({
                workspaceId,
                id: req.body.flowId,
                versionId: req.body.flowVersionId,
            })
            const sampleData = await sampleDataService(req.log).getSampleDataForFlow(workspaceId, flow.version, SampleDataFileType.OUTPUT)
            const { response } = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<unknown>>({
                jobType: WorkerJobType.EXECUTE_PROPERTY,
                platformId: platform.id,
                workspaceId,
                flowVersion: flow.version,
                propertyName: req.body.propertyName,
                actionOrTriggerName: req.body.actionOrTriggerName,
                input: req.body.input,
                sampleData,
                searchValue: req.body.searchValue,
                connector: await getConnectorPackageWithoutArchive(req.log, platform.id, req.body),
            }, req.log)
            return response
        },
    )

}

function getPlatformId(principal: Principal): string | undefined {
    return principal.type === PrincipalType.WORKER || principal.type === PrincipalType.UNKNOWN || principal.type === PrincipalType.ONBOARDING ? undefined : principal.platform?.id
}

function filterModelActionsByAudience(connector: ConnectorMetadataModel, audience: ConnectorAudienceFilter | undefined): ConnectorMetadataModel {
    return {
        ...connector,
        actions: filterActionsByAudience(connector.actions, audience),
    }
}

function applyVisibilityPolicy({ policy, connector }: { policy: Awaited<ReturnType<typeof resolveVisibility>>, connector: ConnectorMetadataModel }): ConnectorMetadataModel {
    if (isNil(policy)) {
        return connector
    }
    if (!policy.isConnectorVisible(connector.name)) {
        throw new PlatformError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { message: `connector_metadata_not_found connectorName=${connector.name}` },
        })
    }
    return policy.filterConnectorComponents(connector)
}

const RegistryConnectorsRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        querystring: RegistryConnectorsRequestQuery,
    },
}

const ListConnectorsRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        querystring: ListConnectorsRequestQuery,

    },

}
const GetConnectorParamsRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        params: GetConnectorRequestParams,
        querystring: GetConnectorRequestQuery,
    },
}

const GetConnectorParamsWithScopeRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        params: GetConnectorRequestWithScopeParams,
        querystring: GetConnectorRequestQuery,
    },
}

const ListCategoriesRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        querystring: ListConnectorsRequestQuery,
    },
}

const OptionsConnectorRequest = {
    schema: {
        body: ConnectorOptionRequest,
    },
    config: {
        security: securityAccess.workspace([PrincipalType.USER], undefined, {
            type: WorkspaceResourceType.BODY,
        }),
    },
}

const SyncConnectorsRequest = {
    config: {
        security: securityAccess.publicPlatform([PrincipalType.USER]),
    },
}

const DeleteConnectorRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['connectors'],
        params: z.object({
            id: z.string(),
        }),
    },
}
