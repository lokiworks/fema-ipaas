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

describe('versionUtil.getLatestRelease', () => {
    const getMock = vi.fn()

    async function loadWithMockedNetwork(): Promise<typeof import('../src/version')['versionUtil']> {
        vi.resetModules()
        getMock.mockReset()
        vi.doMock('../src/safe-http', () => ({ safeHttp: { axios: { get: getMock } } }))
        const mod = await import('../src/version')
        return mod.versionUtil
    }

    afterEach(() => {
        vi.doUnmock('../src/safe-http')
        vi.useRealTimers()
    })

    it('asks the network once for several callers at the same time', async () => {
        const versionUtil = await loadWithMockedNetwork()
        getMock.mockResolvedValue({ data: { version: '9.9.9' } })
        const results = await Promise.all([versionUtil.getLatestRelease(), versionUtil.getLatestRelease(), versionUtil.getLatestRelease()])
        expect(results).toEqual(['9.9.9', '9.9.9', '9.9.9'])
        expect(getMock).toHaveBeenCalledTimes(1)
    })

    it('does not make an offline installation wait for the network on every system page load', async () => {
        const versionUtil = await loadWithMockedNetwork()
        getMock.mockRejectedValue(new Error('connect ETIMEDOUT'))
        expect(await versionUtil.getLatestRelease()).toBe('0.0.0')
        expect(await versionUtil.getLatestRelease()).toBe('0.0.0')
        expect(getMock).toHaveBeenCalledTimes(1)
    })

    it('tries again once the failure has aged out, and keeps a success for an hour', async () => {
        const versionUtil = await loadWithMockedNetwork()
        vi.useFakeTimers()
        getMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: { version: '1.0.1' } })
        expect(await versionUtil.getLatestRelease()).toBe('0.0.0')
        vi.advanceTimersByTime(11 * 60 * 1000)
        expect(await versionUtil.getLatestRelease()).toBe('1.0.1')
        vi.advanceTimersByTime(30 * 60 * 1000)
        expect(await versionUtil.getLatestRelease()).toBe('1.0.1')
        expect(getMock).toHaveBeenCalledTimes(2)
        vi.advanceTimersByTime(31 * 60 * 1000)
        await versionUtil.getLatestRelease()
        expect(getMock).toHaveBeenCalledTimes(3)
    })
})
