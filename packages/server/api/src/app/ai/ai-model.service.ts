import { safeHttp } from '@fema-ipaas/server-utils'
import {
    AI_CONNECTOR_NAME,
    AiFeature,
    AiModelConnection,
    ApplicationError,
    ConnectionStatus,
    ErrorCode,
    isNil,
    LlmCallParams,
    LlmConfig,
    LlmProvider,
    LlmResponse,
    llmWire,
    ProjectId,
    TenantId,
    tryCatch,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { connectionService } from '../connection/connection-service/connection-service'
import { aiUsageService } from './ai-usage.service'

export const aiModelService = (log: FastifyBaseLogger) => ({
    async listModelConnections({ projectId, tenantId }: ProjectScope): Promise<AiModelConnection[]> {
        const page = await connectionService(log).list({
            projectId,
            tenantId,
            connectorName: AI_CONNECTOR_NAME,
            cursorRequest: null,
            limit: MAX_MODEL_CONNECTIONS,
            status: [ConnectionStatus.ACTIVE],
            scope: undefined,
            displayName: undefined,
            externalIds: undefined,
        })
        return page.data.flatMap((connection) => {
            const config = configOf(connection.value)
            return isNil(config) ? [] : [{ externalId: connection.externalId, displayName: connection.displayName, provider: config.provider, model: config.model }]
        })
    },

    async resolveConfig({ projectId, tenantId, externalId }: ProjectScope & { externalId: string }): Promise<LlmConfig> {
        const connection = await connectionService(log).getOne({ projectId, tenantId, externalId })
        const config = isNil(connection) || connection.connectorName !== AI_CONNECTOR_NAME ? null : configOf(connection.value)
        if (isNil(config)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'Model connection not found in this project' },
            })
        }
        return config
    },

    async call({ params, usage }: { params: LlmCallParams, usage: UsageContext }): Promise<LlmResponse> {
        const request = llmWire.buildRequest(params)
        const { data, error } = await tryCatch(() => safeHttp.axios.post<unknown>(request.url, request.body, {
            headers: request.headers,
            timeout: MODEL_TIMEOUT_MS,
            validateStatus: () => true,
        }))
        if (error) {
            log.warn({ error, ai: { provider: params.config.provider, model: params.config.model } }, '[aiModelService#call] Model request failed')
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: `Could not reach the model: ${error.message}` } })
        }
        const parsed = await tryCatch(async () => llmWire.parseResponse({ provider: params.config.provider, body: data.data }))
        if (parsed.error) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: `Model error (HTTP ${data.status}): ${parsed.error.message}` } })
        }
        await tryCatch(() => aiUsageService(log).record({
            projectId: usage.projectId,
            feature: usage.feature,
            provider: params.config.provider,
            model: params.config.model,
            usage: parsed.data.usage,
            workflowId: usage.workflowId,
            userId: usage.userId,
        }))
        return parsed.data
    },
})

function configOf(value: unknown): LlmConfig | null {
    const parsed = ModelConnectionValue.safeParse(value)
    if (!parsed.success) {
        return null
    }
    const { provider, apiKey, model, baseUrl } = parsed.data.props
    return { provider, apiKey, model, ...(isNil(baseUrl) || baseUrl.length === 0 ? {} : { baseUrl }) }
}

const MAX_MODEL_CONNECTIONS = 50
const MODEL_TIMEOUT_MS = 120_000

const ModelConnectionValue = z.object({
    props: z.object({
        provider: z.enum(LlmProvider),
        apiKey: z.string().min(1),
        model: z.string().min(1),
        baseUrl: z.string().nullish(),
    }),
})

type ProjectScope = {
    projectId: ProjectId
    tenantId: TenantId
}

type UsageContext = {
    projectId: ProjectId
    feature: AiFeature
    workflowId?: string | null
    userId?: string | null
}
