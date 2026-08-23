import { ConnectorAuth, createComponent, FlowComponentCategory, InputPropertyMap, Property } from '@fema-ipaas/component-sdk'

export const httpResponseComponent = createComponent({
    type: 'runtime/http-response',
    displayName: 'HTTP Response',
    description: 'Answer the HTTP request that started this run',
    category: FlowComponentCategory.RUNTIME,
    icon: 'reply',
    props: {
        responseType: Property.StaticDropdown({
            displayName: 'Response Type',
            required: true,
            defaultValue: 'json',
            options: {
                options: [
                    { label: 'JSON', value: 'json' },
                    { label: 'Raw', value: 'raw' },
                    { label: 'Redirect', value: 'redirect' },
                ],
            },
        }),
        fields: Property.DynamicProperties({
            auth: ConnectorAuth.None(),
            displayName: 'Response',
            required: true,
            refreshers: ['responseType'],
            props: async ({ responseType }): Promise<InputPropertyMap> => {
                if (!responseType) {
                    return {}
                }
                if (responseType === 'redirect') {
                    return {
                        body: Property.ShortText({
                            displayName: 'Redirect URL',
                            required: true,
                        }),
                    }
                }
                return {
                    status: Property.Number({
                        displayName: 'Status',
                        required: false,
                        defaultValue: HTTP_STATUS_OK,
                    }),
                    headers: Property.Object({
                        displayName: 'Headers',
                        required: false,
                    }),
                    body: responseType === 'json'
                        ? Property.Json({ displayName: 'JSON Body', required: true })
                        : Property.LongText({ displayName: 'Raw Body', required: true }),
                }
            },
        }),
        afterResponding: Property.StaticDropdown({
            displayName: 'After Responding',
            required: true,
            defaultValue: 'stop',
            options: {
                options: [
                    { label: 'Stop the workflow', value: 'stop' },
                    { label: 'Continue the workflow', value: 'continue' },
                ],
            },
        }),
    },
    async run(context) {
        const { responseType, fields, afterResponding } = context.input
        const values = isRecord(fields) ? fields : {}
        const response = buildResponse({
            responseType: String(responseType),
            body: values['body'],
            status: values['status'],
            headers: values['headers'],
        })
        if (afterResponding === 'continue') {
            context.run.respond({ response })
        }
        else {
            context.run.stop({ response })
        }
        return response
    },
})

export const stopComponent = createComponent({
    type: 'runtime/stop',
    displayName: 'Stop',
    description: 'End the workflow run here without running any later step',
    category: FlowComponentCategory.RUNTIME,
    icon: 'circle-stop',
    props: {},
    async run(context) {
        context.run.stop()
        return {}
    },
})

function buildResponse({ responseType, body, status, headers }: BuildResponseParams) {
    const baseHeaders = toHeaders(headers)
    if (responseType === 'redirect') {
        const url = ensureProtocol(String(body))
        return { status: HTTP_STATUS_MOVED_PERMANENTLY, headers: { ...baseHeaders, Location: url }, body: url }
    }
    return {
        status: toStatus(status),
        headers: baseHeaders,
        body: responseType === 'json' ? parseToJson(body) : body,
    }
}

function parseToJson(body: unknown): unknown {
    if (typeof body === 'string') {
        return JSON.parse(body)
    }
    return body
}

function ensureProtocol(url: string): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return `https://${url}`
    }
    return url
}

function toStatus(status: unknown): number {
    const parsed = Number(status)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : HTTP_STATUS_OK
}

function toHeaders(headers: unknown): Record<string, string> {
    if (!isRecord(headers)) {
        return {}
    }
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]))
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const HTTP_STATUS_OK = 200
const HTTP_STATUS_MOVED_PERMANENTLY = 301

type BuildResponseParams = {
    responseType: string
    body: unknown
    status: unknown
    headers: unknown
}
