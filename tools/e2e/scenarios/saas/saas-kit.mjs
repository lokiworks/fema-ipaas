import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(here, '../../../..')
export const SLOT = Number(process.env.E2E_SLOT ?? 3)
export const API_PORT = 3100 + SLOT
export const WEB = process.env.SAAS_WEB_URL ?? `http://localhost:${4200 + SLOT}`
export const API = `${WEB}/api`
export const DIRECT_API = `http://localhost:${API_PORT}`
export const STATE_DIR = `${process.env.E2E_STATE_ROOT ?? '/tmp/fema-e2e'}/slot-${SLOT}`
export const SHOTS = `${STATE_DIR}/shots/saas`
export const IAM_PORT = Number(process.env.FEMA_IAM_PORT ?? 19300 + SLOT)
export const IAM_BASE = `http://127.0.0.1:${IAM_PORT}`
export const ISSUER = `${IAM_BASE}/iam`
export const FEMA_API = `${IAM_BASE}/api`
export const TOKEN_URL = `${ISSUER}/oauth2/token`
export const ADMIN = { email: process.env.SAAS_ADMIN_EMAIL ?? 'dev@ap.com', password: process.env.SAAS_ADMIN_PASSWORD ?? '12345678' }
export const STATE_FILE = `${STATE_DIR}/saas-state.json`

export const ROUTES = {
  signIn: '/v1/authentication/sign-in',
  flags: '/v1/flags',
  ssoProviders: '/v1/authn/sso/providers',
  ssoStart: '/v1/authn/sso/start',
  ssoExchange: '/v1/authn/sso/exchange',
  ssoAdmin: '/v1/tenant-access/sso',
  myTenants: '/v1/tenants',
  tenantById: (id) => `/v1/tenants/${id}`,
  projects: '/v1/projects',
  workflows: (projectId) => `/v1/workflows?projectId=${projectId}&limit=10`,
  connections: (projectId) => `/v1/connections?projectId=${projectId}&limit=100`,
  createConnection: '/v1/connections',
  operatorTenants: (search) => `/v1/operator/tenants?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`,
  operatorPlatformClients: '/v1/operator/platform-clients',
  operatorRevokeClient: (id) => `/v1/operator/platform-clients/${id}/revoke`,
  platformProvision: '/v1/platform/tenants',
  platformByRef: ({ issuer, tenantId }) => `/v1/platform/tenants/by-external-ref?issuer=${encodeURIComponent(issuer)}&tenantId=${encodeURIComponent(tenantId)}`,
  platformTenant: (id) => `/v1/platform/tenants/${id}`,
  platformMembers: (id) => `/v1/platform/tenants/${id}/members`,
  federationEvents: '/v1/federation/events',
}

mkdirSync(SHOTS, { recursive: true })

const results = []

export async function check(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    process.stdout.write(`PASS  ${name}  (${Math.round((Date.now() - started) / 1000)}s)\n`)
  }
  catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) })
    process.stdout.write(`FAIL  ${name}\n      ${String(error?.message ?? error).split('\n').slice(0, 8).join('\n      ')}\n`)
  }
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

