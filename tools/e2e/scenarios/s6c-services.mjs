import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createFakeRegistry, createFakeS3, createFakeSmtp } from './lib/fakes.mjs'
import { ADMIN, API, assert, check, http, STATE_DIR, summary, waitFor } from './lib/s5-kit.mjs'

const SLOT = Number(process.env.E2E_SLOT ?? 1)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const API_PORT = 3100 + SLOT
const CONFIG_DIR = path.join(STATE_DIR, 'config')
const BACKUP_DIR = path.join(CONFIG_DIR, 'backups')
const SMTP_PORT = 25100 + SLOT
const SMTP_ENV_PORT = 25200 + SLOT
const REGISTRY_PORT = 19100 + SLOT
const S3_PORT = 19200 + SLOT
const BUCKET = 'fema-e2e-bucket'
const ACCESS_KEY = 'AKIAE2EFAKEKEY'
const SECRET_KEY = 'e2e-secret-access-key-do-not-leak'
const SMTP_PASSWORD = 'smtp-password-do-not-leak'
const requireFromApi = createRequire(path.join(ROOT, 'packages/server/api/package.json'))

const smtp = createFakeSmtp({ port: SMTP_PORT })
const smtpFromEnvironment = createFakeSmtp({ port: SMTP_ENV_PORT })
const registry = createFakeRegistry({ port: REGISTRY_PORT })
const s3 = createFakeS3({ port: S3_PORT, bucket: BUCKET, accessKeyId: ACCESS_KEY })
let session = null

await Promise.all([smtp.start(), smtpFromEnvironment.start(), registry.start(), s3.start()])
try {
  await run()
}
finally {
  await Promise.all([smtp.close(), smtpFromEnvironment.close(), registry.close(), s3.close()])
}
summary()

