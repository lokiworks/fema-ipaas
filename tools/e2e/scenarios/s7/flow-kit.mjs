import { api, env } from './lib.mjs'

export function connectorStep({ name, displayName, connectorName, connectorVersion = '~0.1.0', actionName, input, errorHandlingOptions = {}, nextAction }) {
  return {
    type: 'CONNECTOR',
    name,
    displayName,
    valid: true,
    lastUpdatedDate: new Date().toISOString(),
    settings: { connectorName, connectorVersion, actionName, input, propertySettings: {}, errorHandlingOptions },
    ...(nextAction ? { nextAction } : {}),
  }
}

export function webhookTrigger({ displayName = '接收请求', nextAction }) {
  return {
    name: 'trigger',
    type: 'CONNECTOR_TRIGGER',
    valid: true,
    displayName,
    lastUpdatedDate: new Date().toISOString(),
    settings: {
      connectorName: '@fema-ipaas/connector-webhook',
      connectorVersion: '~0.1.0',
      triggerName: 'catch_webhook',
      input: { authType: 'none', authFields: {} },
      propertySettings: {},
    },
    nextAction,
  }
}

export function mcpCallStep({ name, displayName, externalId, tool, args, nextAction }) {
  return connectorStep({
    name,
    displayName,
    connectorName: '@fema-ipaas/connector-mcp',
    actionName: 'call_tool',
    input: { auth: `{{connections['${externalId}']}}`, tool, arguments: args },
    nextAction,
  })
}

export function respondStep({ name = 'respond', body, nextAction }) {
  return connectorStep({
    name,
    displayName: '返回结果',
    connectorName: '@fema-ipaas/connector-webhook',
    actionName: 'return_response',
    input: { responseType: 'json', fields: { status: 200, body }, respond: 'stop' },
    nextAction,
  })
}

export async function createFlow({ session, displayName, trigger }) {
  const { token, projectId } = session
  const created = await api({ method: 'POST', url: '/v1/workflows', token, body: { displayName, projectId } })
  const imported = await api({
    method: 'POST',
    url: `/v1/workflows/${created.json.id}?projectId=${projectId}`,
    token,
    body: { type: 'IMPORT_WORKFLOW', request: { displayName, trigger, schemaVersion: null, notes: null } },
  })
  if (imported.status !== 200) {
    throw new Error(`import flow failed: ${imported.status} ${imported.text.slice(0, 300)}`)
  }
  return created.json.id
}

export async function runDraftSync({ workflowId, body, timeoutMs = 180000 }) {
  const response = await fetch(`${env.api}/v1/webhooks/${workflowId}/draft/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: response.status, text: await response.text() }
}

export async function latestRun({ session, workflowId }) {
  const list = await api({ url: `/v1/run-logs?projectId=${session.projectId}&workflowId=${workflowId}&type=ALL&limit=5`, token: session.token })
  return (list.json?.data ?? [])[0] ?? null
}

export async function runDetail({ session, runId }) {
  const detail = await api({ url: `/v1/executions/${runId}?projectId=${session.projectId}`, token: session.token })
  return detail.json
}
