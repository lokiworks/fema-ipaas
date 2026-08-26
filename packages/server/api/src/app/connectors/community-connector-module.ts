import { ConnectorMetadataModel } from '@fema-ipaas/connector-sdk'
import { AddConnectorRequestBody, ApplicationEventName, PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { attachMultipartFieldsToBody } from '../helper/multipart-body'
import { connectorInstallService } from './connector-install-service'

export const communityConnectorsModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(communityConnectorsController, { prefix: '/v1/connectors' })
}

const communityConnectorsController: FastifyPluginAsyncZod = async (app) => {
    app.post(
        '/',
        {
            config: {
                security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
            },
            preValidation: attachMultipartFieldsToBody,
            schema: {
                tags: ['connectors'],
                description: 'Install a connector into the tenant from npm or an uploaded archive.',
                body: AddConnectorRequestBody,
            },
        },
        async (req, res): Promise<ConnectorMetadataModel> => {
            const tenantId = req.principal.tenant.id
            const connectorMetadata = await connectorInstallService(req.log).installConnector(
                tenantId,
                req.body,
            )
            applicationEvents(req.log).sendUserEvent(req, {
                action: ApplicationEventName.CONNECTOR_PUBLISHED,
                data: {
                    connector: {
                        name: connectorMetadata.name,
                        version: connectorMetadata.version,
                    },
                },
            })
            return res.code(StatusCodes.CREATED).send(connectorMetadata)
        },
    )
}
