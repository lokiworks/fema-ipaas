import { ConnectorMetadataModel } from '@fema/connector-sdk'
import { AddConnectorRequestBody, PrincipalType } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
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
                security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
            },
            preValidation: attachMultipartFieldsToBody,
            schema: {
                body: AddConnectorRequestBody,
            },
        },
        async (req, res): Promise<ConnectorMetadataModel> => {
            const platformId = req.principal.platform.id
            const connectorMetadata = await connectorInstallService(req.log).installConnector(
                platformId,
                req.body,
            )
            return res.code(StatusCodes.CREATED).send(connectorMetadata)
        },
    )
}
