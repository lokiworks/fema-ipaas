import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PackageType, ConnectorType } from '@fema/shared'
import type { OfficialConnectorPackage, PrivateConnectorPackage } from '@fema/shared'
import type { ApLogger } from '@fema/server-utils'

// Module-level variable updated per test so the vi.mock factory can reference it
let testWorkspace = ''

const mockInstall = vi.fn()

vi.mock('../../../src/lib/utils/bun-runner', () => ({
    bunRunner: () => ({
        install: mockInstall,
    }),
}))

vi.mock('../../../src/lib/cache/cache-paths', () => ({
    cacheUtils: () => ({
        getGlobalCacheCommonPath: () => testWorkspace,
        getGlobalCachePathLatestVersion: () => testWorkspace,
    }),
}))

// Import after mocks are registered
const { connectorInstaller, isValidPackageName } = await import('../../../src/lib/cache/connectors/connector-installer')

function makeConnector(name: string, version = '1.0.0'): OfficialConnectorPackage {
    return {
        packageType: PackageType.REGISTRY,
        connectorType: ConnectorType.OFFICIAL,
        connectorName: name,
        connectorVersion: version,
    }
}

function makeArchiveConnector(name: string, version = '1.0.0'): PrivateConnectorPackage {
    return {
        packageType: PackageType.ARCHIVE,
        connectorType: ConnectorType.CUSTOM,
        connectorName: name,
        connectorVersion: version,
        archiveId: randomUUID(),
        tenantId: 'tenant-1',
    }
}

function connectorDirPath(connector: OfficialConnectorPackage | PrivateConnectorPackage): string {
    return join(testWorkspace, 'connectors', `${connector.connectorName}-${connector.connectorVersion}`)
}

function readyFilePath(connector: OfficialConnectorPackage | PrivateConnectorPackage): string {
    return join(connectorDirPath(connector), 'ready')
}

async function pathExists(p: string): Promise<boolean> {
    return access(p).then(() => true, () => false)
}

const fakeLog = {
    level: 'silent',
    silent: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
} as unknown as ApLogger

// Every connector is installed from its bundle link; the dependency value is the engine bundle endpoint.
const bundleSource = { publicApiUrl: 'http://localhost:3000/api/', engineToken: 'test-token' }

const fakeGetSettings = () => ({
    EXECUTION_MODE: 'UNSANDBOXED',
    DEV_CONNECTORS: [] as string[],
    ENVIRONMENT: 'production',
    REUSE_SANDBOX: undefined,
    WORKFLOW_TIMEOUT_SECONDS: 600,
    MAX_FILE_SIZE_MB: 10,
    MAX_EXECUTION_LOG_SIZE_MB: 10,
    NETWORK_MODE: 'UNRESTRICTED' as never,
    SANDBOX_MEMORY_LIMIT: '1048576',
    SANDBOX_PROPAGATED_ENV_VARS: [] as string[],
    SSRF_ALLOW_LIST: [] as string[],
})

beforeEach(async () => {
    testWorkspace = join(tmpdir(), `connector-installer-test-${randomUUID()}`)
    await mkdir(testWorkspace, { recursive: true })
    vi.clearAllMocks()
    // The installer downloads each connector tarball from the bundle endpoint via fetch.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode('tgz').buffer,
    }))
})

afterEach(() => {
    vi.unstubAllGlobals()
})

afterEach(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(testWorkspace, { recursive: true, force: true })
})

