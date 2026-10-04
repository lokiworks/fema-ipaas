import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

export async function freshStack({ slot }) {
  const stateDir = `/tmp/fema-e2e/slot-${slot}`
  run({ script: 'stop-stack.sh', slot })
  run({ script: 'stop-worker.sh', slot })
  await sleep(3000)
  rmSync(`${stateDir}/config`, { recursive: true, force: true })
  rmSync(`${stateDir}/worker-cache`, { recursive: true, force: true })
  run({ script: 'start-stack.sh', slot })
  await waitFor({ url: `http://localhost:${3100 + slot}/api/v1/flags`, label: 'API' })
  run({ script: 'start-worker.sh', slot })
  await waitFor({ url: `http://localhost:${4200 + slot}/sign-in`, label: '前端' })
  await sleep(8000)
}

function run({ script, slot }) {
  const result = spawnSync('bash', [`${ROOT}/tools/e2e/stack/${script}`, String(slot)], { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${script} 失败：${result.stderr}`)
  }
}

async function waitFor({ url, label }) {
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    const ok = await fetch(url).then((response) => response.ok).catch(() => false)
    if (ok) {
      return
    }
    await sleep(2000)
  }
  throw new Error(`${label}没有在 4 分钟内起来`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
