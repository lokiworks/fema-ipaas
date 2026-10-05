import { api, assert, check, codeStep, http, sleep, summary, waitFor, webhookTrigger } from './s5-kit.mjs'

const SLOT = Number(process.env.E2E_SLOT ?? 1)
const STATE_DIR = process.env.E2E_STATE_DIR ?? `/tmp/fema-e2e/slot-${SLOT}`
const ADMIN_USER = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@corp.test',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'Passw0rd!x1',
  firstName: '林',
  lastName: '晓',
  organizationName: '星河科技',
}
const FINISHED = ['SUCCEEDED', 'FAILED', 'INTERNAL_ERROR', 'TIMEOUT', 'QUOTA_EXCEEDED']

export const prodKit = {
  api,
  http,
  check,
  assert,
  sleep,
  summary,
  waitFor,
  codeStep,
  webhookTrigger,
  stateDir: STATE_DIR,
  connectorStep,
  ensureAdmin,
  createConnection,
  publishFlow,
  runFlow,
  runDetail,
  stepsOf,
}

function connectorStep({ name, displayName, connectorName, connectorVersion = '~0.1.0', actionName, input, errorHandlingOptions = {}, nextAction }) {
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

async function ensureAdmin() {
  const existing = await http({ method: 'POST', path: '/authentication/sign-in', body: { email: ADMIN_USER.email, password: ADMIN_USER.password } })
  if (existing.ok) {
    return { token: existing.body.token, projectId: existing.body.projectId, tenantId: existing.body.tenantId }
  }
  const signUp = await http({
    method: 'POST',
    path: '/authentication/sign-up',
    body: { email: ADMIN_USER.email, password: ADMIN_USER.password, firstName: ADMIN_USER.firstName, lastName: ADMIN_USER.lastName, trackEvents: false, newsLetter: false },
  })
  assert(signUp.ok, `sign-up failed ${signUp.status} ${signUp.text.slice(0, 200)}`)
  const completed = await http({
    method: 'POST',
    path: '/authentication/complete-sign-up',
    token: signUp.body.token,
    body: { fullName: `${ADMIN_USER.firstName}${ADMIN_USER.lastName}`, organizationName: ADMIN_USER.organizationName },
  })
  assert(completed.ok, `complete-sign-up failed ${completed.status} ${completed.text.slice(0, 200)}`)
  return { token: completed.body.token, projectId: completed.body.projectId, tenantId: completed.body.tenantId }
}

async function createConnection({ session, externalId, displayName, connectorName, props }) {
  return api({
    method: 'POST',
    path: '/connections',
    token: session.token,
    body: { externalId, displayName, connectorName, projectId: session.projectId, type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props } },
  })
}

async function publishFlow({ session, displayName, trigger }) {
  const created = await api({ method: 'POST', path: '/workflows', body: { displayName, projectId: session.projectId }, token: session.token })
  const base = `/workflows/${created.id}?projectId=${session.projectId}`
  await api({ method: 'POST', path: base, body: { type: 'IMPORT_WORKFLOW', request: { displayName, trigger, schemaVersion: null, notes: null } }, token: session.token })
  await api({ method: 'POST', path: base, body: { type: 'LOCK_AND_PUBLISH', request: {} }, token: session.token })
  return created.id
}

async function runFlow({ session, workflowId, body = {}, timeoutMs = 120000 }) {
  const response = await http({ method: 'POST', path: `/webhooks/${workflowId}`, body })
  assert(response.ok, `webhook ${response.status} ${response.text.slice(0, 200)}`)
  return waitFor({
    what: `运行结束 ${workflowId}`,
    timeoutMs,
    probe: async () => {
      const runs = await api({ method: 'GET', path: `/run-logs?projectId=${session.projectId}&workflowId=${workflowId}&type=ALL&limit=5`, token: session.token })
      const run = runs.data[0]
      return run && FINISHED.includes(run.status) ? run : null
    },
  })
}

async function runDetail({ session, runId }) {
  return api({ method: 'GET', path: `/executions/${runId}?projectId=${session.projectId}`, token: session.token })
}

function stepsOf({ detail }) {
  return detail.steps ?? {}
}
