import { api, env, go, openBrowser, shot, uiLogin } from './lib.mjs'

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
    agentFlow ? { name: 'agent-builder', url: `${env.web}/projects/${projectId}/workflows/${agentFlow.id}`, ready: /AI 智能体/, click: 'AI 智能体' } : null,
  ].filter((item) => item !== null)

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
      await page.getByText(target.ready).first().waitFor({ timeout: 180000 }).catch(() => undefined)
      await page.waitForTimeout(2500)
      if (target.click) {
        await page.getByText(target.click, { exact: true }).first().click().catch(() => undefined)
        await page.waitForTimeout(2500)
      }
      await shot({ page, name: `ui-${target.name}-${variant.suffix}` })
    }
    await browser.close()
  }
}
