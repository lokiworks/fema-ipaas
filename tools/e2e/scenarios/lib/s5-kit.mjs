import { execFileSync } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { zstdDecompressSync } from 'node:zlib'

const SLOT = Number(process.env.E2E_SLOT ?? 5)
export const API = process.env.E2E_API_URL ?? `http://localhost:${3100 + SLOT}/api/v1`
export const WEB = process.env.E2E_WEB_URL ?? `http://localhost:${4200 + SLOT}`
export const STATE_DIR = process.env.E2E_STATE_DIR ?? `/tmp/fema-e2e/slot-${SLOT}`
export const SHOTS = `${STATE_DIR}/shots`
export const ADMIN = { email: 'dev@ap.com', password: '12345678' }
export const MEMBER = { email: 'member1@example.com', password: 'Passw0rd!2026' }

const results = []

export async function http({ method, path, body, token, base = API, headers = {} }) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = text
  try {
    parsed = text ? JSON.parse(text) : null
  }
  catch {
    parsed = text
  }
  return { ok: response.ok, status: response.status, body: parsed, text }
}

export async function api({ method, path, body, token }) {
  const response = await http({ method, path, body, token })
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${response.text.slice(0, 400)}`)
  }
  return response.body
}

export async function signIn({ email, password }) {
  const response = await http({ method: 'POST', path: '/authentication/sign-in', body: { email, password } })
  if (!response.ok) {
    return null
  }
  return { token: response.body.token, projectId: response.body.projectId, userId: response.body.id, tenantId: response.body.tenantId }
}

export async function check(label, fn) {
  const startedAt = Date.now()
  try {
    const detail = await fn()
    results.push({ label, ok: true })
    process.stdout.write(`PASS ${label}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`} (${Math.round((Date.now() - startedAt) / 1000)}s)\n`)
    return detail ?? true
  }
  catch (error) {
    results.push({ label, ok: false, reason: error.message })
    process.stdout.write(`FAIL ${label}\n     ${error.message}\n`)
    return null
  }
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

