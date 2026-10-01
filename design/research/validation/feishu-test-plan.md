# 飞书实测方案

2026-10-01。这是一份写给产品负责人的实测手册：注册一个飞书测试企业，准备约 3 小时，再照着做 1 到 2 天，就能拿到结果。范围包括 `feishu-capabilities.md` 第 10 节实测清单的 T1 到 T22，`contradictions.md`、`org-and-lifecycle.md`、`alternatives.md`、`reachability-and-ai-clients.md` 里所有标「需实测」的飞书事项（逐条对应见 §2.0），以及 `engine-spike.md` 第 10 节里的几项飞书事项。

本文只写怎么测。结果建议写进 `design/research/validation/feishu-results.md`，模板在 §4.1。原始记录留在本机的工作目录里，其中有同事的手机号，不进仓库。下文引用的调研文件都在 `design/research/landscape/` 目录下，只写文件名。

已经定下的前提：首发主线是「北森员工变动 → 飞书通讯录开通账号并通知」。首发主打「北森 + 飞书、没买北森飞书连接器、没上 IDaaS、现在靠脚本或手工」的企业；平台探测到别的写入方时默认只读核对，飞书人事客户不进这条主线。离职分两段，首发只做暂停（见决定 000041、000042 的 10 月 1 日修订）。实测只回答「飞书实际怎么表现」，不替产品中心方向下结论。

---

## 0. 一页摘要

### 0.1 先说结论

1. **用飞书免费版的真实租户，不用开发者后台的「测试企业」。** 测试企业「固定为未认证的基础版」，测试版应用的权限和事件变更「自动生效，无需再重新创建版本和走审核流程」（[测试企业与人员](https://open.feishu.cn/document/develop-process/test-and-release-app/testing-enterprise-and-personnel-functions)）。所以 T9、T10 这类「改范围 → 发版 → 审核 → 生效」的项，在测试企业里测不出来。测试企业只用来先把脚本跑通。
2. **有两条约束，直接改变了测法。**
   - **人数上限。** 免费版「支持 100 用户」（飞书官网[版本对比](https://www.feishu.cn/service)页，2026-10-01 读的页面脚本）；「未认证企业的人数上限为 100」（[创建用户](https://open.feishu.cn/document/server-docs/contact-v3/user/create)文档）。300 人在飞书里建不出来，所以 300 人放在北森一侧的本地样本里；飞书一侧是 30 个部门、最多约 50 个账号。
   - **手机号和邀请。** 创建用户时 `mobile` 必填。账号一建好，系统就「以短信或邮件的形式向用户发送邀请」，接口没有关闭邀请的参数。另外，「一个手机号码或者一个邮箱，一天只能加入三个租户」（44009）。因此真人账号只用 3 到 5 位同事自愿提供的号码。合成账号要先过 T0 探针（§1.8）：只有飞书接受大陆不存在的 1099 号段，才造合成账号。
3. **免费版测不了的项**：恢复已删除用户、商业版频控等级、单部门 500 人以上、行为审计接口、飞书人事企业版。这些列在 §5，靠问飞书、访谈或在试用租户里补测。
4. **记录全自动。** 所有接口请求都从 `feishu.mjs` 发出，请求、完整响应和响应头会写进 `results/calls.ndjson`；长连接事件和卡片回调分别写进 `results/events-*.ndjson` 和 `results/cards-*.ndjson`。需要人在客户端上看的项（暂停后能否登录、会话多久失效、席位怎么算、资源转移去向）单独成节，见 §3。
5. **端到端脚本要改过才能连真实飞书。** 读 `tools/e2e/main-line/` 的结论：目标地址由 API 和 worker 进程的 `FEMA_FEISHU_BASE_URL` 决定。brain 页和提交说明里写的「设置 `E2E_FEISHU_*`、去掉 `FEMA_FEISHU_BASE_URL`」不够，原因有三：8 项判定里有 3 项读的是模拟服务的 `/__admin/state`；两个写死的手机号会收到真实的邀请；`od-rd`、`od-hr` 这两个部门在真实租户里不存在。§7 写了改法和步骤，北森一侧仍用模拟服务。

### 0.2 日程

范围配置的代号：**S1** 全部成员；**S2** 部分成员（平台中心）；**S3** 部分成员（平台中心、外部协作）。部门代号见 §1.8，人的代号见 §1.2。

`interview-guide.md` 要求在第 3 场访谈之前跑完 T6、T7、T10、T18、T20，所以这五项都排在第 1 天。

| 时间 | 范围 | 做什么 |
| --- | --- | --- |
| 第 0 天，约 3 小时 | S1 | 完成 §1 全部：注册、M6 入口检查、建 App1 和 App2、开权限、配长连接、发布、建 HR 群；用 `seed.mjs` 造部门和样本；跑 T0 探针；条件允许时造合成账号；截 T13 要用的额度基线 |
| 第 1 天 09:00 | S1 | T20（建 R1、R2），同时做 T29；T2-a 到 T2-c（建 R3）。R1、R2 接受邀请，R3 不点 |
| 09:45 | S1 | T3、T7、T23、T26、T11（全员）、T12（全员） |
| 10:30 | S1 | T2-d；T19（T19-d 除外）；T18（R1 点卡片）；T14；T17 |
| 11:30 | S1 | T13；T8 的准备（R1、R2 建资源，建 FS-P7、FS-P8 两个部门群） |
| 13:00 | S1 → S2 | T10-0（在开发者后台改范围，同时计时）；T1；T9；T11（部分）；T12-e |
| 14:00 | S2 → S3 | T10-1、T10-2；T19-d |
| 15:00 | S3 | T6（同时做 M1、M2）；T5 |
| 17:00 | S3 | 布置 T15：App1 慢处理过夜，App2 分两段离线；填当天的结果表 |
| 第 2 天 09:00 | S3 | 收 T15 的结果；T2-e；开始 T22（经代理长跑到约 11:30） |
| 10:00 | S3 | T4（顺带删除未激活的 R3）；11:00 做 T2-f |
| 11:30 | S3 | T8 删除（同时做 M3、M2）；T30；T31 |
| 13:30 | S3 | §7 端到端（用 R4、R5 的号码） |
| 15:30 | S3 | T24、T27（可选，放在最后，因为 T24 可能改变租户模式） |
| 16:30 | | 填 §4 的结果表和对照表 |
| 第 3 天、第 8 天 | | T2-g，各 2 分钟 |

---

## 1. 准备

### 1.1 注册哪一档

**注册免费版，不做企业认证。** 在飞书官网用 R0 的手机号「创建企业」，名称起一个一眼能认出的，例如「集成平台实测 2026-10」。

官网注册入口的来源标记里有「官网注册旗舰版试用」（2026-10-01 从官网脚本里看到）。能不能领到试用、试用多久、是否包含「恢复已删除用户」，以注册时的页面为准。如果领得到，就另开一个试用租户补测 §5 的前两项。不要把免费版租户升级：月调用额度（T13）只有免费版才有，升级后就测不到了。

| 测试项 | 免费版能不能测 | 说明 |
| --- | --- | --- |
| T1–T7、T9–T12、T14–T20、T22、T23、T26、T29–T31 | 能 | |
| T8 | 能，恢复那一步除外 | 恢复已删除用户「仅适用于飞书商业专业版、商业旗舰版、企业标准版、企业专业版、企业旗舰版」，免费版只记录报错 |
| T13 | 能 | 月调用量上限只在「基础免费版」有；商业版的频控等级（100 次/秒）测不了 |
| T21 | 不能 | 要在一个部门里放第 501 个人，免费版总共只有 100 人；商业版「支持 500 用户」也不够 |
| T24 | 部分能 | 飞书人事企业版要付费；标准版能否在免费租户启用，进管理后台看（M6） |
| T25、T27 | 先看入口 | 「组织架构数据同步」和 aily 的适用版本都未查到，先在 M6 里看入口在不在 |
| T28 | 延后 | 等平台的预演做出来，再在这个租户上测 |
| 300 人规模 | 不能 | 见 §0.1 第 2 条 |
| 非 +86 手机号 | 要先认证 | 44019：「未认证企业仅支持添加中国大陆 +86 手机号……完成认证后次日可添加」。本方案用不到 |

### 1.2 人和号码

| 代号 | 是谁 | 账号怎么来 | 要做什么 | 用在哪些测试 |
| --- | --- | --- | --- | --- |
| R0 | 产品负责人 | 注册租户时自动成为创建者和超级管理员 | 电脑和手机都装飞书；在管理后台审批、看席位；点卡片 | 全程；担任 R1 的直属上级 |
| R1 | 同事甲（要有一个能收信的邮箱） | T20 用接口建：`user_id` 为 `tr1`，产品部，上级 R0，工号 E9001 | 收到邀请后接受；手机和电脑都登录；建 T8 用的资源；点卡片 | T3、T5、T6、T8、T14、T17、T18、T20 |
| R2 | 同事乙 | T20 建：`tr2`，数据部，没有上级，工号 E9002 | 接受邀请；建 T8 用的资源 | T3、T4、T5、T8、T9、T17、T30 |
| R3 | 同事丙 | T2-a 建：`tr3`，在「外部协作 / 驻场顾问」下，工号 E9003 | **收到邀请先不要点**；第 2 天按 T7 的要求点一次 | T1、T2、T4、T7 |
| R4、R5 | 同事丁、戊 | 由 §7 的端到端脚本建，名字是「张三」「李四」 | 第 2 天下午之前不能出现在租户里 | §7；T1 拿 R4 的号码当「租户里没有的人」 |

- 事先跟每个人说清楚：会收到飞书的邀请短信或邮件，账号属于测试企业，第 2 天会被暂停或删除。
- 一个号码一天最多加入 3 个租户（44009）；加入得太频繁，会报「用户加入团队过于频繁，请 24 小时后重试」（44004）。不要拿同一个号码在同一天删了又建，只有 T30 是故意这么做的。
- 号码只写在本机的 `lab.env` 里。写进结果文档时，只保留后四位。

### 1.3 工作目录和请求脚本

需要 Node 18 或更高版本（用 `node -v` 查看），它自带 `fetch`。

```bash
mkdir -p ~/feishu-lab/results/screens && cd ~/feishu-lab
npm init -y > /dev/null
npm i @larksuiteoapi/node-sdk@1.74.0 https-proxy-agent@7
```

凭证和号码放进 `lab.env`。执行 `chmod 600 lab.env`，之后每开一个终端，先 `source lab.env`。脚本只从环境变量里读凭证，不写死在代码里：

```bash
export FEISHU_APP_ID='cli_xxxxxxxxxxxxxxxx'
export FEISHU_APP_SECRET='<App1 的 App Secret>'
export APP2_ID='cli_yyyyyyyyyyyyyyyy'
export APP2_SECRET='<App2 的 App Secret>'
export R0_MOBILE='+86<R0 的手机号>'
export R1_MOBILE='+86<R1 的手机号>'
export R1_EMAIL='<R1 的邮箱>'
export R2_MOBILE='+86<R2 的手机号>'
export R3_MOBILE='+86<R3 的手机号>'
export R4_MOBILE='+86<R4 的手机号>'
export R5_MOBILE='+86<R5 的手机号>'
export R0_USER_ID='<§1.4 第 8 步查到后填>'
export HR_CHAT_ID='<§1.4 第 8 步查到后填>'
export T2_TOKEN='<T2-a 生成后填>'
```

所有接口测试都从 `feishu.mjs` 进入。几条约定：
- 请求里的 `{{名字}}` 会被替换成同名环境变量。
- `{{NOW}}` 替换成当前的秒级时间戳，`{{UUID}}` 替换成随机 UUID。
- 请求体写 `-` 表示没有请求体，写 `@文件名` 表示从文件读取。

每次调用都会往 `results/calls.ndjson` 追加一行，内容包括请求、HTTP 状态、全部响应头和完整响应体。

```js
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const DOMAIN = process.env.FEISHU_DOMAIN ?? 'https://open.feishu.cn'
const RESULTS = process.env.RESULTS_DIR ?? 'results'
const tokenCache = { value: '', expiresAt: 0 }

export const feishu = { call, token, fill, log, sleep }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await cli(process.argv.slice(2))
}

async function cli([command, ...args]) {
  const commands = {
    call: () => call({ method: args[0], path: args[1], body: parseBody(args[2]), label: args[3] ?? '' }),
    watch: () => watch({ seconds: Number(args[0]), method: args[1], path: args[2], body: parseBody(args[3]), label: args[4] ?? 'watch' }),
    burst: () => burst({ total: Number(args[0]), concurrency: Number(args[1]), method: args[2], path: args[3], label: args[4] ?? 'burst' }),
    'list-all': () => listAll({ start: args[0] ?? 'scopes', label: args[1] ?? 'list-all' }),
    changes: () => changes({ marker: args[0], count: Number(args[1]), perSecond: Number(args[2]), userIds: args[3].split(',') }),
    freeze: () => freeze({ userIds: args[0].split(','), frozen: args[1] !== 'false' }),
    'dept-pace': () => deptPace({ perSecond: Number(args[0]), count: Number(args[1]), userIds: args[2].split(','), departments: args[3].split(',') }),
    card: () => sendCard({ chatId: fill(args[0]) }),
    events: () => summarizeEvents({ filter: args[0] ?? '' }),
  }
  const run = commands[command]
  if (run === undefined) {
    process.stdout.write('子命令：call watch burst list-all changes freeze dept-pace card events\n')
    process.exitCode = 1
    return
  }
  await run()
}

async function token() {
  if (tokenCache.expiresAt > Date.now()) {
    return tokenCache.value
  }
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('先 export FEISHU_APP_ID 和 FEISHU_APP_SECRET')
  }
  const response = await fetch(`${DOMAIN}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const body = await response.json()
  if (body.code !== 0) {
    throw new Error(`取 tenant_access_token 失败：${body.code} ${body.msg}`)
  }
  tokenCache.value = body.tenant_access_token
  tokenCache.expiresAt = Date.now() + (body.expire - 300) * 1000
  return tokenCache.value
}

async function call({ method, path, body, label = '', quiet = false }) {
  const resolvedPath = fill(path)
  const startedAt = Date.now()
  const response = await fetch(`${DOMAIN}${resolvedPath}`, {
    method,
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json; charset=utf-8' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const record = {
    at: new Date(startedAt).toISOString(),
    ms: Date.now() - startedAt,
    label,
    method,
    path: resolvedPath,
    request: body ?? null,
    status: response.status,
    headers: Object.fromEntries(response.headers),
    response: parseJson(text),
  }
  log({ file: 'calls.ndjson', record })
  if (!quiet) {
    printRecord(record)
  }
  return record
}

async function watch({ seconds, method, path, body, label }) {
  const startedAt = Date.now()
  const pickPath = process.env.WATCH_PICK ?? ''
  let previous = ''
  for (;;) {
    const record = await call({ method, path, body, label, quiet: true })
    const signature = JSON.stringify([record.status, record.response?.code, pick({ value: record.response, path: pickPath })])
    if (signature !== previous) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      process.stdout.write(`${new Date().toISOString()} +${elapsed}s ${signature} ${record.response?.msg ?? ''}\n`)
      previous = signature
    }
    await sleep(seconds * 1000)
  }
}

async function burst({ total, concurrency, method, path, label }) {
  await token()
  const startedAt = Date.now()
  const pending = Array.from({ length: total }, (_, index) => index)
  const results = []
  const worker = async () => {
    while (pending.pop() !== undefined) {
      const record = await call({ method, path, label, quiet: true })
      results.push({ offsetMs: Date.now() - startedAt, status: record.status, code: record.response?.code, reset: record.headers['x-ogw-ratelimit-reset'] ?? null })
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  const groups = results.reduce((acc, item) => {
    const key = `HTTP ${item.status} code=${item.code}`
    return { ...acc, [key]: (acc[key] ?? 0) + 1 }
  }, {})
  const limited = results.filter((item) => item.status === 429 || item.code === 99991400).sort((left, right) => left.offsetMs - right.offsetMs)
  const summary = { label, total, concurrency, seconds: (Date.now() - startedAt) / 1000, groups, firstLimitedAtMs: limited[0]?.offsetMs ?? null, resetValues: [...new Set(limited.map((item) => item.reset))] }
  log({ file: 'bursts.ndjson', record: summary })
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

async function listAll({ start, label }) {
  const counts = {}
  const tally = (name) => {
    counts[name] = (counts[name] ?? 0) + 1
  }
  const startedAt = Date.now()
  const roots = start === 'root' ? { departments: ['0'], users: [] } : await scopeRoots({ tally, label })
  const departments = new Set(roots.departments)
  for (const id of roots.departments) {
    for await (const child of paged({ path: `/open-apis/contact/v3/departments/${encodeURIComponent(id)}/children?department_id_type=department_id&fetch_child=true&page_size=50`, tally, name: 'children', label })) {
      departments.add(child.department_id)
    }
  }
  const users = new Map()
  let appearances = 0
  for (const id of departments) {
    for await (const user of paged({ path: `/open-apis/contact/v3/users/find_by_department?department_id_type=department_id&user_id_type=user_id&department_id=${encodeURIComponent(id)}&page_size=50`, tally, name: 'find_by_department', label })) {
      appearances += 1
      users.set(user.user_id ?? user.open_id, user.name)
    }
  }
  const totalCalls = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const summary = { label, start, departments: departments.size, users: users.size, appearances, scopeOnlyUsers: roots.users.length, calls: counts, totalCalls, seconds: (Date.now() - startedAt) / 1000 }
  log({ file: 'list-all.ndjson', record: { ...summary, userIds: [...users.keys()] } })
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

async function scopeRoots({ tally, label }) {
  const departments = []
  const users = []
  let pageToken = ''
  for (;;) {
    const suffix = pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''
    const record = await call({ method: 'GET', path: `/open-apis/contact/v3/scopes?department_id_type=department_id&user_id_type=user_id&page_size=100${suffix}`, label, quiet: true })
    tally('scopes')
    const data = record.response?.data ?? {}
    departments.push(...(data.department_ids ?? []))
    users.push(...(data.user_ids ?? []))
    if (!data.has_more) {
      return { departments, users }
    }
    pageToken = data.page_token
  }
}

async function* paged({ path, tally, name, label }) {
  let pageToken = ''
  for (;;) {
    const suffix = pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''
    const record = await call({ method: 'GET', path: `${path}${suffix}`, label, quiet: true })
    tally(name)
    if (record.response?.code !== 0) {
      process.stdout.write(`${name} 失败：HTTP ${record.status} code=${record.response?.code} ${record.response?.msg ?? ''} ${path}\n`)
      return
    }
    yield* record.response.data?.items ?? []
    if (!record.response.data?.has_more) {
      return
    }
    pageToken = record.response.data.page_token
  }
}

async function changes({ marker, count, perSecond, userIds }) {
  const startedAt = Date.now()
  for (let index = 0; index < count; index += 1) {
    await sleepUntil(startedAt + (index * 1000) / perSecond)
    const userId = userIds[index % userIds.length]
    const enName = `${marker}-${String(index + 1).padStart(2, '0')}`
    const record = await call({ method: 'PATCH', path: `/open-apis/contact/v3/users/${userId}?user_id_type=user_id`, body: { en_name: enName }, label: marker, quiet: true })
    process.stdout.write(`${record.at} ${userId} en_name=${enName} HTTP ${record.status} code=${record.response?.code}\n`)
  }
}

async function freeze({ userIds, frozen }) {
  const records = await Promise.all(userIds.map((userId) => call({ method: 'PATCH', path: `/open-apis/contact/v3/users/${userId}?user_id_type=user_id`, body: { is_frozen: frozen }, label: `freeze-${frozen}`, quiet: true })))
  records.forEach((record) => {
    process.stdout.write(`${record.at} ${record.path} HTTP ${record.status} code=${record.response?.code} ${record.response?.msg ?? ''}\n`)
  })
}

async function deptPace({ perSecond, count, userIds, departments }) {
  const startedAt = Date.now()
  for (let index = 0; index < count; index += 1) {
    await sleepUntil(startedAt + (index * 1000) / perSecond)
    const userId = userIds[index % userIds.length]
    const department = departments[Math.floor(index / userIds.length) % departments.length]
    const record = await call({ method: 'PATCH', path: `/open-apis/contact/v3/users/${userId}?user_id_type=user_id&department_id_type=department_id`, body: { department_ids: [department] }, label: `dept-pace-${perSecond}`, quiet: true })
    process.stdout.write(`${record.at} ${userId} -> ${department} HTTP ${record.status} code=${record.response?.code} ${record.response?.msg ?? ''}\n`)
  }
}

async function sendCard({ chatId }) {
  const consoleUrl = process.env.CONSOLE_URL ?? 'http://localhost:4200'
  const card = {
    schema: '2.0',
    config: { update_multi: true },
    header: { title: { tag: 'plain_text', content: 'T18 交接卡片测试' } },
    body: {
      elements: [
        { tag: 'markdown', content: '模拟「等待飞书管理员」：2 个部门不在通讯录权限范围，影响 3 人。' },
        button({ text: '重新检查', action: 'recheck', type: 'primary' }),
        button({ text: '慢回调（4 秒）', action: 'slow' }),
        button({ text: '30 分钟后再更新', action: 'late' }),
        { tag: 'button', text: { tag: 'plain_text', content: '打开控制台' }, behaviors: [{ type: 'open_url', default_url: consoleUrl, pc_url: consoleUrl, android_url: 'lark://msgcard/unsupported_action', ios_url: 'lark://msgcard/unsupported_action' }] },
      ],
    },
  }
  return call({ method: 'POST', path: '/open-apis/im/v1/messages?receive_id_type=chat_id', body: { receive_id: chatId, msg_type: 'interactive', content: JSON.stringify(card), uuid: randomUUID() }, label: 'T18-send' })
}

function button({ text, action, type = 'default' }) {
  return { tag: 'button', text: { tag: 'plain_text', content: text }, type, behaviors: [{ type: 'callback', value: { action } }] }
}

function summarizeEvents({ filter }) {
  const deliveries = readdirSync(RESULTS)
    .filter((name) => name.startsWith('events-'))
    .flatMap((name) => readFileSync(`${RESULTS}/${name}`, 'utf8').split('\n'))
    .filter((line) => line && line.includes(filter))
    .map((line) => JSON.parse(line))
    .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt))
  const grouped = deliveries.reduce((map, item) => map.set(item.eventId, [...(map.get(item.eventId) ?? []), item]), new Map())
  const rows = [...grouped.values()].map((items) => ({
    type: items[0].type,
    marker: items[0].marker,
    eventId: items[0].eventId,
    createdAt: items[0].createTime ? new Date(Number(items[0].createTime)).toISOString() : '',
    deliveries: items.length,
    labels: [...new Set(items.map((item) => item.label))].join(','),
    first: items[0].receivedAt,
    last: items.at(-1).receivedAt,
  }))
  console.table(rows)
  process.stdout.write(`事件 ${rows.length} 个，投递 ${deliveries.length} 次，被投递多次的 ${rows.filter((row) => row.deliveries > 1).length} 个\n`)
}

function parseBody(raw) {
  if (raw === undefined || raw === '-' || raw === '') {
    return undefined
  }
  const text = raw.startsWith('@') ? readFileSync(raw.slice(1), 'utf8') : raw
  return JSON.parse(fill(text))
}

function fill(text) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (name === 'NOW') {
      return String(Math.floor(Date.now() / 1000))
    }
    if (name === 'UUID') {
      return randomUUID()
    }
    const value = process.env[name]
    if (value === undefined) {
      throw new Error(`环境变量 ${name} 没有设置`)
    }
    return value
  })
}

