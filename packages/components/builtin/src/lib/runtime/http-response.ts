import { createComponent, FlowComponentCategory, Property } from '@fema-ipaas/component-sdk'

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
        body: Property.Json({
            displayName: 'Body',
            description: 'The JSON body, the raw body, or the redirect URL depending on the response type',
            required: true,
        }),
        status: Property.Number({
            displayName: 'Status',
            description: 'Ignored for a redirect, which always answers 301',
            required: false,
            defaultValue: 200,
        }),
        headers: Property.Object({
            displayName: 'Headers',
            required: false,
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
        const { responseType, body, status, headers, afterResponding } = context.input
        const response = buildResponse({ responseType: String(responseType), body, status, headers })
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
    if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
        return {}
    }
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]))
}

const HTTP_STATUS_OK = 200
const HTTP_STATUS_MOVED_PERMANENTLY = 301

type BuildResponseParams = {
    responseType: string
    body: unknown
    status: unknown
    headers: unknown
}
