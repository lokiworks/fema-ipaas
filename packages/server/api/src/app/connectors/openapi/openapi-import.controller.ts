import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { GenerateConnectorFromOpenApiRequest, GenerateConnectorFromOpenApiResponse, ParseOpenApiRequest, ParseOpenApiResponse, PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { openApiConnectorGenerator } from './openapi-connector-generator'
import { openApiParser } from './openapi-parser'

export const openApiImportController: FastifyPluginAsyncZod = async (app) => {
    app.post('/parse', ParseRequest, async (request): Promise<ParseOpenApiResponse> => {
        return openApiParser.parse(parseDocument(request.body.document))
    })

    app.post('/generate', GenerateRequest, async (request): Promise<GenerateConnectorFromOpenApiResponse> => {
        const parsed = openApiParser.parse(parseDocument(request.body.document))
        const generated = openApiConnectorGenerator.generate({
            parsed,
            operationIds: request.body.operationIds,
            connectorName: request.body.connectorName,
            displayName: request.body.displayName,
        })
        return {
            connectorName: generated.connectorName,
            displayName: generated.displayName,
            baseUrl: generated.baseUrl,
            files: generated.files,
        }
    })
}

function parseDocument(raw: string): unknown {
    try {
        return JSON.parse(raw)
    }
    catch {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'The OpenAPI document must be valid JSON. Convert YAML to JSON before importing.' },
        })
    }
}

const adminOnly = securityAccess.tenantAdminOnly([PrincipalType.USER])

const ParseRequest = {
    config: { security: adminOnly },
    schema: {
        body: ParseOpenApiRequest,
        response: { [StatusCodes.OK]: ParseOpenApiResponse },
    },
}

const GenerateRequest = {
    config: { security: adminOnly },
    schema: {
        body: GenerateConnectorFromOpenApiRequest,
        response: { [StatusCodes.OK]: GenerateConnectorFromOpenApiResponse },
    },
}