async function run() {
  session = await signInAdmin()
  await resetServices()

  await check('V1 没配置任何可选服务：四项都是「未启用」，没有错误，设置来源是 NONE', async () => {
    const settings = await get('/service-settings')
    assert(settings.length === 4 && settings.every((entry) => entry.source === 'NONE'), `都应是 NONE，实际 ${JSON.stringify(settings.map((entry) => entry.source))}`)
    const overview = await get('/health/overview')
    assert(overview.services.every((service) => service.enabled === false && service.problem === null), `都应未启用且无错误，实际 ${JSON.stringify(overview.services)}`)
  })

  await check('V2 地址连不上：保存被拒绝并给出原因，什么都没存下', async () => {
    const response = await save({ kind: 'CONNECTOR_REGISTRY', config: { url: 'http://127.0.0.1:1/registry' } })
    assert(response.saved === false && response.check.ok === false && response.check.failure === 'UNREACHABLE', `应被拒绝，实际 ${JSON.stringify(response)}`)
    assert(response.setting === null, '不应返回已保存的设置')
    const entry = (await get('/service-settings')).find((setting) => setting.kind === 'CONNECTOR_REGISTRY')
    assert(entry.source === 'NONE', '失败的保存不应落库')
    registry.setMode('notarray')
    const notRegistry = await save({ kind: 'CONNECTOR_REGISTRY', config: { url: `http://127.0.0.1:${REGISTRY_PORT}` } })
    assert(notRegistry.saved === false && notRegistry.check.failure === 'REJECTED', `回应不是仓库列表应被拒，实际 ${JSON.stringify(notRegistry.check)}`)
    registry.setMode('ok')
  })

  await check('V3 连接器仓库：测试通过后保存，系统页变为已启用；移除后回到未启用', async () => {
    const response = await save({ kind: 'CONNECTOR_REGISTRY', config: { url: `http://127.0.0.1:${REGISTRY_PORT}` } })
    assert(response.saved === true && response.setting.source === 'SAVED', `应保存成功，实际 ${JSON.stringify(response)}`)
    const service = (await get('/health/overview')).services.find((entry) => entry.kind === 'CONNECTOR_REGISTRY')
    const syncOff = service.problem?.message.includes('FEMA_CONNECTORS_SYNC_MODE is NONE') === true
    assert(service.detail === `127.0.0.1:${REGISTRY_PORT}` && (service.enabled === true || syncOff), `应已启用（本机开发栈把同步模式设成了 NONE 时，要如实提示这一点），实际 ${JSON.stringify(service)}`)
    const removed = await del('/service-settings/CONNECTOR_REGISTRY')
    assert(removed.ok, `移除应成功，实际 ${removed.status} ${removed.text}`)
    const after = (await get('/health/overview')).services.find((entry) => entry.kind === 'CONNECTOR_REGISTRY')
    assert(after.enabled === false && after.detail === null, '移除后应回到未启用')
  })

  await check('V4 邮件：密码错误被拒；正确后保存，密钥不回显，测试邮件真的发到了配置的服务器', async () => {
    const config = { host: '127.0.0.1', port: SMTP_PORT, username: 'mailer', password: SMTP_PASSWORD, senderEmail: 'noreply@corp.test', senderName: '星河平台' }
    smtp.setMode('reject')
    const rejected = await save({ kind: 'SMTP', config })
    assert(rejected.saved === false && rejected.check.failure === 'AUTHENTICATION', `应是认证失败，实际 ${JSON.stringify(rejected.check)}`)
    assert(!JSON.stringify(rejected).includes(SMTP_PASSWORD), '失败信息里不能出现密码')
    smtp.setMode('accept')
    const saved = await save({ kind: 'SMTP', config })
    assert(saved.saved === true && saved.setting.secretConfigured === true, `应保存成功，实际 ${JSON.stringify(saved)}`)
    const listed = JSON.stringify(await get('/service-settings'))
    assert(!listed.includes(SMTP_PASSWORD), '读取设置时不应返回密码')
    assert(saved.setting.values.host === '127.0.0.1' && saved.setting.values.port === SMTP_PORT, '应返回非密钥字段')
    const before = smtp.messages().length
    const sent = await post('/health/services/check', { kind: 'SMTP', recipient: 'admin@corp.test' })
    assert(sent.ok === true && sent.sentTo === 'admin@corp.test', `用已保存的配置发测试邮件应成功，实际 ${JSON.stringify(sent)}`)
    assert(smtp.messages().length === before + 1, '假邮件服务器应收到一封邮件')
    assert(/星河平台/.test(smtp.messages().at(-1).data) || smtp.messages().at(-1).data.includes('noreply@corp.test'), '发件人应是保存的配置')
    const overview = (await get('/health/overview')).services.find((entry) => entry.kind === 'SMTP')
    assert(overview.enabled === true && overview.problem === null, `邮件应已启用，实际 ${JSON.stringify(overview)}`)
  })

  await check('V5 不改密码再保存：留空表示沿用已保存的密码，仍然通过测试', async () => {
    const edited = await save({ kind: 'SMTP', config: { host: '127.0.0.1', port: SMTP_PORT, username: 'mailer', password: '', senderEmail: 'support@corp.test', senderName: '' } })
    assert(edited.saved === true && edited.setting.secretConfigured === true && edited.setting.values.senderEmail === 'support@corp.test', `应保存成功且仍有密钥，实际 ${JSON.stringify(edited)}`)
    const draftTest = await post('/service-settings/test', { draft: { kind: 'SMTP', config: { host: '127.0.0.1', port: SMTP_PORT, username: 'mailer', password: '', senderEmail: 'support@corp.test' } }, recipient: 'ops@corp.test' })
    assert(draftTest.ok === true && draftTest.sentTo === 'ops@corp.test', `草稿测试应成功，实际 ${JSON.stringify(draftTest)}`)
  })

  await check('V6 对象存储：错误的密钥和不存在的存储桶被拒；正确后保存并立即生效，备份可复制过去，删除备份同步删除', async () => {
    const wrongKey = await save({ kind: 'OBJECT_STORAGE', config: { endpoint: `http://127.0.0.1:${S3_PORT}`, region: 'us-east-1', bucket: BUCKET, accessKeyId: 'WRONGKEY', secretAccessKey: SECRET_KEY } })
    assert(wrongKey.saved === false && wrongKey.check.failure === 'AUTHENTICATION', `错误密钥应是认证失败，实际 ${JSON.stringify(wrongKey.check)}`)
    const wrongBucket = await save({ kind: 'OBJECT_STORAGE', config: { endpoint: `http://127.0.0.1:${S3_PORT}`, region: 'us-east-1', bucket: 'no-such-bucket', accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } })
    assert(wrongBucket.saved === false && wrongBucket.check.failure === 'REJECTED', `不存在的存储桶应被拒，实际 ${JSON.stringify(wrongBucket.check)}`)
    const missingSecret = await http({ method: 'POST', path: '/service-settings', body: { kind: 'OBJECT_STORAGE', config: { endpoint: `http://127.0.0.1:${S3_PORT}`, bucket: BUCKET, accessKeyId: ACCESS_KEY } }, token: session.token })
    assert(missingSecret.status === 409 && String(missingSecret.text).includes('secret access key is required'), `没有密钥应提示，实际 ${missingSecret.status} ${missingSecret.text.slice(0, 200)}`)
    const good = await save({ kind: 'OBJECT_STORAGE', config: { endpoint: `http://127.0.0.1:${S3_PORT}`, region: 'us-east-1', bucket: BUCKET, accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } })
    assert(good.saved === true, `应保存成功，实际 ${JSON.stringify(good)}`)
    const storage = (await get('/health/overview')).services.find((entry) => entry.kind === 'OBJECT_STORAGE')
    assert(storage.enabled === true && storage.detail === BUCKET, `对象存储应已启用，实际 ${JSON.stringify(storage)}`)
    const effective = await post('/health/services/check', { kind: 'OBJECT_STORAGE' })
    assert(effective.ok === true, `用已保存的配置测试应通过（不需要重启），实际 ${JSON.stringify(effective)}`)
    const backupOverview = await get('/backups/overview')
    assert(backupOverview.objectStorageAvailable === true, '备份页应知道对象存储可用')
    await post('/backups/settings', { enabled: true, frequency: 'DAILY', weekday: 1, hour: 2, keep: 7, uploadToObjectStorage: true })
    const created = await post('/backups', { note: '复制到对象存储' })
    const done = await waitBackup({ id: created.id })
    assert(done.status === 'SUCCEEDED' && done.uploadedToObjectStorage === true, `应成功并上传，实际 ${done.status} ${done.error} ${done.uploadedToObjectStorage}`)
    const key = `backups/${done.fileName}`
    assert(s3.keys().includes(key) && s3.sizeOf(key) === done.sizeBytes, `存储桶里应有大小一致的 ${key}，实际 ${JSON.stringify(s3.keys())}`)
    assert(fs.existsSync(path.join(BACKUP_DIR, done.fileName)), '本地那份始终保留')
    const removed = await del(`/backups/${done.id}`)
    assert(removed.status === 204, `删除应成功，实际 ${removed.status}`)
    assert(!s3.keys().includes(key), '删除备份应同时删除对象存储里的副本')
    assert(!fs.existsSync(path.join(BACKUP_DIR, done.fileName)), '本地文件也应删除')
  })

  await check('V7 密钥加密存储：数据库里没有 SMTP 密码和访问密钥的明文', async () => {
    const dump = await readDatabase({ sql: `SELECT kind, "values"::text AS "values", secrets::text AS secrets FROM service_setting ORDER BY kind` })
    session = await signInAdmin()
    const text = JSON.stringify(dump)
    assert(dump.length >= 2, `应有已保存的邮件和对象存储，实际 ${dump.length} 条`)
    assert(!text.includes(SMTP_PASSWORD) && !text.includes(SECRET_KEY), '数据库里不应有密钥明文')
    const smtpRow = dump.find((row) => row.kind === 'SMTP')
    assert(smtpRow.secrets && smtpRow.secrets.includes('"iv"') && smtpRow.secrets.includes('"data"'), '密钥应是加密对象')
    return { rows: dump.map((row) => row.kind) }
  })

  await check('V8 重启后保存的配置仍然生效（启动时从数据库加载）', async () => {
    await startApi()
    session = await signInAdmin()
    const services = (await get('/health/overview')).services
    assert(services.find((entry) => entry.kind === 'SMTP').enabled === true, '重启后邮件应仍启用')
    assert(services.find((entry) => entry.kind === 'OBJECT_STORAGE').enabled === true, '重启后对象存储应仍启用')
    const sent = await post('/health/services/check', { kind: 'SMTP', recipient: 'after-restart@corp.test' })
    assert(sent.ok === true, `重启后发信应成功，实际 ${JSON.stringify(sent)}`)
  })

  await check('V9 环境变量优先：设了环境变量的服务来源是 ENVIRONMENT、界面只读，已保存的值被忽略', async () => {
    await startApi({ extra: ['FEMA_SMTP_HOST=127.0.0.1', `FEMA_SMTP_PORT=${SMTP_ENV_PORT}`, 'FEMA_SMTP_SENDER_EMAIL=env@corp.test'] })
    session = await signInAdmin()
    const entry = (await get('/service-settings')).find((setting) => setting.kind === 'SMTP')
    assert(entry.source === 'ENVIRONMENT' && entry.canClear === false, `邮件应来自环境变量且不可移除，实际 ${JSON.stringify(entry)}`)
    assert(entry.values.host === '127.0.0.1' && entry.values.port === SMTP_ENV_PORT, `应显示环境变量里的值，实际 ${JSON.stringify(entry.values)}`)
    const refused = await http({ method: 'POST', path: '/service-settings', body: { kind: 'SMTP', config: { host: '127.0.0.1', port: SMTP_PORT, senderEmail: 'x@corp.test' } }, token: session.token })
    assert(refused.status === 409 && String(refused.text).includes('environment variables'), `保存应被拒绝并说明，实际 ${refused.status} ${refused.text.slice(0, 200)}`)
    const clearRefused = await del('/service-settings/SMTP')
    assert(clearRefused.status === 409, `移除也应被拒绝，实际 ${clearRefused.status}`)
    const envBefore = smtpFromEnvironment.messages().length
    const savedBefore = smtp.messages().length
    const sent = await post('/health/services/check', { kind: 'SMTP', recipient: 'env@corp.test' })
    assert(sent.ok === true, `应通过环境变量里的服务器发信，实际 ${JSON.stringify(sent)}`)
    assert(smtpFromEnvironment.messages().length === envBefore + 1 && smtp.messages().length === savedBefore, '邮件应发到环境变量指向的服务器，而不是已保存的那个')
    const other = (await get('/service-settings')).find((setting) => setting.kind === 'OBJECT_STORAGE')
    assert(other.source === 'SAVED', '没设环境变量的服务仍可在界面改')
  })

  await check('V10 全部移除后回到零配置：四项未启用、没有错误，备份页的「复制到对象存储」随之不可用', async () => {
    await startApi()
    session = await signInAdmin()
    for (const kind of ['SMTP', 'OBJECT_STORAGE']) {
      const removed = await del(`/service-settings/${kind}`)
      assert(removed.ok, `移除 ${kind} 应成功，实际 ${removed.status} ${removed.text}`)
    }
    const overview = await get('/health/overview')
    assert(overview.services.every((service) => service.enabled === false && service.problem === null), `都应未启用，实际 ${JSON.stringify(overview.services)}`)
    const backups = await get('/backups/overview')
    assert(backups.objectStorageAvailable === false, '对象存储没了，备份页不应再声称可用')
    const create = await post('/backups', { note: '对象存储已移除' })
    const done = await waitBackup({ id: create.id })
    assert(done.status === 'SUCCEEDED' && done.uploadedToObjectStorage === false && done.error === null, `只写本地，不报错，实际 ${JSON.stringify({ status: done.status, error: done.error, up: done.uploadedToObjectStorage })}`)
    await del(`/backups/${done.id}`)
    await post('/backups/settings', { enabled: true, frequency: 'DAILY', weekday: 1, hour: 2, keep: 7, uploadToObjectStorage: false })
  })
}

