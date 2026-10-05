import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, openSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(here, '../../../..')
export const SLOT = Number(process.env.E2E_SLOT ?? 3)
export const WEB = `http://localhost:${4200 + SLOT}`
export const API = `${WEB}/api`
export const STATE_DIR = `${process.env.E2E_STATE_ROOT ?? '/tmp/fema-e2e'}/slot-${SLOT}`
export const SHOTS = `${STATE_DIR}/shots`
export const REAL_IDP_PORT = 19000 + SLOT
export const REAL_IDP = `http://127.0.0.1:${REAL_IDP_PORT}`
export const FAKE_IDP_PORT = 19023 + (SLOT - 3) * 100
export const FAKE_IDP = `http://127.0.0.1:${FAKE_IDP_PORT}`
export const FEISHU_PORT = 19013 + (SLOT - 3) * 100
export const ADMIN = { email: 'dev@ap.com', password: '12345678' }
export const CLIENT_SECRET = 'e2e-secret-value'

mkdirSync(SHOTS, { recursive: true })

const results = []

export async function check(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    process.stdout.write(`PASS  ${name}\n`)
  }
  catch (error) {
    results.push({ name, ok: false })
    process.stdout.write(`FAIL  ${name}\n      ${String(error?.message ?? error).split('\n').slice(0, 6).join('\n      ')}\n`)
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
  if (failed.length > 0) {
    process.exitCode = 1
  }
}

export async function launchBrowser() {
  return chromium.launch()
}

export async function openContext({ browser, width = 1280, height = 900, theme = 'light' }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, locale: 'zh-CN', serviceWorkers: 'block' })
  await context.addInitScript(({ mode }) => {
    window.localStorage.setItem('fema.theme', mode)
  }, { mode: theme })
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'vite-error-overlay,vite-plugin-checker-error-overlay{display:none!important}'
      document.head.appendChild(style)
    })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  return { context, page }
}

export async function shot({ page, name }) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
}

export async function apiRequest({ method = 'GET', url, token, body }) {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  }
  catch {
    json = null
  }
  return { status: response.status, json, text }
}

export async function adminSession() {
  const response = await apiRequest({ method: 'POST', url: '/v1/authentication/sign-in', body: ADMIN })
  assert(response.status === 200, `admin sign-in failed: ${response.text}`)
  return response.json
}

export async function signInInBrowser({ page, email, password }) {
  await page.goto(`${WEB}/sign-in`)
  await page.getByTestId('sign-in-email').fill(email)
  await page.getByTestId('sign-in-password').fill(password)
  await page.getByTestId('sign-in-button').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 60000 })
}

export async function listMembers({ token }) {
  const response = await apiRequest({ url: '/v1/tenant-access/members', token })
  assert(response.status === 200, `list members failed: ${response.text}`)
  return response.json.members
}

export async function listAudit({ token, action }) {
  const response = await apiRequest({ url: `/v1/audit-events?limit=200&action=${encodeURIComponent(action)}`, token })
  assert(response.status === 200, `audit list failed: ${response.text}`)
  return response.json.data
}

export function startProcess({ name, args, env = {}, loader = false }) {
  const log = openSync(`${STATE_DIR}/${name}.log`, 'a')
  const child = spawn(process.execPath, loader ? ['--import', 'tsx', ...args] : args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', log, log],
  })
  child.unref()
  return child.pid
}

export function stopPort({ port }) {
  const out = spawnSync('lsof', ['-nP', '-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.trim()
  for (const pid of out.split('\n').filter(Boolean)) {
    try {
      process.kill(Number(pid), 'SIGTERM')
    }
    catch {
      void 0
    }
  }
}

export async function waitPort({ port, timeoutMs = 20000 }) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`)
      return
    }
    catch {
      await sleep(300)
    }
  }
  throw new Error(`port ${port} did not open`)
}

export async function restartRealIdp({ env = {} }) {
  stopPort({ port: REAL_IDP_PORT })
  await sleep(500)
  startProcess({ name: 'idp-real', args: ['tools/e2e/scenarios/sso/idp-real.mjs'], env: { IDP_PORT: String(REAL_IDP_PORT), E2E_SLOT: String(SLOT), ...env } })
  await waitPort({ port: REAL_IDP_PORT })
}

export function freshApi({ extraEnv = [] } = {}) {
  stopPort({ port: 3100 + SLOT })
  spawnSync('rm', ['-rf', `${STATE_DIR}/config/pglite`])
  const result = spawnSync('bash', ['tools/e2e/stack/restart-api.sh', String(SLOT), `FEMA_FEISHU_BASE_URL=http://127.0.0.1:${FEISHU_PORT}/feishu`, ...extraEnv], { cwd: ROOT, encoding: 'utf8', timeout: 300000 })
  if (result.status !== 0) {
    throw new Error(`restart api failed: ${result.stdout}${result.stderr}`)
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
