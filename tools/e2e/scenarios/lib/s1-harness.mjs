import { mkdirSync } from 'node:fs'

export function createHarness({ slot }) {
  const apiPort = 3100 + slot
  const webPort = 4200 + slot
  const mockPort = 18900 + slot
  const llmPort = 19100 + slot
  const stateDir = `/tmp/fema-e2e/slot-${slot}`
  const shotDir = `${stateDir}/shots`
  mkdirSync(shotDir, { recursive: true })
  const env = {
    slot,
    api: `http://localhost:${apiPort}/api/v1`,
    web: `http://localhost:${webPort}`,
    mock: `http://127.0.0.1:${mockPort}`,
    llmPort,
    shotDir,
  }
  const results = []
  const gaps = []
  const session = { token: '', projectId: '' }

  async function signIn({ email, password }) {
    const response = await fetch(`${env.api}/authentication/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const body = await response.json()
    if (!response.ok) {
      throw new Error(`sign-in failed: ${JSON.stringify(body)}`)
    }
    session.token = body.token
    session.projectId = body.projectId
    return session
  }

  async function call({ method, path, body }) {
    const response = await fetch(`${env.api}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), authorization: `Bearer ${session.token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    const parsed = parseJson(text)
    return { status: response.status, body: parsed }
  }

  async function api({ method, path, body }) {
    const response = await call({ method, path, body })
    if (response.status >= 400) {
      throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(response.body).slice(0, 400)}`)
    }
    return response.body
  }

  async function check(label, fn) {
    const startedAt = Date.now()
    try {
      const detail = await fn()
      results.push({ label, ok: true })
      process.stdout.write(`PASS ${label}${detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 200)}`} (${Math.round((Date.now() - startedAt) / 1000)}s)\n`)
      return detail ?? true
    }
    catch (error) {
      results.push({ label, ok: false })
      process.stdout.write(`FAIL ${label}: ${String(error.message).split('\n')[0].slice(0, 400)}\n`)
      return null
    }
  }

  function gap({ severity, text, shot }) {
    gaps.push({ severity, text, shot })
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message)
    }
  }

  function summary() {
    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    failed.forEach((result) => process.stdout.write(`  FAILED: ${result.label}\n`))
    gaps.forEach((entry) => process.stdout.write(`  GAP[${entry.severity}] ${entry.text}${entry.shot ? ` (${entry.shot})` : ''}\n`))
    return failed.length
  }

  return { env, session, signIn, call, api, check, gap, assert, summary }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}