async function resetServices() {
  for (const entry of await get('/service-settings')) {
    if (entry.source === 'SAVED') {
      await del(`/service-settings/${entry.kind}`)
    }
  }
}

async function signInAdmin() {
  const response = await http({ method: 'POST', path: '/authentication/sign-in', body: ADMIN })
  assert(response.ok, `登录失败 ${response.status} ${response.text.slice(0, 200)}`)
  return { token: response.body.token, projectId: response.body.projectId }
}

async function get(urlPath) {
  const response = await http({ method: 'GET', path: urlPath, token: session.token })
  assert(response.ok, `GET ${urlPath} -> ${response.status} ${response.text.slice(0, 300)}`)
  return response.body
}

async function post(urlPath, body) {
  const response = await http({ method: 'POST', path: urlPath, body, token: session.token })
  assert(response.ok, `POST ${urlPath} -> ${response.status} ${response.text.slice(0, 300)}`)
  return response.body
}

function save(draft) {
  return post('/service-settings', draft)
}

async function del(urlPath) {
  const response = await fetch(`${API}${urlPath}`, { method: 'DELETE', headers: { authorization: `Bearer ${session.token}` } })
  return { ok: response.ok, status: response.status, text: await response.text() }
}

async function waitBackup({ id }) {
  return waitFor({
    what: `备份 ${id} 结束`,
    timeoutMs: 180_000,
    stepMs: 1000,
    probe: async () => (await get('/backups')).find((entry) => entry.id === id && entry.status !== 'RUNNING'),
  })
}