function pick({ value, path }) {
  return path ? path.split('.').reduce((current, key) => current?.[key], value) : null
}

function log({ file, record }) {
  mkdirSync(RESULTS, { recursive: true })
  appendFileSync(`${RESULTS}/${file}`, `${JSON.stringify(record)}\n`)
}

function printRecord(record) {
  const limit = record.headers['x-ogw-ratelimit-limit']
  const reset = record.headers['x-ogw-ratelimit-reset']
  const rate = limit || reset ? ` ratelimit-limit=${limit ?? ''} ratelimit-reset=${reset ?? ''}` : ''
  process.stdout.write(`${record.at} ${record.label} ${record.method} ${record.path}\nHTTP ${record.status} code=${record.response?.code} msg=${record.response?.msg ?? ''}${rate}\n${JSON.stringify(record.response, null, 2)}\n`)
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sleepUntil(timestamp) {
  return sleep(Math.max(0, timestamp - Date.now()))
}
```

| 子命令 | 用法 | 用在哪些测试 |
| --- | --- | --- |
| `call` | `call <方法> <路径> [请求体] [标签]` | 所有单次请求 |
| `watch` | `watch <秒> <方法> <路径> [请求体] [标签]`。只有 HTTP 状态、`code` 或 `WATCH_PICK` 指定的字段变了，才打印一行。看到想要的那一行就按 Ctrl-C | T9、T10、T20、§7 |
| `burst` | `burst <总数> <并发> <方法> <路径> [标签]` | T13 |
| `list-all` | `list-all root` 从根部门列（要求全员范围），`list-all scopes` 从权限范围列 | T11 |
| `changes` | `changes <标记> <次数> <每秒几次> <user_id,...>`，用改 `en_name` 来制造通讯录变更 | T14、T15、T17 |
| `freeze` | `freeze <user_id,...> true 或 false`，同时并发发出 | T5 |
| `dept-pace` | `dept-pace <每秒几次> <次数> <user_id,...> <部门,部门>`，按固定速率改部门，两个部门轮流换 | T5、T17 |
| `card` | `card '{{HR_CHAT_ID}}'`，发 T18 的测试卡片 | T18 |
| `events` | `events [过滤词]`，汇总监听日志：每个事件投了几次、落到哪个实例 | T9、T10、T14–T17 |

### 1.4 建两个企业自建应用

App1 承担全部测试。App2 只用于 T13（两个应用是否互相影响）、T15（离线）、T16（回环对照）和 T26（另一个写入方）。

1. R0 登录[开发者后台](https://open.feishu.cn/app)，创建企业自建应用「集成平台实测」。在「凭证与基础信息」里复制 App ID 和 App Secret，填进 `lab.env`。
2. 应用能力：添加「机器人」。卡片回调和发消息都要用到它。
3. 权限管理：按 §1.5 开通权限。
4. 数据权限 → 通讯录权限范围：选「全部成员」（即 S1）。如果页面上还有和组织架构相关的数据权限设置，记下默认值并截图，T12 要用。
5. 事件与回调：按 §1.7 配长连接。先启动监听脚本，再保存订阅方式。
6. 版本管理与发布：创建版本，可用范围选「全部成员」，然后申请发布。R0 在管理后台的应用审核里通过。记下三个时间：申请、通过、权限实际生效，作为 T10 的基线。
7. 按同样的步骤建 App2「集成平台实测-2」：开通 §1.5 里标了 App2 的权限，配同样的通讯录事件和长连接，通讯录权限范围选「全部成员」。
8. R0 在飞书客户端建一个群「实测 HR 通知群」，把 App1 的机器人加进去，然后执行：

```bash
node feishu.mjs call POST '/open-apis/contact/v3/users/batch_get_id?user_id_type=user_id' '{"mobiles":["{{R0_MOBILE}}"]}' setup-r0
node feishu.mjs call GET '/open-apis/im/v1/chats?page_size=100' - setup-chats
node feishu.mjs call GET '/open-apis/tenant/v2/tenant/query' - setup-tenant
```

把返回里的 R0 `user_id` 和群的 `chat_id`（以 `oc_` 开头）分别填进 `lab.env` 的 `R0_USER_ID` 和 `HR_CHAT_ID`。

### 1.5 权限清单

| 权限（开发者后台显示名） | scope | App2 也开 | 用在哪里 |
| --- | --- | --- | --- |
| 更新通讯录 | `contact:contact` | 是 | 建、改、删用户和部门，恢复用户；T26 的「另一个写入方」 |
| 以应用身份读取通讯录 | `contact:contact:readonly_as_app` | 是 | 读用户、部门、权限范围 |
| 获取通讯录基本信息 | `contact:contact.base:readonly` | 是 | `scopes`、读单个用户 |
| 获取通讯录部门组织架构信息 | `contact:department.organize:readonly` | 是 | `children`、`find_by_department` |
| 获取部门基础信息 | `contact:department.base:readonly` | | 部门名称 |
| 通过手机号或邮箱获取用户 ID | `contact:user.id:readonly` | 是 | `batch_get_id` |
| 获取用户 user ID | `contact:user.employee_id:readonly` | 是 | 返回 `user_id`；卡片回调里带出点击者的 `user_id` |
| 获取用户基本信息 | `contact:user.base:readonly` | 是 | 字段权限 |
| 获取用户组织架构信息 | `contact:user.department:readonly` | | `department_ids`、`leader_user_id` |
| 获取用户受雇信息 | `contact:user.employee:readonly` | | `status` |
| 查看成员工号 | `contact:user.employee_number:read` | | `employee_no` |
| 获取用户手机号 | `contact:user.phone:readonly` | | `mobile` |
| 获取用户邮箱信息 | `contact:user.email:readonly` | | `email` |
| 更新用户 ID | `contact:contact:update_user_id` | | T31（可选） |
| 调用 API 获取员工列表 | `directory:employee:list` | | T12、T26 |
| 查看员工个人基本信息 | `directory:employee.base.base:read` | | T12、T26 |
| 查看员工手机号 | `directory:employee.base.mobile:read` | | T1-d、T12 |
| 查看员工所属部门信息 | `directory:employee.base.department:read` | | T12 |
| 查看员工状态信息 | `directory:employee.base.status:read` | | T12 |
| 查看员工数据来源 | `directory:employee.base.data_source:read` | | T26 |
| 查看员工的工号 | `directory:employee.work.job_number:read` | | T12 |
| 查看员工的人事状态 | `directory:employee.work.staff_status:read` | | T12 |
| 查看部门基础信息 | `directory:department.base:read` | | T12 |
| 获取应用信息 | `admin:app.info:readonly` | | `contacts_range_configuration` |
| 获取企业信息 | `tenant:tenant:readonly` | | 记下租户信息 |
| 查询租户下的席位信息 | `tenant:tenant.product_assign_info:read` | | M2 |
| 以应用的身份发消息 | `im:message:send_as_bot` | | T6、T13、T18、T19、§7 |
| 获取单聊、群组消息 | `im:message:readonly` | | T19、§7 读回 |
| 获取群组中所有消息 | `im:message.group_msg` | | T19、§7 读回（读群消息必开） |
| 获取群组信息 | `im:chat:readonly` | | 查 `HR_CHAT_ID` |
| 获取事件的出口 IP | `event:ip_list` | | T22 |
| 查看 OpenAPI 审计日志 | `security_and_compliance:audit_log.openapi_log:readonly` | | T26 |
| 获取行为审计日志 | `admin:audit_info:readonly` | | T26（预计用不了，见 T26） |

添加事件时，页面会列出每个事件需要的权限。缺哪个就按提示补上，再发版。

### 1.6 通讯录权限范围的两种配置

全程只改「通讯录权限范围」，「可用范围」始终保持「全部成员」。原因是给用户发单聊、让用户点卡片，都要求对方在机器人的可用范围内（见[发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create)）。

| 代号 | 配置 | 什么时候用 |
| --- | --- | --- |
| S1 | 全部成员 | 第 0 天到第 1 天中午。造部门要求「全部成员」，因为在根部门下建部门需要全员权限 |
| S2 | 部分成员：平台中心（FS-P） | 第 1 天下午：T1、T9、T11（部分）、T12-e |
| S3 | 部分成员：平台中心、外部协作（FS-P、FS-X） | 第 1 天下午 T10 以后，一直到最后 |

两条修改路径：

- **开发者后台**：应用详情 → 开发配置 → 权限管理 → 数据权限 → 通讯录权限范围 → 编辑 → 保存，然后到「应用发布 → 版本管理与发布」创建版本、申请发布，由 R0 审核。
- **管理后台**：工作台 → 应用管理 → 本应用 → 通讯录权限范围（`feishu-capabilities.md` §3.3 里叫「管理应用的通讯录设置」，菜单名以实际界面为准）。T10-2 专门测这条路。

每次改完都拍两张快照（T9、T10 也会用到）：

```bash
node feishu.mjs call GET '/open-apis/application/v6/applications/{{FEISHU_APP_ID}}/contacts_range_configuration?department_id_type=department_id&user_id_type=user_id&page_size=100' - range-snapshot
node feishu.mjs call GET '/open-apis/contact/v3/scopes?department_id_type=department_id&user_id_type=user_id&page_size=100' - scopes-snapshot
```

### 1.7 事件与回调：走长连接

长连接只需要出网，不需要公网地址（`feishu-capabilities.md` §7.4）。监听脚本 `listener.mjs` 做三件事：
- 把七种通讯录事件全部写进 `results/events-<实例名>.ndjson`；
- 把卡片回调写进 `results/cards-<实例名>.ndjson`，并按按钮做出相应动作；
- 支持几个测试开关：`SLEEP_MS` 配合 `SLEEP_MATCH`，让匹配的事件处理得慢一些（T15）；`FAIL_FIRST` 让最先收到的 N 个事件故意处理失败（T17）；`PROXY_URL` 让连接经过 HTTP 代理（T22）。

```js
import * as Lark from '@larksuiteoapi/node-sdk'
import { feishu } from './feishu.mjs'

const LABEL = process.env.LISTENER_LABEL ?? 'A'
const SLEEP_MS = Number(process.env.SLEEP_MS ?? 0)
const SLEEP_MATCH = process.env.SLEEP_MATCH ?? ''
const FAIL_FIRST = Number(process.env.FAIL_FIRST ?? 0)
const CARD_SLOW_MS = Number(process.env.CARD_SLOW_MS ?? 4000)
const CONTACT_EVENTS = [
  'contact.user.created_v3',
  'contact.user.updated_v3',
  'contact.user.deleted_v3',
  'contact.department.created_v3',
  'contact.department.updated_v3',
  'contact.department.deleted_v3',
  'contact.scope.updated_v3',
]
const state = { failed: 0 }

const dispatcher = new Lark.EventDispatcher({}).register({
  ...Object.fromEntries(CONTACT_EVENTS.map((type) => [type, (data) => onEvent({ type, data })])),
  'card.action.trigger': (data) => onCard(data),
})

const client = new Lark.WSClient({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  loggerLevel: Lark.LoggerLevel.info,
  ...(await proxyOptions()),
})
client.start({ eventDispatcher: dispatcher })

async function onEvent({ type, data }) {
  const receivedAt = new Date().toISOString()
  const payload = Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'token'))
  const marker = payload.object?.en_name || payload.object?.name || ''
  feishu.log({ file: `events-${LABEL}.ndjson`, record: { receivedAt, label: LABEL, type, eventId: payload.event_id, createTime: payload.create_time, marker, payload } })
  process.stdout.write(`${receivedAt} [${LABEL}] ${type} ${payload.event_id} ${marker}\n`)
  if (state.failed < FAIL_FIRST) {
    state.failed += 1
    throw new Error(`FAIL_FIRST：第 ${state.failed} 个事件故意处理失败`)
  }
  if (SLEEP_MS > 0 && JSON.stringify(payload).includes(SLEEP_MATCH)) {
    await feishu.sleep(SLEEP_MS)
  }
}

async function onCard(data) {
  const receivedAt = new Date().toISOString()
  const action = data.action?.value?.action ?? ''
  feishu.log({ file: `cards-${LABEL}.ndjson`, record: { receivedAt, label: LABEL, action, operator: data.operator, context: data.context, tokenPrefix: String(data.token ?? '').slice(0, 2) } })
  process.stdout.write(`${receivedAt} [${LABEL}] card ${action} ${JSON.stringify(data.operator)}\n`)
  if (action === 'slow') {
    await feishu.sleep(CARD_SLOW_MS)
  }
  if (action === 'recheck') {
    scheduleCardUpdates({ token: data.token, delays: [10, 20, 30] })
  }
  if (action === 'late') {
    scheduleCardUpdates({ token: data.token, delays: [31 * 60] })
  }
  return { toast: { type: 'info', content: `收到「${action}」（实例 ${LABEL}）` } }
}

function scheduleCardUpdates({ token, delays }) {
  delays.forEach((seconds, index) => {
    setTimeout(() => {
      feishu.call({
        method: 'POST',
        path: '/open-apis/interactive/v1/card/update',
        body: { token, card: updatedCard({ attempt: index + 1, seconds }) },
        label: `T18-update-${index + 1}-after-${seconds}s`,
      })
    }, seconds * 1000)
  })
}

function updatedCard({ attempt, seconds }) {
  return {
    schema: '2.0',
    config: { update_multi: true },
    header: { title: { tag: 'plain_text', content: 'T18 交接卡片测试' } },
    body: { elements: [{ tag: 'markdown', content: `第 ${attempt} 次延时更新（点击后 ${seconds} 秒）` }] },
  }
}

async function proxyOptions() {
  if (!process.env.PROXY_URL) {
    return {}
  }
  const { HttpsProxyAgent } = await import('https-proxy-agent')
  const agent = new HttpsProxyAgent(process.env.PROXY_URL)
  Lark.defaultHttpInstance.defaults.httpsAgent = agent
  Lark.defaultHttpInstance.defaults.proxy = false
  return { agent }
}
```

配置步骤：

1. 在一个终端里执行 `source lab.env && LISTENER_LABEL=A node listener.mjs | tee -a results/listener-A.log`，看到 `ws client ready` 再往下做。
2. 开发者后台 → 事件与回调 → 事件配置 → 订阅方式，选「使用长连接接收事件」，保存。官方文档写明，此时本地客户端必须在线才能保存成功。
3. 添加事件：员工入职 `contact.user.created_v3`、员工信息被修改 `contact.user.updated_v3`、员工离职 `contact.user.deleted_v3`、部门新建、部门信息变化、部门被删除（`contact.department.*_v3`），以及通讯录权限范围变更 `contact.scope.updated_v3`。
4. 回调配置 → 订阅方式，选「使用长连接接收回调」，保存；再添加回调「卡片回传交互」`card.action.trigger`。旧版的「消息卡片回传交互」不支持长连接，不要选它。
5. 创建版本并发布，R0 审核通过。然后在管理后台随便改一个部门名，监听窗口里应当出现一条 `contact.department.updated_v3`。
6. App2 照做，凭证换成 App2 的，标签用 `APP2`：

```bash
FEISHU_APP_ID="$APP2_ID" FEISHU_APP_SECRET="$APP2_SECRET" LISTENER_LABEL=APP2 node listener.mjs | tee -a results/listener-APP2.log
```

App1（标签 A）和 App2（标签 APP2）的监听从第 0 天一直开着；只有测试步骤写了要停，才停。

### 1.8 测试数据

**规模和分工**：

| 一侧 | 放在哪 | 有什么 |
| --- | --- | --- |
| 北森 | 本地文件 `fixtures/`，没有北森租户 | 300 人、31 个组织加一个根组织；带异常标记；另有一份两棵树的期望部门映射 |
| 飞书 | 测试租户 | 30 个部门；真人账号 R0 到 R5；T0 探针通过时，再加 40 个合成账号、5 个「飞书有北森无」的账号和 1 个探针账号 |

`fixtures/expected-department-mapping.json` 同时也是 `ai-v1.md` 部门映射评测的一组样本，覆盖了几种情况：同名、改名、北森多级收拢到飞书一级、北森有飞书无、虚拟组织、目标部门在范围外。

**飞书一侧的 30 个部门**（自定义 `department_id`，后面的测试都按这个 ID 操作）：

| 一级 | 下级 |
| --- | --- |
| FS-P 平台中心 | FS-P1 研发部（下面还有 FS-P11 后端组、FS-P12 前端组、FS-P13 测试组）、FS-P2 产品部、FS-P3 数据部、FS-P4 人力资源部、FS-P5 行政部、FS-P6 安全合规部 |
| FS-S 销售中心 | FS-S1 华东销售部、FS-S2 华南销售部、FS-S3 华北销售部、FS-S4 渠道部、FS-S5 大客户部 |
| FS-F 财务中心 | FS-F1 会计部、FS-F2 资金部 |
| FS-M 市场部 | FS-M1 品牌组、FS-M2 增长组 |
| FS-O 运营中心 | FS-O1 客服部、FS-O2 供应链部 |
| FS-X 外部协作 | FS-X1 驻场顾问（S2 下在范围外；也是「飞书有北森无」的部门） |
| FS-R 会议室与设备 | （「飞书有北森无」） |
| FS-Q 待分配 | （`org-and-lifecycle.md` §1.6 的「待分配部门」） |
| FS-T 实测专用 | （T3、T23 在这下面做实验） |

**两侧的异常数据**：

| 异常 | 在哪一侧 | 样本 | 给谁用 |
| --- | --- | --- | --- |
| 缺手机号、手机号格式不对、两人同一手机号 | 北森 | E0041–E0053 | 匹配规则、「无法匹配」 |
| 部门缺映射（战略投资部）、虚拟组织、目标部门在范围外（驻场顾问组） | 北森 | 按组织自动带标记 | 部门映射建议、40004、待分配 |
| 上级已离职、未来生效的调岗、待入职、已离职 | 北森 | E0060–E0067、E0292–E0297、E0280–E0291 | 生效日排程、「离职仍可登录」 |
| 生僻字和带「·」的名字、同名同姓、境外手机号（NANP 虚构号段 555-01xx） | 北森 | E0068–E0074、E0298–E0299 | 规则表、44019 |
| 存量账号没有工号 | 飞书 | s0031–s0040 | 工号匹配要靠手机号兜底 |
| 工号相同、手机号不同 | 飞书 | f0002（工号 E0100） | 冲突 |
| 北森已离职、飞书账号还在 | 飞书 | f0005（工号 E0285） | 「离职仍可登录」 |
| 飞书有北森无 | 飞书 | f0001、f0003、f0004 | 对账、按规则批量例外 |

**造数据的脚本** `seed.mjs` 依赖同目录的 `feishu.mjs`，除此之外没有别的依赖。凭证从环境变量读取。合成手机号一律用 1099 开头：大陆没有这个号段，就算误发了邀请，也不会到任何人手里。

```js
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { feishu } from './feishu.mjs'

