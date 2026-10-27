import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'

assert(process.env.E2E_STATE_ROOT && process.env.E2E_SLOT && process.env.E2E_DOCKER_HOST, 'Set isolated E2E_STATE_ROOT, E2E_SLOT and E2E_DOCKER_HOST')
const name = `ipaas-gap-zero-${process.env.E2E_SLOT}`
const volume = `${name}-data`
const image = process.env.E2E_IMAGE ?? 'ipaas-gap:validation'
const api = `http://127.0.0.1:${loadStack.paths.API_PORT}`
const resultDir = process.env.E2E_RESULT_DIR ?? '/tmp/fema-e2e/results'
const env = { ...process.env, DOCKER_HOST: process.env.E2E_DOCKER_HOST }
mkdirSync(resultDir, { recursive: true })
let succeeded = false
try {
  docker(['run', '-d', '--name', name, '--publish', `127.0.0.1:${loadStack.paths.API_PORT}:80`, '--volume', `${volume}:/root/.fema`, image])
  await ready()
  const html = await fetch(api)
  assert.equal(html.status, 200)
  assert((await html.text()).includes('<html'))
  const signedUp = await request({ path: '/authentication/sign-up', body: { email: process.env.E2E_EMAIL ?? 'dev@ap.com', password: process.env.E2E_PASSWORD ?? '12345678', firstName: 'Image', lastName: 'Acceptance', trackEvents: false, newsLetter: false } })
  await request({ path: '/authentication/complete-sign-up', token: signedUp.token, body: { fullName: 'Image Acceptance', organizationName: 'Image Acceptance' } })
  await kit.connect()
  const projectId = kit.session().projectId
  await workerOnline()
  const connectors = await kit.api({ method: 'GET', path: `/connectors?projectId=${projectId}&locale=en` })
  const names = new Set((Array.isArray(connectors) ? connectors : connectors.data).map((item) => item.name))
  for (const connector of ['beisen', 'feishu', 'wecom', 'dingtalk', 'org-sync', 'email']) assert(names.has(`@fema-ipaas/connector-${connector}`), `Missing built-in connector ${connector}`)
  const executed = await executeProbe({ projectId })
  const settings = docker(['exec', name, 'node', '-e', 'const fs=require("node:fs");const s=JSON.parse(fs.readFileSync("/root/.fema/settings.json","utf8"));process.stdout.write(JSON.stringify({jwt:typeof s.JWT_SECRET==="string",encryption:typeof s.ENCRYPTION_KEY==="string",restore:fs.existsSync("/usr/local/bin/fema-restore")}))'])
  assert.deepEqual(JSON.parse(settings), { jwt: true, encryption: true, restore: true })
  docker(['restart', '--timeout', '30', name])
  await ready()
  await kit.connect()
  assert.equal(kit.session().projectId, projectId)
  await workerOnline()
  const report = { image: docker(['image', 'inspect', image, '--format', '{{.Id}}']).trim(), environmentOverrides: 0, html: 200, signup: true, embeddedWorker: true, sandboxExecution: executed, optionalServicesUnconfigured: true, persistentProjectAfterRestart: true, connectors: [...names], settings: JSON.parse(settings) }
  writeFileSync(path.join(resultDir, 'container-zero-config.json'), JSON.stringify(report, null, 2))
  succeeded = true
  process.stdout.write('PASS actual Linux image with zero environment overrides: HTML, signup, built-in connectors, embedded worker, restore command and persistent restart\n')
}
finally {
  try { const logs = spawnSync('docker', ['logs', name], { env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); writeFileSync(path.join(resultDir, 'container-zero-config.log'), `${logs.stdout ?? ''}${logs.stderr ?? ''}`) } catch { void 0 }
  try { docker(['rm', '--force', name]) } catch { void 0 }
  if (succeeded) docker(['volume', 'rm', volume])
}

function docker(args) {
  return execFileSync('docker', args, { env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

async function ready() {
  return kit.waitFor({ timeoutMs: 180000, intervalMs: 1000, probe: async () => {
    assert.equal(docker(['inspect', name, '--format', '{{.State.Status}}']).trim(), 'running', 'Image exited during zero-config startup; inspect the saved container log')
    try { return (await fetch(`${api}/api/v1/flags`, { signal: AbortSignal.timeout(3000) })).ok } catch { return false }
  } })
}

async function workerOnline() {
  return kit.waitFor({ timeoutMs: 120000, intervalMs: 1000, probe: async () => (await kit.api({ method: 'GET', path: '/worker-machines' })).some((worker) => worker.status === 'ONLINE') })
}

async function executeProbe({ projectId }) {
  const workflow = await kit.api({ method: 'POST', path: '/workflows', body: { displayName: 'Image execution probe', projectId } })
  const stamp = new Date().toISOString()
  const trigger = {
    name: 'trigger', type: 'CONNECTOR_TRIGGER', valid: true, displayName: 'Webhook', lastUpdatedDate: stamp,
    settings: { connectorName: '@fema-ipaas/connector-webhook', connectorVersion: '~0.1.0', triggerName: 'catch_webhook', input: { authType: 'none', authFields: {} }, propertySettings: {} },
    nextAction: {
      name: 'probe', type: 'CODE', valid: true, displayName: 'Sandbox probe', lastUpdatedDate: stamp,
      settings: { sourceCode: { code: 'export const code = async () => ({ marker: "image-probe" })', packageJson: '{}' }, input: {}, errorHandlingOptions: {} },
      nextAction: {
        name: 'remember', type: 'CONNECTOR', valid: true, displayName: 'Persist probe', lastUpdatedDate: stamp,
        settings: { connectorName: '@fema-ipaas/connector-store', connectorVersion: '~0.6.0', actionName: 'put', input: { key: 'image-execution-probe', value: '{{probe.output.marker}}', store_scope: 'COLLECTION' }, propertySettings: {}, errorHandlingOptions: {} },
      },
    },
  }
  await kit.api({ method: 'POST', path: `/workflows/${workflow.id}?projectId=${projectId}`, body: { type: 'IMPORT_WORKFLOW', request: { displayName: 'Image execution probe', trigger, schemaVersion: null } } })
  await kit.api({ method: 'POST', path: `/workflows/${workflow.id}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  const response = await fetch(`${api}/api/v1/webhooks/${workflow.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  assert.equal(response.status, 200)
  const completed = await kit.waitFor({ timeoutMs: 180000, intervalMs: 1000, probe: async () => {
    const page = await kit.api({ method: 'GET', path: `/executions?projectId=${projectId}&limit=10` })
    const run = page.data.find((item) => item.workflowId === workflow.id)
    if (run && !['QUEUED', 'RUNNING', 'SUCCEEDED'].includes(run.status)) throw new Error(`Image execution failed: ${JSON.stringify(run)}`)
    return run?.status === 'SUCCEEDED' ? run : null
  } })
  return { id: completed.id, status: completed.status }
}

async function request({ path, token, body }) {
  const response = await fetch(`${api}/api/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  const result = await response.json()
  assert(response.ok, `${path}: ${response.status} ${JSON.stringify(result)}`)
  return result
}
