import {
  api,
  check,
  env,
  login,
  mcpClientFor,
  openBrowser,
  portOpen,
  shot,
  startProcess,
  summary,
  textOfToolResult,
  uiLogin,
  waitFor,
} from './s7/lib.mjs'
import { forwardPhase } from './s7/phase-forward.mjs'
import { reversePhase } from './s7/phase-reverse.mjs'

const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const phases = [
  { name: 'forward', run: forwardPhase },
  { name: 'reverse', run: reversePhase },
]

const children = []
const session = await login()
const context = { session, children }

try {
  await ensureHelpers()
  for (const phase of phases) {
    if (only.length === 0 || only.includes(phase.name)) {
      process.stdout.write(`\n== ${phase.name}\n`)
      await phase.run(context)
    }
  }
} finally {
  children.forEach((child) => child.kill())
}

process.exit(summary() === 0 ? 0 : 1)

async function ensureHelpers() {
  if (!(await portOpen({ port: env.externalPort }))) {
    children.push(startProcess({ file: 'external-mcp-server.mjs', extraEnv: { EXTERNAL_MCP_PORT: String(env.externalPort) }, name: 'ext-mcp' }))
  }
  if (!(await portOpen({ port: env.llmPort }))) {
    children.push(startProcess({ file: 'fake-llm.mjs', extraEnv: { FAKE_LLM_PORT: String(env.llmPort) }, name: 'llm' }))
  }
  await waitFor({ fn: () => portOpen({ port: env.externalPort }), what: 'external mcp server' })
  await waitFor({ fn: () => portOpen({ port: env.llmPort }), what: 'fake llm' })
}

export { api, check, mcpClientFor, openBrowser, shot, textOfToolResult, uiLogin }