const TODAY = new Date()
const USER_PATH = '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id'
const FEISHU_DEPARTMENTS = [
  ['FS-P', '平台中心', '0'], ['FS-P1', '研发部', 'FS-P'], ['FS-P11', '后端组', 'FS-P1'], ['FS-P12', '前端组', 'FS-P1'],
  ['FS-P13', '测试组', 'FS-P1'], ['FS-P2', '产品部', 'FS-P'], ['FS-P3', '数据部', 'FS-P'], ['FS-P4', '人力资源部', 'FS-P'],
  ['FS-P5', '行政部', 'FS-P'], ['FS-P6', '安全合规部', 'FS-P'], ['FS-S', '销售中心', '0'], ['FS-S1', '华东销售部', 'FS-S'],
  ['FS-S2', '华南销售部', 'FS-S'], ['FS-S3', '华北销售部', 'FS-S'], ['FS-S4', '渠道部', 'FS-S'], ['FS-S5', '大客户部', 'FS-S'],
  ['FS-F', '财务中心', '0'], ['FS-F1', '会计部', 'FS-F'], ['FS-F2', '资金部', 'FS-F'], ['FS-M', '市场部', '0'],
  ['FS-M1', '品牌组', 'FS-M'], ['FS-M2', '增长组', 'FS-M'], ['FS-O', '运营中心', '0'], ['FS-O1', '客服部', 'FS-O'],
  ['FS-O2', '供应链部', 'FS-O'], ['FS-X', '外部协作', '0'], ['FS-X1', '驻场顾问', 'FS-X'], ['FS-R', '会议室与设备', '0'],
  ['FS-Q', '待分配', '0'], ['FS-T', '实测专用', '0'],
]
const BEISEN_ORGS = [
  ['BS-0001', '示例科技有限公司', null, null], ['BS-1000', '研发中心', 'BS-0001', 'FS-P'],
  ['BS-1100', '服务端开发部', 'BS-1000', 'FS-P11'], ['BS-1200', '前端开发部', 'BS-1000', 'FS-P12'],
  ['BS-1300', '质量保障部', 'BS-1000', 'FS-P13'], ['BS-1400', '研发部', 'BS-1000', 'FS-P1'],
  ['BS-1500', '数据智能部', 'BS-1000', 'FS-P3'], ['BS-1600', '产品管理部', 'BS-1000', 'FS-P2'],
  ['BS-2000', '销售中心', 'BS-0001', 'FS-S'], ['BS-2100', '华东大区', 'BS-2000', 'FS-S1'],
  ['BS-2110', '上海销售一部', 'BS-2100', 'FS-S1'], ['BS-2120', '杭州销售部', 'BS-2100', 'FS-S1'],
  ['BS-2200', '华南大区', 'BS-2000', 'FS-S2'], ['BS-2300', '华北大区', 'BS-2000', 'FS-S3'],
  ['BS-2400', '渠道合作部', 'BS-2000', 'FS-S4'], ['BS-2500', '大客户部', 'BS-2000', 'FS-S5'],
  ['BS-2600', '驻场顾问组', 'BS-2000', 'FS-X1'], ['BS-3000', '财务中心', 'BS-0001', 'FS-F'],
  ['BS-3100', '会计核算部', 'BS-3000', 'FS-F1'], ['BS-3200', '资金管理部', 'BS-3000', 'FS-F2'],
  ['BS-4000', '人力资源部', 'BS-0001', 'FS-P4'], ['BS-4100', '招聘组', 'BS-4000', 'FS-P4'],
  ['BS-5000', '行政部', 'BS-0001', 'FS-P5'], ['BS-6000', '市场部', 'BS-0001', 'FS-M'],
  ['BS-6100', '品牌公关部', 'BS-6000', 'FS-M1'], ['BS-6200', '用户增长部', 'BS-6000', 'FS-M2'],
  ['BS-7000', '运营中心', 'BS-0001', 'FS-O'], ['BS-7100', '客户服务部', 'BS-7000', 'FS-O1'],
  ['BS-7200', '供应链管理部', 'BS-7000', 'FS-O2'], ['BS-8000', '战略投资部', 'BS-0001', null],
  ['BS-9000', '安全合规部', 'BS-0001', 'FS-P6'], ['BS-9100', '数字化转型项目组', 'BS-0001', null, 'virtual'],
]
const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '高']
const GIVEN_NAMES = ['伟', '芳', '娜', '敏', '静', '磊', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '建华']
const ANOMALY_RANGES = [
  [31, 40, 'feishu-without-employee-no'], [41, 46, 'missing-mobile'], [47, 49, 'malformed-mobile'],
  [50, 53, 'duplicate-mobile'], [60, 62, 'leader-resigned'], [63, 67, 'future-transfer'],
  [68, 70, 'unusual-name'], [71, 74, 'same-name'], [280, 291, 'resigned'],
  [292, 297, 'pending-hire'], [298, 299, 'overseas-mobile'],
]
const FEISHU_ONLY = [
  { user_id: 'f0001', name: '驻场顾问甲', mobile: '+8610992000001', department_ids: ['FS-X1'], employee_type: 5 },
  { user_id: 'f0002', name: '驻场顾问乙', mobile: '+8610992000002', department_ids: ['FS-X1'], employee_type: 5, employee_no: 'E0100' },
  { user_id: 'f0003', name: '会议室平板 3F', mobile: '+8610992000003', department_ids: ['FS-R'], employee_type: 1 },
  { user_id: 'f0004', name: '会议室平板 5F', mobile: '+8610992000004', department_ids: ['FS-R'], employee_type: 1 },
  { user_id: 'f0005', name: '离职未处理', mobile: '+8610992000005', department_ids: ['FS-P3'], employee_type: 1, employee_no: 'E0285' },
]
const MODES = { fixtures, departments, probe, users }

const mode = MODES[process.argv[2]]
if (mode === undefined) {
  process.stdout.write('用法：node seed.mjs fixtures 或 departments 或 probe 或 users\n')
  process.exitCode = 1
}
else {
  await mode()
}

async function fixtures() {
  const employees = Array.from({ length: 300 }, (_, index) => employee(index + 1))
  const tally = employees.flatMap((item) => item.Anomalies).reduce((acc, tag) => ({ ...acc, [tag]: (acc[tag] ?? 0) + 1 }), {})
  mkdirSync('fixtures', { recursive: true })
  write({ file: 'fixtures/beisen-orgs.json', value: BEISEN_ORGS.map(([code, name, parent, , flag]) => ({ OId: code, Code: code, Name: name, ParentCode: parent, IsVirtualOrg: flag === 'virtual' })) })
  write({ file: 'fixtures/beisen-employees.json', value: employees })
  write({ file: 'fixtures/feishu-departments.json', value: FEISHU_DEPARTMENTS.map(([id, name, parent]) => ({ department_id: id, name, parent_department_id: parent })) })
  write({ file: 'fixtures/expected-department-mapping.json', value: BEISEN_ORGS.map(([code, name, , expected, flag]) => ({ beisenCode: code, beisenName: name, expected, note: flag ?? null })) })
  process.stdout.write(`北森侧 ${employees.length} 人、${BEISEN_ORGS.length} 个组织（含根）；飞书侧 ${FEISHU_DEPARTMENTS.length} 个部门\n异常标记：${JSON.stringify(tally)}\n`)
}

async function departments() {
  for (const [id, name, parent] of FEISHU_DEPARTMENTS) {
    const record = await feishu.call({
      method: 'POST',
      path: `/open-apis/contact/v3/departments?department_id_type=department_id&client_token=seed-${id}`,
      body: { name, parent_department_id: parent, department_id: id },
      label: 'seed-departments',
      quiet: true,
    })
    const code = record.response?.code
    const verdict = code === 0 ? '已建' : code === 43007 || code === 43000 ? '已存在，跳过' : `失败 HTTP ${record.status} code=${code} ${record.response?.msg ?? ''}`
    process.stdout.write(`${id} ${name}（上级 ${parent}）：${verdict}\n`)
    await feishu.sleep(200)
  }
}

async function probe() {
  const record = await feishu.call({
    method: 'POST',
    path: USER_PATH,
    body: { user_id: 'p0001', name: '造数探针', mobile: '+8610990000001', department_ids: ['FS-Q'], employee_type: 1 },
    label: 'T0-probe',
  })
  const verdicts = {
    0: '飞书接受 1099 号段：export ALLOW_FAKE_MOBILE=1 后再跑 users',
    41004: '飞书拒绝 1099 号段（41004）：不造合成账号，按「少人方案」测',
  }
  process.stdout.write(`\n结论：${verdicts[record.response?.code] ?? '返回了别的码，先看上面的完整响应再决定'}\n`)
}

async function users() {
  if (process.env.ALLOW_FAKE_MOBILE !== '1') {
    process.stdout.write('先跑 node seed.mjs probe；飞书接受 1099 号段后再 export ALLOW_FAKE_MOBILE=1\n')
    process.exitCode = 1
    return
  }
  const mapping = Object.fromEntries(BEISEN_ORGS.map(([code, , , expected]) => [code, expected]))
  const seeded = JSON.parse(readFileSync('fixtures/beisen-employees.json', 'utf8'))
    .filter((item) => item.FeishuSeed)
    .map((item) => ({
      user_id: `s${item.EmployeeNumber.slice(1)}`,
      name: item.Name,
      mobile: item.MobilePhone,
      department_ids: [mapping[item.OrgCode] ?? 'FS-Q'],
      employee_type: item.EmployeeType === '实习' ? 2 : item.EmployeeType === '外包' ? 3 : 1,
      ...(item.Anomalies.includes('feishu-without-employee-no') ? {} : { employee_no: item.EmployeeNumber }),
      ...(item.ManagerEmployeeNumber === 'E0001' ? { leader_user_id: 's0001' } : {}),
    }))
  for (const body of [...seeded, ...FEISHU_ONLY]) {
    const record = await feishu.call({ method: 'POST', path: USER_PATH, body, label: 'seed-users', quiet: true })
    const code = record.response?.code
    const verdict = code === 0 ? '已建' : code === 41011 || code === 41001 ? '已存在，跳过' : `失败 HTTP ${record.status} code=${code} ${record.response?.msg ?? ''}`
    process.stdout.write(`${body.user_id} ${body.name} ${body.department_ids[0]}：${verdict}\n`)
    if (code === 44012) {
      process.stdout.write('飞书拦截了添加成员（44012），停下，不要重试\n')
      return
    }
    await feishu.sleep(200)
  }
}

function employee(index) {
  const people = BEISEN_ORGS.filter(([code]) => code !== 'BS-0001')
  const [orgCode, orgName, , expected, flag] = people[index % people.length]
  const number = `E${String(index).padStart(4, '0')}`
  const tags = [
    ...ANOMALY_RANGES.filter(([from, to]) => index >= from && index <= to).map(([, , tag]) => tag),
    ...(expected === null && flag !== 'virtual' ? ['no-mapping'] : []),
    ...(flag === 'virtual' ? ['virtual-org'] : []),
    ...(expected === 'FS-X1' ? ['out-of-scope-department'] : []),
  ]
  return {
    UserID: String(10000000 + index),
    EmployeeNumber: number,
    Name: nameFor(index),
    MobilePhone: mobileFor(index),
    Email: `${number.toLowerCase()}@example.com`,
    OrgCode: orgCode,
    DepartmentName: orgName,
    Status: tags.includes('resigned') ? '离职' : tags.includes('pending-hire') ? '待入职' : '在职',
    EmployeeType: index % 15 === 0 ? '实习' : index % 25 === 0 ? '外包' : '正式',
    EntryDate: tags.includes('pending-hire') ? day(index - 291) : '2024-03-01',
    LastWorkDate: tags.includes('resigned') ? day(279 - index) : null,
    ManagerEmployeeNumber: tags.includes('leader-resigned') ? 'E0280' : index >= 2 && index <= 10 ? 'E0001' : null,
    PendingChange: tags.includes('future-transfer') ? { type: '调岗', startDate: day(7), toOrgCode: 'BS-1500' } : null,
    FeishuSeed: index <= 40,
    Anomalies: tags,
  }
}

function mobileFor(index) {
  const fixed = { 47: '1099100', 48: '+86-1099-100-0048', 49: '10991000049x', 51: mobileForPlain(50), 53: mobileForPlain(52), 298: '+12015550100', 299: '+12015550101' }
  if (index >= 41 && index <= 46) {
    return null
  }
  return fixed[index] ?? mobileForPlain(index)
}

function mobileForPlain(index) {
  return `+861099100${String(index).padStart(4, '0')}`
}

function nameFor(index) {
  const special = { 68: '欧阳䶮', 69: '阿依古丽·买买提', 70: 'Anna Müller' }
  const base = index === 72 || index === 74 ? index - 1 : index
  return special[base] ?? `${SURNAMES[base % SURNAMES.length]}${GIVEN_NAMES[(base * 7) % GIVEN_NAMES.length]}`
}

function day(offset) {
  return new Date(TODAY.getTime() + offset * 86400000).toISOString().slice(0, 10)
}

