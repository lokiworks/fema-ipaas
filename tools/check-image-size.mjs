import { execFileSync } from 'node:child_process'

const [candidate, baseline] = process.argv.slice(2)
if (!candidate || !baseline) throw new Error('Usage: node tools/check-image-size.mjs <candidate image> <previous image>')
const current = sizes(candidate)
const previous = sizes(baseline)
let failed = false
for (const [platform, bytes] of current) {
  const before = previous.get(platform)
  if (!before) throw new Error(`Missing previous image size for ${platform}`)
  const ratio = bytes / before
  process.stdout.write(JSON.stringify({ candidate, baseline, platform, bytes, previousBytes: before, growthPercent: Number(((ratio - 1) * 100).toFixed(2)), maxGrowthPercent: 10 }) + '\n')
  if (ratio > 1.1) failed = true
}
if (!current.size || current.size !== previous.size) throw new Error('The image platform sets differ')
if (failed) throw new Error('Image size grew by more than 10%; review runtime dependencies and layers before release')

function inspect(ref) {
  return JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', '--raw', ref], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))
}
function sizes(ref) {
  const manifest = inspect(ref)
  const index = ref.includes('@') ? ref.slice(0, ref.indexOf('@')) : ref
  const platforms = new Map()
  for (const entry of manifest.manifests ?? []) {
    if (entry.platform?.os !== 'linux' || !['amd64', 'arm64'].includes(entry.platform?.architecture)) continue
    const platform = `${entry.platform.os}/${entry.platform.architecture}`
    const image = inspect(`${index}@${entry.digest}`)
    if (!Array.isArray(image.layers)) throw new Error(`No layers for ${platform}`)
    platforms.set(platform, image.layers.reduce((sum, layer) => { if (!Number.isSafeInteger(layer.size) || layer.size < 0) throw new Error('Invalid layer size'); return sum + layer.size }, 0) + (image.config?.size ?? 0))
  }
  return platforms
}
