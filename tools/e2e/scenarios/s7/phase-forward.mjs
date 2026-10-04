import { api, check, env, go, login, mcpClientFor, openBrowser, shot, textOfToolResult, uiLogin } from './lib.mjs'

const SERVICE_KEY = 's7-hr-tools'
const MEMBER_EMAIL = 'member7@ap.com'
const MEMBER_PASSWORD = 'Passw0rd!Passw0rd'

export async function forwardPhase({ session }) {
  const { token, projectId } = session
  await cleanup({ token, projectId })

  const { browser, page } = await openBrowser()
  await uiLogin({ page })
  const serviceId = await createServiceInUi({ page, projectId })
  check({ name: '前端创建 MCP 服务，进入详情页', ok: Boolean(serviceId), detail: serviceId })

  await createToolInUi({ page })
  const issuesBefore = await api({ url: `/v1/mcp-services/${serviceId}/issues`, token })
  check({ name: '前端新建连接器工具后问题检查没有错误', ok: issuesBefore.json?.errorCount === 0 || issuesBefore.json?.issues?.every((issue) => issue.level !== 'ERROR'), detail: JSON.stringify(issuesBefore.json).slice(0, 200) })
  await shot({ page, name: 'fw-01-tool-created' })

  await publishInUi({ page })
  await shot({ page, name: 'fw-02-published' })
  const service = (await api({ url: `/v1/mcp-services/${serviceId}`, token })).json
  check({ name: '前端发布后服务状态为已启用，版本 1.0', ok: service.status === 'ENABLED' && service.publishedVersion === '1.0', detail: `${service.status} ${service.publishedVersion}` })

  const usage = await openUsageTab({ page, projectId, serviceId })
  check({ name: '「用量」页展示服务地址和脱敏的个人 Key', ok: usage.hasEndpoint && usage.maskedKey, detail: JSON.stringify(usage) })

  const keyInfo = (await api({ url: `/v1/mcp-services/${serviceId}/my-key`, token })).json
  const endpoint = `${env.api.replace(/\/api$/, '')}/api/${keyInfo.endpointPath}`
  const mcpUrl = endpoint

  const client = await mcpClientFor({ url: mcpUrl, token: keyInfo.key })
  const tools = (await client.listTools()).tools
  check({ name: 'MCP 客户端（官方 SDK）用个人 Key 连上，只看到已发布的 1 个工具', ok: tools.length === 1 && tools[0].name === 'join_text', detail: tools.map((tool) => tool.name).join(',') })
  const schemaProps = Object.keys(tools[0]?.inputSchema?.properties ?? {})
  check({ name: '工具入参 schema 包含 texts、separator', ok: schemaProps.includes('texts') && schemaProps.includes('separator'), detail: schemaProps.join(',') })
  const called = await client.callTool({ name: 'join_text', arguments: { texts: ['张三', '研发部'], separator: '-' } })
  check({ name: '调用 join_text 成功并返回拼接结果', ok: !called.isError && textOfToolResult({ result: called }).includes('张三-研发部'), detail: textOfToolResult({ result: called }).slice(0, 120) })

  await addDraftTool({ token, serviceId })
  const toolsAfterDraft = (await client.listTools()).tools
  check({ name: '新增但未发布的草稿工具对客户端不可见', ok: toolsAfterDraft.length === 1, detail: toolsAfterDraft.map((tool) => tool.name).join(',') })
  const draftCall = await client.callTool({ name: 'slug_text', arguments: { text: 'Hello World' } })
  check({ name: '直接调用未发布的工具被拒绝并说清楚', ok: draftCall.isError === true && /does not exist/.test(textOfToolResult({ result: draftCall })), detail: textOfToolResult({ result: draftCall }) })
  await client.close()

  const wrong = await rawCall({ url: mcpUrl, token: 'mcp_sk_wrongwrongwrong' })
  check({ name: '错误的 Key 返回 401', ok: wrong.status === 401, detail: String(wrong.status) })
  const noKey = await rawCall({ url: mcpUrl, token: '' })
  check({ name: '不带 Key 返回 401', ok: noKey.status === 401, detail: String(noKey.status) })

  const resetKey = await resetKeyInUi({ page, projectId, serviceId })
  const afterReset = (await api({ url: `/v1/mcp-services/${serviceId}/my-key`, token })).json
  check({ name: '点「重置」会先弹出确认，确认后 Key 变了', ok: afterReset.key !== keyInfo.key && resetKey.askedForConfirmation, detail: JSON.stringify(resetKey) })
  const oldKeyCall = await rawCall({ url: mcpUrl, token: keyInfo.key })
  check({ name: '重置后旧 Key 立即失效（401）', ok: oldKeyCall.status === 401, detail: String(oldKeyCall.status) })
  const newClient = await mcpClientFor({ url: mcpUrl, token: afterReset.key })
  const again = await newClient.callTool({ name: 'join_text', arguments: { texts: ['a', 'b'], separator: '+' } })
  check({ name: '新 Key 可用', ok: textOfToolResult({ result: again }).includes('a+b') })
  await newClient.close()

  await api({ method: 'POST', url: `/v1/mcp-services/${serviceId}/status`, token, body: { status: 'PAUSED' } })
  const paused = await rawCall({ url: mcpUrl, token: afterReset.key })
  check({ name: '暂停服务后调用被拒绝并说明已暂停', ok: paused.status === 403 && /paused/.test(paused.text), detail: `${paused.status} ${paused.text.slice(0, 100)}` })
  await api({ method: 'POST', url: `/v1/mcp-services/${serviceId}/status`, token, body: { status: 'ENABLED' } })

  await memberChecks({ token, projectId, serviceId, mcpUrl })
  await shot({ page, name: 'fw-03-usage' })
  await browser.close()
}