export function summary({ name }) {
  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`\n${name}: ${results.length - failed.length}/${results.length} passed\n`)
  writeFileSync(`${STATE_DIR}/${name}-results.json`, JSON.stringify(results, null, 2))
  if (failed.length > 0) {
    process.exitCode = 1
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitFor({ probe, timeoutMs = 30000, intervalMs = 500, what = 'condition' }) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await probe()
    if (last) {
      return last
    }
    await sleep(intervalMs)
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}`)
}

export async function http({ method = 'GET', url, token, body, headers = {}, jar, form, redirect = 'manual' }) {
  const target = new URL(url)
  const cookie = jar?.headerFor({ url: target })
  const requestHeaders = {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(form === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded' }),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { cookie } : {}),
    ...headers,
  }
  const response = await fetch(target, {
    method,
    headers: requestHeaders,
    redirect,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    ...(form === undefined ? {} : { body: new URLSearchParams(form).toString() }),
    signal: AbortSignal.timeout(Number(process.env.SAAS_HTTP_TIMEOUT_MS ?? 120000)),
  })
  jar?.store({ url: target, response })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  }
  catch {
    json = null
  }
  return { status: response.status, json, text, location: response.headers.get('location'), headers: response.headers }
}

export async function api({ method = 'GET', path: route, token, body, headers }) {
  return http({ method, url: `${API}${route}`, token, body, headers })
}

export function cookieJar() {
  const cookies = new Map()
  return {
    headerFor({ url }) {
      const bag = cookies.get(url.host)
      return bag && bag.size > 0 ? [...bag.entries()].map(([name, value]) => `${name}=${value}`).join('; ') : null
    },
    store({ url, response }) {
      const values = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
      for (const value of values) {
        const [pair, ...attributes] = value.split(';').map((part) => part.trim())
        const index = pair.indexOf('=')
        const name = pair.slice(0, index)
        const cookieValue = pair.slice(index + 1)
        const bag = cookies.get(url.host) ?? new Map()
        const expired = attributes.some((attribute) => /^max-age=0$/i.test(attribute)) || cookieValue === ''
        if (expired) {
          bag.delete(name)
        }
        else {
          bag.set(name, cookieValue)
        }
        cookies.set(url.host, bag)
      }
    },
  }
}

export async function iam({ method = 'POST', path: route, body }) {
  const response = await http({ method, url: `${IAM_BASE}${route}`, body: method === 'GET' ? undefined : (body ?? {}) })
  assert(response.status < 400, `iam mock ${route} failed: ${response.status} ${response.text.slice(0, 300)}`)
  return response.json
}

export async function iamState() {
  return iam({ method: 'GET', path: '/__control/state' })
}

export async function adminSession() {
  const response = await api({ method: 'POST', path: ROUTES.signIn, body: ADMIN })
  assert(response.status === 200, `admin sign-in failed: ${response.status} ${response.text.slice(0, 300)}`)
  return response.json
}

export async function ssoLogin({ startUrl, username, password = 'Passw0rd!', jar = cookieJar(), tamperAuthorize }) {
  const trail = []
  const start = await http({ url: startUrl, jar })
  trail.push(`start ${start.status} -> ${start.location}`)
  assert(start.status === 302 && start.location, `sso start did not redirect: ${start.status} ${start.text.slice(0, 300)}`)
  const authorizeUrl = tamperAuthorize ? tamperAuthorize(new URL(start.location, startUrl)).toString() : new URL(start.location, startUrl).toString()
  if (!authorizeUrl.startsWith(ISSUER)) {
    return { ok: false, code: errorCodeOf({ location: authorizeUrl }), trail, sawLoginPage: false, authorizeUrl }
  }
  let authorize = await http({ url: authorizeUrl, jar })
  let sawLoginPage = false
  if (authorize.status === 200 && authorize.text.includes('iam-login-form')) {
    sawLoginPage = true
    const returnTo = new URL(authorizeUrl)
    const login = await http({ method: 'POST', url: `${ISSUER.replace(/\/iam$/, '')}/iam/login`, jar, form: { username, password, return: returnTo.pathname + returnTo.search } })
    trail.push(`login ${login.status}`)
    assert(login.status === 302, `iam login failed for ${username}: ${login.status} ${login.text.slice(0, 200)}`)
    authorize = await http({ url: authorizeUrl, jar })
  }
  trail.push(`authorize ${authorize.status} -> ${authorize.location}`)
  assert(authorize.status === 302 && authorize.location, `authorize did not redirect: ${authorize.status} ${authorize.text.slice(0, 300)}`)
  const callback = await http({ url: authorize.location, jar })
  trail.push(`callback ${callback.status} -> ${callback.location}`)
  assert(callback.status === 302 && callback.location, `callback did not redirect: ${callback.status} ${callback.text.slice(0, 300)}`)
  const landing = new URL(callback.location, WEB)
  const ticket = landing.searchParams.get('ticket')
  if (!ticket) {
    return { ok: false, code: errorCodeOf({ location: landing.toString() }), trail, sawLoginPage, authorizeUrl, iamError: new URL(authorize.location).searchParams.get('error') }
  }
  const exchanged = await api({ method: 'POST', path: ROUTES.ssoExchange, body: { ticket } })
  trail.push(`exchange ${exchanged.status}`)
  if (exchanged.status !== 200) {
    return { ok: false, code: exchanged.json?.code ?? `HTTP_${exchanged.status}`, trail, sawLoginPage, authorizeUrl, detail: exchanged.text.slice(0, 300) }
  }
  return { ok: true, session: exchanged.json, token: exchanged.json.token, trail, sawLoginPage, authorizeUrl, jar }
}

function errorCodeOf({ location }) {
  const url = new URL(location, WEB)
  return url.searchParams.get('ssoError') ?? url.searchParams.get('error') ?? `AT ${url.pathname}`
}

export async function issueApiKey({ token, name, scopes }) {
  const response = await api({ method: 'POST', path: ROUTES.operatorPlatformClients, token, body: { kind: 'API_KEY', name, scopes } })
  assert(response.status === 200 || response.status === 201, `platform API key issue failed: ${response.status} ${response.text.slice(0, 300)}`)
  assert(typeof response.json?.secret === 'string' && response.json.secret.startsWith('fpk_'), `API key secret missing or malformed: ${response.text.slice(0, 200)}`)
  return response.json
}

export async function provision({ apiKey, body }) {
  return api({ method: 'POST', path: ROUTES.platformProvision, token: apiKey, body })
}

export async function platformMembers({ apiKey, tenantId }) {
  const response = await api({ path: ROUTES.platformMembers(tenantId), token: apiKey })
  assert(response.status === 200, `list platform members failed: ${response.status} ${response.text.slice(0, 300)}`)
  return response.json
}

export async function addPlatformMember({ apiKey, tenantId, member }) {
  const response = await api({ method: 'POST', path: ROUTES.platformMembers(tenantId), token: apiKey, body: member })
  assert(response.status === 200 || response.status === 201, `add platform member failed: ${response.status} ${response.text.slice(0, 300)}`)
  return response.json
}

export async function sessionAlive({ token }) {
  const response = await api({ path: ROUTES.projects, token })
  return response.status === 200
}

export function saveState(value) {
  writeFileSync(STATE_FILE, JSON.stringify(value, null, 2))
}

export function loadState() {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
}

export function freshApi({ extraEnv = [] } = {}) {
  stopPort({ port: API_PORT })
  spawnSync('rm', ['-rf', `${STATE_DIR}/config/pglite`])
  const result = spawnSync('bash', ['tools/e2e/stack/restart-api.sh', String(SLOT), ...extraEnv], { cwd: ROOT, encoding: 'utf8', timeout: 600000 })
  if (result.status !== 0) {
    throw new Error(`restart api failed: ${result.stdout}${result.stderr}`)
  }
}

export function stopPort({ port }) {
  const out = spawnSync('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.trim()
  for (const pid of out.split('\n').filter(Boolean)) {
    try {
      process.kill(Number(pid), 'SIGTERM')
    }
    catch {
      void 0
    }
  }
}
