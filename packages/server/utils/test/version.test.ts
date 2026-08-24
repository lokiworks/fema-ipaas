import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let tempDir: string
let originalCwd: string

async function loadVersionUtil(): Promise<typeof import('../src/version')['versionUtil']> {
    vi.resetModules()
    const mod = await import('../src/version')
    return mod.versionUtil
}

beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'version-test-'))
    process.chdir(tempDir)
})

afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
})

describe('versionUtil.getCurrentRelease', () => {
    it('returns the version field from package.json in cwd', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ version: '1.2.3' }))
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.getCurrentRelease()).toBe('1.2.3')
    })

    it('falls back to 0.0.0 when package.json is missing', async () => {
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.getCurrentRelease()).toBe('0.0.0')
    })

    it('falls back to 0.0.0 when package.json is not valid JSON', async () => {
        await writeFile(join(tempDir, 'package.json'), '{ not json')
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.getCurrentRelease()).toBe('0.0.0')
    })

    it('falls back to 0.0.0 when version field is absent', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'pkg' }))
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.getCurrentRelease()).toBe('0.0.0')
    })

    it('falls back to 0.0.0 when version field is not a string', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ version: 123 }))
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.getCurrentRelease()).toBe('0.0.0')
    })

    it('caches the first read and ignores later changes to package.json', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ version: '1.2.3' }))
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.getCurrentRelease()).toBe('1.2.3')
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ version: '9.9.9' }))
        expect(versionUtil.getCurrentRelease()).toBe('1.2.3')
    })
})

describe('versionUtil.versionsAreCompatible', () => {
    it('returns true when both are the same real version', async () => {
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.versionsAreCompatible({ versionA: '1.2.3', versionB: '1.2.3' })).toBe(true)
    })

    it('returns false when both are real but different', async () => {
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.versionsAreCompatible({ versionA: '1.2.3', versionB: '1.2.4' })).toBe(false)
    })

    it('returns false when either side is undefined (old, pre-gate worker)', async () => {
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.versionsAreCompatible({ versionA: undefined, versionB: '1.2.3' })).toBe(false)
        expect(versionUtil.versionsAreCompatible({ versionA: '1.2.3', versionB: undefined })).toBe(false)
        expect(versionUtil.versionsAreCompatible({ versionA: undefined, versionB: undefined })).toBe(false)
    })

    it('returns false when either side is the 0.0.0 read-failure sentinel', async () => {
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.versionsAreCompatible({ versionA: '0.0.0', versionB: '1.2.3' })).toBe(false)
        expect(versionUtil.versionsAreCompatible({ versionA: '1.2.3', versionB: '0.0.0' })).toBe(false)
    })

    // The crux: two processes that both failed their read report '0.0.0' but may be on
    // different releases. Fail closed so a skewed dispatch can never slip through.
    it('returns false when both sides are 0.0.0 (both failed to read)', async () => {
        const versionUtil = await loadVersionUtil()
        expect(versionUtil.versionsAreCompatible({ versionA: '0.0.0', versionB: '0.0.0' })).toBe(false)
    })
})
