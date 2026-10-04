import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ADMIN, API, assert, check, http, sleep, STATE_DIR, summary, waitFor } from './lib/s5-kit.mjs'

const SLOT = Number(process.env.E2E_SLOT ?? 1)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const API_PORT = 3100 + SLOT
const CONFIG_DIR = path.join(STATE_DIR, 'config')
const BACKUP_DIR = path.join(CONFIG_DIR, 'backups')
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef'
const JWT_SECRET = `e2e-slot-${SLOT}-secret`
const ONLY = (process.env.E2E_ONLY ?? '').split(',').filter(Boolean)
const requireFromApi = createRequire(path.join(ROOT, 'packages/server/api/package.json'))

let session = null

const phases = [
  { name: 'pglite', run: pglitePhase },
  { name: 'failures', run: failuresPhase },
  { name: 'retention', run: retentionPhase },
  { name: 'restore', run: restorePhase },
  { name: 'postgres', run: postgresPhase },
  { name: 'scheduler', run: schedulerPhase },
]

for (const phase of phases) {
  if (ONLY.length > 0 && !ONLY.includes(phase.name)) {
    continue
  }
  console.log(`\n== ${phase.name}`)
  await phase.run()
}
summary()

async function pglitePhase() {
  session = await signInAdmin()
  await resetBackups()
  await check('B1 没有备份时：概览是空状态，计划是默认值，列表为空', async () => {
    const overview = await get('/backups/overview')
    assert(overview.engine.kind === 'PGLITE' && overview.engine.available, `引擎应是可用的 PGLITE，实际 ${JSON.stringify(overview.engine)}`)
    assert(overview.latestSuccess === null && overview.succeededCount === 0, '不应已有成功备份')
    assert(overview.settings.enabled && overview.settings.frequency === 'DAILY' && overview.settings.hour === 2 && overview.settings.keep === 7, `默认计划不对：${JSON.stringify(overview.settings)}`)
    assert(overview.directory === BACKUP_DIR, `备份目录应在数据目录下的 backups，实际 ${overview.directory}`)
    assert(overview.objectStorageAvailable === false, '没配对象存储时不应声称可用')
    assert((await get('/backups')).length === 0, '列表应为空')
    return { next: overview.nextRunAt }
  })

  await check('B2 手动备份：记录从运行中变成成功，文件、清单、校验和、大小都对得上', async () => {
    const created = await post('/backups', { note: '升级前' })
    assert(created.status === 'RUNNING' && created.note === '升级前', `创建后应是运行中，实际 ${created.status}`)
    const done = await waitBackup({ id: created.id })
    assert(done.status === 'SUCCEEDED', `应成功，实际 ${done.status} ${done.error}`)
    const file = path.join(BACKUP_DIR, done.fileName)
    assert(fs.existsSync(file), '备份文件应存在')
    assert(fs.statSync(file).size === done.sizeBytes, '记录的大小应等于文件大小')
    assert(sha256File(file) === done.checksum, '记录的校验和应等于文件的 SHA-256')
    const manifest = JSON.parse(fs.readFileSync(`${file}.manifest.json`, 'utf8'))
    assert(manifest.id === done.id && manifest.checksum === done.checksum && manifest.engine === 'PGLITE', '清单文件应写明同一份备份')
    assert(done.counts.users >= 1 && done.counts.projects >= 1, `应记录备份时的数量，实际 ${JSON.stringify(done.counts)}`)
    return { file: done.fileName, size: done.sizeBytes }
  })

  await check('B3 备份文件里没有加密密钥和 JWT 密钥，只记指纹', async () => {
    const [backup] = await get('/backups')
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fema-backup-scan-'))
    try {
      execFileSync('tar', ['-xzf', path.join(BACKUP_DIR, backup.fileName), '-C', workdir], { stdio: 'pipe' })
      const hits = grepTree({ dir: workdir, needles: [ENCRYPTION_KEY, JWT_SECRET, Buffer.from(ENCRYPTION_KEY).toString('base64')] })
      assert(hits.length === 0, `备份里不应出现密钥原文：${hits.join(', ')}`)
    }
    finally {
      fs.rmSync(workdir, { recursive: true, force: true })
    }
    const fingerprint = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest('hex').slice(0, 8)
    assert(backup.keyFingerprint === fingerprint, `指纹应是密钥 SHA-256 的前 8 位 ${fingerprint}，实际 ${backup.keyFingerprint}`)
    const manifestText = fs.readFileSync(path.join(BACKUP_DIR, `${backup.fileName}.manifest.json`), 'utf8')
    assert(!manifestText.includes(ENCRYPTION_KEY) && !manifestText.includes(JWT_SECRET), '清单文件里不应有密钥')
    return { fingerprint }
  })

  await check('B4 备份运行中再点一次：被拒绝并说明，不会同时跑两个', async () => {
    const first = await post('/backups', {})
    const second = await http({ method: 'POST', path: '/backups', body: {}, token: session.token })
    assert(second.status === 409 && String(second.text).includes('already running'), `第二次应被拒绝，实际 ${second.status} ${second.text.slice(0, 200)}`)
    const done = await waitBackup({ id: first.id })
    assert(done.status === 'SUCCEEDED', `第一个应成功，实际 ${done.status}`)
  })

  await check('B5 恢复预检：完好的备份各项都通过，会覆盖什么写得清楚', async () => {
    const [latest] = await get('/backups')
    const precheck = await get(`/backups/${latest.id}/restore-precheck`)
    assert(precheck.canRestore === true, `应可恢复：${JSON.stringify(precheck.checks.filter((item) => item.level === 'ERROR'))}`)
    const kinds = precheck.checks.map((item) => `${item.kind}:${item.level}`)
    for (const expected of ['FILE_PRESENT:OK', 'CHECKSUM:OK', 'READABLE:OK', 'ENGINE:OK', 'VERSION:OK', 'ENCRYPTION_KEY:OK']) {
      assert(kinds.includes(expected), `预检应有 ${expected}，实际 ${kinds.join(' ')}`)
    }
    assert(precheck.overwrites.backup && precheck.overwrites.backup.users === latest.counts.users, '应列出备份里的数量')
    assert(precheck.target.fileName === latest.fileName && precheck.target.directory === BACKUP_DIR, '应给出文件位置供恢复步骤使用')
  })

  await check('B8 备份期间服务器在处理请求：每份备份都是一致的（引擎会把备份解开再启动一次数据库来验证）', async () => {
    let busy = true
    const hammer = (async () => {
      while (busy) {
        await Promise.all([get('/backups'), get('/health/overview'), get('/service-settings')]).catch(() => undefined)
      }
    })()
    try {
      for (let round = 0; round < 3; round += 1) {
        const created = await post('/backups', { note: `繁忙时备份${round}` })
        const done = await waitBackup({ id: created.id })
        assert(done.status === 'SUCCEEDED', `第 ${round + 1} 份应成功，实际 ${done.status} ${done.error}`)
        const precheck = await get(`/backups/${done.id}/restore-precheck`)
        const readable = precheck.checks.find((item) => item.kind === 'READABLE')
        assert(readable.level === 'OK' && readable.params.verifiedWith === 'open', `应通过启动验证，实际 ${JSON.stringify(readable)}`)
      }
    }
    finally {
      busy = false
      await hammer
    }
  })

  await check('B6 计划校验：保留份数超范围被拒；没配对象存储时不能勾选复制', async () => {
    const base = { enabled: true, frequency: 'DAILY', weekday: 1, hour: 2, keep: 7, uploadToObjectStorage: false }
    const tooMany = await http({ method: 'POST', path: '/backups/settings', body: { ...base, keep: 0 }, token: session.token })
    assert(tooMany.status === 400 && String(tooMany.text).includes('backupKeepRange'), `keep=0 应返回 i18n 键 backupKeepRange，实际 ${tooMany.status} ${tooMany.text.slice(0, 200)}`)
    const badHour = await http({ method: 'POST', path: '/backups/settings', body: { ...base, hour: 24 }, token: session.token })
    assert(badHour.status === 400 && String(badHour.text).includes('backupHourRange'), '小时 24 应被拒')
    const upload = await http({ method: 'POST', path: '/backups/settings', body: { ...base, uploadToObjectStorage: true }, token: session.token })
    assert(upload.status === 409 && String(upload.text).includes('Object storage is not configured'), `应拒绝并说明，实际 ${upload.status} ${upload.text.slice(0, 200)}`)
    const saved = await post('/backups/settings', { ...base, frequency: 'WEEKLY', weekday: 3, hour: 4, keep: 14 })
    assert(saved.frequency === 'WEEKLY' && saved.weekday === 3 && saved.hour === 4 && saved.keep === 14, '合法计划应保存成功')
    const overview = await get('/backups/overview')
    assert(overview.settings.keep === 14 && overview.nextRunAt !== null, '概览应反映新计划和下次时间')
    await post('/backups/settings', base)
  })

  await check('B7 未登录、无权限访问备份接口被拒绝', async () => {
    const anonymous = await http({ method: 'GET', path: '/backups/overview' })
    assert([401, 403].includes(anonymous.status), `未登录应被拒绝，实际 ${anonymous.status}`)
    const anonymousCreate = await http({ method: 'POST', path: '/backups', body: {} })
    assert([401, 403].includes(anonymousCreate.status), `未登录创建应被拒绝，实际 ${anonymousCreate.status}`)
  })
}