function write({ file, value }) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
```

按下面的顺序跑。造部门要在 S1 下进行，否则会报 40014「没有父部门权限」：

```bash
node seed.mjs fixtures
node seed.mjs departments
node seed.mjs probe
export ALLOW_FAKE_MOBILE=1
node seed.mjs users
```

- 第 4、5 行只在第 3 行的结论是「接受」时才执行。这就是 **T0 造数探针**，把结论和完整响应记进结果表。
- 飞书接受 1099 号段时，s0001–s0006 都落在平台中心的子部门里，T5 会用到它们。
- **少人方案**：飞书拒绝 1099 号段时，不造合成账号。T5 用 tr1、tr2，T11、T12 在小规模上验证公式和语义，T29-e 跳过。
- 不要把 300 人整批灌进连着真实飞书的工作流：会撞上 100 人上限（41007、44023），把测试租户塞满。北森样本只给模拟服务、看现状和评测用。

### 1.9 记录约定、数据安全和排错

- 每个请求都带一个标签，例如 `T1-a`。结果表里引用标签，原文去 `results/calls.ndjson` 里找。
- 截图存在 `results/screens/`，按「编号-设备-内容-时间」命名，例如 `M1-手机-暂停后提示-1512.png`。时间一律用北京时间。
- `results/` 目录和 `lab.env` 都不进仓库。写进结果文档的手机号只留后四位，`tenant_key` 只留前 6 位。
- 测试租户只用来测试，绝不把客户或公司正式租户的应用凭证放进 `lab.env`。
- 管理后台的菜单名以实际界面为准，和本文不一致时，在结果表里记下实际路径。

| 现象 | 多半是 |
| --- | --- |
| 99991672 Access denied | 权限没开，或者开了还没发版、没审核 |
| 40004、41050 | 部门或人不在通讯录权限范围内 |
| 40014 | 父部门不在范围内；在根部门下建部门要求「全部成员」 |
| 99991663 | App ID 或 App Secret 不对 |
| 230002 | 机器人不在群里 |
| 41007、44023 | 撞上了 100 人上限 |
| 44004、44009 | 同一个号码加入得太频繁，等 24 小时 |
| 44012 | 添加成员被飞书拦截，停下，别重试 |
| 长连接的订阅方式保存不了 | `listener.mjs` 没在运行 |
| 监听日志报 `invalid appId` | SDK 在本地校验 App ID 格式（`cli_` 加 16 位十六进制），多半是复制错了 |

---

## 2. 接口测试

每项都按同一个格式写：目的；对应假设；前置；请求；记录什么；结果 → 设计。「结果 → 设计」只说会改哪条设计。要改的具体文件、位置和负责人，汇总在 §4.2。

### 2.0 需实测事项和编号的对应

| 来源 | 需实测事项 | 本方案编号 |
| --- | --- | --- |
| `feishu-capabilities.md` 结论 1、§1.1；`contradictions.md` A3 | 范围外的人在 `batch_get_id` 里返回什么形态，能不能和「不存在」区分 | T1 |
| `feishu-capabilities.md` §4.1 | 41001、41002 的响应里有没有已存在用户的 ID | T3（T1 顺带） |
| `feishu-capabilities.md` §4.1、§9 第 18 条；`contradictions.md` 3.13 | `client_token` 的有效期，重放时返回什么 | T2 |
| `feishu-capabilities.md` §4.2、§9 第 5 条；`contradictions.md` A7 | 把直属上级改成已离职的人，报什么 | T4 |
| `feishu-capabilities.md` §10 T5；`contradictions.md` 3.1；`engine-spike.md` §10 | 改部门、暂停的 1 QPS 怎么生效，并发冻结报什么 | T5 |
| `feishu-capabilities.md` §4.3、§9 第 8 条；`contradictions.md` A6、3.9 | 暂停后已登录的会话是否立刻失效、多久失效 | T6、M1 |
| `feishu-capabilities.md` §4.3；`org-and-lifecycle.md` §3.1、§6；`contradictions.md` A6；`engine-spike.md` §10 | 接口能不能暂停未激活的账号；暂停的、未激活的账号占不占席位 | T7、M2 |
| `feishu-capabilities.md` 末尾汇总；`contradictions.md` A6；`alternatives.md` §8（我们自己） | 删除时各类资源的实际去向；重复删除的错误码；免费版调恢复接口返回什么 | T8、M3 |
| `org-and-lifecycle.md` §3.1、§6 | 普通群的群主离职后，群怎么处理 | T8、M3 |
| `feishu-capabilities.md` §3.2、§9 第 12 条 | 新建的子部门多久进入权限范围 | T9 |
| `feishu-capabilities.md` §3.3、§9 第 12、13 条 | 在管理后台改通讯录权限范围要不要发版、多久生效；`contact.scope.updated_v3` 何时到、带什么内容 | T10 |
| `feishu-capabilities.md` §2.4、§10 T11；`contradictions.md` 3.12 | 列全量实际要调用多少次、用多长时间 | T11 |
| `feishu-capabilities.md` §1.2、§2.3；`contradictions.md` A3、3.2 | 组织架构 v1：按哪套数据权限过滤、`in` 的上限、条件为空能否列全量、部门条件是否包含子部门 | T12 |
| `feishu-capabilities.md` §6.4、§10 T13；`alternatives.md` §8；`contradictions.md` 3.1；`engine-spike.md` §10 | 429 的返回形态；两个应用是否互相影响；2026 年 10 月免费版的月额度和计入范围；取令牌接口的频率 | T13 |
| `feishu-capabilities.md` §10 T14 | 长连接多实例时怎么投递，有没有重复、丢失 | T14 |
| `feishu-capabilities.md` §7.4、§10 T15 | 处理超时后的重推节奏；没有客户端在线时事件去了哪里 | T15 |
| `feishu-capabilities.md` §7.1 | 应用自己的写入会不会推回给自己 | T16 |
| `feishu-capabilities.md` §7.2 | 通讯录事件是否有序，一条处理失败会不会挡住后面的 | T17 |
| `feishu-capabilities.md` §7.5、§10 T18；ADR 0020 | 新版卡片回调走长连接时：点击者的身份、超过 3 秒的表现、更新 token 的次数和时效 | T18、M5 |
| `reachability-and-ai-clients.md` §1.2「卡片里的链接」 | 按端配置链接、移动端声明不跳转时的实际表现 | T18、M5 |
| `feishu-capabilities.md` §7.6、§9 第 19 条；`contradictions.md` A5、3.13 | 用同一个 `uuid` 重发返回什么；丢了响应的那条消息能否从历史里认出来 | T19 |
| `feishu-capabilities.md` §1.5、§9 第 20 条、§10 T20 | 邀请何时到达、走短信还是邮件；激活何时能读到，有没有事件 | T20、M4 |
| `feishu-capabilities.md` §4.2 | 单个部门的直属成员上限是 500 还是 1 万 | T21（免费版测不了，见 §5） |
| `feishu-capabilities.md` §7.4、§10 T22；`reachability-and-ai-clients.md` §1.2、§1.7、待查第 2 条；`contradictions.md` §5.1 | 长连接要放行哪些出网域名；经过企业 HTTP 代理能否连通、能否稳定重连 | T22 |
| `feishu-capabilities.md` §5.2；`org-and-lifecycle.md` §1.3、§6 | 部门名「不能重复」是全局判定还是同级判定 | T23 |
| `org-and-lifecycle.md` §1.3、§6；`alternatives.md` §8 | 43031、44053 说的「外部数据源」具体指什么；启用飞书人事后还能不能用接口改成员 | T24 |
| `org-and-lifecycle.md` §1.1、§6 | 经 SCIM（Okta、Entra）接入时，部门字符串怎么变成飞书部门 | T25（可选，另约时间） |
| `alternatives.md` §6.3、§8 | 成员的数据源标识、通讯录最近的修改人，能不能用接口读到 | T26 |
| `alternatives.md` §8 | 「组织架构数据同步」是不是所有版本都有 | M6 |
| `org-and-lifecycle.md` §6 | 44062「仅能通过生命周期引擎删除」这条规则在哪里配置 | M6、§5 |
| `reachability-and-ai-clients.md` 待查第 8 条 | aily 的自定义 MCP 能不能填请求头，从哪些 IP 发起请求 | T27（可选） |
| `reachability-and-ai-clients.md` 待查第 7 条 | 手机装了企业 VPN 或零信任客户端后，飞书内置浏览器能否打开内网地址 | M7（可选） |
| `reachability-and-ai-clients.md` 待查第 3 条 | 飞书私有化版本是否支持长连接和卡片回调 | §5 |
| `alternatives.md` §4.3 | 阿里云 IDaaS 的「绑定飞书-出方向」能不能用 | §5 |
| `contradictions.md` B3；`engine-spike.md` §10 | 预演的预测和实际执行的一致率 | T28（预演做出来以后测） |
| `engine-spike.md` §6、§10 | 写完马上读能不能读到；按 ID 批量读每次最多几个 | T29 |
| `alternatives.md` §3.4；`feishu-capabilities.md` §1.4（顺带测） | 再入职能不能复用原来的 user_id；同一手机号再入职时的表现 | T30 |
| `feishu-capabilities.md` §1.4（未查到，顺带测） | `update_user_id` 最多能改几次 | T31（可选） |

### T1 范围外的人查不查得到

**目的**：确认通讯录权限范围外的人，在三种操作下各是什么表现：按手机号查、用他的手机号创建、按 ID 读。

**对应假设**：`feishu-capabilities.md` §1.1、§3.5、§9 第 1、14 条；`design-inputs.md` 洞察 3、方向 C 体验 1（「无法匹配」「飞书有北森无」）；`contradictions.md` A3。

**前置**：S2。R3 在驻场顾问（范围外），R1 在产品部（范围内），R4 还不在租户里。

```bash
node feishu.mjs call POST '/open-apis/contact/v3/users/batch_get_id?user_id_type=user_id' '{"mobiles":["{{R3_MOBILE}}","{{R1_MOBILE}}","{{R4_MOBILE}}"],"include_resigned":true}' T1-a
node feishu.mjs call POST '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id' '{"name":"T1 撞号","mobile":"{{R3_MOBILE}}","department_ids":["FS-P2"],"employee_type":1}' T1-b
node feishu.mjs call GET '/open-apis/contact/v3/users/tr3?user_id_type=user_id' - T1-c
node feishu.mjs call POST '/open-apis/directory/v1/employees/filter?employee_id_type=open_id' '{"filter":{"conditions":[{"field":"base_info.mobile","operator":"eq","value":"\"{{R3_MOBILE}}\""}]},"required_fields":["base_info.name"],"page_request":{"page_size":10}}' T1-d
```

**记录**：
- T1-a：`user_list` 里三条各长什么样——有没有这一条，有没有 `user_id`，有没有 `status`。
- T1-b：HTTP 状态、`code`、完整的 `data` 和 `error`，里面有没有已存在用户的 ID。
- T1-c：是不是 41050。
- T1-d：有没有返回 R3（和 T12-e 对照）。

| 结果 | 设计怎么变 |
| --- | --- |
| R3 和 R4 两条形态一样 | 台账保留独立状态「平台看不到」；「没找到」一律写成「在通讯录权限范围内没找到」；「北森有飞书无」的结果页写明核对范围 |
| R3 那条能和 R4 区分开 | 连接器的按键查找可以直接报「范围外」，问题直接交给飞书管理员，不进待确认池 |
| T1-b 的 41001 里带了已存在用户的 ID | 「查找并链接」直接记下对应关系（标「看不到详情」），省一次查询 |
| 41001 里没有 ID | 41001 进对应关系的待确认池，交飞书管理员扩大范围。连接器现在的 `provisionUser` 先 `batch_get_id`，查不到就创建，撞上 41001 只会失败，要改走这一分支 |

### T2 client_token 的有效期和重放

**目的**：同一个 `client_token` 重放时返回什么，能保多久，删除之后再用会怎样。

**对应假设**：`feishu-capabilities.md` §4.1「需实测」、§9 第 18 条；`contradictions.md` 1-5、3.13；决定 000042 的 10 月 1 日修订第 5 条（幂等键由「业务键 + 目标状态」生成）。

**前置**：S1。R3 还不在租户里，并且已经告诉 R3「收到邀请先别点」。

```bash
export T2_TOKEN="t2-$(date +%s)"
node feishu.mjs call POST '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id&client_token={{T2_TOKEN}}' '{"user_id":"tr3","name":"同事丙","mobile":"{{R3_MOBILE}}","department_ids":["FS-X1"],"employee_type":1,"employee_no":"E9003"}' T2-a
```

把 `T2_TOKEN` 的值写回 `lab.env`。之后按下表重放：除 T2-c 外，请求和 T2-a 完全相同，只换标签。

| 步骤 | 时间 | 和 T2-a 的差别 | 标签 |
| --- | --- | --- | --- |
| T2-b | 紧接着 | 无 | `T2-b` |
| T2-c | 紧接着 | `department_ids` 改成 `["FS-X"]` | `T2-c` |
| T2-d | T2-a 之后 1 小时 | 无 | `T2-d-1h` |
| T2-e | T2-a 之后 24 小时（第 2 天） | 无 | `T2-e-24h` |
| T2-f | T4-a 删除 R3 之后至少 1 小时 | 无 | `T2-f-after-delete` |
| T2-g | 第 3 天、第 8 天 | 无 | `T2-g-2d`、`T2-g-7d` |

**记录**：每次的 HTTP 状态和 `code`；`data.user` 里的 `user_id`、`open_id` 是否和 T2-a 相同；`status.is_resigned` 的值；T2-f、T2-g 如果成功，R3 有没有又收到邀请。

| 结果 | 设计怎么变 |
| --- | --- |
| 重放返回同一个用户，24 小时后仍然如此 | 照 000042 修订第 5 条做：token = 业务键 + 目标状态（例如 `E10231:入职:2026-10-08`），重试时沿用同一个；连接器契约里写明实测的有效期 |
| 很快失效（再用就变成重复创建或报 41001） | 「结果未知」靠「先读回、再决定」来压低（`contradictions.md` 3.13 的修正说法不变），token 只当加分项，并补上实测数字 |
| 删除之后重放，仍返回那个已删除的用户 | 「幂等成功」可能拿回一个已离职的账号，所以写完必须读回 `status` 才能算到位（见 T29）；token 必须带上目标状态，否则再入职会拿回旧账号。连接器现在用 `hash(appId:手机号)` 当 token，正好会踩这个坑 |
| T2-c 返回的不是 40021 | 按实测语义写进连接器的错误归类；40021 归为「参数变了、结果未知 → 先读回」 |

### T3 冲突错误的响应体

**目的**：41001、41002、41003、44051 的响应里都有什么，能不能直接拿到已存在的那个用户。

**对应假设**：`feishu-capabilities.md` §4.1「对设计的影响」第 2 条、§4「对设计的含义」里的错误码分派表；`design-inputs.md` 洞察 3、4；`ai-v1.md` ⑦。

**前置**：S1。R1（带邮箱）、R2 已经由 T20 建好。

```bash
node feishu.mjs call POST '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id' '{"name":"T3 手机号撞号","mobile":"{{R1_MOBILE}}","department_ids":["FS-T"],"employee_type":1}' T3-a
node feishu.mjs call POST '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id' '{"name":"T3 两个账号","mobile":"{{R2_MOBILE}}","email":"{{R1_EMAIL}}","department_ids":["FS-T"],"employee_type":1}' T3-b
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr2?user_id_type=user_id' '{"email":"{{R1_EMAIL}}"}' T3-c
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr2?user_id_type=user_id' '{"employee_no":"E9001"}' T3-d
```

如果 T0 的结论是「接受 1099 号段」，再测创建路径上的 41002 和 44051：

```bash
node feishu.mjs call POST '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id' '{"name":"T3 邮箱撞号","mobile":"+8610993000001","email":"{{R1_EMAIL}}","department_ids":["FS-T"],"employee_type":1}' T3-e
node feishu.mjs call POST '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id' '{"name":"T3 工号撞号","mobile":"+8610993000002","employee_no":"E9001","department_ids":["FS-T"],"employee_type":1}' T3-f
```

**记录**：每个响应的完整 body，包括 `code`、`msg`、`data`，以及 `error` 里的 `log_id` 等字段；有没有已存在用户的 `user_id` 或 `open_id`；T3-b 报的是 41003 还是 41001。

| 结果 | 设计怎么变 |
| --- | --- |
| 冲突响应里带了已存在用户的 ID | 「查找并链接」省掉一次查询，41001、41002、44051 直接转成「链接到某人」 |
| 没带 | 维持「先按手机号、邮箱、工号查，查不到再建」；按工号查是走 v1 还是本地索引，看 T12 |
| T3-b 报 41003 | 规则表里写：41003 交员工本人或 HR 处理联系方式。如果报的是 41001，说明飞书先查手机号，41003 只在别的组合下出现，规则表照实写 |
| 无论哪种结果 | 把这些响应原文整理成 `ai-v1.md` ⑦ 规则表的样本，规则表认不出的再交给模型 |

### T4 把直属上级改成已离职的人

**目的**：PATCH 的错误码表里没有 44021。实测把上级改成已离职的人时报什么，能不能和「上级不存在」区分开。

**对应假设**：`feishu-capabilities.md` §4.2、§9 第 5 条；`contradictions.md` A7；`design-inputs.md`「没进前十」第 3 条；`ai-v1.md` ⑦。

**前置**：S3（第 2 天）。R3 未激活、在范围内。T4-a 同时也是 T7 的最后一步：删除一个未激活的账号。

```bash
node feishu.mjs call DELETE '/open-apis/contact/v3/users/tr3?user_id_type=user_id' - T4-a
node feishu.mjs call GET '/open-apis/contact/v3/users/tr3?user_id_type=user_id' - T4-b
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr2?user_id_type=user_id' '{"leader_user_id":"tr3"}' T4-c
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr2?user_id_type=user_id' '{"leader_user_id":"nobody"}' T4-d
node feishu.mjs call PATCH '/open-apis/contact/v3/departments/FS-P3?department_id_type=department_id&user_id_type=user_id' '{"leader_user_id":"tr3"}' T4-e
```

**记录**：
- T4-a 的返回（删除未激活账号时有没有特别的码），以及删除后 M2 的人数；
- T4-b 的 `status.is_resigned`；
- T4-c、T4-d、T4-e 各自的 `code` 和 `msg`。

| 结果 | 设计怎么变 |
| --- | --- |
| T4-c 报 44021 | 规则表照第一轮的写法；收敛顺序「上级先于下属」不变 |
| 报别的码，且和 T4-d（上级不存在）不同 | 规则表按实测码写：上级已离职 → 交 HRIS 改上级 |
| 和 T4-d 是同一个码 | 错误码分不出「已离职」和「不存在」，所以收敛前要先读回上级的状态；「上级待补」按读回结果判断，不靠错误码（即 `engine-spike.md` §4 的「等待前置」） |
| T4-c 成功了 | 飞书允许挂一个已离职的上级，平台得自己拦，否则会写出脏数据；`design-inputs.md`「没进前十」第 3 条要改 |

### T5 改部门、暂停的 1 QPS 与并发冻结

**目的**：弄清 1 QPS 是按应用算、按人算还是按租户算，超了报什么；并发冻结的失败长什么样。

**对应假设**：`feishu-capabilities.md` §4.2、§6.2、§9 第 17 条；`contradictions.md` 1-2、3.1；`design-inputs.md` 方向 C 体验 2（「按飞书配额约 10 秒」）；`engine-spike.md` §10 第 1 行。

**前置**：S3，在 T6 之后做。有合成账号时，用 s0002 到 s0006（都在平台中心下，未激活）；如果 T7 表明未激活账号暂停不了，或者根本没有合成账号，就把下面的 s0002 到 s0006 换成 tr1、tr2。

```bash
node feishu.mjs freeze s0002,s0003,s0004,s0005,s0006 true
for u in s0002 s0003 s0004 s0005 s0006; do node feishu.mjs freeze "$u" false; sleep 1.5; done
node feishu.mjs dept-pace 2 20 s0002 FS-P5,FS-P6
node feishu.mjs dept-pace 1 20 s0002 FS-P5,FS-P6
node feishu.mjs dept-pace 2 20 s0003,s0004 FS-P5,FS-P6
node feishu.mjs changes T5-en 20 10 s0002
```

做完把人改回原部门：s0002 回 FS-P12，s0003 回 FS-P13，s0004 回 FS-P1；用的是 tr1、tr2 时，tr1 回 FS-P2，tr2 回 FS-P3。例如：

```bash
node feishu.mjs call PATCH '/open-apis/contact/v3/users/s0002?user_id_type=user_id&department_id_type=department_id' '{"department_ids":["FS-P12"]}' T5-restore
```

**记录**：每次调用的时间、HTTP 状态、`code`、`msg` 和 `x-ogw-ratelimit-*` 响应头。这些都在 `results/calls.ndjson` 里，标签是 `freeze-true`、`dept-pace-2`、`dept-pace-1`、`T5-en`。

| 结果 | 设计怎么变 |
| --- | --- |
| 单人 2 次/秒时有失败，1 次/秒时全部成功 | 1 QPS 成立。再看失败码：如果是 99991400 并带 `x-ogw-ratelimit-reset`，就按这个头等待；如果是别的码（例如 44025），归为「平台自己退避重试」 |
| 两人轮流、合计 2 次/秒也有失败 | 按应用（或租户）计：改部门和暂停全局串行，预演卡上写「换部门 300 人约 5 分钟」 |
| 两人轮流不失败，只有单人失败 | 按人计：同一个人串行，不同的人可以并行，300 人换部门会快很多；写队列和预演耗时的估算都要改 |
| 并发冻结有失败 | 暂停也进串行队列，失败后自动退避重试，不算未到位 |
| 改 `en_name` 每秒 10 次也不受限 | 限制只针对 `department_ids` 和 `is_frozen` 两个字段，连接器按动作声明各自的速率（即 `contradictions.md` 3.1 的修正说法） |

### T6 暂停的真实效果

**目的**：用接口暂停之后，已登录的人多久被挡在外面，别人还能不能找到他，恢复之后数据还在不在。

**对应假设**：`feishu-capabilities.md` §4.3、§9 第 8 条；`contradictions.md` A6、D1、3.9；决定 000041 修订里「离职分两段」的第一段（「当天不能登录」）。

**前置**：S3。R1 已激活，手机和电脑上都登录着。按 M1、M2 准备好记录。

```bash
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr1?user_id_type=user_id' '{"is_frozen":true}' T6-a
node feishu.mjs call GET '/open-apis/contact/v3/users/tr1?user_id_type=user_id' - T6-b
node feishu.mjs call POST '/open-apis/im/v1/messages?receive_id_type=user_id' '{"receive_id":"tr1","msg_type":"text","content":"{\"text\":\"T6 暂停期间机器人发的单聊\"}"}' T6-c
```

暂停 15 分钟后恢复：

```bash
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr1?user_id_type=user_id' '{"is_frozen":false}' T6-d
```

**记录**：
- M1、M2 要求记录的全部内容；
- T6-b 读回的 `status.is_frozen`（暂停后立刻读，这也是 T29 的一项）；
- T6-c 的返回；
- 监听日志里有没有 tr1 的 `contact.user.updated_v3`，带不带状态变化。

| 结果 | 设计怎么变 |
| --- | --- |
| 已登录的会话几分钟内被踢下线 | 「当天不能登录」光靠暂停就能做到，000041 修订的第一段照写 |
| 会话要很久才失效，或者一直不失效 | 承诺改成「新登录立即被拒，已登录的会话在 N 之内失效」，在离职设置页写明；去问飞书有没有强制下线的办法（列入 §5） |
| 暂停期间仍计入人数或占用席位 | 设置页显示「暂停中 N 人，占 N 个席位」；第二段（缓冲期之后操作离职）必须做 |
| T6-c 发不出去 | 「通知本人」这类结果不发给已暂停的人 |

### T7 暂停未激活的账号

**目的**：接口能不能暂停一个还没接受邀请的账号；暂停之后邀请还能不能用；未激活的账号算不算人数。

**对应假设**：
- `feishu-capabilities.md` §4.3：管理后台「无法对状态为未激活和未加入的账号进行暂停操作」，接口能不能做，文档没写；
- `org-and-lifecycle.md` §3.1、§6；
- 决定 000041 修订：「撤销入职且账号还没激活时能不能直接删，等实测（T7）」。

**前置**：S1。R3 已经由 T2-a 建好，没有接受邀请。

```bash
node feishu.mjs call GET '/open-apis/contact/v3/users/tr3?user_id_type=user_id' - T7-a
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr3?user_id_type=user_id' '{"is_frozen":true}' T7-b
node feishu.mjs call GET '/open-apis/contact/v3/users/tr3?user_id_type=user_id' - T7-c
```

接着：
1. R0 在管理后台对 R3 点「暂停」，记下界面上的提示（M6）；
2. 看 M2 的人数里算不算 R3；
3. 如果 T7-b 成功了，第 2 天上午请 R3 点一次邀请链接，看能不能加入（M4），然后执行 T7-d 恢复。R3 的删除在 T4-a 里做。

```bash
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr3?user_id_type=user_id' '{"is_frozen":false}' T7-d
```

**记录**：T7-b 的 `code`；T7-c 的 `is_frozen`、`is_activated`；管理后台提示的原文；R3 点链接的结果；M2 的人数。

| 结果 | 设计怎么变 |
| --- | --- |
| 接口不能暂停未激活的账号 | 撤销入职、账号又没激活时，允许直接删除，作为唯一的删除例外（000041 修订里「等实测（T7）」那句就此定下；同时定下 `contradictions.md` D1 推荐的最后一句） |
| 能暂停，而且暂停后邀请链接失效 | 撤销入职也用暂停，删除仍不开放 |
| 能暂停，但暂停后还能靠邀请链接加入 | 对未激活账号来说，暂停不等于「进不来」，撤销入职必须删除 |
| 未激活的账号也计入 100 人上限 | 「入职前 N 天开通」会提前占名额，设置页要提示 |

### T8 删除用户与资源去向

**目的**：不指定接收人时，删除用户后各类资源的实际去向；重复删除报什么；免费版调用恢复接口返回什么。

**对应假设**：`feishu-capabilities.md` §4.4；`org-and-lifecycle.md` §3.1（包括「普通群群主离职后的默认行为，未查到」）、§3 的「对设计的含义」；`contradictions.md` A6；`alternatives.md` §3.4、§8；决定 000041 修订里的第二段。

**前置（第 1 天，R1、R2 在客户端里做）**：
- 各建一篇云文档，分享给 R0 只读；
- 各建一个下周的日程，邀请 R0；
- 各建一个普通群，拉进 R0 和机器人；
- 可选：各建一份飞书问卷、录一段妙记、在开发者后台建一个应用；
- 可选：如果能找到一个其他企业的飞书账号当外部联系人，再建一个外部群。

部门群用接口建，两人分别当部门主管：

```bash
node feishu.mjs call POST '/open-apis/contact/v3/departments?department_id_type=department_id&user_id_type=user_id' '{"name":"T8 甲的部门","parent_department_id":"FS-P","department_id":"FS-P7","leader_user_id":"tr1","create_group_chat":true}' T8-prep-1
node feishu.mjs call POST '/open-apis/contact/v3/departments?department_id_type=department_id&user_id_type=user_id' '{"name":"T8 乙的部门","parent_department_id":"FS-P","department_id":"FS-P8","leader_user_id":"tr2","create_group_chat":true}' T8-prep-2
node feishu.mjs call GET '/open-apis/contact/v3/departments/FS-P7?department_id_type=department_id&user_id_type=user_id' - T8-prep-3
```

按 M3 填好「删除前清单」。R1 有直属上级（R0），R2 没有。

**删除（第 2 天，S3）**：

```bash
node feishu.mjs call DELETE '/open-apis/contact/v3/users/tr1?user_id_type=user_id' - T8-a
node feishu.mjs call DELETE '/open-apis/contact/v3/users/tr2?user_id_type=user_id' - T8-b
node feishu.mjs call GET '/open-apis/contact/v3/users/tr1?user_id_type=user_id' - T8-c
node feishu.mjs call POST '/open-apis/contact/v3/users/batch_get_id?user_id_type=user_id' '{"mobiles":["{{R1_MOBILE}}","{{R2_MOBILE}}"],"include_resigned":true}' T8-d
node feishu.mjs call DELETE '/open-apis/contact/v3/users/tr1?user_id_type=user_id' - T8-e
node feishu.mjs call POST '/open-apis/contact/v3/users/tr1/resurrect?user_id_type=user_id&department_id_type=department_id' '{"departments":[{"department_id":"FS-P2"}]}' T8-f
```

T8-a 如果因为 R1 是部门主管而报错，记下错误码，先把 FS-P7 的主管清掉再删，并把这一点写进结果。

**记录**：
- T8-a 到 T8-f 的返回；
- T8-c 的 `status`（同时算 T29 的一项）；
- T8-d 在 `include_resigned=true` 时有没有这两个人；
- 监听日志里的 `contact.user.deleted_v3`；
- M3 的「删除后」清单和 M2 的人数。

| 结果 | 设计怎么变 |
| --- | --- |
| 资源去向和文档一致（有上级的全转给上级；没上级的，文档、妙记、邮件留在原名下，日程、问卷被删） | 000041 第二段的预演卡照 `org-and-lifecycle.md` §3「对设计的含义」第 2、3 条写；接收人规则的默认顺序是「直属上级 → 部门负责人 → 兜底接收人」 |
| 和文档有出入 | 改 `feishu-capabilities.md` §4.4、`org-and-lifecycle.md` §3.1 的表，预演卡按实测写 |
| 弄清了普通群的去向（转给谁，或者解散） | 补进 `org-and-lifecycle.md` §3.1「接口没有覆盖的」；预演卡列出「名下有 N 个普通群」 |
| 重复删除有专门的码 | 连接器把它归为「已到位（已删除）」，不报失败 |
| 免费版调 resurrect 报 44029 或别的码 | 对免费版客户来说，「再入职只能新建账号」（`alternatives.md` §3.4）是硬事实，对应关系要显式记「旧账号 → 新账号」 |

### T9 新建的子部门是否自动进入范围

**目的**：父部门在范围内时，用接口建的子部门和在管理后台建的子部门，分别多久能用。

**对应假设**：`feishu-capabilities.md` §3.2（「只要有一个部门的通讯录范围权限，那么就拥有这个部门下所有子部门的权限」，但生效时延没写）、§3「对设计的含义」第 1 条；`org-and-lifecycle.md` §1.6 第 2 条（「补齐缺失部门」开关）。

**前置**：S2（范围只有平台中心）。

```bash
node feishu.mjs call POST '/open-apis/contact/v3/departments?department_id_type=department_id' '{"name":"T9 接口子部门","parent_department_id":"FS-P","department_id":"FS-P9"}' T9-a
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr2?user_id_type=user_id&department_id_type=department_id' '{"department_ids":["FS-P9"]}' T9-b
```

如果 T9-b 报 40004，就改用 watch，每 10 秒重试一次，直到成功：

```bash
node feishu.mjs watch 10 PATCH '/open-apis/contact/v3/users/tr2?user_id_type=user_id&department_id_type=department_id' '{"department_ids":["FS-P9"]}' T9-b-watch
```

然后 R0 在管理后台「平台中心」下手工建一个「T9 后台子部门」，记下时间，再执行：

```bash
node feishu.mjs call GET '/open-apis/contact/v3/departments/FS-P/children?department_id_type=department_id&page_size=50' - T9-c
export T9_DEPT='<T9-c 里「T9 后台子部门」的 department_id>'
node feishu.mjs watch 10 GET '/open-apis/contact/v3/users/find_by_department?department_id_type=department_id&department_id={{T9_DEPT}}' - T9-d
node feishu.mjs call GET '/open-apis/contact/v3/scopes?department_id_type=department_id&user_id_type=user_id&page_size=100' - T9-e
node feishu.mjs call GET '/open-apis/application/v6/applications/{{FEISHU_APP_ID}}/contacts_range_configuration?department_id_type=department_id&user_id_type=user_id&page_size=100' - T9-f
node feishu.mjs events T9
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr2?user_id_type=user_id&department_id_type=department_id' '{"department_ids":["FS-P3"]}' T9-restore
```

**记录**：
- T9-a 成功没有；
- T9-b 是第一次就成功，还是过了多少秒才成功；
- T9-d 从管理后台建好部门到不再报 40004，用了多少秒；
- T9-e、T9-f 有没有列出新的子部门（预期只列出「平台中心」）；
- 两个 `contact.department.created_v3` 事件都收到了没有。

| 结果 | 设计怎么变 |
| --- | --- |
| 两种新子部门都立刻能用 | 发布前检查只需在检查时展开覆盖集；「补齐部门」建完部门可以马上建人 |
| 有延迟 | 发布前检查和补齐部门都要容忍这段延迟（重试或等待），把时延写进 `feishu-capabilities.md` §3.2 |
| 两个范围接口都只列出配置的节点 | 覆盖集必须自己用 `children` 展开（`feishu-capabilities.md` §3「对设计的含义」第 1 条成立） |

### T10 改范围的两条路和时延

**目的**：在开发者后台和管理后台改通讯录权限范围，分别多久生效、要不要发版；权限范围变更事件何时到、带什么内容。

**对应假设**：`feishu-capabilities.md` §3.3、§3.4、§9 第 12、13 条；`design-inputs.md` 原则 3 的检验，以及方向 C 体验 3（对方待办单，「平台每 10 分钟读一次」那句已由 `contradictions.md` 3.16 末表改写）；ADR 0020（卡片上的「重新检查」）。

**前置**：开始时是 S1。三段都开着同一个探测请求：

```bash
node feishu.mjs watch 10 GET '/open-apis/contact/v3/departments/FS-X?department_id_type=department_id' - T10-watch
```

| 段 | 怎么改 | 记什么 |
| --- | --- | --- |
| T10-0：S1 → S2 | 开发者后台：通讯录权限范围改成「部分成员：平台中心」，创建版本，申请发布，R0 审核 | 申请、审核通过、watch 出现 40004 这三个时间点；`contact.scope.updated_v3` 何时到、`removed` 里有什么 |
| T10-1：S2 → S3 | 开发者后台：加上「外部协作」，发版、审核 | 审核通过到 watch 返回 0 的秒数；事件的 `added` |
| T10-2：S3 → S2 → S3 | 管理后台：工作台 → 应用管理 → 本应用 → 通讯录权限范围，先移出「外部协作」，保存；再加回来，保存 | 两次各自要不要发版、多少秒生效；两次事件到没到、内容是什么；管理后台里到底有没有这个入口 |

每段改完都拍一次 §1.6 的两张快照，标签分别改成 `T10-0-range`、`T10-0-scopes` 等。

| 结果 | 设计怎么变 |
| --- | --- |
| 管理后台改范围不用发版，几秒到几分钟就生效 | 对方待办单首选管理后台这条路，飞书管理员不用进开发者后台、不用发版；待办单的步骤按 `contacts_scope_type` 分支写（`feishu-capabilities.md` §3「对设计的含义」）；卡片上的「重新检查」可以在管理员说「好了」之后马上去查 |
| 管理后台改也要发版，或者生效很慢 | 待办单写全「创建版本 → 审核」；把预期的等待时长写进问题 |
| `contact.scope.updated_v3` 每次都到，而且 `added` 列出了部门 | 「等待对方」由事件驱动自动关闭，定时读只做兜底 |
| 事件不到，或者内容不全 | 用定时读 `contacts_range_configuration`（限 100 次/分钟）兜底，间隔按实测时延来定 |

### T11 列全量的实际调用数

**目的**：用实测数字核对「看现状」的调用量估算。

**对应假设**：`feishu-capabilities.md` §2.4；`contradictions.md` 3.12、A7（「看现状」的调用数）；`engine-spike.md` §6。

**前置**：第一条在 S1 下跑，第二条在 S2 下跑。

```bash
node feishu.mjs list-all root T11-S1
node feishu.mjs list-all scopes T11-S2
node feishu.mjs call GET '/open-apis/contact/v3/users/batch?user_id_type=user_id&user_ids=tr1&user_ids=tr2' - T11-batch
```

**记录**：每个接口的调用次数、总耗时、部门数、去重后的人数、重复出现的次数；`scopeOnlyUsers`（范围里单独授权的人）的个数；S2 下 R3 有没有出现。

| 结果 | 设计怎么变 |
| --- | --- |
| 调用数大致等于「⌈部门数 / 50⌉ + 部门数 + 大部门加页」 | `contradictions.md` 3.12 的修正说法成立，把实测数字写进去，「看现状」照这个公式估算 |
| 明显偏多（例如 `children` 不分页，或者重复很多） | 修正公式；连接器的「列出全部」按实测步骤上报调用数 |
| S2 下看不到 R3 | 结果页写「核对范围：飞书应用的通讯录权限范围，共 N 个部门」 |

### T12 组织架构 v1 按工号查

**目的**：确认 `employees/filter` 按哪套数据权限过滤、`in` 能放几个值、条件为空能不能列出全量、按部门查时含不含子部门。

**对应假设**：`feishu-capabilities.md` §1.2（两处文档对数据权限的说法矛盾）、§2.3；`contradictions.md` A3、3.2。

**前置**：T12-a 到 T12-d 在 S1 下做，T12-e 在 S2 下做。先在开发者后台的「数据权限」页看一眼，有没有单独的「组织架构」数据权限设置，截图存档。

```bash
node feishu.mjs call POST '/open-apis/directory/v1/employees/filter?employee_id_type=open_id&department_id_type=department_id' '{"filter":{"conditions":[{"field":"work_info.job_number","operator":"eq","value":"\"E9001\""}]},"required_fields":["base_info.name","base_info.mobile","base_info.departments","base_info.active_status","base_info.is_resigned","base_info.data_source","work_info.job_number","work_info.staff_status"],"page_request":{"page_size":100}}' T12-a
for n in 10 50 100 101 200 1000; do
  node -e 'const n = Number(process.argv[1]); const values = Array.from({ length: n }, (_, i) => (i === 0 ? "E9001" : `X${i}`)); process.stdout.write(JSON.stringify({ filter: { conditions: [{ field: "work_info.job_number", operator: "in", value: JSON.stringify(values) }] }, required_fields: ["work_info.job_number"], page_request: { page_size: 100 } }))' "$n" > "t12-in-$n.json"
  node feishu.mjs call POST '/open-apis/directory/v1/employees/filter?employee_id_type=open_id' "@t12-in-$n.json" "T12-b-in-$n"
