import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { feishu } = require('../../../packages/connectors/community/feishu/dist/src/index.js')
if (process.env.FEMA_FEISHU_BASE_URL) throw new Error('Unset FEMA_FEISHU_BASE_URL for real tenant cleanup')
const { E2E_FEISHU_APP_ID: appId, E2E_FEISHU_APP_SECRET: appSecret, E2E_FEISHU_ARCHIVE_DEPARTMENT_ID: archiveParentId } = process.env
if (!appId || !appSecret || !archiveParentId) throw new Error('Configure the app credentials and an existing E2E_FEISHU_ARCHIVE_DEPARTMENT_ID locally')
const auth = { props: { domain: process.env.E2E_FEISHU_DOMAIN ?? 'https://open.feishu.cn', appId, appSecret } }
const next = new Map()
const rateLimit = { async acquire({ bucket }) { const delay = Math.max(0, (next.get(bucket) ?? 0) - Date.now()); if (delay) await new Promise((resolve) => setTimeout(resolve, delay)); next.set(bucket, Date.now() + (bucket === 'contact-write' ? 1100 : 30)) } }
const invoke = (name, input) => feishu.actions()[name].run({ auth, rateLimit, propsValue: input })
const users = (await all({ name: 'enumerate_users', input: { rootDepartmentId: '0' } })).filter((user) => typeof user.name === 'string' && user.name.startsWith('e2e-') && typeof user.employee_no === 'string' && user.employee_no.startsWith('e2e-'))
const departments = (await all({ name: 'enumerate_departments', input: { rootDepartmentId: '0' } })).filter((department) => typeof department.name === 'string' && department.name.startsWith('e2e-'))
if (departments.some((department) => [department.department_id, department.open_department_id].includes(archiveParentId))) throw new Error('The archive parent must be outside the cleanup set')
process.stdout.write(JSON.stringify({ apply: process.argv.includes('--apply'), users: users.map((user) => user.open_id), departments: departments.map((department) => department.open_department_id), deletes: 0 }) + '\n')
if (process.argv.includes('--apply')) {
  for (const user of users) {
    await invoke('suspend_user', { openId: user.open_id })
    await invoke('update_user', { openId: user.open_id, departmentId: archiveParentId })
  }
  for (const department of departments) await invoke('archive_department', { departmentId: department.open_department_id, archiveParentId })
}
async function all({ name, input }) {
  const items = []
  let pageToken
  for (let index = 0; index < 1000; index++) {
    const page = await invoke(name, { ...input, pageToken, pageSize: 100 })
    items.push(...page.items)
    if (!page.nextPageToken) return items
    if (page.nextPageToken === pageToken) throw new Error('Pagination did not advance')
    pageToken = page.nextPageToken
  }
  throw new Error('Cleanup scan exceeded 1000 pages; no cleanup was applied')
}