async function failuresPhase() {
  session = session ?? (await signInAdmin())
  const corrupt = await makeBackup({ note: '将被损坏' })
  const missing = await makeBackup({ note: '将被删除' })
  const versioned = await makeBackup({ note: '版本不匹配' })

  await check('F1 备份文件被改动：预检报校验和不一致并禁止恢复', async () => {
    fs.appendFileSync(path.join(BACKUP_DIR, corrupt.fileName), Buffer.from('tampered'))
    const precheck = await get(`/backups/${corrupt.id}/restore-precheck`)
    assert(precheck.canRestore === false, '损坏的备份不应能恢复')
    const levels = Object.fromEntries(precheck.checks.map((item) => [item.kind, item.level]))
    assert(levels.CHECKSUM === 'ERROR' && levels.FILE_PRESENT === 'ERROR', `校验和和大小应报错，实际 ${JSON.stringify(levels)}`)
  })

  await check('F2 备份文件被删除：列表标明不可恢复和原因，预检报文件缺失', async () => {
    fs.rmSync(path.join(BACKUP_DIR, missing.fileName))
    const item = (await get('/backups')).find((entry) => entry.id === missing.id)
    assert(item.restorable === false && item.unrestorableReason === 'FILE_MISSING', `应是 FILE_MISSING，实际 ${item.unrestorableReason}`)
    const precheck = await get(`/backups/${missing.id}/restore-precheck`)
    assert(precheck.canRestore === false && precheck.checks.some((check) => check.kind === 'FILE_PRESENT' && check.level === 'ERROR' && check.params.reason === 'MISSING'), '预检应报文件缺失')
  })

  await check('F3 备份来自更新的版本：预检拒绝并说明；来自更旧的版本：提醒迁移；密钥指纹不同：提醒', async () => {
    const newer = await makeBackup({ note: '来自新版本' })
    const older = await makeBackup({ note: '来自旧版本' })
    const rekeyed = await makeBackup({ note: '换过密钥' })
    await editDatabase({
      statements: [
        `UPDATE "backup_record" SET "appVersion" = '9.9.9', "schemaVersion" = 'FutureMigration9999999999999' WHERE id = '${newer.id}'`,
        `UPDATE "backup_record" SET "appVersion" = '0.80.0' WHERE id = '${older.id}'`,
        `UPDATE "backup_record" SET "keyFingerprint" = 'deadbeef' WHERE id = '${rekeyed.id}'`,
      ],
    })
    session = await signInAdmin()
    const listed = await get('/backups')
    assert(listed.find((entry) => entry.id === newer.id).unrestorableReason === 'NEWER_VERSION', '列表应标 NEWER_VERSION')
    const newerCheck = await get(`/backups/${newer.id}/restore-precheck`)
    const version = newerCheck.checks.find((item) => item.kind === 'VERSION')
    assert(newerCheck.canRestore === false && version.level === 'ERROR' && version.params.relation === 'newer', `较新版本应被拒绝，实际 ${JSON.stringify(version)}`)
    const olderCheck = await get(`/backups/${older.id}/restore-precheck`)
    const olderVersion = olderCheck.checks.find((item) => item.kind === 'VERSION')
    assert(olderCheck.canRestore === true && olderVersion.level === 'WARNING' && olderVersion.params.relation === 'older', `较旧版本应是提醒，实际 ${JSON.stringify(olderVersion)}`)
    const rekeyedCheck = await get(`/backups/${rekeyed.id}/restore-precheck`)
    const key = rekeyedCheck.checks.find((item) => item.kind === 'ENCRYPTION_KEY')
    assert(rekeyedCheck.canRestore === true && key.level === 'WARNING' && key.params.relation === 'different', `密钥不同应是提醒，实际 ${JSON.stringify(key)}`)
  })

  await check('F6 备份文件能解开但里面的数据库坏了：预检用启动验证抓出来，不让恢复', async () => {
    const target = await makeBackup({ note: '数据库内容损坏' })
    const file = path.join(BACKUP_DIR, target.fileName)
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fema-backup-corrupt-'))
    try {
      execFileSync('tar', ['-xzf', file, '-C', workdir], { stdio: 'pipe' })
      fs.writeFileSync(path.join(workdir, 'global', 'pg_control'), Buffer.alloc(8192))
      execFileSync('tar', ['-czf', file, '-C', workdir, '.'], { stdio: 'pipe' })
    }
    finally {
      fs.rmSync(workdir, { recursive: true, force: true })
    }
    await editDatabase({ statements: [`UPDATE "backup_record" SET "checksum" = '${sha256File(file)}', "sizeBytes" = ${fs.statSync(file).size} WHERE id = '${target.id}'`] })
    session = await signInAdmin()
    const precheck = await get(`/backups/${target.id}/restore-precheck`)
    const levels = Object.fromEntries(precheck.checks.map((item) => [item.kind, item]))
    assert(levels.CHECKSUM.level === 'OK' && levels.FILE_PRESENT.level === 'OK', '文件本身没变，大小和校验和应该对得上')
    assert(levels.READABLE.level === 'ERROR' && levels.READABLE.params.verifiedWith === 'open', `启动验证应报错，实际 ${JSON.stringify(levels.READABLE)}`)
    assert(precheck.canRestore === false, '数据库坏了的备份不能恢复')
  })

  await check('F4 升级前检查读取真实备份：最近一次备份不是当前版本创建时，概览如实反映', async () => {
    const overview = await get('/health/overview')
    assert(overview.backup.latestSuccessAt !== null, '概览应带最近一次成功备份时间')
    await editDatabase({ statements: [`UPDATE "backup_record" SET "appVersion" = '0.80.0' WHERE "status" = 'SUCCEEDED'`] })
    session = await signInAdmin()
    const mismatched = await get('/health/overview')
    assert(mismatched.backup.matchesCurrentVersion === false && mismatched.backup.latestSuccessVersion === '0.80.0', `版本不同应标出，实际 ${JSON.stringify(mismatched.backup)}`)
    await editDatabase({ statements: [`UPDATE "backup_record" SET "appVersion" = '${overview.release.current}' WHERE "status" = 'SUCCEEDED' AND "appVersion" = '0.80.0'`] })
    session = await signInAdmin()
    const restored = await get('/health/overview')
    assert(restored.backup.matchesCurrentVersion === true, '改回后应显示版本一致')
  })

  await check('F5 删除备份：文件、清单和记录都没了；运行中的删不掉', async () => {
    const target = await makeBackup({ note: '将被删除2' })
    const filePath = path.join(BACKUP_DIR, target.fileName)
    assert(fs.existsSync(filePath), '删除前文件应在')
    const removed = await del(`/backups/${target.id}`)
    assert(removed.status === 204, `删除应返回 204，实际 ${removed.status}`)
    assert(!fs.existsSync(filePath) && !fs.existsSync(`${filePath}.manifest.json`), '文件和清单应一并删除')
    assert(!(await get('/backups')).some((entry) => entry.id === target.id), '记录应一并删除')
    const running = await post('/backups', {})
    const denied = await del(`/backups/${running.id}`)
    assert(denied.status === 409 && String(denied.text).includes('running'), `运行中的备份应拒绝删除，实际 ${denied.status}`)
    await waitBackup({ id: running.id })
    const missingRecord = await del('/backups/doesnotexist0000000000')
    assert(missingRecord.status === 404, `不存在的备份应返回 404，实际 ${missingRecord.status}`)
  })
}