describe('connectorInstaller', () => {
    it('batch install succeeds — all connectors marked ready', async () => {
        const connector1 = makeConnector('@fema/connector-a')
        const connector2 = makeConnector('@fema/connector-b')
        const installer = connectorInstaller(fakeLog, testWorkspace, fakeGetSettings)

        mockInstall.mockResolvedValueOnce({ output: '' })

        await installer.install({ connectors: [connector1, connector2], includeFilters: true, ...bundleSource })

        expect(mockInstall).toHaveBeenCalledOnce()
        expect(await pathExists(readyFilePath(connector1))).toBe(true)
        expect(await pathExists(readyFilePath(connector2))).toBe(true)
    })

    it('batch fails with good and bad connector — good connector marked ready, bad connector rolled back', async () => {
        const good = makeConnector('@fema/connector-good')
        const bad = makeConnector('@fema/connector-bad')
        const installer = connectorInstaller(fakeLog, testWorkspace, fakeGetSettings)

        mockInstall
            .mockRejectedValueOnce(new Error('workspace:* resolve error'))  // batch attempt
            .mockResolvedValueOnce({ output: '' })                           // good individual
            .mockRejectedValueOnce(new Error('workspace:* resolve error'))  // bad individual

        const error = await installer.install({ connectors: [good, bad], includeFilters: false, ...bundleSource }).catch(e => e as Error)

        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain('@fema/connector-bad@1.0.0')
        expect(error.message).not.toContain('@fema/connector-good@1.0.0')
        expect(mockInstall).toHaveBeenCalledTimes(3)

        expect(await pathExists(readyFilePath(good))).toBe(true)
        expect(await pathExists(connectorDirPath(bad))).toBe(false)
    })

    it('batch fails with both connectors bad — both rolled back, error names both', async () => {
        const connector1 = makeConnector('@fema/connector-x')
        const connector2 = makeConnector('@fema/connector-y')
        const installer = connectorInstaller(fakeLog, testWorkspace, fakeGetSettings)

        mockInstall
            .mockRejectedValueOnce(new Error('workspace:* resolve error'))  // batch
            .mockRejectedValueOnce(new Error('workspace:* resolve error'))  // connector-x individual
            .mockRejectedValueOnce(new Error('workspace:* resolve error'))  // connector-y individual

        const error = await installer.install({ connectors: [connector1, connector2], includeFilters: false, ...bundleSource }).catch(e => e as Error)

        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain('@fema/connector-x@1.0.0')
        expect(error.message).toContain('@fema/connector-y@1.0.0')
        expect(mockInstall).toHaveBeenCalledTimes(3)

        expect(await pathExists(connectorDirPath(connector1))).toBe(false)
        expect(await pathExists(connectorDirPath(connector2))).toBe(false)
    })

    it('single connector fails — rolled back immediately, no individual retry', async () => {
        const connector = makeConnector('@fema/connector-solo')
        const installer = connectorInstaller(fakeLog, testWorkspace, fakeGetSettings)

        mockInstall.mockRejectedValueOnce(new Error('install failure'))

        await expect(installer.install({ connectors: [connector], includeFilters: true, ...bundleSource })).rejects.toThrow('install failure')

        expect(mockInstall).toHaveBeenCalledOnce()
        expect(await pathExists(connectorDirPath(connector))).toBe(false)
    })

    it('connector already installed — bun install never called', async () => {
        const connector = makeConnector('@fema/connector-cached')
        const connectorDir = connectorDirPath(connector)

        await mkdir(join(connectorDir, 'node_modules'), { recursive: true })
        await writeFile(join(connectorDir, 'ready'), 'true')

        const installer = connectorInstaller(fakeLog, testWorkspace, fakeGetSettings)
        await installer.install({ connectors: [connector], includeFilters: true, ...bundleSource })

        expect(mockInstall).not.toHaveBeenCalled()
    })

    it('archive connector installs through bun with a unique suffixed workspace name pointing at its bundle link', async () => {
        const connector = makeArchiveConnector('@acme/connector-sample', '0.3.3')
        const installer = connectorInstaller(fakeLog, testWorkspace, fakeGetSettings)

        mockInstall.mockResolvedValueOnce({ output: '' })

        await installer.install({ connectors: [connector], includeFilters: true, ...bundleSource })

        expect(mockInstall).toHaveBeenCalledOnce()
        expect(await pathExists(readyFilePath(connector))).toBe(true)

        // The folder's package.json carries the unique `<connectorName>-<connectorVersion>` workspace name
        // (never the raw connector name) and depends on the locally downloaded bundle.tgz — so multiple
        // cached versions of the same connector can never collide on a bun workspace name.
        const manifest = JSON.parse(await readFile(join(connectorDirPath(connector), 'package.json'), 'utf8'))
        expect(manifest.name).toBe('@acme/connector-sample-0.3.3')
        expect(manifest.dependencies['@acme/connector-sample']).toContain('bundle.tgz')
    })

    it('skips connectors whose name is a relative path — they never reach the shared bun workspace', async () => {
        const good = makeConnector('@fema/connector-good')
        // Stale `usedConnectors` data from a since-reverted build can carry a relative path as the
        // connectorName. Writing it as a workspace member corrupts the shared bun.lock and breaks every
        // other connector (and cache pre-warm / deploy), so it must be dropped before any member is built.
        const poison = makeConnector('../../../common/connectors/@fema/connector-algolia', '0.0.3')
        const installer = connectorInstaller(fakeLog, testWorkspace, fakeGetSettings)

        mockInstall.mockResolvedValueOnce({ output: '' })

        await installer.install({ connectors: [good, poison], includeFilters: true, ...bundleSource })

        expect(mockInstall).toHaveBeenCalledOnce()
        expect(mockInstall.mock.calls[0]?.[0].filtersPath).toEqual([
            expect.stringContaining('@fema/connector-good-1.0.0'),
        ])
        expect(await pathExists(readyFilePath(good))).toBe(true)
    })

    it('install made up only of invalid-named connectors is a no-op — bun never runs', async () => {
        const poison = makeConnector('../../../common/connectors/@fema/connector-algolia', '0.0.3')
        const installer = connectorInstaller(fakeLog, testWorkspace, fakeGetSettings)

        await installer.install({ connectors: [poison], includeFilters: true, ...bundleSource })

        expect(mockInstall).not.toHaveBeenCalled()
    })

    it('mixes valid and invalid connectors — only valid ones reach bun, both filters present for valid', async () => {
        const goodA = makeConnector('@fema/connector-a')
        const goodB = makeConnector('connector-b-unscoped')
        const poison1 = makeConnector('../../../common/connectors/@fema/connector-x', '0.0.3')
        const poison2 = makeConnector('@fema/connector-y/extra', '1.2.3')
        const installer = connectorInstaller(fakeLog, testWorkspace, fakeGetSettings)

        mockInstall.mockResolvedValueOnce({ output: '' })

        await installer.install({ connectors: [goodA, poison1, goodB, poison2], includeFilters: true, ...bundleSource })

        expect(mockInstall).toHaveBeenCalledOnce()
        const filtersPath = mockInstall.mock.calls[0]?.[0].filtersPath as string[]
        expect(filtersPath).toHaveLength(2)
        expect(filtersPath.some(f => f.includes('@fema/connector-a-1.0.0'))).toBe(true)
        expect(filtersPath.some(f => f.includes('connector-b-unscoped-1.0.0'))).toBe(true)
        expect(filtersPath.some(f => f.includes('connector-x'))).toBe(false)
        expect(filtersPath.some(f => f.includes('connector-y'))).toBe(false)
    })

    it('individual fallback always passes --filter path regardless of includeFilters', async () => {
        const connector1 = makeConnector('@fema/connector-filter-a')
        const connector2 = makeConnector('@fema/connector-filter-b')
        const installer = connectorInstaller(fakeLog, testWorkspace, fakeGetSettings)

        mockInstall
            .mockRejectedValueOnce(new Error('batch error'))
            .mockResolvedValueOnce({ output: '' })
            .mockResolvedValueOnce({ output: '' })

        // Use includeFilters: false so the batch call has no filters
        await installer.install({ connectors: [connector1, connector2], includeFilters: false, ...bundleSource })

        expect(mockInstall).toHaveBeenCalledTimes(3)

        // Batch call uses empty filtersPath because includeFilters is false
        expect(mockInstall.mock.calls[0]?.[0]).toMatchObject({ filtersPath: [] })

        // Individual calls must always include the --filter path (sequential order)
        expect(mockInstall.mock.calls[1]?.[0]).toMatchObject({
            filtersPath: [expect.stringContaining(`${connector1.connectorName}-${connector1.connectorVersion}`)],
        })
        expect(mockInstall.mock.calls[2]?.[0]).toMatchObject({
            filtersPath: [expect.stringContaining(`${connector2.connectorName}-${connector2.connectorVersion}`)],
        })
    })
})

describe('isValidPackageName', () => {
    it.each([
        '@fema/connector-algolia',
        '@fema/connector-add-event',
        '@acme/connector-sample',
        // the `<name>-<version>` workspace-member form is itself a single-slash scoped name
        '@fema/connector-algolia-0.0.3',
        'tslib',
        'connector-b-unscoped',
        'lodash.merge',
        '@a/b',
        'a',
    ])('accepts valid package name %j', (name) => {
        expect(isValidPackageName(name)).toBe(true)
    })

    it.each([
        // the production poison: a relative path masquerading as a connector name
        '../../../common/connectors/@fema/connector-algolia',
        '../../../common/connectors/@fema/connector-algolia-0.0.3',
        '..',
        '../foo',
        './foo',
        'foo/..',
        '@fema/..',
        // more than one path segment (scoped names allow exactly one slash)
        '@fema/connector-y/extra',
        'a/b/c',
        'foo/bar',
        // malformed scopes
        '@/name',
        '@scope/',
        // empty
        '',
    ])('rejects invalid package name %j', (name) => {
        expect(isValidPackageName(name)).toBe(false)
    })
})