done
node feishu.mjs call POST '/open-apis/directory/v1/employees/filter?employee_id_type=open_id&department_id_type=department_id' '{"filter":{"conditions":[]},"required_fields":["base_info.name","work_info.job_number","base_info.data_source"],"page_request":{"page_size":100}}' T12-c
node feishu.mjs call POST '/open-apis/directory/v1/employees/filter?employee_id_type=open_id&department_id_type=department_id' '{"filter":{"conditions":[{"field":"base_info.departments.department_id","operator":"eq","value":"\"FS-P\""},{"field":"work_info.staff_status","operator":"eq","value":"1"}]},"required_fields":["base_info.name","base_info.departments"],"page_request":{"page_size":100}}' T12-d
```

S2 下再执行：

```bash
node feishu.mjs call POST '/open-apis/directory/v1/employees/filter?employee_id_type=open_id' '{"filter":{"conditions":[{"field":"work_info.job_number","operator":"eq","value":"\"E9003\""}]},"required_fields":["base_info.name","work_info.job_number"],"page_request":{"page_size":100}}' T12-e
```

T12-c 如果返回了 `page_token`，就把它加进 `page_request` 重发一次，直到没有为止。

**记录**：
- T12-a 是否找到 R1，返回了哪些字段；
- T12-b 从多少个值开始报错，报的是什么码（例如 2220014）；
- T12-c 共返回多少人，和 T11 是否一致；
- T12-d 里有没有子部门的人（R1 在 FS-P2）；
- T12-e 有没有返回 R3。

| 结果 | 设计怎么变 |
| --- | --- |
| v1 遵循通讯录权限范围，`in` 至少能放 100 个值 | 连接器的「按工号查」走 v1，每页 100；权限清单里加上 v1 的权限 |
| v1 走的是另一套「组织架构」数据权限，或者 `in` 上限很小 | 按工号查改成「列出全量后在本地建索引」（`contradictions.md` 3.2 的修正说法），v1 不进首发 |
| 条件为空能列出全量 | 「列出全部」可以用 v1 代替逐部门遍历，1 万人约 100 次调用 |
| 按部门查含子部门 | 按部门核对可以少调用很多次 |

### T13 限流与月额度

**目的**：超限时返回什么；同一租户的两个应用是否共享频控；免费版现在的月额度是多少、哪些调用计入；取令牌接口有没有频率限制。

**对应假设**：`feishu-capabilities.md` §6.1–§6.4、§9 第 4 条；`contradictions.md` 1-2、3.1；`alternatives.md` §3.4（免费版额度只卡消息）、§8；`engine-spike.md` §10。

**前置**：任意范围都行。先截「费用中心 → 权益数据」里的 API 调用次数和上限（M6 第 1 项）。

```bash
node feishu.mjs burst 300 20 GET '/open-apis/contact/v3/scopes?page_size=1' T13-app1-solo
```

两个应用同时打：开两个终端，各跑下面一条。两条都会先等到下一个整分钟，再同时开始：

```bash
node -e 'setTimeout(() => {}, (60 - new Date().getSeconds()) * 1000)'; node feishu.mjs burst 300 20 GET '/open-apis/contact/v3/scopes?page_size=1' T13-app1-pair
```

```bash
node -e 'setTimeout(() => {}, (60 - new Date().getSeconds()) * 1000)'; FEISHU_APP_ID="$APP2_ID" FEISHU_APP_SECRET="$APP2_SECRET" node feishu.mjs burst 300 20 GET '/open-apis/contact/v3/scopes?page_size=1' T13-app2-pair
```

月额度：先发 10 条消息（消息接口计入额度），再调 100 次通讯录接口（不计入）。1 小时后和第 2 天早上各截一次权益数据：

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do node feishu.mjs call POST '/open-apis/im/v1/messages?receive_id_type=chat_id' '{"receive_id":"{{HR_CHAT_ID}}","msg_type":"text","content":"{\"text\":\"T13 计量消息\"}","uuid":"{{UUID}}"}' T13-msg > /dev/null; done
node feishu.mjs burst 100 1 GET '/open-apis/contact/v3/scopes?page_size=1' T13-contact
```

取令牌接口的频率（`engine-spike.md` §10）：

```bash
node -e 'const body = JSON.stringify({ app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET }); Promise.all(Array.from({ length: 60 }, () => fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body }).then(async (r) => `HTTP ${r.status} code=${(await r.json()).code}`))).then((rows) => console.log(rows.reduce((acc, row) => ({ ...acc, [row]: (acc[row] ?? 0) + 1 }), {})))'
```

**记录**：
- `burst` 打出的汇总：各种 HTTP 状态和 `code` 各多少次，第一次被限流在第几毫秒，`x-ogw-ratelimit-reset` 取过哪些值；
- 两个应用同时打和单独打时，429 各占多少；
- 权益数据前后的数字，以及当前的上限；
- 60 次并发取令牌的结果。

| 结果 | 设计怎么变 |
| --- | --- |
| 超限时是 HTTP 429 + 99991400 + reset 响应头 | 和文档一致：连接器按 reset 头等待，不找 `Retry-After`（`feishu-capabilities.md` §6.3） |
| 两个应用同时打时，各自的 429 比例和单独打时一样 | 频控按应用算：建议客户为平台单独建一个应用（写进安装清单）；限流挂在「接口 × 应用 × 租户」上（`contradictions.md` 3.1） |
| 同时打时 429 明显变多 | 同一租户的应用共享频控，限流单位改成租户，连接器的声明要改 |
| 消息计入、通讯录不计入，上限是 X | 连接详情显示「本月消息额度已用 N / X」；遇到 99991403 就生成「需要飞书管理员升级版本」的问题，不自动重试 |

### T14 长连接多实例

**目的**：同一个应用连着两个长连接客户端时，每条事件投给谁，有没有重复、有没有丢。

**对应假设**：`feishu-capabilities.md` §7.4（「只有其中随机一个客户端会收到消息」）、§7「对设计的含义」第 2 条；`reachability-and-ai-clients.md` §1.8 第 2 条；ADR 0020 Consequences 里的「IM 通道」。

**前置**：S1。实例 A 已经在跑，再开一个实例 B。

```bash
LISTENER_LABEL=B node listener.mjs | tee -a results/listener-B.log
```

```bash
node feishu.mjs changes T14 50 2 tr1,tr2
node feishu.mjs events T14
```

做完把 B 停掉。

**记录**：50 次变更对应多少个事件；每个事件落在 A 还是 B；被投递多次的有几个；有没有哪次变更一个事件都没收到。

| 结果 | 设计怎么变 |
| --- | --- |
| 每条只投一个实例，不重不丢 | IM 通道可以多实例并存，用不着选主；按 `event_id` 去重照做 |
| 有跨实例的重复 | 去重必须做在共享存储里（Redis），不能只在单个进程里做 |
| 有丢失 | 事件只当加速器的结论更硬，对账频率要提高 |

### T15 处理超时与离线

**目的**：处理超过 3 秒时，飞书的重推节奏是什么样；没有客户端在线时，事件是排队、按重试节奏丢，还是直接丢。

**对应假设**：`feishu-capabilities.md` §7.2（按 15 秒、5 分钟、1 小时、6 小时重推，最多 4 次）、§7.4；`reachability-and-ai-clients.md` §1.8 第 8 条；`design-inputs.md` 洞察 5。

**前置**：S3，第 1 天傍晚开始。

慢处理（App1，过夜）：先停掉实例 A，用下面的参数重启，再造一条变更：

```bash
SLEEP_MS=5000 SLEEP_MATCH=T15-slow LISTENER_LABEL=A node listener.mjs | tee -a results/listener-A.log
```

```bash
node feishu.mjs changes T15-slow 1 1 tr2
```

离线（App2，两段）：
1. 17:40 停掉 APP2 实例，造三条变更 `node feishu.mjs changes T15-off 3 1 tr2`；
2. 17:50 重新启动 APP2 实例，看哪些事件补到了、什么时候到的；
3. 18:00 再停掉 APP2 实例，造三条变更 `node feishu.mjs changes T15-night 3 1 tr2`；
4. 第 2 天 09:00 启动 APP2 实例。

最后汇总：

```bash
node feishu.mjs events T15
```

**记录**：
- T15-slow 那个事件每次投递的时间点，和 15 秒、5 分钟、1 小时、6 小时对照；
- 离线 10 分钟和离线一整夜，各补到了几条、在什么时候；
- 开发者后台有没有事件推送日志；开发者小助手有没有推送「重试都失败」的提醒（截图）。

| 结果 | 设计怎么变 |
| --- | --- |
| 慢处理的重推节奏和文档一致 | 「平台停机约 7 小时以上，事件就丢了」写进运维文档；IM 通道 3 秒内只入队 |
| 离线 10 分钟后能补到 | 短暂断线可以靠飞书重推兜住，对账照常做 |
| 离线一整夜补不到 | 对账频率至少每天一次；IM 通道断开算一种「没有动静」，要进问题中心（`reachability-and-ai-clients.md` §1.8 第 2 条） |

### T16 自己的写入会不会推回给自己

**目的**：App1 自己建、改、删人和部门时，App1 能不能收到对应的通讯录事件。

**对应假设**：`feishu-capabilities.md` §7.1（「平台自己的写入是否也会推回给自己（回环），文档没写」）。企业微信的文档写明不回环，可作对照。

**前置**：第 0 天造部门、第 1 天建人时，A 和 APP2 两个实例都开着。

```bash
node feishu.mjs events contact.department.created_v3
node feishu.mjs events contact.user.created_v3
node feishu.mjs events contact.user.deleted_v3
```

**记录**：App1 自己造的 30 个部门、建的 R1 到 R3，在 A（App1 的实例）和 APP2（另一个应用的实例）里各收到了几条。

| 结果 | 设计怎么变 |
| --- | --- |
| A 也收到了自己写入产生的事件 | IM 通道要能认出自己的写入，例如按业务键记下「刚写过」，在核对者场景里避免「事件 → 重新检查 → 写入 → 事件」来回打转；因为收敛是幂等的，最坏也只是多读一次 |
| A 收不到，APP2 收得到 | 不用做回环过滤；但「写后读回」不能指望自己的事件来触发 |

### T17 通讯录事件是否有序

**目的**：同一个人连续变化几次时，事件是否按顺序到达；一条处理失败时，后面的事件会不会被挡住。

**对应假设**：`feishu-capabilities.md` §7.2（「通讯录事件页面没有标注是否有序」）。

**前置**：S1，只开着 A 一个实例，并且没有别的测试在进行。

```bash
node feishu.mjs changes T17-a 3 10 tr2
node feishu.mjs dept-pace 0.9 3 tr2 FS-P5,FS-P3
node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr2?user_id_type=user_id&department_id_type=department_id' '{"department_ids":["FS-P3"]}' T17-restore
```

然后用 `FAIL_FIRST=1 LISTENER_LABEL=A node listener.mjs` 重启 A，再执行：

```bash
node feishu.mjs changes T17-c 3 10 tr2
node feishu.mjs events T17
```

测完用普通参数（不带 `FAIL_FIRST`）重启 A。

**记录**：
- T17-a 三条事件的到达顺序，和 `create_time`、`en_name` 序号对照；
- 改部门那三条事件的顺序；
- T17-c 里第一条故意失败之后，第二、三条是马上到，还是等第一条重推成功以后才到。

| 结果 | 设计怎么变 |
| --- | --- |
| 无序，失败也不挡后面 | 照 000042 的做法，按状态收敛，不依赖事件顺序，不用多做什么 |
| 有序，失败会挡住后面 | 一条坏事件会把整条流卡住：IM 通道必须 3 秒内确认、处理放进队列，绝不在回调里同步处理 |

### T18 卡片按钮回调走长连接

**目的**：新版卡片的回调全程走长连接时，能否认出点击者；回调超过 3 秒时用户看到什么；更新 token 的次数和时效；按端配置的链接在手机上怎么表现。

**对应假设**：`feishu-capabilities.md` §7.5、§9 第 22 条；ADR 0020（「点击者是谁，只看 IM 平台回调里的操作人」；卡片回调 3 秒内只做校验和入队；token 30 分钟内最多更新 2 次）；`reachability-and-ai-clients.md` §1.2、§1.8 第 4 条。

**前置**：S1。R1 已经激活，人在 HR 群里，手机和电脑都开着。回调订阅方式只配了长连接，没有任何公网地址。

```bash
node feishu.mjs card '{{HR_CHAT_ID}}'
```

