import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const stateRoot = process.env.E2E_STATE_ROOT
assert(stateRoot && path.isAbsolute(stateRoot), 'Set E2E_STATE_ROOT to an isolated absolute directory')
const context = path.join(stateRoot, 'runtime-image-context')
const image = process.env.E2E_IMAGE ?? 'ipaas-gap:validation'
const base = process.env.E2E_IMAGE_BASE ?? 'ipaas-gap:build-base'
const env = { ...process.env, ...(process.env.E2E_DOCKER_HOST ? { DOCKER_HOST: process.env.E2E_DOCKER_HOST } : {}) }
execFileSync('docker', ['image', 'inspect', base], { env, stdio: 'ignore' })
if (process.env.E2E_SKIP_BUILD !== '1') execFileSync('npx', ['turbo', 'run', 'build', '--filter=web', '--filter=@fema-ipaas/engine', '--filter=api', '--filter=worker', '--filter=./packages/connectors/core/*', '--filter=./packages/connectors/community/*', '--concurrency=1'], { cwd: root, stdio: 'inherit' })
rmSync(context, { recursive: true, force: true })
mkdirSync(context, { recursive: true })
for (const name of ['.npmrc', 'package.json', 'bun.lock', 'bunfig.toml', 'LICENSE', 'docker-entrypoint.sh', 'tools/fema-restore']) {
  const target = path.join(context, name)
  mkdirSync(path.dirname(target), { recursive: true })
  cpSync(path.join(root, name), target)
}
cpSync(path.join(root, 'packages'), path.join(context, 'packages'), { recursive: true, filter: (source) => {
  const relative = path.relative(path.join(root, 'packages'), source)
  const parts = relative.split(path.sep)
  if (['web', 'cli', 'tests-e2e'].includes(parts[0]) || parts.some((part) => ['node_modules', '.turbo'].includes(part) || part.startsWith('.env') || part.endsWith('.tsbuildinfo'))) return false
  const distIndex = parts.indexOf('dist')
  if (distIndex >= 0 && source.endsWith('.js')) {
    const original = path.join(root, 'packages', ...parts.slice(0, distIndex), ...parts.slice(distIndex + 1))
    return existsSync(original) || existsSync(original.replace(/\.js$/, '.ts')) || existsSync(original.replace(/\.js$/, '.tsx'))
  }
  return true
} })
for (const name of ['engine', 'web']) cpSync(path.join(root, 'dist/packages', name), path.join(context, 'dist/packages', name), { recursive: true, filter: (source) => name === 'engine' || !source.endsWith('.map') })
const manifestPath = path.join(context, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.workspaces = manifest.workspaces.filter((workspace) => existsSync(path.join(context, workspace.replace('/*', ''))))
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
const migrations = execFileSync(process.execPath, ['-e', 'const {getMigrations}=require("./packages/server/api/dist/src/app/database/postgres-connection");process.stdout.write(JSON.stringify(getMigrations().map(Migration=>new Migration().name)))'], { cwd: root, encoding: 'utf8' })
writeFileSync(path.join(context, 'packages/server/api/dist/src/migration-manifest.json'), migrations)
const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8').split('### STAGE 2: Run ###')[1]
  .replace('FROM base AS run', `FROM ${base} AS run`)
  .replaceAll('--from=build /usr/src/app/', '')
  .replace('RUN --mount=type=cache,target=/root/.bun/install/cache \\\n    bun install --production', 'RUN bun install --lockfile-only --ignore-scripts && bun install --production --backend=hardlink && bun pm cache rm')
assert(!dockerfile.includes('--from=build'), 'Unexpected runtime stage COPY format')
assert(!dockerfile.includes('--mount=type=cache'), 'Unexpected runtime dependency install format')
writeFileSync(path.join(context, 'Dockerfile'), dockerfile)
const child = spawn('docker', ['buildx', 'build', '--load', '--tag', image, '--progress=plain', context], { env, stdio: 'inherit' })
let lowDisk = false
const timer = setInterval(() => {
  const disk = statfsSync(context)
  if (!lowDisk && disk.bavail * disk.bsize < 512 * 1024 * 1024) {
    lowDisk = true
    process.stderr.write('Stopping the image build before exhausting the host disk\n')
    child.kill('SIGINT')
  }
}, 1000)
try {
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  assert.equal(code, 0, lowDisk ? 'Image build needs more free disk space' : 'Image build failed')
}
finally { clearInterval(timer) }
process.stdout.write(`PASS runtime image built from fresh artifacts and the repository runtime stage: ${image}\n`)
