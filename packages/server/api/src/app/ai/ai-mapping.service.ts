import {
    AiFeature,
    llmWire,
    SuggestFieldMappingRequestBody,
    SuggestFieldMappingResponse,
    TenantId,
    tryCatchSync,
    UserId,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { aiModelService } from './ai-model.service'

export const aiMappingService = (log: FastifyBaseLogger) => ({
    async suggest({ request, tenantId, userId }: { request: SuggestFieldMappingRequestBody, tenantId: TenantId, userId: UserId }): Promise<SuggestFieldMappingResponse> {
        const config = await aiModelService(log).resolveConfig({ projectId: request.projectId, tenantId, userId, externalId: request.modelConnectionExternalId })
        const response = await aiModelService(log).call({
            params: {
                config,
                system: MAPPING_SYSTEM_PROMPT,
                messages: [{
                    role: 'user',
                    content: [{ type: 'text', text: JSON.stringify({ targets: request.targets, sources: request.sources }) }],
                }],
                maxTokens: MAPPING_MAX_TOKENS,
                jsonOutput: true,
            },
            usage: { projectId: request.projectId, feature: AiFeature.AUTO_MAPPING, userId },
        })
        const text = llmWire.textOf(response)
        const start = text.indexOf('{')
        const end = text.lastIndexOf('}')
        const { data } = tryCatchSync(() => JSON.parse(start === -1 || end <= start ? '{}' : text.slice(start, end + 1)))
        const parsed = ModelReply.safeParse(data)
        const knownPaths = new Set(request.sources.map((source) => source.path))
        const knownTargets = new Set(request.targets)
        const suggestions = parsed.success
            ? parsed.data.suggestions
                .filter((suggestion) => knownTargets.has(suggestion.target) && knownPaths.has(suggestion.sourcePath))
                .map((suggestion) => ({ ...suggestion, confidence: Math.min(Math.max(suggestion.confidence, 0), 1) }))
            : []
        return { suggestions, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens }
    },
})

const MAPPING_MAX_TOKENS = 2048
const MAPPING_SYSTEM_PROMPT = [
    'You map fields between business systems.',
    'Given target field names and source paths with sample values, pick at most one source path for each target.',
    'Only use source paths from the list. Skip targets with no reasonable source.',
    'confidence is between 0 and 1: 0.95 for the same meaning and format, lower when the format differs or you are guessing.',
    'Reply with JSON only: {"suggestions": [{"target": string, "sourcePath": string, "confidence": number}]}',
].join('\n')

const ModelReply = z.object({
    suggestions: z.array(z.object({
        target: z.string(),
        sourcePath: z.string(),
        confidence: z.number(),
    })),
})
