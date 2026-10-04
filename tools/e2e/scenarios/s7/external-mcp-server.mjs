import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const apiRequire = createRequire(path.join(root, 'packages/server/api/package.json'))
const sdkRoot = path.join(root, 'packages/server/api/node_modules/@modelcontextprotocol/sdk')
const sdkModule = (file) => import(pathToFileURL(path.join(sdkRoot, 'dist/esm', file)).href)
const { McpServer } = await sdkModule('server/mcp.js')
const { StreamableHTTPServerTransport } = await sdkModule('server/streamableHttp.js')
const { SSEServerTransport } = await sdkModule('server/sse.js')
const { z } = apiRequire('zod')

const port = Number(process.env.EXTERNAL_MCP_PORT ?? 18977)
const TOKEN = process.env.EXTERNAL_MCP_TOKEN ?? 'e2e-secret-token'

const state = {
  down: false,
  tickets: [],
  calls: [],
  authFailures: 0,
}

const EMPLOYEES = [
  { id: 'E1001', name: '张三', dept: '研发部', email: 'zhangsan@corp.test', status: 'active' },
  { id: 'E1002', name: '张伟', dept: '销售部', email: 'zhangwei@corp.test', status: 'active' },
  { id: 'E1003', name: '李四', dept: '人事部', email: 'lisi@corp.test', status: 'resigned' },
  { id: 'E1004', name: '王五', dept: '研发部', email: 'wangwu@corp.test', status: 'active' },
]

function textResult(text, extra = {}) {
  return { content: [{ type: 'text', text }], ...extra }
}

function buildServer(req) {
  const server = new McpServer({ name: 'corp-hr-tools', version: '1.0.0' })
  server.registerTool(
    'query_employee',
    {
      title: '查询员工',
      description: '按姓名关键字查询员工，返回员工编号、姓名、部门、邮箱和状态',
      inputSchema: { keyword: z.string().describe('姓名关键字，例如 张') },
      annotations: { readOnlyHint: true },
    },
    async ({ keyword }) => {
      state.calls.push({ tool: 'query_employee', keyword })
      const employees = EMPLOYEES.filter((employee) => employee.name.includes(keyword))
      return textResult(JSON.stringify({ total: employees.length, employees }), {
        structuredContent: { total: employees.length, employees },
      })
    },
  )
  server.registerTool(
    'create_ticket',
    {
      title: '创建工单',
      description: '为指定员工创建一张 IT 工单，返回工单号',
      inputSchema: { title: z.string(), assignee: z.string().describe('处理人员工编号') },
    },
    async ({ title, assignee }) => {
      const ticket = { id: `T${1000 + state.tickets.length + 1}`, title, assignee }
      state.tickets.push(ticket)
      state.calls.push({ tool: 'create_ticket', title, assignee })
      return textResult(JSON.stringify(ticket), { structuredContent: ticket })
    },
  )
  server.registerTool(
    'always_error',
    {
      title: '总是报错',
      description: '测试用：永远返回工具级错误',
      inputSchema: {},
    },
    async () => {
      state.calls.push({ tool: 'always_error' })
      return { isError: true, content: [{ type: 'text', text: '工单系统暂不可用：数据库连接被拒绝 (E_DB_REFUSED)' }] }
    },
  )
  server.registerTool(
    'slow_tool',
    {
      title: '慢工具',
      description: '测试用：等待指定秒数后返回',
      inputSchema: { seconds: z.number().default(5) },
    },
    async ({ seconds }) => {
      state.calls.push({ tool: 'slow_tool', seconds })
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
      return textResult(`waited ${seconds}s`)
    },
  )
  server.registerTool(
    'huge_output',
    {
      title: '超大输出',
      description: '测试用：返回指定 KB 的文本',
      inputSchema: { kb: z.number().default(512) },
    },
    async ({ kb }) => {
      state.calls.push({ tool: 'huge_output', kb })
      return textResult('x'.repeat(kb * 1024))
    },
  )
  server.registerTool(
    'drop_connection',
    {
      title: '中途掉线',
      description: '测试用：收到调用后直接断开连接，不返回任何响应',
      inputSchema: {},
    },
    async () => {
      state.calls.push({ tool: 'drop_connection' })
      req?.socket.destroy()
      await new Promise((resolve) => setTimeout(resolve, 3000))
      return textResult('unreachable')
    },
  )
  return server
}

function unauthorized(req) {
  const header = req.headers.authorization ?? ''
  return header !== `Bearer ${TOKEN}`
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw.length > 0 ? JSON.parse(raw) : undefined
}

const sseTransports = new Map()

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  if (url.pathname === '/admin/state') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(state))
    return
  }
  if (url.pathname === '/admin/down' && req.method === 'POST') {
    state.down = true
    res.writeHead(200).end('ok')
    return
  }
  if (url.pathname === '/admin/up' && req.method === 'POST') {
    state.down = false
    res.writeHead(200).end('ok')
    return
  }
  if (url.pathname === '/admin/reset' && req.method === 'POST') {
    state.tickets = []
    state.calls = []
    state.authFailures = 0
    res.writeHead(200).end('ok')
    return
  }
  if (state.down) {
    req.socket.destroy()
    return
  }
  const needsAuth = url.pathname !== '/open' && url.pathname !== '/open/'
  if (needsAuth && unauthorized(req)) {
    state.authFailures += 1
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'invalid_token', message: '令牌无效或已过期' }))
    return
  }
  if (url.pathname === '/mcp' || url.pathname === '/open') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' })
      res.end(JSON.stringify({ error: 'method_not_allowed' }))
      return
    }
    const body = await readBody(req)
    const server = buildServer(req)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
    return
  }
  if (url.pathname === '/sse' && req.method === 'GET') {
    const transport = new SSEServerTransport('/messages', res)
    sseTransports.set(transport.sessionId, transport)
    res.on('close', () => sseTransports.delete(transport.sessionId))
    await buildServer().connect(transport)
    return
  }
  if (url.pathname === '/messages' && req.method === 'POST') {
    const transport = sseTransports.get(url.searchParams.get('sessionId') ?? '')
    if (!transport) {
      res.writeHead(404).end('unknown session')
      return
    }
    await transport.handlePostMessage(req, res, await readBody(req))
    return
  }
  res.writeHead(404).end('not found')
})

http.listen(port, '0.0.0.0', () => {
  process.stdout.write(`external mcp server on ${port}\n`)
})
