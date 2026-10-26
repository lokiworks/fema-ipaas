import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { beisen } = require('../../../packages/connectors/community/beisen/dist/src/index.js')

if (process.env.FEMA_BEISEN_BASE_URL) throw new Error('Unset FEMA_BEISEN_BASE_URL for a real tenant probe')
const { E2E_BEISEN_APP_KEY: appKey, E2E_BEISEN_APP_SECRET: appSecret, E2E_BEISEN_ROOT_ORGANIZATION_ID: rootOrganizationId } = process.env
if (!appKey || !appSecret || !rootOrganizationId) throw new Error('Configure E2E_BEISEN_APP_KEY, E2E_BEISEN_APP_SECRET and E2E_BEISEN_ROOT_ORGANIZATION_ID locally')
const rateLimit = limiter()
const context = { auth: { props: { appKey, appSecret } }, rateLimit }
const now = new Date()
const probes = [
  { action: 'search_changed_employees', input: { startTime: beisenTime(new Date(now - 86400000)), stopTime: beisenTime(now), statusScope: 'ALL', queryType: 2 } },
  { action: 'enumerate_organizations', input: { rootOrganizationId, pageSize: 1 } },
  { action: 'enumerate_employees', input: { rootOrganizationId, recentDeparturesDays: 30, pageSize: 1 } },
]
let failed = false
for (const probe of probes) {
  const action = beisen.actions()[probe.action]
  if (!action || !['READ', 'SEARCH'].includes(action.classification)) throw new Error('Probe may invoke read actions only')
  try {
    const output = await action.run({ ...context, propsValue: probe.input })
    const rows = Array.isArray(output) ? output : output?.items ?? output?.records ?? []
    process.stdout.write(JSON.stringify({ action: probe.action, success: true, rowCount: rows.length, shape: shape(rows[0] ?? output), missingEmployeeFields: probe.action === 'enumerate_employees' && rows.length ? ['employeeInfo', 'recordInfo'].filter((key) => !Object.hasOwn(rows[0], key)) : [] }) + '\n')
  } catch (error) {
    failed = true
    process.stdout.write(JSON.stringify({ action: probe.action, success: false, errorType: error instanceof Error ? error.name : 'UnknownError', detail: 'Inspect the connector step in a private diagnostic session; credentials and personal records are omitted from this report.' }) + '\n')
  }
}
if (failed) process.exitCode = 1

function shape(value, depth = 0) {
  if (depth > 3) return 'nested'
  if (Array.isArray(value)) return { array: value.length ? shape(value[0], depth + 1) : 'empty' }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item, depth + 1)]))
  return value === null ? 'null' : typeof value
}
function limiter() {
  let next = 0
  return { async acquire() { const delay = Math.max(0, next - Date.now()); if (delay) await new Promise((resolve) => setTimeout(resolve, delay)); next = Date.now() + 25 } }
}

function beisenTime(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date).replace(' ', 'T')
}
