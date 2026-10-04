import { api, check, env, go, openBrowser, shot, uiLogin } from './lib.mjs'

export async function uiPhase({ session }) {
  const { token, projectId } = session
  const server = ((await api({ url: '/v1/mcp-servers', token })).json ?? []).find((item) => item.displayName.startsWith('S7 企业'))
  const services = ((await api({ url: `/v1/mcp-services?projectId=${projectId}`, token })).json ?? []).find((item) => (item.key ?? '').startsWith('s7-'))
  const flows = (await api({ url: `/v1/workflows?projectId=${projectId}&limit=100`, token })).json?.data ?? []
  const agentFlow = flows.find((item) => item.version.displayName === 's7-智能体-查询')

  const pages = [
    { name: 'market-mcp', url: `${env.web}/tenant/connectors?cat=mcp`, ready: /S7 企业人事工具|MCP 服务器/ },
    server ? { name: 'mcp-detail', url: `${env.web}/tenant/connectors/mcp/${server.id}`, ready: /query_employee/ } : null,
    { name: 'services-list', url: `${env.web}/projects/${projectId}/mcp-services`, ready: /MCP 服务/ },
    services ? { name: 'service-detail', url: `${env.web}/projects/${projectId}/mcp-services/${services.id}`, ready: /工具/ } : null,
    { name: 'approvals', url: `${env.web}/projects/${projectId}/agent-approvals`, ready: /智能体确认/ },
    agentFlow ? { name: 'agent-builder', url: `${env.web}/projects/${projectId}/workflows/${agentFlow.id}`, ready: /AI 智能体/, click: '2. AI 智能体' } : null,
  ].filter((item) => item !== null)

  await marketChecks()

  const variants = [
    { suffix: 'light', width: 1440, height: 900, colorScheme: 'light' },
    { suffix: 'dark', width: 1440, height: 900, colorScheme: 'dark' },
    { suffix: 'narrow', width: 820, height: 900, colorScheme: 'light' },
  ]
  for (const variant of variants) {
    const { browser, page } = await openBrowser(variant)
    await uiLogin({ page })
    for (const target of pages) {
      await go({ page, url: target.url })
      const shown = await page.getByText(target.ready).first().waitFor({ timeout: 180000 }).then(() => true, () => false)
      await page.waitForTimeout(2500)
      if (target.click) {
        await page.getByText(target.click).first().click().catch(() => undefined)
        await page.getByText('入参', { exact: true }).first().click().catch(() => undefined)
        await page.waitForTimeout(2500)
      }
      const state = await page.evaluate(() => {
        const background = getComputedStyle(document.body).backgroundColor
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const context = canvas.getContext('2d')
        context.fillStyle = background
        context.fillRect(0, 0, 1, 1)
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
        return {
          dark: document.documentElement.classList.contains('dark'),
          background,
          luminance: (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        }
      })
      const wantDark = variant.colorScheme === 'dark'
      check({ name: `界面截图 ${target.name} / ${variant.suffix}：页面加载出来，主题是${wantDark ? '深' : '浅'}色${variant.width < 1000 ? '，窄屏没有横向滚动条' : ''}`, ok: shown && state.dark === wantDark && (state.luminance < 0.5) === wantDark && (variant.width >= 1000 || state.overflow <= 1), detail: JSON.stringify({ shown, ...state }) })
      await shot({ page, name: `ui-${target.name}-${variant.suffix}` })
    }
    await browser.close()
  }
}

async function marketChecks() {
  const { browser, page } = await openBrowser({ width: 1440, height: 900 })
  await uiLogin({ page })
  await go({ page, url: `${env.web}/tenant/connectors` })
  const nav = page.getByRole('navigation', { name: '连接器分类' })
  await nav.waitFor({ timeout: 180000 })
  await page.waitForTimeout(3000)
  const navText = await nav.innerText()
  const expected = ['办公协同', '人力资源', '客户管理', '财务与 ERP', '开发者工具', '电商与零售', '数据库', '文件存储', 'AI 模型', '营销与消息', '内置工具', '自定义']
  check({ name: '连接器市场左侧分类名全是中文', ok: expected.every((name) => navText.includes(name)) && !/[A-Za-z]{4,}/.test(navText.replace('MCP', '').replace('AI', '').replace('ERP', '')), detail: navText.replace(/\s+/g, ' ') })
  await shot({ page, name: 'ui-market-categories' })
  await go({ page, url: `${env.web}/tenant/connectors/detail/${encodeURIComponent('@fema-ipaas/connector-beisen')}` })
  await page.getByText('北森').first().waitFor({ timeout: 180000 })
  await page.waitForTimeout(2500)
  const detailText = await page.locator('main, body').first().innerText()
  check({ name: '连接器详情页：所属分类和动作分类徽标是中文', ok: /人力资源/.test(detailText) && /读取|搜索|写入/.test(detailText) && !/\b(READ|WRITE|SEARCH|DESTRUCTIVE|HUMAN_RESOURCES)\b/.test(detailText), detail: detailText.replace(/\s+/g, ' ').slice(0, 260) })
  await shot({ page, name: 'ui-connector-detail' })
  await browser.close()
}
