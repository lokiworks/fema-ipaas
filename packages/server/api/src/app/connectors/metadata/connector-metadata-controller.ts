import { ConnectorMetadataModel, ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk'
import { ApplicationError, ErrorCode, isNil, LocalesEnum } from '@fema-ipaas/core-utils'
import { ALL_PRINCIPAL_TYPES, ConnectorAudienceFilter, ConnectorCategory, ConnectorOptionRequest, EngineResponse, GetConnectorRequestParams, GetConnectorRequestQuery, GetConnectorRequestWithScopeParams, ListConnectorsRequestQuery, Principal, PrincipalType, RegistryConnectorsRequestQuery, SampleDataFileType, WorkerJobType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { WorkspaceResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { sampleDataService } from '../../workflows/step-run/sample-data.service'
import { workflowService } from '../../workflows/workflow/workflow.service'
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
            throw new ApplicationError({
                code: ErrorCode.CONNECTOR_SYNC_NOT_SUPPORTED,
                params: {
                    message: 'This endpoint is deprecated. Please use it without release parameter.',
                    release: query.release ?? '',
                },
            })
        }
        const tenantId = getTenantId(req.principal)
        const workspaceId = req.query.workspaceId
        const connectorMetadataSummary = await connectorMetadataService(req.log).list({
            includeHidden: query.includeHidden ?? false,
            workspaceId,
            tenantId,
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
            const tenantId = getTenantId(req.principal)
            const connector = await connectorMetadataService(req.log).getOrThrow({
                tenantId,
                name: `${decodeScope}/${decodedName}`,
                version,
                locale: req.query.locale as LocalesEnum | undefined,
            })
            const policy = await resolveVisibility({ tenantId, workspaceId: req.query.workspaceId, log: req.log })
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
            const tenantId = getTenantId(req.principal)
            const connector = await connectorMetadataService(req.log).getOrThrow({
                tenantId,
                name: decodedName,
                version,
                locale: req.query.locale as LocalesEnum | undefined,
            })
            const policy = await resolveVisibility({ tenantId, workspaceId: req.query.workspaceId, log: req.log })
            const visibleConnector = applyVisibilityPolicy({ policy, connector })
            return filterModelActionsByAudience(visibleConnector, req.query.audience)
        },
    )

    app.get('/registry', RegistryConnectorsRequest, async (req) => {
        const connectors = await connectorMetadataService(req.log).registry({
            release: req.query.release,
            tenantId: getTenantId(req.principal),
        })
        return connectors
    })

    app.post('/sync', SyncConnectorsRequest, async (req) => connectorSyncService(req.log).sync({ publishCacheRefresh: true }))

    app.delete('/:id', DeleteConnectorRequest, async (req, reply) => {
        await connectorMetadataService(req.log).delete({
            id: req.params.id,
            tenantId: req.principal.tenant.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.post(
        '/options',
        OptionsConnectorRequest,
        async (req) => {
            const workspaceId = req.workspaceId
            const tenant = req.principal.tenant
            const workflow = await workflowService(req.log).getOnePopulatedOrThrow({
                workspaceId,
                id: req.body.workflowId,
                versionId: req.body.workflowVersionId,
            })
            const sampleData = await sampleDataService(req.log).getSampleDataForWorkflow(workspaceId, workflow.version, SampleDataFileType.OUTPUT)
            const { response } = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<unknown>>({
                jobType: WorkerJobType.EXECUTE_PROPERTY,
                tenantId: tenant.id,
                workspaceId,
                workflowVersion: workflow.version,
                propertyName: req.body.propertyName,
                actionOrTriggerName: req.body.actionOrTriggerName,
                input: req.body.input,
                sampleData,
                searchValue: req.body.searchValue,
                componentType: req.body.componentType,
                connector: isNil(req.body.componentType) && !isNil(req.body.connectorName) && !isNil(req.body.connectorVersion)
                    ? await getConnectorPackageWithoutArchive(req.log, tenant.id, {
                        connectorName: req.body.connectorName,
                        connectorVersion: req.body.connectorVersion,
                    })
                    : undefined,
            }, req.log)
            return response
        },
    )

}

function getTenantId(principal: Principal): string | undefined {
    return principal.type === PrincipalType.WORKER || principal.type === PrincipalType.UNKNOWN || principal.type === PrincipalType.ONBOARDING ? undefined : principal.tenant?.id
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
        throw new ApplicationError({
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
        security: securityAccess.publicTenant([PrincipalType.USER]),
    },
}

const DeleteConnectorRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['connectors'],
        params: z.object({
            id: z.string(),
        }),
    },
}