async function retentionPhase() {
  session = session ?? (await signInAdmin())
  await check('R1 保留份数：只删最早的定时备份，手动备份和较新的定时备份保留', async () => {
    const source = await makeBackup({ note: '保留测试样本' })
    const sourceFile = path.join(BACKUP_DIR, source.fileName)
    const fakes = Array.from({ length: 5 }, (_, index) => ({
      id: `retention${String(index).padStart(11, '0')}`,
      fileName: `fema-retention-${index}.pglite.tar.gz`,
      startedAt: new Date(Date.now() - (10 - index) * 3600_000).toISOString(),
    }))
    fakes.forEach((fake) => fs.copyFileSync(sourceFile, path.join(BACKUP_DIR, fake.fileName)))
    const tenantId = source.tenantId
    await editDatabase({
      statements: fakes.map((fake) => `INSERT INTO "backup_record" ("id", "tenantId", "status", "trigger", "engine", "appVersion", "fileName", "sizeBytes", "checksum", "startedAt", "finishedAt", "uploadedToObjectStorage") VALUES ('${fake.id}', '${tenantId}', 'SUCCEEDED', 'SCHEDULED', 'PGLITE', '0.88.3', '${fake.fileName}', ${source.sizeBytes}, '${source.checksum}', '${fake.startedAt}', '${fake.startedAt}', false)`),
    })
    session = await signInAdmin()
    const before = (await get('/backups')).filter((entry) => entry.trigger === 'SCHEDULED' && entry.status === 'SUCCEEDED')
    assert(before.length === 5, `应有 5 份定时备份，实际 ${before.length}`)
    await post('/backups/settings', { enabled: true, frequency: 'DAILY', weekday: 1, hour: 2, keep: 3, uploadToObjectStorage: false })
    const after = await get('/backups')
    const scheduled = after.filter((entry) => entry.trigger === 'SCHEDULED' && entry.status === 'SUCCEEDED').map((entry) => entry.fileName)
    assert(scheduled.length === 3, `保留 3 份后应剩 3 份定时备份，实际 ${scheduled.length}`)
    assert(!scheduled.includes('fema-retention-0.pglite.tar.gz') && !scheduled.includes('fema-retention-1.pglite.tar.gz'), '应删最早的两份')
    assert(!fs.existsSync(path.join(BACKUP_DIR, 'fema-retention-0.pglite.tar.gz')), '被删记录的文件也应删除')
    assert(fs.existsSync(path.join(BACKUP_DIR, 'fema-retention-4.pglite.tar.gz')), '较新的定时备份文件应保留')
    assert(after.some((entry) => entry.id === source.id), '手动备份不应被自动删除')
    await post('/backups/settings', { enabled: true, frequency: 'DAILY', weekday: 1, hour: 2, keep: 7, uploadToObjectStorage: false })
  })
}