async function cleanup({ token, projectId }) {
  const list = await api({ url: `/v1/mcp-services?projectId=${projectId}`, token })
  const mine = (list.json ?? []).filter((service) => (service.key ?? '').startsWith('s7-'))
  for (const service of mine) {
    await api({ method: 'DELETE', url: `/v1/mcp-services/${service.id}`, token })
  }
}

async function createServiceInUi({ page, projectId }) {
  await go({ page, url: `${env.web}/projects/${projectId}/mcp-services` })
  await page.getByRole('button', { name: /创建 MCP 服务/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input').nth(0).fill('人事工具箱')
  await dialog.locator('input').nth(1).fill(SERVICE_KEY)
  await dialog.locator('textarea').fill('让 AI 助手查询员工并拼接展示文本')
  await dialog.getByRole('button', { name: '创建' }).click()
  await page.waitForURL(/mcp-services\/[A-Za-z0-9]+$/)
  return page.url().split('/').pop()
}

async function createToolInUi({ page }) {
  await page.getByRole('button', { name: '新建工具' }).first().click()
  await page.getByRole('menuitem', { name: '从连接器新建' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('文本助手', { exact: true }).click()
  await dialog.getByRole('button', { name: '下一个' }).click()
  await dialog.getByText('拼接', { exact: true }).first().click()
  await dialog.getByRole('button', { name: '下一个' }).click()
  const inputs = dialog.locator('input')
  await inputs.nth(0).fill('join_text')
  await inputs.nth(1).fill('拼接文本')
  await dialog.locator('textarea').first().fill('把多段文本用指定分隔符拼成一句话，返回拼接后的字符串')
  await dialog.getByRole('button', { name: '创建工具' }).click()
  await dialog.waitFor({ state: 'hidden' })
}

async function publishInUi({ page }) {
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('textarea').fill('首个版本：拼接文本')
  await dialog.getByRole('button', { name: /发布/ }).last().click()
  await dialog.waitFor({ state: 'hidden' })
}

async function openUsageTab({ page, projectId, serviceId }) {
  await go({ page, url: `${env.web}/projects/${projectId}/mcp-services/${serviceId}` })
  await page.getByRole('tab', { name: '用量' }).click()
  await page.getByText('服务地址').first().waitFor()
  const body = await page.locator('body').innerText()
  return { hasEndpoint: /mcp\/s7-hr-tools/.test(await page.locator('input').evaluateAll((els) => els.map((el) => el.value).join('\n'))), maskedKey: /mcp_sk_/.test(await page.locator('input').evaluateAll((els) => els.map((el) => el.value).join('\n'))) && !/mcp_sk_[A-Za-z0-9]{14}/.test(body) }
}

async function resetKeyInUi({ page, projectId, serviceId }) {
  await go({ page, url: `${env.web}/projects/${projectId}/mcp-services/${serviceId}` })
  await page.getByRole('tab', { name: '用量' }).click()
  const button = page.getByRole('button', { name: '重置' })
  await button.waitFor()
  await button.click()
  const confirm = page.getByRole('dialog')
  const asked = await confirm.waitFor({ timeout: 5000 }).then(() => true, () => false)
  if (asked) {
    await shot({ page, name: 'fw-reset-confirm' })
    await confirm.getByRole('button', { name: '重置' }).click()
  }
  await page.waitForTimeout(1500)
  return { clicked: true, askedForConfirmation: asked }
}

async function addDraftTool({ token, serviceId }) {
  const current = (await api({ url: `/v1/mcp-services/${serviceId}`, token })).json
  const draft = {
    id: 's7-draft-slug',
    name: 'slug_text',
    title: '转 slug',
    description: '把一段文本转成 slug，只在草稿里，未发布',
    source: { type: 'CONNECTOR_ACTION', connectorName: '@fema-ipaas/connector-text-helper', actionName: 'slugify' },
    params: [{ name: 'text', description: '要转换的文本', mode: 'AI', required: true, valueType: 'string' }],
  }
  const updated = await api({ method: 'POST', url: `/v1/mcp-services/${serviceId}/tools`, token, body: { tools: [...current.tools, draft] } })
  return updated
}

async function rawCall({ url, token }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  return { status: response.status, text: await response.text() }
}

async function memberChecks({ token, serviceId, mcpUrl }) {
  const member = await signInMember()
  await api({ method: 'POST', url: `/v1/tenant-access/members/${member.userId}/access`, token, body: { modules: ['MCP_SERVICES'] } })
  const before = await api({ url: `/v1/mcp-services/${serviceId}`, token: member.token })
  check({ name: '未上架的服务，其他成员看不到（不可见）', ok: before.status === 404 || before.status === 403, detail: String(before.status) })

  await api({ method: 'POST', url: `/v1/mcp-services/${serviceId}/listed`, token, body: { listed: true } })
  await api({ method: 'POST', url: `/v1/mcp-services/${serviceId}/availability`, token, body: { availability: { mode: 'MEMBERS', userIds: [session0(token).userId] } } })
  const restricted = await api({ method: 'POST', url: `/v1/mcp-services/${serviceId}/obtain`, token: member.token })
  check({ name: '可用范围限定为指定成员时，范围外的成员获取被拒绝', ok: restricted.status >= 400, detail: `${restricted.status} ${restricted.text.slice(0, 120)}` })

  await api({ method: 'POST', url: `/v1/mcp-services/${serviceId}/availability`, token, body: { availability: { mode: 'ALL', userIds: [] } } })
  const obtained = await api({ method: 'POST', url: `/v1/mcp-services/${serviceId}/obtain`, token: member.token })
  check({ name: '全员可用后，其他成员获取成功并得到自己的 Key', ok: obtained.status < 300, detail: `${obtained.status} ${obtained.text.slice(0, 120)}` })
  const memberKey = (await api({ url: `/v1/mcp-services/${serviceId}/my-key`, token: member.token })).json
  const ownerKey = (await api({ url: `/v1/mcp-services/${serviceId}/my-key`, token })).json
  check({ name: '按人发令牌：两个人的 Key 不同', ok: Boolean(memberKey?.key) && memberKey.key !== ownerKey.key })
  const memberClient = await mcpClientFor({ url: mcpUrl, token: memberKey.key })
  const memberTools = (await memberClient.listTools()).tools
  check({ name: '成员的 Key 能连上并只看到已发布工具', ok: memberTools.length === 1 && memberTools[0].name === 'join_text' })
  await memberClient.close()

  const ownerId = (await api({ url: `/v1/mcp-services/${serviceId}`, token })).json.ownerId
  await api({ method: 'POST', url: `/v1/mcp-services/${serviceId}/availability`, token, body: { availability: { mode: 'MEMBERS', userIds: [ownerId] } } })
  const revoked = await rawCall({ url: mcpUrl, token: memberKey.key })
  check({ name: '收窄可用范围后，成员已有的 Key 立即失效', ok: revoked.status === 401, detail: String(revoked.status) })
  const ownerStill = await rawCall({ url: mcpUrl, token: ownerKey.key })
  check({ name: '所有者的 Key 不受影响', ok: ownerStill.status === 200, detail: String(ownerStill.status) })
}

async function signInMember() {
  const response = await api({ method: 'POST', url: '/v1/authentication/sign-in', body: { email: MEMBER_EMAIL, password: MEMBER_PASSWORD } })
  if (response.status === 200) {
    return { token: response.json.token, userId: response.json.id }
  }
  const { token } = await login()
  const invited = await api({ method: 'POST', url: '/v1/user-invitations', token, body: { email: MEMBER_EMAIL, type: 'TENANT', tenantRole: 'MEMBER' } })
  const link = new URL(invited.json.link)
  await api({ method: 'POST', url: '/v1/user-invitations/accept', body: { invitationToken: link.searchParams.get('token') } })
  const signUp = await api({ method: 'POST', url: '/v1/authentication/sign-up', body: { email: MEMBER_EMAIL, password: MEMBER_PASSWORD, firstName: 'Member', lastName: 'Seven', trackEvents: false, newsLetter: false } })
  return { token: signUp.json.token, userId: signUp.json.id }
}

function session0(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  return { userId: payload.id }
}