R1 按顺序操作：
1. 点「重新检查」，等 40 秒；
2. 点「慢回调（4 秒）」；
3. 点「30 分钟后再更新」，监听要保持运行 31 分钟以上；
4. 在手机上点「打开控制台」，再在电脑上点一次。

R0 也点一次「重新检查」。整个过程按 M5 观察。

**记录**：
- `results/cards-A.ndjson` 里 `operator` 的 `user_id`（应为 `tr1`）、`open_id`、`union_id`、`tenant_key`，以及 `tokenPrefix`（更新 token 应以 `c-` 开头）；
- `calls.ndjson` 里 `T18-update-1`、`-2`、`-3` 和 `-after-1860s` 各自的结果；
- M5 的截图。

| 结果 | 设计怎么变 |
| --- | --- |
| `operator.user_id` 等于 `tr1` | ADR 0020「只看 `operator.user_id`、`open_id` 认人」可行；平台成员绑定 IM 身份时用 `user_id` |
| 慢回调时用户看到报错，飞书也不重推 | 卡片回调 3 秒内只入队（ADR 0020 已经这样写），重新检查异步做，结果靠延时更新回写到卡片 |
| 第 3 次更新失败，31 分钟后的更新也失败 | 一张卡片最多更新两次：「检查中」和「结果」；超过 30 分钟才出的结果，改发一条新消息 |
| 手机端声明了不跳转，点了也不跳 | `reachability-and-ai-clients.md` §1.8 第 4 条照做：移动端不跳转，卡片上写「请在电脑上打开」 |

### T19 消息去重与读回

**目的**：用同一个 `uuid` 重发时返回什么；超过 1 小时还管不管用；丢了响应的那条消息能否从历史记录里认出来；能不能给未激活的人发单聊。

**对应假设**：`feishu-capabilities.md` §7.6、§9 第 19 条；`contradictions.md` A5、3.13；`design-inputs.md` 方向 C 的主要风险。

**前置**：机器人在 HR 群里。

```bash
node feishu.mjs call POST '/open-apis/im/v1/messages?receive_id_type=chat_id' '{"receive_id":"{{HR_CHAT_ID}}","msg_type":"text","content":"{\"text\":\"T19-U1 第一条\"}","uuid":"t19-u1"}' T19-a
node feishu.mjs call POST '/open-apis/im/v1/messages?receive_id_type=chat_id' '{"receive_id":"{{HR_CHAT_ID}}","msg_type":"text","content":"{\"text\":\"T19-U1 第一条\"}","uuid":"t19-u1"}' T19-b
node feishu.mjs call POST '/open-apis/im/v1/messages?receive_id_type=chat_id' '{"receive_id":"{{HR_CHAT_ID}}","msg_type":"text","content":"{\"text\":\"T19-U1 换了内容\"}","uuid":"t19-u1"}' T19-c
node feishu.mjs call POST '/open-apis/im/v1/messages?receive_id_type=chat_id' '{"receive_id":"{{HR_CHAT_ID}}","msg_type":"text","content":"{\"text\":\"T19-U2 假装丢了响应\"}","uuid":"t19-u2"}' T19-e > /dev/null
export T19_FROM=$(( $(date +%s) - 7200 ))
node feishu.mjs call GET '/open-apis/im/v1/messages?container_id_type=chat&container_id={{HR_CHAT_ID}}&start_time={{T19_FROM}}&sort_type=ByCreateTimeDesc&page_size=50' - T19-f
export T19_MSG_ID='<T19-a 返回的 message_id>'
node feishu.mjs call GET '/open-apis/im/v1/messages/{{T19_MSG_ID}}' - T19-g
node feishu.mjs call POST '/open-apis/im/v1/messages?receive_id_type=user_id' '{"receive_id":"tr3","msg_type":"text","content":"{\"text\":\"T19 发给还没激活的人\"}"}' T19-h
```

T19-a 发出 65 分钟以后，把 T19-a 原样再发一次，标签记为 `T19-d`。T19-e 发出时不看它的输出，只从 T19-f 里去找那一条。

**记录**：
- T19-b、T19-c 返回的 `message_id` 和 T19-a 是否相同，有没有报错；
- T19-d 有没有产生一条新消息；
- T19-f 能否靠正文标记和发送方（`sender.id` 为应用、`sender_type` 为 `app`）找到 T19-U2，历史记录里有没有 `uuid` 字段；
- T19-h 的 `code`。

| 结果 | 设计怎么变 |
| --- | --- |
| 同一个 `uuid` 在 1 小时内返回同一个 `message_id`，不报错 | 连接器的 `send_group_message`（`packages/connectors/community/feishu/src/lib/actions/send-group-message.ts`，现在不带 `uuid`）改成用「业务键 + 变化序号」当 `uuid`；超过 1 小时的重试，靠平台自己的发送记录去重 |
| 返回报错 | 连接器把这个码当作「已发送」处理 |
| 能从历史记录里认出那条消息 | 「每次变化一条」在读回成功时，依据从「发送记录」升为「读回核对」（`contradictions.md` A5）；消息正文里带上业务键和变化序号，作为标记 |
| 认不出来 | 依据只能是发送记录，界面上标「依据：发送记录」 |
| T19-h 失败 | 欢迎消息改发 HR 群，或者等读回到 `is_activated` 之后再发给本人 |

### T20 邀请与激活

**目的**：建好账号后，邀请何时到达、走什么渠道；本人接受邀请后，接口多久能读到激活状态，有没有事件。

**对应假设**：`feishu-capabilities.md` §1.5、§4.1（「入职日前 N 天开通就是入职日前 N 天发出加入企业的邀请」）、§9 第 20 条；决定 000041 修订。

**前置**：S1。R1、R2 拿着手机，R1 能看邮箱。

```bash
node feishu.mjs call POST '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id' '{"user_id":"tr1","name":"同事甲","mobile":"{{R1_MOBILE}}","email":"{{R1_EMAIL}}","department_ids":["FS-P2"],"leader_user_id":"{{R0_USER_ID}}","employee_type":1,"employee_no":"E9001"}' T20-a
node feishu.mjs call GET '/open-apis/contact/v3/users/tr1?user_id_type=user_id&department_id_type=department_id' - T29-a
node feishu.mjs call POST '/open-apis/contact/v3/users/batch_get_id?user_id_type=user_id' '{"mobiles":["{{R1_MOBILE}}"]}' T29-b
node feishu.mjs call POST '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id' '{"user_id":"tr2","name":"同事乙","mobile":"{{R2_MOBILE}}","department_ids":["FS-P3"],"employee_type":1,"employee_no":"E9002"}' T20-b
WATCH_PICK=data.user.status.is_activated node feishu.mjs watch 15 GET '/open-apis/contact/v3/users/tr1?user_id_type=user_id' - T20-watch
```

R1 按 M4 记录收到邀请的情况，然后接受邀请，记下接受的时间；R2 也接受。R3（T2-a 建的）不点。

**记录**：M4 的全部内容；T20-watch 里 `is_activated` 从 `false` 变成 `true` 的时间，和 R1 接受邀请的时间相差多少；监听日志里有没有对应的 `contact.user.updated_v3`，带不带 `status`。

| 结果 | 设计怎么变 |
| --- | --- |
| 只填手机号时走短信；同时填了邮箱时也发邮件（或者改走邮件） | 「入职前 N 天开通」等于提前 N 天给本人发邀请，HR 的设置页写清走什么渠道 |
| 激活后几秒内就能读到 `is_activated=true`，而且有事件 | 台账里「已建待激活 → 已激活」由事件驱动，定时读只兜底 |
| 激活没有事件 | 「已激活」只能靠定时读回，读回频率写进核对任务 |

### T21 单部门直属成员上限

免费版测不了：总共只能有 100 人，放不出第 501 个。列在 §5 问飞书。这个结果决定的是：待分配部门、大部门能不能放下全部人员（`feishu-capabilities.md` §4.2 的「500 与 10,000」之争）。

### T22 出网域名和企业代理

**目的**：长连接要放行哪些域名和端口；经过只支持 CONNECT 的企业 HTTP 代理时，能不能连上、断了能不能自己重连。

**对应假设**：`feishu-capabilities.md` §7.4（「WebSocket 要放行哪些出网域名（文档未列）」）；`reachability-and-ai-clients.md` §1.2（飞书 Node SDK 的长连接客户端接受 `agent` 参数，经过企业代理能否连通需实测）、§1.7 矩阵、待查第 2 条；`contradictions.md` §5.1。

**前置**：第 2 天上午。下面的 `proxy.mjs` 是一个只做 CONNECT 转发、会把每个目标主机记下来的最小代理；设置 `ALLOW_HOSTS` 后，它就模拟只放行白名单的企业代理。

```js
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { appendFileSync, mkdirSync } from 'node:fs'

const PORT = Number(process.env.PROXY_PORT ?? 8899)
const ALLOW = (process.env.ALLOW_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean)

mkdirSync('results', { recursive: true })
const server = createServer((request, response) => {
  response.writeHead(405)
  response.end('只支持 CONNECT')
})
server.on('connect', (request, client, head) => {
  const [host, port = '443'] = request.url.split(':')
  const allowed = ALLOW.length === 0 || ALLOW.some((rule) => host === rule || host.endsWith(`.${rule}`))
  const line = JSON.stringify({ at: new Date().toISOString(), host, port, allowed })
  appendFileSync('results/proxy.ndjson', `${line}\n`)
  process.stdout.write(`${line}\n`)
  if (!allowed) {
    client.end('HTTP/1.1 403 Forbidden\r\n\r\n')
    return
  }
  const upstream = connect(Number(port), host, () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    upstream.write(head)
    upstream.pipe(client)
    client.pipe(upstream)
  })
  upstream.on('error', () => client.destroy())
  client.on('error', () => upstream.destroy())
})
server.listen(PORT, () => process.stdout.write(`CONNECT 代理在 http://127.0.0.1:${PORT}\n`))
```

步骤：

1. 停掉直连的实例 A。开一个终端跑 `node proxy.mjs`，再开一个终端跑：

```bash
PROXY_URL=http://127.0.0.1:8899 LISTENER_LABEL=P node listener.mjs | tee -a results/listener-P.log
```

2. 跑 `node feishu.mjs changes T22 2 1 tr1`，确认实例 P 收到了事件。`results/proxy.ndjson` 里出现的主机，就是要放行的完整名单。
3. 用 `ALLOW_HOSTS=<上一步出现的主机，用逗号隔开> node proxy.mjs` 重启代理，再重启实例 P，造一次变更，确认名单够用。然后每次去掉一个主机，看哪一步失败、日志里怎么报错。
4. 按 Ctrl-C 停掉代理 60 秒，期间造一次变更；再启动代理，看 SDK 多久重连上，停机期间的那次变更补到了没有。
5. 让实例 P 经代理一直跑到 11:30，数一下 `listener-P.log` 里断线重连的次数。
6. 顺手记下事件出口 IP。这只对 DMZ 部署下的 Webhook 方式有用：

```bash
node feishu.mjs call GET '/open-apis/event/v1/outbound_ip' - T22-ip
```

**记录**：必须放行的主机和端口完整名单；缺了某个主机时的报错；代理断开 60 秒后的重连时间，以及期间事件的去向；两小时内断线了几次。

| 结果 | 设计怎么变 |
| --- | --- |
| 只要放行 `*.feishu.cn` 的 443 端口，经过 CONNECT 代理就能连上，也能稳定重连 | 「能出网不能入网（经代理）」这种部署可以默认用长连接；把放行名单写进「网络与信创」体检页和安装文档；`reachability-and-ai-clients.md` §1.7 里「出站 WebSocket 不能被代理拦掉（需实测）」一格改成实测结论 |
| 要放行的主机不止飞书域名，或者走代理连不上 | 体检页逐项列出；连不上时 IM 通道如实降级，写明原因，不报错 |
| 断线期间的事件丢了 | 和 T15 一起看：对账是必需的 |

### T23 部门重名

**目的**：「不能与存量部门名称重复」到底是全局判定还是同级判定。

**对应假设**：`feishu-capabilities.md` §5.2（43022，「重名的判定范围是不是同级，需实测」）；`org-and-lifecycle.md` §1.3、§1.6。北森常见多个分公司下面都有「销售部」。

**前置**：S1。

```bash
node feishu.mjs call POST '/open-apis/contact/v3/departments?department_id_type=department_id' '{"name":"T23 重名","parent_department_id":"FS-T","department_id":"FS-T23A"}' T23-a
node feishu.mjs call POST '/open-apis/contact/v3/departments?department_id_type=department_id' '{"name":"T23 重名","parent_department_id":"FS-X","department_id":"FS-T23B"}' T23-b
node feishu.mjs call POST '/open-apis/contact/v3/departments?department_id_type=department_id' '{"name":"T23 重名","parent_department_id":"FS-T","department_id":"FS-T23C"}' T23-c
```

再在管理后台的两个不同父部门下，各手工建一个同名部门，看界面怎么提示。

| 结果 | 设计怎么变 |
| --- | --- |
| T23-b 成功、T23-c 报 43022（同级判定） | 「补齐部门」可以按北森的名称原样建 |
| T23-b 也报 43022（全局判定） | 按北森名称原样建会失败：补齐部门要有命名规则（例如「销售部（上海）」），部门映射建议也不能假设名字唯一 |

### T24 外部数据源（可选，放在最后做）

**目的**：43031、44053 说的「外部数据源」指的是什么；启用飞书人事之后，还能不能用接口改成员和部门。

**对应假设**：`org-and-lifecycle.md` §1.3（推断「外部数据源」指飞书人事或「组织架构数据同步」，需实测）、§6；`alternatives.md` §3.2、§8；决定 000041 修订（探测到写入方就只读核对）。

**前置**：§7 已经跑完。这一步可能会把管理后台切换成「人事管理模式」，必须最后做。

1. 先看 M6：工作台里有没有可以启用的「飞书人事」（标准版），企业设置里有没有「组织架构数据同步」。都没有，就记「免费版不可用」，把问题转到 §5。
2. 如果飞书人事（标准版）能启用：启用它，在飞书人事里给一个合成账号（或 R0）走一遍「调动」，然后执行：

```bash
node feishu.mjs call PATCH '/open-apis/contact/v3/users/s0010?user_id_type=user_id' '{"en_name":"T24 外部数据源"}' T24-a
node feishu.mjs call PATCH '/open-apis/contact/v3/departments/FS-P5?department_id_type=department_id' '{"name":"T24 行政部"}' T24-b
node feishu.mjs call POST '/open-apis/directory/v1/employees/filter?employee_id_type=open_id' '{"filter":{"conditions":[]},"required_fields":["base_info.name","base_info.data_source"],"page_request":{"page_size":100}}' T24-c
```

| 结果 | 设计怎么变 |
| --- | --- |
| 报 44053 或 43031，并且 `data_source` 变成了 2 | 「外部数据源」的含义确认了：把它们归入「需要飞书管理员」并标「需访谈确认」；探测到之后进入只读核对 |
| 照样能改 | 飞书人事标准版不会锁住通讯录；企业版要不要锁，留给 §5 问 |

### T25 SCIM 接入时部门怎么落地（可选，另约时间）

这一项要一个 Entra ID 或 Okta 的测试租户，再加上飞书的「组织架构数据同步」，两天内做不完。先在 M6 里看入口在不在、有没有版本限制。入口存在时，另约半天：
1. 在 Entra 里建一个用户，`department` 字段分别填已有的一级部门名、已有的部门 ID、不存在的名字；
2. 同步后看飞书里落到了哪个部门，有没有新建部门；
3. 用 v1 读这个人的 `data_source`（预期是 3）；
4. 用接口改他，看是否报 44053。

结果写回 `org-and-lifecycle.md` §1.1、§6。

### T26 已有写入方探测

**目的**：「成员的数据源标识」和「通讯录最近是谁改的」能不能用接口读到。这决定了平台怎么探测客户已有的写入方。

**对应假设**：`alternatives.md` §6.3（「通讯录近 30 天的修改者（如果飞书接口能取到，需实测）」）、§8；决定 000041 修订（「平台探测到（飞书人事企业版、成员的数据源标识、客户自报）就进入只读核对」）；`contradictions.md` F2。另外，文档里有两条线索：组织架构 v1 的员工和部门都有 `data_source` 字段（1 管理后台、2 人事企业版、3 SCIM）；OpenAPI 审计日志接口按 `app_id` 记录每次调用。

**前置**：S1。

```bash
node feishu.mjs call POST '/open-apis/directory/v1/employees/filter?employee_id_type=open_id&department_id_type=department_id' '{"filter":{"conditions":[]},"required_fields":["base_info.name","base_info.data_source","base_info.departments.data_source"],"page_request":{"page_size":100}}' T26-a
export T26_FROM=$(( $(date +%s) - 86400 ))
node feishu.mjs call POST '/open-apis/security_and_compliance/v1/openapi_logs/list_data' '{"api_keys":["POST/open-apis/contact/v3/users","PATCH/open-apis/contact/v3/users/:user_id","DELETE/open-apis/contact/v3/users/:user_id"],"start_time":{{T26_FROM}},"end_time":{{NOW}},"page_size":100}' T26-b
FEISHU_APP_ID="$APP2_ID" FEISHU_APP_SECRET="$APP2_SECRET" node feishu.mjs call PATCH '/open-apis/contact/v3/users/tr2?user_id_type=user_id' '{"nickname":"App2 改过"}' T26-c
node feishu.mjs call POST '/open-apis/security_and_compliance/v1/openapi_logs/list_data' '{"api_keys":["PATCH/open-apis/contact/v3/users/:user_id"],"start_time":{{T26_FROM}},"end_time":{{NOW}},"page_size":100}' T26-d
node feishu.mjs call GET '/open-apis/admin/v1/audit_infos?page_size=20' - T26-e
```

再到管理后台找管理员日志或操作日志（M6），看能不能看到「应用某某修改了成员」这类记录。

**记录**：
- T26-a 里，R0（注册时生成的账号）、R1（接口建的）、合成账号的 `data_source` 分别是多少；
- T26-b、T26-d 在免费版能不能用，能用的话列出了哪些 `app_id`、`ip`；
- T26-e 的报错（文档写的是「此功能内测中，仅限企业旗舰版申请」）；
- 管理后台日志里能看到什么。

| 结果 | 设计怎么变 |
| --- | --- |
| 接口建的人 `data_source` 是 1 | `data_source` 只能认出「人事企业版」和「SCIM」两类写入方；北森连接器、IDaaS、脚本写进来的都显示为 1，靠它探测不到 |
| OpenAPI 审计日志在免费版能用，而且看得到 App2 的写入 | 探测里加一条最直接的信号：「近 30 天写过通讯录的其他应用」，列出 `app_id` 和应用名 |
| 审计日志在免费版用不了 | 探测只能靠 `data_source` 加上客户自报；客户用的飞书版本要在访谈里问清楚 |

### T27 aily 自定义 MCP（可选）

**目的**：飞书 aily 添加自定义 MCP 时能不能填请求头，请求从哪些 IP 发起。这决定了 DMZ 部署下能不能让 aily 调我们的 MCP。

**对应假设**：`reachability-and-ai-clients.md` §2.2、§2.3 的兼容性表、待查第 8 条。

**前置**：要有一个公网可达的 HTTPS 地址（例如一台云主机加反向代理），在上面跑下面这个只记录请求的服务。不要暴露平台本身。

```js
import { createServer } from 'node:http'