async function restorePhase() {
  session = session ?? (await signInAdmin())
  await check('S1 恢复实测（PGlite）：按预检给出的步骤在服务器上恢复，备份之后的改动消失，之前的回来', async () => {
    const step = (name) => console.log(`   .. ${name}`)
    const projectId = session.projectId
    step('创建标记文件夹')
    const marker = `恢复标记-${Date.now()}`
    const folder = await post('/folders', { projectId, displayName: marker })
    step('做备份')
    const backup = await makeBackup({ note: '恢复实测' })
    const precheck = await get(`/backups/${backup.id}/restore-precheck`)
    assert(precheck.canRestore, '恢复前预检应通过')
    step('创建备份之后的文件夹')
    const afterBackup = await post('/folders', { projectId, displayName: `${marker}-之后` })
    assert((await folders({ projectId })).some((entry) => entry.id === afterBackup.id), '备份之后创建的文件夹应存在')
    const lastBackup = await post('/backups', { note: `恢复前最后一份-${marker}` }).then((created) => waitBackup({ id: created.id }))

    step('停 API 并替换数据目录')
    stopApi()
    const { directory, dataDirectory, fileName } = precheck.target
    run({ command: `mv ${dataDirectory}/pglite ${dataDirectory}/pglite.before-restore-$(date +%Y%m%d-%H%M%S) && mkdir ${dataDirectory}/pglite && tar -xzf ${directory}/${fileName} -C ${dataDirectory}/pglite` })
    step('启动 API 并登录')
    await startApi()
    session = await signInAdmin()
    const restored = await folders({ projectId })
    assert(restored.some((entry) => entry.id === folder.id), '备份之前的文件夹应回来')
    assert(!restored.some((entry) => entry.id === afterBackup.id), '备份之后的文件夹应消失')
    const list = await get('/backups')
    const restoredEntry = list.find((entry) => entry.id === backup.id)
    assert(restoredEntry !== undefined, '用来恢复的备份仍在列表里')
    assert(restoredEntry.status === 'SUCCEEDED' && restoredEntry.fileName === backup.fileName && restoredEntry.checksum === backup.checksum, `备份期间数据库里它还是「运行中」，恢复后应按清单文件还原成成功，实际 ${restoredEntry.status}`)
    await makeBackup({ note: '恢复后立刻再备份' })
    assert(!list.some((entry) => entry.id === lastBackup.id), '恢复点之后的备份不再出现在列表里（列表在数据库里）')
    assert(fs.existsSync(path.join(BACKUP_DIR, lastBackup.fileName)), '它们的文件仍留在备份目录里')
    fs.readdirSync(dataDirectory).filter((name) => name.startsWith('pglite.before-restore')).forEach((name) => fs.rmSync(path.join(dataDirectory, name), { recursive: true, force: true }))
    return { restoredFolder: folder.id }
  })
}

