import { z } from 'zod/mini'

export enum LlmProvider {
    ANTHROPIC = 'ANTHROPIC',
    OPENAI = 'OPENAI',
    DEEPSEEK = 'DEEPSEEK',
    OPENAI_COMPATIBLE = 'OPENAI_COMPATIBLE',
}

export const llmWire = {
    buildRequest,
    parseResponse,
    defaultBaseUrl,
    textOf,
}

function buildRequest({ config, system, messages, tools, maxTokens, jsonOutput }: LlmCallParams): LlmHttpRequest {
    const baseUrl = trimSlash(config.baseUrl === undefined || config.baseUrl.trim().length === 0 ? defaultBaseUrl(config.provider) : config.baseUrl.trim())
    if (config.provider === LlmProvider.ANTHROPIC) {
        return {
            url: `${baseUrl}/v1/messages`,
            headers: {
                'content-type': 'application/json',
                'x-api-key': config.apiKey,
                'anthropic-version': ANTHROPIC_VERSION,
            },
            body: {
                model: config.model,
                max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
                ...(system === undefined ? {} : { system: jsonOutput === true ? `${system}\n\n${JSON_ONLY_HINT}` : system }),
                messages: messages.map(toAnthropicMessage),
                ...(tools === undefined || tools.length === 0 ? {} : { tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })) }),
            },
        }
    }
    return {
        url: `${baseUrl}/chat/completions`,
        headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${config.apiKey}`,
        },
        body: {
            model: config.model,
            ...(config.provider === LlmProvider.OPENAI ? { max_completion_tokens: maxTokens ?? DEFAULT_MAX_TOKENS } : { max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS }),
            messages: [
                ...(system === undefined ? [] : [{ role: 'system', content: system }]),
                ...messages.flatMap(toOpenAiMessages),
            ],
            ...(tools === undefined || tools.length === 0 ? {} : { tools: tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) }),
            ...(jsonOutput === true ? { response_format: { type: 'json_object' } } : {}),
        },
    }
}

function parseResponse({ provider, body }: { provider: LlmProvider, body: unknown }): LlmResponse {
    if (provider === LlmProvider.ANTHROPIC) {
        const parsed = AnthropicResponse.safeParse(body)
        if (!parsed.success) {
            throw new Error(errorMessageOf(body))
        }
        const content: LlmContent[] = parsed.data.content.flatMap((block): LlmContent[] => {
            if (block.type === 'text' && block.text !== undefined) {
                return [{ type: 'text', text: block.text }]
            }
            if (block.type === 'tool_use' && block.id !== undefined && block.name !== undefined) {
                return [{ type: 'tool_call', id: block.id, name: block.name, arguments: block.input ?? {} }]
            }
            return []
        })
        return {
            content,
            usage: { inputTokens: parsed.data.usage?.input_tokens ?? 0, outputTokens: parsed.data.usage?.output_tokens ?? 0 },
            truncated: parsed.data.stop_reason === 'max_tokens',
        }
    }
    const parsed = OpenAiResponse.safeParse(body)
    if (!parsed.success || parsed.data.choices.length === 0) {
        throw new Error(errorMessageOf(body))
    }
    const choice = parsed.data.choices[0]
    const text = choice.message.content ?? ''
    const calls: LlmContent[] = (choice.message.tool_calls ?? []).map((call) => ({
        type: 'tool_call',
        id: call.id,
        name: call.function.name,
        arguments: parseArguments(call.function.arguments),
    }))
    return {
        content: [...textBlocks(text), ...calls],
        usage: { inputTokens: parsed.data.usage?.prompt_tokens ?? 0, outputTokens: parsed.data.usage?.completion_tokens ?? 0 },
        truncated: choice.finish_reason === 'length',
    }
}

function defaultBaseUrl(provider: LlmProvider): string {
    switch (provider) {
        case LlmProvider.ANTHROPIC:
            return 'https://api.anthropic.com'
        case LlmProvider.OPENAI:
            return 'https://api.openai.com/v1'
        case LlmProvider.DEEPSEEK:
            return 'https://api.deepseek.com/v1'
        case LlmProvider.OPENAI_COMPATIBLE:
            return 'http://localhost:11434/v1'
    }
}

function textOf(response: LlmResponse): string {
    return response.content.map((block) => (block.type === 'text' ? block.text : '')).join('').trim()
}

function toAnthropicMessage(message: LlmMessage): Record<string, unknown> {
    return {
        role: message.role,
        content: message.content.map((block) => {
            switch (block.type) {
                case 'text':
                    return { type: 'text', text: block.text }
                case 'tool_call':
                    return { type: 'tool_use', id: block.id, name: block.name, input: block.arguments }
                case 'tool_result':
                    return { type: 'tool_result', tool_use_id: block.toolCallId, content: block.content, is_error: block.isError }
            }
        }),
    }
}

function toOpenAiMessages(message: LlmMessage): Record<string, unknown>[] {
    const results = message.content.flatMap((block) => (block.type === 'tool_result' ? [{ role: 'tool', tool_call_id: block.toolCallId, content: block.content }] : []))
    const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
    const calls = message.content.flatMap((block) => (block.type === 'tool_call' ? [{ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.arguments) } }] : []))
    if (results.length > 0) {
        return results
    }
    if (calls.length > 0) {
        return [{ role: 'assistant', content: text.length > 0 ? text : null, tool_calls: calls }]
    }
    return [{ role: message.role, content: text }]
}

function textBlocks(text: string): LlmContent[] {
    return text.length > 0 ? [{ type: 'text', text }] : []
}

function parseArguments(raw: string): Record<string, unknown> {
    try {
        const value: unknown = JSON.parse(raw)
        const parsed = JsonObject.safeParse(value)
        return parsed.success ? parsed.data : {}
    }
    catch {
        return {}
    }
}

function errorMessageOf(body: unknown): string {
    const parsed = ProviderError.safeParse(body)
    if (parsed.success) {
        const error = parsed.data.error
        return typeof error === 'string' ? error : error.message ?? 'Model provider returned an error'
    }
    return 'Model provider returned an unexpected response'
}

function trimSlash(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url
}

const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MAX_TOKENS = 4096
const JSON_ONLY_HINT = 'Reply with a single JSON object and nothing else.'

const JsonObject = z.record(z.string(), z.unknown())

const AnthropicResponse = z.object({
    content: z.array(z.object({
        type: z.string(),
        text: z.optional(z.string()),
        id: z.optional(z.string()),
        name: z.optional(z.string()),
        input: z.optional(JsonObject),
    })),
    stop_reason: z.optional(z.nullable(z.string())),
    usage: z.optional(z.object({ input_tokens: z.number(), output_tokens: z.number() })),
})

const OpenAiResponse = z.object({
    choices: z.array(z.object({
        message: z.object({
            content: z.optional(z.nullable(z.string())),
            tool_calls: z.optional(z.array(z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string() }),
            }))),
        }),
        finish_reason: z.optional(z.nullable(z.string())),
    })),
    usage: z.optional(z.object({ prompt_tokens: z.number(), completion_tokens: z.number() })),
})

const ProviderError = z.object({
    error: z.union([z.string(), z.object({ message: z.optional(z.string()) })]),
})

export type LlmConfig = {
    provider: LlmProvider
    apiKey: string
    model: string
    baseUrl?: string
}

export type LlmContent =
    | { type: 'text', text: string }
    | { type: 'tool_call', id: string, name: string, arguments: Record<string, unknown> }
    | { type: 'tool_result', toolCallId: string, content: string, isError?: boolean }

export type LlmMessage = {
    role: 'user' | 'assistant'
    content: LlmContent[]
}

export type LlmTool = {
    name: string
    description: string
    inputSchema: Record<string, unknown>
}

export type LlmCallParams = {
    config: LlmConfig
    system?: string
    messages: LlmMessage[]
    tools?: LlmTool[]
    maxTokens?: number
    jsonOutput?: boolean
}

export type LlmHttpRequest = {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
}

export type LlmUsage = {
    inputTokens: number
    outputTokens: number
}

export type LlmResponse = {
    content: LlmContent[]
    usage: LlmUsage
    truncated: boolean
}
