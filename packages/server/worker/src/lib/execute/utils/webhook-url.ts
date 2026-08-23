export function getWebhookUrl(publicApiUrl: string, workflowId: string, simulate?: boolean): string {
    const suffix = simulate ? '/test' : ''
    const cleanUrl = publicApiUrl.replace(/\/+$/, '')
    return `${cleanUrl}/v1/webhooks/${workflowId}${suffix}`
}

export function getAppWebhookUrl(publicApiUrl: string, appName: string): string {
    const cleanUrl = publicApiUrl.replace(/\/+$/, '')
    return `${cleanUrl}/v1/app-events/${appName}`
}