async function postgresPhase() {
  const bin = ['/opt/homebrew/opt/postgresql@16/bin', '/opt/homebrew/bin'].find((dir) => fs.existsSync(path.join(dir, 'initdb')))
  if (bin === undefined || process.env.E2E_SKIP_POSTGRES === '1') {
    console.log('SKIP 本机没有 PostgreSQL 二进制，PostgreSQL 备份没有实测')
    return
  }
  const dataDir = path.join(STATE_DIR, 'pg-data')
  const port = 55430 + SLOT
  const connection = { FEMA_DB_TYPE: 'POSTGRES', FEMA_POSTGRES_HOST: '127.0.0.1', FEMA_POSTGRES_PORT: String(port), FEMA_POSTGRES_USERNAME: 'fema', FEMA_POSTGRES_PASSWORD: 'e2e-password', FEMA_POSTGRES_DATABASE: 'fema_e2e' }
  const pgEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}`, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' }
  fs.rmSync(dataDir, { recursive: true, force: true })
  execFileSync(path.join(bin, 'initdb'), ['-D', dataDir, '-U', 'fema', '--auth=trust', '-E', 'UTF8'], { stdio: 'pipe', env: pgEnv })
  execFileSync(path.join(bin, 'pg_ctl'), ['-D', dataDir, '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${dataDir}`, '-l', path.join(STATE_DIR, 'pg.log'), '-w', 'start'], { stdio: 'pipe', env: pgEnv })
  const savedConfig = path.join(STATE_DIR, 'config-pglite-saved')
  try {
    execFileSync(path.join(bin, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'fema', 'fema_e2e'], { stdio: 'pipe', env: pgEnv })
    stopApi()
    fs.rmSync(savedConfig, { recursive: true, force: true })
    fs.cpSync(CONFIG_DIR, savedConfig, { recursive: true })
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
    await startApi({ extra: withPath({ connection, path: `${bin}:${process.env.PATH}` }) })
    session = await signInAdmin()

    await check('P1 PostgreSQL：pg_dump 在 PATH 里时备份可用，版本和引擎如实显示', async () => {
      const overview = await get('/backups/overview')
      assert(overview.engine.kind === 'PG_DUMP', `引擎应是 PG_DUMP，实际 ${overview.engine.kind}`)
      assert(overview.engine.available && overview.engine.clientVersion !== null, `应可用：${JSON.stringify(overview.engine)}`)
      return overview.engine
    })

    let backup = null
    await check('P2 PostgreSQL：手动备份得到 pg_dump 自定义格式文件，pg_restore 能列出内容，明文导出里没有密钥', async () => {
      const created = await post('/backups', { note: 'pg_dump 实测' })
      backup = await waitBackup({ id: created.id })
      assert(backup.status === 'SUCCEEDED', `应成功，实际 ${backup.status} ${backup.error}`)
      const file = path.join(BACKUP_DIR, backup.fileName)
      assert(fs.readFileSync(file).subarray(0, 5).toString() === 'PGDMP', '应是 pg_dump 自定义格式')
      const listing = execFileSync(path.join(bin, 'pg_restore'), ['--list', file], { env: pgEnv }).toString()
      assert(listing.includes('TABLE DATA') && listing.includes('backup_record'), 'pg_restore 应能列出表')
      const plain = execFileSync(path.join(bin, 'pg_restore'), ['-f', '-', file], { env: pgEnv, maxBuffer: 512 * 1024 * 1024 }).toString()
      assert(!plain.includes(ENCRYPTION_KEY) && !plain.includes(JWT_SECRET), '明文导出里不应有密钥原文')
      assert(backup.databaseVersion?.startsWith('16'), `应记录数据库版本，实际 ${backup.databaseVersion}`)
    })

    await check('P3 PostgreSQL：恢复预检通过，用 pg_restore 读出目录', async () => {
      const precheck = await get(`/backups/${backup.id}/restore-precheck`)
      const readable = precheck.checks.find((item) => item.kind === 'READABLE')
      assert(precheck.canRestore && readable.params.verifiedWith === 'pg_restore', `应用 pg_restore 验证，实际 ${JSON.stringify(readable)}`)
      const space = precheck.checks.find((item) => item.kind === 'DISK_SPACE')
      assert(space.params.scope === 'DATABASE_SERVER', '数据库服务器的磁盘平台看不到，应如实说明')
    })

    await check('P4 PostgreSQL 手动恢复实测：pg_restore 到数据库，备份之后的数据消失，之前的回来', async () => {
      const projectId = session.projectId
      const before = await post('/folders', { projectId, displayName: `pg-恢复前-${Date.now()}` })
      const second = await post('/backups', { note: '含恢复前文件夹' }).then((created) => waitBackup({ id: created.id }))
      const after = await post('/folders', { projectId, displayName: `pg-恢复后-${Date.now()}` })
      stopApi()
      execFileSync(path.join(bin, 'pg_restore'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'fema', '-d', 'fema_e2e', '--clean', '--if-exists', '--no-owner', path.join(BACKUP_DIR, second.fileName)], { env: pgEnv, stdio: 'pipe' })
      await startApi({ extra: withPath({ connection, path: `${bin}:${process.env.PATH}` }) })
      session = await signInAdmin()
      const restored = await folders({ projectId })
      assert(restored.some((entry) => entry.id === before.id), '备份里的文件夹应回来')
      assert(!restored.some((entry) => entry.id === after.id), '备份之后的文件夹应消失')
    })

    await check('P5 没有 pg_dump：降级为未启用并写明怎么装，创建备份被拒绝，不报错', async () => {
      stopApi()
      await startApi({ extra: withPath({ connection, path: `${path.dirname(process.execPath)}:/usr/bin:/bin` }) })
      session = await signInAdmin()
      const overview = await get('/backups/overview')
      assert(overview.engine.available === false && overview.engine.problem === 'PG_DUMP_MISSING', `应是 PG_DUMP_MISSING，实际 ${JSON.stringify(overview.engine)}`)
      const refused = await http({ method: 'POST', path: '/backups', body: {}, token: session.token })
      assert(refused.status === 409 && String(refused.text).includes('pg_dump is not installed'), `应拒绝并说明，实际 ${refused.status} ${refused.text.slice(0, 200)}`)
      assert((await get('/backups')).some((entry) => entry.id === backup.id), '已有备份仍可见')
      const withoutRestore = await get(`/backups/${backup.id}/restore-precheck`)
      const readable = withoutRestore.checks.find((item) => item.kind === 'READABLE')
      assert(withoutRestore.canRestore === true && readable.level === 'OK' && readable.params.verifiedWith === 'header', `没有 pg_restore 时只验文件头并如实说明，实际 ${JSON.stringify(readable)}`)
      const health = await get('/health/overview')
      assert(health.backup.engineAvailable === false, '升级前检查应知道备份不可用')
    })

    await check('P6 pg_dump 比数据库旧：降级为未启用并写明版本，创建备份被拒绝并说明', async () => {
      const fakeDir = path.join(STATE_DIR, 'fake-old-pg-dump')
      fs.mkdirSync(fakeDir, { recursive: true })
      fs.writeFileSync(path.join(fakeDir, 'pg_dump'), '#!/bin/sh\necho "pg_dump (PostgreSQL) 12.4"\n', { mode: 0o755 })
      await startApi({ extra: withPath({ connection, path: `${fakeDir}:${path.dirname(process.execPath)}:/usr/bin:/bin` }) })
      session = await signInAdmin()
      const overview = await get('/backups/overview')
      assert(overview.engine.available === false && overview.engine.problem === 'PG_DUMP_TOO_OLD', `应是 PG_DUMP_TOO_OLD，实际 ${JSON.stringify(overview.engine)}`)
      assert(overview.engine.clientVersion === '12.4' && overview.engine.serverVersion.startsWith('16'), `应写明两边的版本，实际 ${JSON.stringify(overview.engine)}`)
      const refused = await http({ method: 'POST', path: '/backups', body: {}, token: session.token })
      assert(refused.status === 409 && String(refused.text).includes('older than the database server'), `应拒绝并说明，实际 ${refused.status} ${refused.text.slice(0, 200)}`)
      const listed = await get('/backups')
      assert(!listed.some((entry) => entry.status === 'FAILED' && entry.note === null && entry.trigger === 'MANUAL'), '手动备份被拒绝不应留下失败记录')
      fs.rmSync(fakeDir, { recursive: true, force: true })
    })
  }
  finally {
    stopApi()
    execFileSync(path.join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], { stdio: 'pipe', env: pgEnv })
    fs.rmSync(dataDir, { recursive: true, force: true })
    fs.rmSync(CONFIG_DIR, { recursive: true, force: true })
    fs.cpSync(savedConfig, CONFIG_DIR, { recursive: true })
    fs.rmSync(savedConfig, { recursive: true, force: true })
    await startApi()
    session = await signInAdmin()
  }
}

