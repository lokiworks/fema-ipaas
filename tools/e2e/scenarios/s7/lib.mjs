import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../..')

export const env = {
  api: 'http://localhost:3107/api',
  web: 'http://localhost:4207',
  shots: '/tmp/fema-e2e/slot-7/shots',
  stateDir: '/tmp/fema-e2e/slot-7',
  externalPort: 18977,
  llmPort: 18978,
  externalToken: 'e2e-secret-token',
  lanHost: process.env.S7_LAN_HOST ?? lanAddress(),
  defaultAllowList: '203.0.113.9',
  email: 'dev@ap.com',
  password: '12345678',
  root,
}

function lanAddress() {
  const addresses = Object.values(networkInterfaces()).flat().filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
  return addresses[0]?.address ?? '127.0.0.1'
}

mkdirSync(env.shots, { recursive: true })

export const results = []

export function check({ name, ok, detail = '' }) {
  results.push({ name, ok: Boolean(ok), detail })
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}\n`)
}

export async function api({ method = 'GET', url, token, body, headers = {} }) {
  const response = await fetch(`${env.api}${url}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: response.status, json, text }
}

export async function login() {
  const { json } = await api({ method: 'POST', url: '/v1/authentication/sign-in', body: { email: env.email, password: env.password } })
  return { token: json.token, projectId: json.projectId }
}

export function startProcess({ file, extraEnv, name }) {
  const child = spawn('node', [path.join(here, file)], {
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logFile = path.join(env.stateDir, `${name}.log`)
  let log = ''
  child.stdout.on('data', (chunk) => {
    log += chunk
    writeFileSync(logFile, log)
  })
  child.stderr.on('data', (chunk) => {
    log += chunk
    writeFileSync(logFile, log)
  })
  return child
}

export async function waitFor({ fn, timeoutMs = 60000, intervalMs = 500, what = 'condition' }) {
  const started = Date.now()
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() - started > timeoutMs) throw new Error(`timeout waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

export async function portOpen({ port }) {
  try {
    await fetch(`http://127.0.0.1:${port}/admin/state`)
    return true
  } catch {
    return false
  }
}

export async function openBrowser({ width = 1440, height = 900, colorScheme = 'light' } = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width, height }, colorScheme })
  await context.addInitScript(() => {
    const hide = () => {
      const style = document.createElement('style')
      style.textContent = 'vite-plugin-checker-error-overlay{display:none!important}'
      document.head.appendChild(style)
    }
    if (document.head) hide()
    else document.addEventListener('DOMContentLoaded', hide)
  })
  await context.addInitScript((scheme) => {
    try {
      localStorage.setItem('fema.theme', scheme)
    } catch {
      return
    }
  }, colorScheme)
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  return { browser, context, page }
}

export async function uiLogin({ page }) {
  await page.goto(`${env.web}/sign-in`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('sign-in-email').fill(env.email)
  await page.getByTestId('sign-in-password').fill(env.password)
  await page.getByTestId('sign-in-button').click()
  await page.waitForURL((url) => !url.pathname.includes('sign-in'))
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)
}

export async function go({ page, url }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await recoverFromStaleBundle({ page })
      return
    } catch (error) {
      if (attempt === 3) throw error
      await page.waitForTimeout(1500)
    }
  }
}

export async function recoverFromStaleBundle({ page }) {
  for (let reload = 0; reload < 6; reload += 1) {
    await page.waitForTimeout(reload === 0 ? 2500 : 8000)
    const stale = await page.getByText('应用已更新，请刷新页面以获取最新版本。').isVisible().catch(() => false)
    if (!stale) {
      return
    }
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
}

export async function shot({ page, name }) {
  await page.screenshot({ path: path.join(env.shots, `${name}.png`) })
}

export function summary() {
  const failed = results.filter((item) => !item.ok)
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`)
  failed.forEach((item) => process.stdout.write(`  FAILED: ${item.name} ${item.detail}\n`))
  return failed.length
}

export function readJson({ file }) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

const sdkRoot = path.join(root, 'packages/server/api/node_modules/@modelcontextprotocol/sdk')

export async function mcpClientFor({ url, token }) {
  const { Client } = await import(pathToFileURL(path.join(sdkRoot, 'dist/esm/client/index.js')).href)
  const { StreamableHTTPClientTransport } = await import(pathToFileURL(path.join(sdkRoot, 'dist/esm/client/streamableHttp.js')).href)
  const client = new Client({ name: 's7-e2e-client', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  })
  await client.connect(transport)
  return client
}

export function textOfToolResult({ result }) {
  return (result.content ?? []).map((block) => block.text ?? '').join('')
}