createServer((request, response) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ip: request.socket.remoteAddress, forwardedFor: request.headers['x-forwarded-for'] ?? null, method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') })}\n`)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{"jsonrpc":"2.0","id":null,"error":{"code":-32601,"message":"probe only"}}')
  })
}).listen(Number(process.env.PORT ?? 8787))
```

步骤：
1. 在租户里找 aily 的入口（M6），没有就记「免费版不可用」。
2. 在「添加自定义 MCP 工具」里填这个地址，看界面上有没有填请求头的地方，然后点检测。
3. 看服务日志：请求头里有什么，来源 IP 有哪些。

| 结果 | 设计怎么变 |
| --- | --- |
| 能填请求头，来源 IP 固定 | DMZ 部署可以把 aily 当可选的对话前端：放行这些 IP，用 Bearer 头鉴权 |
| 只能贴地址 | 只能走 `reachability-and-ai-clients.md` §2.3「对设计的含义」第 2 条说的受限形态：凭证放在地址里、只开放只读工具、有到期时间 |

### T28 预演的一致率（延后）

平台的预演（`planMode`）还没做出来。做出来以后在这个租户上测：
1. 从合成账号和 fixtures 里随机抽 20 个业务键，先预演，记下预测的动作；
2. 再补到位，对比实际写入的结果，算出一致率。

依据是 `engine-spike.md` §1（「随机抽 20 个键交叉核对」）和 `contradictions.md` B3。所以这个租户、合成账号和 `fixtures/` 在实测结束后都要留着。

### T29 写后读和批量读的上限

**目的**：写完马上读，能不能读到；按 ID 批量读，每次最多几个。

**对应假设**：`engine-spike.md` §6（写后在同一个连接器进程里读回）、§10（「飞书写完马上读，能不能读到」「批量读用户每次最多几个」）；`feishu-capabilities.md` §1.4（批量接口写的是「单次最大请求可设置的用户 ID 数量上限为 50」）。

写后读分散在别的测试里：T29-a、T29-b（创建后，见 T20）；T6-b（暂停后）；T7-c（暂停未激活账号后）；T8-c（删除后）。

批量上限在有合成账号时测。先拼出 51 个 ID（最后一个是不存在的 `nobody`）：

```bash
export T29_IDS="$(node -e 'const ids = [...Array.from({ length: 40 }, (_, i) => `s${String(i + 1).padStart(4, "0")}`), "f0001", "f0002", "f0003", "f0004", "f0005", "p0001", "tr1", "tr2", "tr3", process.env.R0_USER_ID, "nobody"]; process.stdout.write(ids.map((id) => `user_ids=${id}`).join("&"))')"
node feishu.mjs call GET '/open-apis/contact/v3/users/batch?user_id_type=user_id&{{T29_IDS}}' - T29-e
```

再去掉最后的 `&user_ids=nobody`，用 50 个 ID 重发一次，标签记 `T29-f`。

| 结果 | 设计怎么变 |
| --- | --- |
| 写完马上读，读到的就是新值 | 写后读回可以直接判定「已到位」 |
| 刚写完时读到旧值或读不到 | 读回要带重试和等待（例如 1 秒、3 秒、10 秒），这段时间内的状态叫「已处理待核对」，不算未到位 |
| 51 个报错、50 个正常 | 文档的上限成立，核对任务按 50 个一批 |

### T30 再入职与 user_id 复用

**目的**：「`user_id` = 工号」这个约定，碰到再入职时还能不能成立。

**对应假设**：`feishu-capabilities.md` §1.4（建议新账号约定 `user_id` = 工号）；`alternatives.md` §3.4（再入职只能新建账号，对应关系要显式记一条）。

**前置**：第 2 天，在 T8 删除 R2 之后做。T30-a 要求 T0 通过；T30-b 会让 R2 再收到一次邀请，需要 R2 同意。

```bash
node feishu.mjs call POST '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id' '{"user_id":"tr2","name":"同事乙（再入职，假号码）","mobile":"+8610993000003","department_ids":["FS-P3"],"employee_type":1}' T30-a
node feishu.mjs call POST '/open-apis/contact/v3/users?user_id_type=user_id&department_id_type=department_id' '{"user_id":"tr2b","name":"同事乙（再入职）","mobile":"{{R2_MOBILE}}","department_ids":["FS-P3"],"employee_type":1,"employee_no":"E9002"}' T30-b
node feishu.mjs call POST '/open-apis/contact/v3/users/batch_get_id?user_id_type=user_id' '{"mobiles":["{{R2_MOBILE}}"],"include_resigned":true}' T30-c
```

| 结果 | 设计怎么变 |
| --- | --- |
| T30-a 报 41011，说明已删除用户的 `user_id` 不能再用 | 「`user_id` = 工号」碰到再入职就失效：对应关系必须记「旧账号 → 新账号」，约定改成「工号加序号」，或者干脆不用 |
| 能复用 | 这个约定在再入职时仍然成立；旧账号按 `open_id` 追溯 |
| T30-b 报 44004 | 同一天删了又建会被飞书拦 24 小时：补到位遇到 44004 就进「等待」，不算失败 |
| T30-c 对同一个手机号返回了两条 | 匹配时必须带上 `include_resigned`，再按状态挑出在职的那条 |

### T31 update_user_id 的次数上限（可选）

**对应假设**：`feishu-capabilities.md` §1.4（41013「超过用户 ID 更新次数限制」，具体次数未查到）。这个上限决定「把存量账号的 `user_id` 一次性对齐成工号」能不能做。

**前置**：有合成账号。

```bash
for n in 1 2 3 4 5; do
  prev=$([ "$n" = 1 ] && echo s0040 || echo "s0040x$((n-1))")
  node feishu.mjs call PATCH "/open-apis/contact/v3/users/$prev/update_user_id?user_id_type=user_id" "{\"new_user_id\":\"s0040x$n\"}" "T31-$n"
done
```

第一次报 41013 时停下，上限就是成功的次数。如果上限很小（3 次以内），「一次性对齐 `user_id`」就必须一次做对，并且要管理员确认。

---

## 3. 要人在客户端上观察的项

这些项接口读不出来，要人盯着设备看、截图。每项都记下：设备型号、飞书版本、时间（精确到秒）、现象、截图文件名。

### M1 暂停后能否登录、会话多久失效（配合 T6）

1. R1 的手机（写明 iOS 还是安卓、什么型号）和电脑客户端都保持登录，停在前台。
2. R0 喊「开始」，同时执行 T6-a，把这一刻记为 t0。
3. R1 在两台设备上每 30 秒操作一次：切换会话、发一条消息、打开一篇文档。记下什么时候出现提示、提示的原文（截图）、有没有被强制退回登录页、已经打开的文档和消息还能不能看。
4. 被退出以后，尝试重新登录，记下提示原文。文档里的说法是「该账号已冻结，联系管理员处理」。
5. 这期间 R0 给 R1 发消息、在群里 @R1、邀请他参加一个日程，记下 R0 这边显示的是「已送达」还是失败提示。
6. 恢复（T6-d）以后，R1 登录，确认暂停期间的消息、@、日程邀请是否都在。

| 设备 | t0 | 第一次出现异常的时间 | 现象 | 能否重新登录 | 截图 |
| --- | --- | --- | --- | --- | --- |
| 手机 | | | | | |
| 电脑 | | | | | |

### M2 席位怎么算（配合 T6、T7、T8）

- **看哪里**：
  - 管理后台首页或「企业设置 → 企业信息」里的成员数和上限（免费版是 100）；
  - 「费用中心」里的版本和人数；
  - 接口：`node feishu.mjs call GET '/open-apis/tenant/v2/tenant/assign_info_list/query' - M2-seats`（免费版可能返回空列表，照实记）。
- **什么时候看**：T20 建 R1 到 R3 之前和之后；R3 处于未激活时，以及 T7 暂停它之后；T6 暂停 R1 之前和之后；T8 删除之前和之后。
- **记什么**：每个时间点的「已用 / 上限」；成员列表里 R1、R3 身上的状态标签（未激活、已暂停、已离职）。
- **要回答的问题**：未激活的、已暂停的、已删除的账号，各占不占名额。

### M3 资源转移去向（配合 T8）

删除前，R0 和 R1、R2 一起把清单填完；删除后，R0 逐项打开核对。

| 资源 | R1（有上级 R0）删除前 | R1 删除后 | R2（无上级）删除前 | R2 删除后 | 和文档一致吗 |
| --- | --- | --- | --- | --- | --- |
| 云文档 | 所有者 R1 | 所有者是谁，R0 能不能编辑 | | | 文档：给上级；无上级时保留在原名下 |
| 日程 | | 还在不在 R0 的日历里，组织者是谁 | | | 文档：给上级；无上级时删除 |
| 普通群 | 群主 R1 | 群主变成谁，群还在不在 | | | 文档未写 |
| 部门群（FS-P7、FS-P8） | 群主 | 群主变成谁 | | | 文档：转给群内第一个入群的人 |
| 飞书问卷（可选） | | | | | 文档：给上级；无上级时删除 |
| 妙记（可选） | | | | | 文档：给上级；无上级时保留 |
| 自建应用（可选） | | 开发者后台里的所有者 | | | 文档：给上级；无上级时保留 |
| 外部群（可选） | | | | | 文档：组织内只剩此人时解散 |

另外在管理后台「成员与部门」的离职成员里，看有没有资源转移记录。

### M4 邀请与激活（配合 T20、T7）

- R1、R2、R3 各自记下：短信或邮件的到达时间、发件方显示的名称、正文（截图）、链接。R1 同时填了手机号和邮箱，两边各收到了什么。
- R1、R2 点链接加入并登录，记下加入的时间。
- R3 先不点。T7-b 成功以后，第 2 天上午再点一次，看邀请是否还有效、暂停之后还能不能加入。

### M5 卡片在手机和电脑上的表现（配合 T18）

- 同一张卡片，在 R1 的手机和电脑上分别点每个按钮。记下 toast 的原文；点「慢回调」时看到的是什么（转圈、报错文字，截图）；延时更新之后，两端的卡片内容是不是都变了。
- 「打开控制台」：电脑上会不会打开浏览器；手机上是没反应、有提示，还是别的表现。
- 截图命名示例：`M5-手机-慢回调.png`。

### M6 管理后台入口检查（第 0 天做，约 20 分钟）

逐项记下：入口在不在、实际路径、有没有「需升级版本」之类的提示，并截图。

1. 费用中心 → 权益数据：API 调用次数和当前上限（T13 的基线）。
2. 企业设置 → 组织架构数据同步：入口在不在，有没有版本限制（`alternatives.md` §8；T25）。
3. 成员与部门里，和离职、成员生命周期相关的设置。这关系到 44062「仅能通过生命周期引擎删除」这条规则在哪里配（`org-and-lifecycle.md` §6）。
4. 安全相关的管理员日志、行为审计、操作日志：入口在不在，能不能看到应用修改成员的记录（T26）。
5. 工作台 → 应用管理 → 本应用：有没有「通讯录权限范围」的设置入口（T10-2）。
6. 应用审核：自建应用发版要不要人工审批，能不能设置免审。
7. 企业信息：人数和上限、认证状态（M2）。
8. 工作台里有没有飞书人事、aily 的入口（T24、T27）。
9. 成员字段管理 → 全局设置：「允许开放平台通讯录 API 调用」开关在不在（`org-and-lifecycle.md` §1.6 第 4 条）。
10. 管理后台对未激活账号点「暂停」时的提示（T7）。

### M7 手机通过 VPN 打开内网链接（可选）

条件：团队有企业 VPN 或零信任客户端。把 `CONSOLE_URL` 设成一个内网地址，再把卡片的手机端链接也改成这个地址（临时改 `feishu.mjs` 里的 `android_url`、`ios_url`），发一张卡片。手机连上 VPN 后在飞书里点链接，看内置浏览器能不能打开；再用系统浏览器打开对比。结果写回 `reachability-and-ai-clients.md` 待查第 7 条。

---

## 4. 结果记录与对照

### 4.1 结果记录表模板

建议新建 `design/research/validation/feishu-results.md`，把下面的模板复制进去。

```markdown
# 飞书实测结果（2026-10-__）

租户：<名称>（tenant_key 前 6 位：______），免费版，未认证
执行人：R0 <姓名>；参与：R1–R5（手机号只写后四位）
原始记录：~/feishu-lab/results/（不进仓库）
T0 造数探针：接受 / 拒绝（code=_____）

## 汇总

| 编号 | 状态 | 一句话结论 | 和文档一致吗 | 证据（标签或截图） | 要更新的文件（见 §4.2） |
| --- | --- | --- | --- | --- | --- |
| T1 | 已测 / 部分 / 未测 / 测不了 | | 一致 / 不一致 / 文档没写 | | |

## T? 名称

- 时间：2026-10-__ __:__–__:__　范围：S1 / S2 / S3
- 前置状态：

| 步骤 | 标签 | HTTP | code | 关键返回（摘录原文） | 判断 |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

- 人工观察（设备、时间点、截图名）：
- 结论：
- 对设计：□ 不用改　□ 按 §4.2 改：______　□ 要再测：______
```

### 4.2 结果 → 要更新的文件和决定

负责人沿用 `contradictions.md` 的四个角色：产品负责人、架构负责人、引擎与连接器负责人、安全与合规。每张表里，飞书行为的结论统一写回 `feishu-capabilities.md` 对应的节，并把第 10 节的状态改成「已实测 日期」。

| 编号 | 要更新的文件和位置 | 影响的决定或原句 | 谁改 |
| --- | --- | --- | --- |
| T1 | `feishu-capabilities.md` §1.1、§9 第 1、14 条；`contradictions.md` A3、3.2；`packages/connectors/community/feishu/src/lib/common/contacts.ts` 里的 `provisionUser`（41001 怎么处理） | 台账的「平台看不到」状态和文案；「查找并链接」流程 | 引擎与连接器负责人；文案归产品负责人 |
| T2 | `feishu-capabilities.md` §4.1；`contradictions.md` 1-5、3.13；决定 000042 修订第 5 条；`contacts.ts` 里的 `clientTokenFor` | 幂等键的生成规则和有效期；「结果未知」的口径 | 引擎与连接器负责人；000042 归产品负责人 |
| T3 | `feishu-capabilities.md` §4.1、§4 的错误码分派表；`ai-v1.md` ⑦ 规则表 | 「查找并链接」是否少一次查询；规则表样本 | 引擎与连接器负责人 |
| T4 | `feishu-capabilities.md` §4.2、§9 第 5 条；`contradictions.md` A7；`ai-v1.md` ⑦；`engine-spike.md` §4 | 「上级待补」怎么判定 | 引擎与连接器负责人 |
| T5 | `feishu-capabilities.md` §4.2、§6.2；`contradictions.md` 1-2、3.1；`product-brief.md`「可靠性原则」里限流那一句；`engine-spike.md` 的写队列 | 限流计数单位的声明；预演耗时的估算方法 | 架构负责人（契约）；产品负责人（备忘） |
| T6 | `feishu-capabilities.md` §4.3；`org-and-lifecycle.md` §3；决定 000041 修订「离职分两段」；`contradictions.md` D1 | 「当天不能登录」怎么措辞；席位提示 | 产品负责人 |
| T7 | 决定 000041 修订（「撤销入职且账号还没激活时能不能直接删，等实测（T7）」）；`contradictions.md` D1 推荐的最后一句 | 唯一允许删除的那个例外成不成立 | 产品负责人 |
| T8 | `feishu-capabilities.md` §4.4；`org-and-lifecycle.md` §3.1 和 §3「对设计的含义」；`alternatives.md` §3.4；决定 000041 修订的第二段；决定 000043 出口三（已删除的账号） | 接收人规则的默认顺序；预演卡的内容；再入职 | 产品负责人；重复删除的归类归连接器负责人 |
| T9 | `feishu-capabilities.md` §3.2、§3「对设计的含义」；`org-and-lifecycle.md` §1.6 | 发布前范围检查的算法；补齐部门之后什么时候能建人 | 引擎与连接器负责人 |
| T10 | `feishu-capabilities.md` §3.3、§3.4；`design-inputs.md` 方向 C 体验 3（按 `contradictions.md` 3.16 末表替换的那一句）；ADR 0020 | 对方待办单写哪条路径；「等待对方」靠事件还是轮询 | 产品负责人；架构负责人 |
| T11 | `feishu-capabilities.md` §2.4；`contradictions.md` 3.12、A7；`engine-spike.md` §6 | 「看现状」的耗时和调用量估算 | 引擎与连接器负责人 |
| T12 | `feishu-capabilities.md` §1.2、§2.3；`contradictions.md` 3.2 | 按工号查走 v1 还是本地索引 | 引擎与连接器负责人 |
| T13 | `feishu-capabilities.md` §6；`contradictions.md` 1-2、3.1；`alternatives.md` §3.4；连接器 `common/index.ts` 的错误归类（现在只把 99991663、99991672 映射成 HTTP 状态） | 99991400 和 99991403 怎么处理；连接详情显示消息额度 | 架构负责人；连接器负责人 |
| T14 | `reachability-and-ai-clients.md` §1.8 第 2 条；ADR 0020 Consequences；`feishu-capabilities.md` §7 | IM 通道要不要选主 | 架构负责人 |
| T15 | `feishu-capabilities.md` §7.2、§7.4；`reachability-and-ai-clients.md` §1.8 第 8 条；`design-inputs.md` 洞察 5 | 对账频率；「没有动静」怎么判定 | 产品负责人；引擎负责人 |
| T16 | `feishu-capabilities.md` §7.1 | 回环过滤 | 引擎负责人 |
| T17 | `feishu-capabilities.md` §7.2 | 事件要不要按键排队 | 引擎负责人 |
| T18 | ADR 0020（Decision 第 2 段、Consequences）；`feishu-capabilities.md` §7.5；`reachability-and-ai-clients.md` §1.8 第 4 条 | 用 IM 身份认人；卡片上放哪些按钮；按端配置链接 | 架构负责人；安全与合规 |
| T19 | `feishu-capabilities.md` §7.6；`contradictions.md` A5、3.13；`send-group-message.ts`（加上 `uuid`） | 「每次变化一条」的依据；通知去重 | 连接器负责人；产品负责人 |
| T20 | `feishu-capabilities.md` §1.5、§4.1、§9 第 20 条；决定 000041 修订 | 台账的「已建待激活」状态；HR 看到的文案 | 产品负责人 |
| T22 | `feishu-capabilities.md` §7.4；`reachability-and-ai-clients.md` §1.7 矩阵、§1.8 第 2 条、待查第 2 条；「网络与信创」体检页 | 放行域名清单；经代理时能否默认用长连接 | 架构负责人 |
| T23 | `org-and-lifecycle.md` §1.3、§1.6；`feishu-capabilities.md` §5.2 | 补齐部门的命名规则 | 产品负责人 |
| T24 | `org-and-lifecycle.md` §1.3、§6；`feishu-capabilities.md` §4 的分派表（44053、43031）；决定 000041 修订（只读核对） | 外部数据源的归类和探测 | 产品负责人；连接器负责人 |
| T26 | `alternatives.md` §6.3、§8；决定 000041 修订（已有写入方探测）；`contradictions.md` F2 | 探测要用哪几个信号 | 产品负责人；连接器负责人 |
| T29 | `engine-spike.md` §6、§10 | 读回核对的重试和等待 | 引擎负责人 |
| T30 | `alternatives.md` §3.4；`feishu-capabilities.md` §1.4 | 再入职时的对应关系；「`user_id` = 工号」这个约定 | 产品负责人 |
| T31 | `feishu-capabilities.md` §1.4 | 「一次性对齐 user_id」能不能做 | 连接器负责人 |
| 全部 | `contradictions.md` §5.1 第二行（「飞书能力没在真实租户核实」）；brain 页 `brain/knowledge/connectors-engine/connectors.md` 的 Gotchas（飞书连接器的意外行为，一条一个要点） | — | 跑测试的人 |
| §7 | `brain/knowledge/engineering/main-line-e2e.md`：第 4 步「换成真实飞书时……去掉 `FEMA_FEISHU_BASE_URL`」改成指向 §7，Gotchas 加一条「真实模式要改脚本」；连接器的错误映射（真实的 40004 会落成 `STEP_FAILED`） | — | 引擎与连接器负责人 |

T3、T4、T24 拿到的错误响应原文，同时整理成 `ai-v1.md` ⑦ 的样本：规则表认得出的写进表里，认不出的作为「归到谁能修」的评测题。

---

## 5. 测不了、要问飞书或访谈的

| 事项 | 为什么这次测不了 | 找谁 | 依赖它的设计 |
| --- | --- | --- | --- |
| 单个部门的直属成员上限是 500 还是 1 万（T21） | 免费版总共 100 人 | 飞书技术支持 | 待分配部门、大部门的容量（`feishu-capabilities.md` §4.2） |
| 恢复已删除用户的实际行为 | 只有商业专业版及以上能用 | 试用租户，或问飞书销售 | 再入职；离职第二段的可逆性（000041 修订） |
| 商业版的频控等级、提频流程 | 免费版是基础等级 | 飞书技术支持或客户成功经理 | 限流计数单位（`contradictions.md` 3.1） |
| 有没有强制已登录会话下线的办法（如果 T6 显示会话失效很慢） | 文档没写 | 飞书技术支持 | 「当天不能登录」的承诺 |
| 44062「仅能通过生命周期引擎删除」规则在哪里配，哪些版本有 | 文档未查到，免费版可能没有入口（先看 M6） | 飞书技术支持 | 删除归为「需要飞书管理员」 |
| 创建用户能不能不发邀请（41054、41055 暗示发送渠道可以设置） | 接口没有这个参数 | 飞书技术支持 | 「入职前 N 天开通 = 提前发邀请」（000041 修订） |
| 未认证企业的 100 人上限算不算暂停、未激活的账号 | M2 只能看到一部分 | 飞书技术支持 | 席位提示 |
| 飞书私有化版本是否支持长连接和卡片回调 | SaaS 租户测不了 | 飞书私有化销售 | 纯内网时怎么降级（`reachability-and-ai-clients.md` §1.8 第 7 条） |
| 「组织架构数据同步」适用哪些版本；SCIM 管理的成员能不能被接口修改 | 入口可能需要付费版 | 飞书技术支持，加 T25 | 已有写入方探测；43031、44053 |
| 飞书人事企业版：完成入职时何时开号，启用后第三方能不能改成员，价格 | 要付费 | 飞书销售；已购客户访谈 | 飞书人事客户不进主线（000041 修订） |
| 行为审计接口的申请条件 | 「仅限企业旗舰版申请」 | 客户成功经理 | 已有写入方探测（T26） |
| OpenAPI 审计日志接口的适用版本（如果 T26 在免费版用不了） | 文档没写版本 | 飞书技术支持 | 已有写入方探测 |
| aily 自定义 MCP 的鉴权方式和出口 IP（如果 T27 做不了） | 可能不对免费版开放 | aily 文档或客服 | MCP 的接入路径（`reachability-and-ai-clients.md` §2.3） |
| 阿里云 IDaaS「绑定飞书-出方向」能不能用 | 不在飞书租户里 | 阿里云 | 对手判断（`alternatives.md` §4.3） |

**放进访谈**（6 到 8 家「北森 + 飞书」企业，每家 HRIS 管理员和负责账号的 IT 各一人；题目在 `interview-guide.md` 里）：
- 客户愿不愿意为平台单独建一个自建应用，通讯录权限范围给到哪一层（`feishu-capabilities.md` §10.3）；
- 能不能接受「`user_id` = 工号」「`department_id` = 北森组织编码」这两个约定（§10.3，结合 T30、T31 的结果问）；
- 飞书通讯录是不是由外部数据源或成员生命周期在维护（44053、43031、44062）；
- HR 能不能接受员工入职前 N 天就收到飞书邀请（T20）；
- 暂停期间占席位能不能接受，缓冲期设多长（T6、T7 的结果带去问）；
- 两棵部门树是什么关系：镜像、收拢还是另起（拿 `fixtures/expected-department-mapping.json` 的样子做对照）。

`interview-guide.md` 已经写了：U08、U17 看 T6，U09 看 T7，U15 看 T10 和 T18，U10 看 T20。实测之前，访谈里不对这些行为下断言。

---

## 6. 要问北森售后或实施顾问的问题

北森没有测试租户，北森一侧的行为只能问。问的渠道有两个：
- 北森的售后或实施顾问；
- 受访企业的 HRIS 管理员——征得同意后，请他们在自己的租户里跑 `org-and-lifecycle.md` §2.1 的只读脚本。

`interview-guide.md` 的 IT-11 已经问了「北森事件推送配没配过」，下表是更细的技术问题。每条都请对方尽量给书面答复、截图或脱敏的接口返回样例。

| # | 问题 | 为什么问（依赖它的设计） | 想拿到的证据 |
| --- | --- | --- | --- |
| **事件订阅** | | | |
| 1 | 事件订阅器能不能由客户管理员在北森管理者后台自助创建？还是只能由北森客服配置、每周五 20:00 生效？这两种说法是不是新旧两代机制？ | `contradictions.md` A1；`alternatives.md` §2.2；连接上「事件订阅：未配置 / 已申请 / 已生效」三种状态 | 后台截图，或客服的书面答复 |
| 2 | 有哪些事件类型？入职（`AddEmp`）、调岗、离职、待入职、撤销、组织变更各叫什么？有没有「生效」类事件，也就是在变动生效当天推送的？ | `org-and-lifecycle.md` §2.1 的兜底设计；事件只做加速 | 事件清单 |
| 3 | 推送失败后重推几次、间隔多久？有没有推送日志？回调地址必须是公网 HTTPS 吗？有没有拉取式或长连接式的取法？ | 自托管「能出网不能入网」（`reachability-and-ai-clients.md` §1）；对账频率 | 文档或答复 |
| 4 | 事件体里带什么：只有 ID，还是带审批状态、生效日期、变动类型？ | 收敛只从触发里取业务键（000042 修订第 4 条） | 脱敏的样例报文 |
| **列全量与增量查询** | | | |
| 5 | 「滚动查询指定组织下的员工与单条任职信息」用根组织加「含子组织」，能不能一次滚完全公司？一万人时稳不稳定？待入职、离职的人要不要显式传 `empStatus`、`withDisabled`？ | `contradictions.md` A2、3.12；「看现状」北森一侧的调用量 | 答复，或在客户租户里实测 |
| 6 | `scrollId` 两次调用的间隔超过 10 秒会怎样（报什么错，能不能续）？`capacity` 的 300 是硬上限吗？ | `engine-spike.md` §6（列全量能不能拆到多次 action run 里翻页） | 答复 |
| 7 | `timeWindowQueryType` 有哪些取值？时间窗里的时间戳按哪个时区解释？超过 90 天时报什么错（是 417 吗）？ | `org-and-lifecycle.md` §6 第 1 行；`brain/knowledge/connectors-engine/building-connectors.md` 的 Gotchas（连接器传的是 UTC） | 答复 |
| 8 | 仓库里用的「根据修改时间窗分页查询」已标「不推荐」，会不会下线？`isWithDeleted`、`WithDisabled`、`IsGetLatestRecord` 在这个旧接口上生不生效？迁到新接口有什么差异？ | `org-and-lifecycle.md` §2.1 的「仓库现状」 | 答复 |
| 9 | 业务接口返回的 `code`，成功值是什么？能不能给一份错误码清单？ | `building-connectors.md` 的 Gotchas | 文档 |
| **未来生效与撤销** | | | |
| 10 | 未来生效的调岗、离职，审批完成时记录处于「审批通过」还是「审批生效」？到生效日当天，`modifiedTime` 会不会变，也就是会不会再出现在时间窗里？日终刷新（比如工龄）会不会带动 `modifiedTime`？ | `org-and-lifecycle.md` §2.1 的表；生效日排程（000042 修订第 2 条） | 答复，加样例 |
| 11 | 未来离职在生效之前，人员状态是在职还是离职？`lastWorkDate` 什么时候写入？ | 离职排程（`org-and-lifecycle.md` §2「对设计的含义」第 7 条） | 同上 |
| 12 | 撤销调岗、撤销离职、撤销入职（删除待入职）在接口里分别是什么样：任职记录被删除（`stdIsDeleted`）、审批状态变化，还是别的？要传 `isWithDeleted=true` 才看得到吗？ | 「撤销是一等事件」（`org-and-lifecycle.md` §2「对设计的含义」第 8 条） | 同上 |
| 13 | 「当前生效」的主职记录在什么时刻、按哪个时区切换？一个人有多条未来记录时，`option=1` 返回哪一条？待入职的人在 `option=2` 下返回什么？ | `engine-spike.md` §3（到期时刻定在 00:05 的依据）、§10 | 同上 |
| 14 | 招聘模块「查询待入职人员信息」里的人，和核心人事的待入职是不是同一批？谁先出现？ | 入职前开通的数据从哪里来 | 同上 |
| **组织** | | | |
| 15 | 组织的三个维度（行政、业务、产品），客户通常用哪一个对应 IM 的部门？虚拟组织一般用来做什么？ | `org-and-lifecycle.md` §1.2；部门映射默认用哪个维度 | 实施经验 |
| 16 | 停用一个组织时会联动停用下级，时间窗里出现的是一条变动还是 N 条？组织的未来生效怎么查（`queryDate`）？ | 闸门计数要包含部门（`org-and-lifecycle.md` §1「对设计的含义」） | 答复 |
| 17 | 组织编码 `code` 和 `OId` 在改名、移动时是否保持不变？ | 映射表的键用 OId（`org-and-lifecycle.md` §1.6 第 1 条） | 答复 |
| **配额、凭证、网络** | | | |
| 18 | 配额是不是全企业共享（每秒 100 次、每分钟 3,000 次）？取 token 的调用算不算进去？超限时返回什么？ | `contradictions.md` 3.1；`engine-spike.md` §8「先修令牌」 | 答复 |
| 19 | OpenAPI 的受限 IP 白名单在哪里配、谁能配、能配几个 IP 或网段？ | `alternatives.md` §2.3（连接向导要显示出口 IP） | 截图 |
| 20 | 有没有能借给 ISV 的沙箱租户或测试数据？开放平台的文档能不能给我们开一个查看账号？ | 本方案缺北森租户 | — |
| 21 | 北森一侧的 API 调用日志保留多久？客户能不能导出？ | `data-retention.md`（北森一侧的日志未查到） | 答复 |
| **人员标识** | | | |
| 22 | 同一个人离职后再入职，UserID 和工号是沿用还是新建？工号会不会复用给别人？ | 业务键选工号（`design-inputs.md` 洞察 1）；T30 | 答复 |
| 23 | 手机号字段是必填的吗？接口返回时是否脱敏？ | 手机号兜底匹配 | 样例 |
| **北森自己的飞书连接器** | | | |
| 24 | 北森飞书连接器怎么认出已有的飞书账号（工号、手机号还是邮箱）？离职时是暂停还是删除？有没有阈值、日志、失败通知、对账？价格和交付方式是什么？ | `alternatives.md` §8；首发客群的收窄 | 产品资料 |
| 25 | 它写飞书时用的是客户自建的应用，还是北森的商店应用？它写进来的成员，在飞书里的数据来源显示成什么？ | 已有写入方探测（T26；000041 修订） | 答复，或已购客户的截图 |
| 26 | 生态广场上标的「付费连接器」和研报说的「免费、开箱即用」，哪个是现状？ | `alternatives.md` §2.1 | 报价 |

答案写回 `org-and-lifecycle.md` §2.1、§6，`contradictions.md` A1、A2，`engine-spike.md` §3、§6，以及北森连接器的触发器 `packages/connectors/community/beisen/src/lib/triggers/employee-changed.ts`。

---

## 7. 把 tools/e2e/main-line 切到真实飞书租户

### 7.1 现在怎么配置目标地址和凭证（读代码得出的结论）

- `run-main-line.mjs` 读这些环境变量：

| 变量 | 默认值 |
| --- | --- |
| `E2E_API_URL` | `http://localhost:18090/api/v1` |
| `E2E_MOCK_URL` | `http://127.0.0.1:18900` |
| `E2E_EMAIL`、`E2E_PASSWORD` | 测试账号 |
| `E2E_FEISHU_APP_ID`、`E2E_FEISHU_APP_SECRET` | `cli_mock`、`mock-secret` |
| `E2E_FEISHU_HR_CHAT_ID` | `oc_hr_notice` |
| `E2E_WAIT_MS` | 240000 |