async function schedulerPhase() {
  if (process.env.E2E_SCHEDULER !== '1') {
    console.log('SKIP 定时执行要等下一个整刻钟，设 E2E_SCHEDULER=1 才跑')
    return
  }
  session = session ?? (await signInAdmin())
  await check('T1 定时备份：计划时间已过且还没跑过时，下一个整刻钟自动备份，且同一时间点只跑一次', async () => {
    const existing = (await get('/backups'))[0] ?? (await makeBackup({ note: '取组织编号' }))
    const tenantId = existing.tenantId
    const hour = new Date().getUTCHours()
    await editDatabase({
      statements: [
        `UPDATE "tenant" SET "created" = now() - interval '5 days' WHERE id = '${tenantId}'`,
        `DELETE FROM "backup_record" WHERE "trigger" = 'SCHEDULED'`,
      ],
    })
    session = await signInAdmin()
    await post('/backups/settings', { enabled: true, frequency: 'DAILY', weekday: 1, hour, keep: 7, uploadToObjectStorage: false })
    const started = Date.now()
    const scheduled = await waitFor({
      what: '定时备份出现',
      timeoutMs: 17 * 60_000,
      stepMs: 5000,
      probe: async () => (await get('/backups')).find((entry) => entry.trigger === 'SCHEDULED' && entry.status === 'SUCCEEDED'),
    })
    assert(scheduled.createdBy === null, '定时备份没有操作人')
    await sleep(35_000)
    const count = (await get('/backups')).filter((entry) => entry.trigger === 'SCHEDULED').length
    assert(count === 1, `同一时间点只应有一份定时备份，实际 ${count}`)
    return { waitedSeconds: Math.round((Date.now() - started) / 1000) }
  })
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

async function del(urlPath) {
  const response = await fetch(`${API}${urlPath}`, { method: 'DELETE', headers: { authorization: `Bearer ${session.token}` } })
  const text = await response.text()
  return { ok: response.ok, status: response.status, text }
}

async function folders({ projectId }) {
  const response = await get(`/folders?projectId=${projectId}&limit=200`)
  return response.data ?? response
}

async function waitIdle() {
  await waitFor({
    what: '没有运行中的备份',
    timeoutMs: 180_000,
    stepMs: 1000,
    probe: async () => !(await get('/backups')).some((entry) => entry.status === 'RUNNING'),
  })
}

async function resetBackups() {
  await waitIdle()
  for (const entry of await get('/backups')) {
    await del(`/backups/${entry.id}`)
  }
  await post('/backups/settings', { enabled: true, frequency: 'DAILY', weekday: 1, hour: 2, keep: 7, uploadToObjectStorage: false })
}

async function makeBackup({ note }) {
  await waitIdle()
  const created = await post('/backups', { note })
  const done = await waitBackup({ id: created.id })
  assert(done.status === 'SUCCEEDED', `备份「${note}」应成功，实际 ${done.status} ${done.error}`)
  return done
}

async function waitBackup({ id }) {
  return waitFor({
    what: `备份 ${id} 结束`,
    timeoutMs: 120_000,
    stepMs: 1000,
    probe: async () => (await get('/backups')).find((entry) => entry.id === id && entry.status !== 'RUNNING'),
  })
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function grepTree({ dir, needles }) {
  const hits = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      const content = fs.readFileSync(full)
      needles.forEach((needle) => {
        if (content.includes(needle)) {
          hits.push(`${path.relative(dir, full)} 含 ${needle.slice(0, 6)}...`)
        }
      })
    }
  }
  walk(dir)
  return hits
}