function stopApi() {
  const pids = execFileSync('bash', ['-c', `lsof -nP -tiTCP:${API_PORT} -sTCP:LISTEN || true`]).toString().trim()
  if (pids.length > 0) {
    execFileSync('bash', ['-c', `kill ${pids.split('\n').join(' ')}; while lsof -nP -tiTCP:${API_PORT} -sTCP:LISTEN >/dev/null 2>&1; do sleep 1; done`])
  }
}

async function startApi({ extra = [] } = {}) {
  stopApi()
  execFileSync('bash', [path.join(ROOT, 'tools/e2e/stack/restart-api.sh'), String(SLOT), ...extra], { stdio: 'pipe', timeout: 600000 })
  await waitFor({
    what: 'API 可以访问',
    timeoutMs: 300_000,
    stepMs: 1000,
    probe: async () => (await fetch(`${API}/flags`).then((response) => response.ok).catch(() => false)),
  })
}

async function readDatabase({ sql }) {
  stopApi()
  const { PGlite } = requireFromApi('@electric-sql/pglite')
  const { vector } = requireFromApi('@electric-sql/pglite/vector')
  const database = await PGlite.create({ dataDir: path.join(CONFIG_DIR, 'pglite'), extensions: { vector } })
  try {
    const result = await database.query(sql)
    return result.rows
  }
  finally {
    await database.close()
    await startApi()
  }
}