- 飞书连接建立时，`domain` 写死为 `https://open.feishu.cn`。真正请求哪里，由连接器里的 `baseUrlFor()` 决定：环境变量 `FEMA_FEISHU_BASE_URL` 优先，没有它才用 `domain`（`packages/connectors/community/feishu/src/lib/common/index.ts`）。沙箱只透传 `FEMA_SANDBOX_PROPAGATED_ENV_VARS` 里列出的变量（`packages/server/sandbox/src/lib/create-sandbox-for-job.ts`）。北森的 `FEMA_BEISEN_BASE_URL` 也是同样的机制。
- 写死的东西有四处：
  - 映射表的两行：`研发部 → od-rd`、`人力资源部 → od-hr`；
  - 两个员工的手机号：`13800000001`、`13800000002`；
  - 第 5、7、8 项判定读的是模拟服务的 `GET /__admin/state`；
  - 第 6 项「缺权限」靠 `POST /__admin/feishu-failure` 注入故障。
- 所以，按 brain 页（`brain/knowledge/engineering/main-line-e2e.md` 第 4 步）和提交 `bd11539b85` 的说法，只设 `E2E_FEISHU_*`、去掉 `FEMA_FEISHU_BASE_URL`，结果是：
  - 账号确实会在真实飞书里建出来，但三项判定一直读不到，最后超时；
  - 两个写死的号码会收到真实的邀请短信，号码的主人谁也不认识；
  - `od-rd`、`od-hr` 在真实租户里不存在，开通会直接失败。

### 7.2 租户这边先准备好

- 部门：FS-P1（研发部）、FS-P4（人力资源部），由 §1.8 造好，都在 S3 范围内。
- HR 群：§1.4 第 8 步建的群，App1 的机器人在群里。
- 号码：R4、R5 两个号码，跑之前不能在租户里，两人知道会收到「张三」「李四」名义的邀请。
- 权限：App1 已经有 `contact:contact`、`contact:user.id:readonly`、`im:message:send_as_bot`，读回要用的 `im:message:readonly`、`im:message.group_msg`，以及读用户的权限（§1.5）。
- 人手：要一位工程师按 brain 页起 API 和 worker，大约 30 分钟。

### 7.3 脚本要改的地方

建议加一个 `E2E_FEISHU_REAL=1` 开关。不开时行为完全不变，开了才走真实飞书。改动如下。

**1. 顶部加配置：**

```js
const REAL_FEISHU = process.env.E2E_FEISHU_REAL === '1'
const FEISHU_DOMAIN = process.env.E2E_FEISHU_DOMAIN ?? 'https://open.feishu.cn'
const MOBILE_1 = process.env.E2E_MOBILE_1 ?? '13800000001'
const MOBILE_2 = process.env.E2E_MOBILE_2 ?? '13800000002'
const DEPT_RD = process.env.E2E_FEISHU_DEPT_RD ?? 'od-rd'
const DEPT_HR = process.env.E2E_FEISHU_DEPT_HR ?? 'od-hr'
const STARTED_AT = Math.floor(Date.now() / 1000)
```

**2. 替换写死的值：**
- 映射表的 `rows` 改成 `[{ k: '研发部', v: DEPT_RD }, { k: '人力资源部', v: DEPT_HR }]`；
- 两处 `employee({ ... mobile: '13800000001' ... })` 改用 `MOBILE_1`，`'13800000002'` 改用 `MOBILE_2`；
- 断言里的 `'+8613800000001'`、`'+8613800000002'` 改成 `normalizeMobile(MOBILE_1)`、`normalizeMobile(MOBILE_2)`；
- `department_ids[0] === 'od-rd'` 改成 `=== DEPT_RD`。

**3. 读状态和注入故障：**
- 三处 `await mock('GET', '/__admin/state')` 改成 `await currentState()`；
- 开头那次重置 `await mock('POST', '/__admin/feishu-failure', {})` 只在模拟模式下执行；
- 注入 99991672 那一行改成 `await injectProvisionFailure()`；
- 「修复后从失败节点重放」之前那次清除改成 `await clearProvisionFailure()`。

**4. 末尾加这几个函数**（沿用脚本里已有的 `fetchJson`、`assert`、`mock`）：

```js
async function currentState() {
  return REAL_FEISHU ? feishuState() : mock('GET', '/__admin/state')
}

async function feishuState() {
  const token = await feishuToken()
  const lookup = await feishuApi({ token, method: 'POST', path: '/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id', body: { mobiles: [MOBILE_1, MOBILE_2].map(normalizeMobile) } })
  const found = (lookup.user_list ?? []).filter((item) => item.user_id)
  const feishuUsers = await Promise.all(found.map(async (item) => {
    const detail = await feishuApi({ token, method: 'GET', path: `/open-apis/contact/v3/users/${item.user_id}?user_id_type=open_id&department_id_type=department_id` })
    return { open_id: item.user_id, mobile: normalizeMobile(item.mobile), department_ids: detail.user.department_ids ?? [] }
  }))
  const history = await feishuApi({ token, method: 'GET', path: `/open-apis/im/v1/messages?container_id_type=chat&container_id=${HR_CHAT_ID}&start_time=${STARTED_AT}&sort_type=ByCreateTimeAsc&page_size=50` })
  const messages = (history.items ?? []).map((item) => ({ message_id: item.message_id, content: item.body?.content ?? '' }))
  return { feishuUsers, messages }
}

async function feishuToken() {
  const response = await fetchJson('POST', `${FEISHU_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal`, { app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET })
  assert(response.body?.code === 0, `取飞书 token 失败：${JSON.stringify(response.body)}`)
  return response.body.tenant_access_token
}

async function feishuApi({ token, method, path, body }) {
  const response = await fetchJson(method, `${FEISHU_DOMAIN}${path}`, body, token)
  assert(response.body?.code === 0, `${method} ${path} -> ${response.status} ${JSON.stringify(response.body).slice(0, 300)}`)
  return response.body.data
}

async function injectProvisionFailure() {
  if (!REAL_FEISHU) {
    return mock('POST', '/__admin/feishu-failure', { code: 99991672, msg: 'Access denied. One of the following scopes is required: [contact:contact]' })
  }
  return waitForOperator('在开发者后台删掉「更新通讯录」权限，创建版本并审核通过；确认已生效后按回车')
}

async function clearProvisionFailure() {
  if (!REAL_FEISHU) {
    return mock('POST', '/__admin/feishu-failure', {})
  }
  return waitForOperator('加回「更新通讯录」权限，创建版本并审核通过；确认已生效后按回车')
}

function waitForOperator(message) {
  process.stdout.write(`\n>>> ${message}\n`)
  return new Promise((resolve) => process.stdin.once('data', () => {
    process.stdin.pause()
    resolve()
  }))
}

function normalizeMobile(mobile) {
  return /^1\d{10}$/.test(mobile) ? `+86${mobile}` : mobile
}
```

**5.（可选）第 8 项在真实模式下多断言一句**：张三最后一条通知要写着「新开通：false」。工作流的通知内容里本来就带 `新开通：{{step_2['output']['created']}}`。在真实飞书里，同一个手机号本来就只能有一个账号，单看「账号数等于 1」这一条判定没有意义。

脚本里提示「确认已生效」时，怎么确认？在另一个终端用 §1.3 的 `feishu.mjs` 盯着一个写权限的请求：

```bash
node feishu.mjs watch 10 PATCH '/open-apis/contact/v3/users/{{R0_USER_ID}}?user_id_type=user_id' '{"nickname":"实测管理员"}' e2e-perm
```

去掉权限后，等它变成 99991672 再按回车；加回权限后，等它变回 0 再按回车。

### 7.4 起服务时，环境变量和 brain 页有什么不同

其余照 `brain/knowledge/engineering/main-line-e2e.md` 第 1 到 3 步做。只有北森还指向模拟服务：

```bash
export FEMA_BEISEN_BASE_URL=http://127.0.0.1:18900/beisen
unset FEMA_FEISHU_BASE_URL
export FEMA_SANDBOX_PROPAGATED_ENV_VARS=FEMA_BEISEN_BASE_URL
export FEMA_SSRF_ALLOW_LIST=127.0.0.1
grep -rn --include='.env*' --exclude-dir=node_modules FEMA_FEISHU_BASE_URL packages/server
```

最后一行应当什么也不输出。原因同 brain 页 Gotchas 的第一条：API 和 worker 会用 dotenv 加载 `.env.dev`，如果那里有 `FEMA_FEISHU_BASE_URL`，在 shell 里 unset 没用，它会被补回来。另外，本机要能直接访问 `open.feishu.cn`。

然后跑：

```bash
node tools/e2e/main-line/mock-server.mjs
```

```bash
E2E_FEISHU_REAL=1 \
E2E_FEISHU_APP_ID="$FEISHU_APP_ID" E2E_FEISHU_APP_SECRET="$FEISHU_APP_SECRET" \
E2E_FEISHU_HR_CHAT_ID="$HR_CHAT_ID" \
E2E_FEISHU_DEPT_RD=FS-P1 E2E_FEISHU_DEPT_HR=FS-P4 \
E2E_MOBILE_1="$R4_MOBILE" E2E_MOBILE_2="$R5_MOBILE" \
node tools/e2e/main-line/run-main-line.mjs
```

部门 ID 不以 `od-` 开头，连接器会按 `department_id` 类型去请求（`contacts.ts` 里的 `departmentIdType`），所以直接填 FS-P1、FS-P4 就行。

### 7.5 怎么判读结果

| # | 判定 | 真实模式下的预期 |
| --- | --- | --- |
| 1 | 创建北森连接 | 和模拟模式一样（北森仍是模拟服务） |
| 2 | 创建飞书连接 | 保存时真实校验凭证；如果失败，查 App ID、Secret 和网络 |
| 3、4 | 映射表、搭建并发布 | 和模拟模式一样 |
| 5 | 北森新员工 → 飞书开通账号并通知 HR 群 | 张三（R4 的号码）建在 FS-P1，HR 群里有一条带「张三」的通知；R4 收到邀请 |
| 6 | 飞书缺权限 → 问题中心出现可读的问题 | 按回车之前，先去掉「更新通讯录」权限并发版。连接器把 99991672 映射成「HTTP 403」，所以问题的 `errorCode` 仍应是 `HTTP_403` |
| 7 | 修复后从失败节点重放 → 李四开通成功 | 加回权限、发版、按回车之后重放；李四（R5 的号码）建在 FS-P4 |
| 8 | 同一员工再次变动 → 不重复开通 | 张三有两条通知，第二条写「新开通：false」 |

**可选的第 9 项**：把一个员工的部门映射到不在 S3 范围内的 FS-Q，制造一个真实的 40004。手机号用 T0 通过时的 1099 号段——40004 会在建号之前就被拦下，不会发出邀请。

在现在的连接器下，这个问题的 `errorCode` 会是 `STEP_FAILED`，原因有两层：
- 连接器的 `HTTP_STATUS_BY_CODE` 只映射了 99991663、99991672 两个码，40004 的业务码和 HTTP 状态在报错信息里都丢了；
- 平台再从报错信息里找 HTTP 状态，也就找不到了。

这一条要记进结果，并按 §4.2 的最后一行交给连接器负责人：「谁能修」要靠飞书的业务码来分派。

### 7.6 跑完之后

- 租户里会留下张三、李四两个真实账号。要重跑，先看 T2 的结论：连接器用 `hash(appId:手机号)` 当 `client_token`，删了之后再用同一个号码重建，可能会拿回那个已删除的账号，也可能撞上 44004。在 T2 的结论出来之前，重跑就换一对号码。
- 每跑一次大约发 3 条群消息，还要轮询读群历史。消息接口计入免费版的月额度（T13），用量很小，在结果里记一笔即可。
- 跑通以后，按 §4.2 的最后一行更新 `brain/knowledge/engineering/main-line-e2e.md`：第 4 步改成指向本节；Gotchas 里补一条，说明真实模式要开 `E2E_FEISHU_REAL`、改号码和部门、权限要靠发版来去掉和加回。