function stopApi() {
  const pids = execFileSync('bash', ['-c', `lsof -nP -tiTCP:${API_PORT} -sTCP:LISTEN || true`]).toString().trim()
  if (pids.length > 0) {
    execFileSync('bash', ['-c', `kill ${pids.split('\n').join(' ')}; while lsof -nP -tiTCP:${API_PORT} -sTCP:LISTEN >/dev/null 2>&1; do sleep 1; done`])
  }
}

async function startApi({ extra = [] } = {}) {
  execFileSync('bash', [path.join(ROOT, 'tools/e2e/stack/restart-api.sh'), String(SLOT), ...extra], { stdio: 'pipe', timeout: 600000 })
  await waitFor({
    what: 'API 可以访问',
    timeoutMs: 300_000,
    stepMs: 1000,
    probe: async () => (await fetch(`${API}/flags`).then((response) => response.ok).catch(() => false)),
  })
}

function withPath({ connection, path: searchPath }) {
  return [...Object.entries(connection).map(([key, value]) => `${key}=${value}`), `PATH=${searchPath}`]
}

function run({ command }) {
  execFileSync('bash', ['-c', command], { stdio: 'pipe' })
}

async function editDatabase({ statements }) {
  stopApi()
  const { PGlite } = requireFromApi('@electric-sql/pglite')
  const { vector } = requireFromApi('@electric-sql/pglite/vector')
  const database = await PGlite.create({ dataDir: path.join(CONFIG_DIR, 'pglite'), extensions: { vector } })
  try {
    for (const statement of statements) {
      await database.exec(statement)
    }
  }
  finally {
    await database.close()
  }
  await startApi()
}