export function summary() {
  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`)
  failed.forEach((result) => process.stdout.write(`  FAIL ${result.label}\n`))
  process.exitCode = failed.length === 0 ? 0 : 1
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitFor({ probe, timeoutMs = 90000, stepMs = 1500, what }) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value) {
      return value
    }
    await sleep(stepMs)
  }
  throw new Error(`timed out waiting for ${what}`)
}

export function secretsOf({ tag }) {
  return {
    jobNumber: `S5${tag}`,
    name: `测试员工${tag}`,
    mobile: `139${tag}0001`,
    idCard: `11010119900307${tag}`,
    bankCard: `6222021${tag}12345678`,
    email: `emp.${tag}@corp-example.com`,
    token: `sk-live-${tag}abcdef123456`,
    contactPlain: `138${tag}0002`,
    contactSpaced: `138 ${tag} 0003`,
    contactDashed: `138-${tag}-0004`,
    contactPlus86: `+86138${tag}0005`,
    spouseMobile: `137${tag}0006`,
    spouseId: `11010119900307${tag.slice(0, 3)}X`,
    spouseIdLower: `11010119900307${tag.slice(0, 3)}x`,
    noteMobile: `136${tag}0007`,
    noteEmail: `backup.${tag}@corp-example.com`,
    arrayId: `11010119880101${tag}`,
    arrayBank: `6222021${tag}87654321`,
    password: `hunter${tag}`,
    salary: 32000 + Number(tag.slice(0, 2)),
    grade: `Z${tag}P7`,
    memo: `内部备注${tag}仅限人力资源`,
  }
}

export function payloadOf({ secrets }) {
  return {
    employee: {
      jobNumber: secrets.jobNumber,
      name: secrets.name,
      mobile: secrets.mobile,
      idCard: secrets.idCard,
      bankCard: secrets.bankCard,
      email: secrets.email,
      apiToken: secrets.token,
    },
    contacts: [
      { phone: secrets.contactPlain },
      { phone: secrets.contactSpaced },
      { phone: secrets.contactDashed },
      { phone: secrets.contactPlus86 },
    ],
    family: { spouse: { contactMobile: secrets.spouseMobile, IDCARD: secrets.spouseId, idcard2: secrets.spouseIdLower } },
    note: `紧急联系人手机 ${secrets.noteMobile}，邮箱 ${secrets.noteEmail}`,
    ids: [secrets.arrayId, secrets.arrayBank],
    comment: `login password=${secrets.password}`,
  }
}

export function leakedIn({ text, secrets, only }) {
  const compact = text.replace(/[\s-]/g, '').toLowerCase()
  return Object.entries(secrets)
    .filter(([key, value]) => (only === undefined || only.includes(key)) && typeof value === 'string' && value.length >= 6)
    .filter(([, value]) => text.toLowerCase().includes(value.toLowerCase()) || compact.includes(value.replace(/[\s-]/g, '').toLowerCase()))
    .map(([key]) => key)
}

export function codeStep({ name, displayName, code, input, sensitive, nextAction }) {
  return {
    type: 'CODE',
    name,
    displayName,
    valid: true,
    lastUpdatedDate: new Date().toISOString(),
    settings: { sourceCode: { code, packageJson: '{}' }, input, errorHandlingOptions: {}, ...(sensitive ? { sensitiveOutput: true } : {}) },
    ...(nextAction ? { nextAction } : {}),
  }
}

export function webhookTrigger({ displayName, dedupeKeyPath, nextAction }) {
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
      ...(dedupeKeyPath ? { dedupe: { enabled: true, keyPath: dedupeKeyPath, windowSeconds: 3600 } } : {}),
    },
    nextAction,
  }
}

export async function publishFlow({ session, displayName, trigger }) {
  const created = await api({ method: 'POST', path: '/workflows', body: { displayName, projectId: session.projectId }, token: session.token })
  const base = `/workflows/${created.id}?projectId=${session.projectId}`
  await api({ method: 'POST', path: base, body: { type: 'IMPORT_WORKFLOW', request: { displayName, trigger, schemaVersion: null, notes: null } }, token: session.token })
  await api({ method: 'POST', path: base, body: { type: 'LOCK_AND_PUBLISH', request: {} }, token: session.token })
  return created.id
}

export async function replaceFlow({ session, workflowId, trigger, displayName }) {
  const base = `/workflows/${workflowId}?projectId=${session.projectId}`
  await api({ method: 'POST', path: base, body: { type: 'IMPORT_WORKFLOW', request: { displayName, trigger, schemaVersion: null, notes: null } }, token: session.token })
  await api({ method: 'POST', path: base, body: { type: 'LOCK_AND_PUBLISH', request: {} }, token: session.token })
}

export async function deleteFlowsNamed({ session, prefix }) {
  const listed = await api({ method: 'GET', path: `/workflows?projectId=${session.projectId}&limit=100`, token: session.token })
  const flows = listed.data.filter((flow) => (flow.version?.displayName ?? '').startsWith(prefix))
  for (const flow of flows) {
    await http({ method: 'DELETE', path: `/workflows/${flow.id}?projectId=${session.projectId}`, token: session.token })
  }
  return flows.length
}

export function openDatabaseSnapshot() {
  const require = createRequire(new URL('../../../../packages/server/api/package.json', import.meta.url))
  const { PGlite } = require('@electric-sql/pglite')
  const source = `${STATE_DIR}/config/pglite`
  const target = `${STATE_DIR}/pglite-snap`
  const state = { db: null }
  const open = () => {
    rmSync(target, { recursive: true, force: true })
    cpSync(source, target, { recursive: true })
    state.db = new PGlite(target)
  }
  const attempt = async (fn, tries = 4) => {
    try {
      if (state.db === null) {
        open()
      }
      return await fn(state.db)
    }
    catch (error) {
      if (tries <= 1) {
        throw error
      }
      await state.db?.close().catch(() => undefined)
      state.db = null
      await sleep(1500)
      return attempt(fn, tries - 1)
    }
  }
  return {
    query: (sql, params) => attempt(async (db) => (await db.query(sql, params)).rows),
    fileText: (fileId) => attempt(async (db) => {
      const rows = (await db.query('select data, compression from file where id = $1', [fileId])).rows
      if (rows.length === 0) {
        return null
      }
      const buffer = Buffer.from(rows[0].data)
      return rows[0].compression === 'ZSTD' ? zstdDecompressSync(buffer).toString('utf8') : buffer.toString('utf8')
    }),
    close: async () => {
      await state.db?.close().catch(() => undefined)
    },
  }
}

export const ALL_PII = ['mobile', 'idCard', 'bankCard', 'token', 'contactPlain', 'contactSpaced', 'contactDashed', 'contactPlus86', 'spouseMobile', 'spouseId', 'spouseIdLower', 'noteMobile', 'noteEmail', 'arrayId', 'arrayBank']

export const DEFAULT_SETTINGS = {
  logRetentionDays: 30,
  payloadLevel: 'FULL',
  rawPayloadRetentionDays: 3,
  maskRules: [
    { id: 'builtin-phone', name: '手机号', type: 'BUILTIN', detector: 'PHONE', pattern: null, enabled: true },
    { id: 'builtin-id-card', name: '身份证号', type: 'BUILTIN', detector: 'ID_CARD', pattern: null, enabled: true },
    { id: 'builtin-bank-card', name: '银行卡号', type: 'BUILTIN', detector: 'BANK_CARD', pattern: null, enabled: true },
    { id: 'builtin-email', name: '邮箱', type: 'BUILTIN', detector: 'EMAIL', pattern: null, enabled: true },
    { id: 'builtin-secret', name: '密钥与令牌', type: 'BUILTIN', detector: 'SECRET', pattern: null, enabled: true },
  ],
  rawViewRoles: ['OWNER', 'ADMIN'],
  requireRawViewReason: true,
}


export function stopApi() {
  const port = 3100 + SLOT
  const pids = execFileSync('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN']).toString().split('\n').filter(Boolean)
  pids.forEach((pid) => process.kill(Number(pid)))
}

export function startApi() {
  execFileSync(new URL('../../stack/restart-api.sh', import.meta.url).pathname, [String(SLOT)], { stdio: 'inherit' })
}

export async function ageRows({ statements }) {
  const require = createRequire(new URL('../../../../packages/server/api/package.json', import.meta.url))
  const { PGlite } = require('@electric-sql/pglite')
  const db = new PGlite(`${STATE_DIR}/config/pglite`)
  try {
    for (const { sql, params } of statements) {
      await db.query(sql, params)
    }
  }
  finally {
    await db.close()
  }
}

export async function uiLogin({ browser, user, colorScheme = 'light', width = 1440, height = 900 }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme })
  if (colorScheme === 'dark') {
    await context.addInitScript(() => localStorage.setItem('fema.theme', 'dark'))
  }
  const page = await context.newPage()
  page.on('pageerror', (error) => process.stdout.write(`pageerror ${error.message.slice(0, 160)}\n`))
  const attempt = async (tries) => {
    await page.goto(`${WEB}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.getByLabel(/邮箱|Email/).first().fill(user.email)
    await page.locator('input[type=password]').fill(user.password)
    await page.getByRole('button', { name: /登录|Sign in/ }).click()
    try {
      await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 60000 })
    }
    catch (error) {
      if (tries <= 1) {
        throw error
      }
      await attempt(tries - 1)
    }
  }
  await attempt(3)
  return { context, page }
}

export async function shot({ page, name, fullPage = false }) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage })
  return `${name}.png`
}
