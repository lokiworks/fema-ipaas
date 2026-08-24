import { rm, writeFile } from 'node:fs/promises'
import path, { dirname, join } from 'node:path'
import { ensureTrailingSlash, groupBy, isEmpty, isNil, tryCatch } from '@fema-ipaas/core-utils'
import { fileSystemUtils, type Logger, memoryLock, wideEvent } from '@fema-ipaas/server-utils'
import { ConnectorPackage, ConnectorType, ExecutionMode, getConnectorNameFromAlias, PackageType } from '@fema-ipaas/shared'
import writeFileAtomic from 'write-file-atomic'
import { SandboxSettings } from '../../types'
import { bunRunner } from '../../utils/bun-runner'
import { cacheUtils } from '../cache-paths'

const usedConnectorsMemoryCache: Record<string, boolean> = {}
const VALID_SCOPED_NAME_REGEX = /^@[^/]+\/[^/]+$/
const VALID_UNSCOPED_NAME_REGEX = /^[^/]+$/
const relativeConnectorPath = (connector: ConnectorPackage) => join('./', 'connectors', `${connector.connectorName}-${connector.connectorVersion}`)
const connectorPath = (rootWorkspace: string, connector: ConnectorPackage) => join(rootWorkspace, 'connectors', `${connector.connectorName}-${connector.connectorVersion}`)

export const connectorInstaller = (log: Logger, basePath: string, getSettings: () => SandboxSettings) => ({
    async install({ connectors, includeFilters, publicApiUrl, engineToken }: InstallParams): Promise<void> {
        const groupedConnectors = groupConnectorsByPackagePath(connectors, basePath, getSettings)
        const installPromises = Object.entries(groupedConnectors).map(async ([packagePath, connectorsInGroup]) => {
            await installConnectors(packagePath, connectorsInGroup, includeFilters, log, { publicApiUrl, engineToken }, getSettings)
        })
        await Promise.all(installPromises)
    },

    getCustomConnectorsPath(tenantId: string): string {
        return getCustomConnectorsPath(basePath, tenantId, getSettings)
    },
})

function getCustomConnectorsPath(basePath: string, tenantId: string, getSettings: () => SandboxSettings): string {
    const paths = cacheUtils(basePath)
    switch (getSettings().EXECUTION_MODE) {
        case ExecutionMode.SANDBOX_PROCESS:
        case ExecutionMode.SANDBOX_CODE_AND_PROCESS:
            return path.resolve(paths.getGlobalCachePathLatestVersion(), 'custom_connectors', tenantId)
        case ExecutionMode.UNSANDBOXED:
        case ExecutionMode.SANDBOX_CODE_ONLY:
            return paths.getGlobalCacheCommonPath()
        default:
            throw new Error('Invalid execution mode')
    }
}

async function installConnectors(rootWorkspace: string, connectors: ConnectorPackage[], includeFilters: boolean, log: Logger, bundleSource: BundleSource, getSettings: () => SandboxSettings): Promise<void> {
    const devConnectors = getSettings().DEV_CONNECTORS
    const nonDevConnectors = connectors.filter(connector => !devConnectors.includes(getConnectorNameFromAlias(connector.connectorName)))
    const { validConnectors, invalidConnectors } = partitionValidConnectorNames(nonDevConnectors)
    if (!isEmpty(invalidConnectors)) {
        log.error({
            rootWorkspace,
            invalidConnectors: invalidConnectors.map(connector => `${connector.connectorName}@${connector.connectorVersion}`),
        }, '[connectorInstaller] Skipping connectors with invalid package names to protect the shared lockfile')
    }
    const { connectorsToInstall } = await partitionConnectorsToInstall(rootWorkspace, validConnectors)

    if (isEmpty(connectorsToInstall)) {
        log.debug({ rootWorkspace }, '[connectorInstaller] No new connectors to install (already installed)')
        return
    }
    log.info({
        rootWorkspace,
        connectorsToInstall: connectorsToInstall.map(connector => `${connector.connectorName}-${connector.connectorVersion}`),
    }, '[connectorInstaller] Installing connectors in workspace')

    await memoryLock.runExclusive({
        key: `install-connectors-${rootWorkspace}`,
        fn: async () => {
            const { connectorsToInstall } = await partitionConnectorsToInstall(rootWorkspace, validConnectors)
            if (isEmpty(connectorsToInstall)) {
                log.info({ rootWorkspace }, '[connectorInstaller] No new connectors to install in lock (already installed)')
                return
            }
            log.info({
                rootWorkspace,
                connectors: connectorsToInstall.map(connector => `${connector.connectorName}-${connector.connectorVersion}`),
            }, '[connectorInstaller] acquired lock and starting to install connectors')

            await createRootPackageJson({
                path: rootWorkspace,
            })

            await saveBundlesToDiskIfNotCached(rootWorkspace, connectorsToInstall, bundleSource)

            await Promise.all(connectorsToInstall.map(connector => createConnectorPackageJson({
                rootWorkspace,
                connectorPackage: connector,
            })))

            await wideEvent.timed({
                name: 'bunInstall',
                fn: async () => {
                    const { error: batchError } = await tryCatch(async () => bunRunner(log).install({
                        path: rootWorkspace,
                        filtersPath: includeFilters ? connectorsToInstall.map(relativeConnectorPath) : [],
                    }))

                    if (isNil(batchError)) {
                        await markConnectorsAsUsed(rootWorkspace, connectorsToInstall)
                        log.info({
                            rootWorkspace,
                            connectorsCount: connectorsToInstall.length,
                        }, '[connectorInstaller] Installed registry connectors using bun')
                        return
                    }

                    if (connectorsToInstall.length === 1) {
                        log.error({ rootWorkspace, error: batchError }, '[connectorInstaller] Connector installation failed, rolling back')
                        await rollbackInstallation(rootWorkspace, connectorsToInstall)
                        throw batchError
                    }

                    log.warn({
                        rootWorkspace,
                        connectors: connectorsToInstall.map(connector => `${connector.connectorName}-${connector.connectorVersion}`),
                        error: batchError,
                    }, '[connectorInstaller] Batch install failed, retrying connectors individually')

                    const failedConnectors = await tryInstallConnectorsIndividually(rootWorkspace, connectorsToInstall, log)

                    if (failedConnectors.length > 0) {
                        const names = failedConnectors.map(p => `${p.connectorName}@${p.connectorVersion}`).join(', ')
                        throw new Error(`[connectorInstaller] Failed to install: ${names}`)
                    }

                    log.info({
                        rootWorkspace,
                        connectorsCount: connectorsToInstall.length,
                    }, '[connectorInstaller] Installed registry connectors using bun (individual fallback)')
                },
            })
        },
    })
}

// A workspace member name (and its dependency key) must be a plain npm package name. A relative
// path such as `../../../common/connectors/@fema-ipaas/connector-x` — fed in via stale `usedConnectors` data
// from a since-reverted build — makes bun write an unparseable resolution token into the SHARED
// bun.lock. That lock then fails to parse on the next install and takes down EVERY connector in the
// workspace (so cache pre-warm and the deploy fail). Worse, because the install joins the name onto
// `<workspace>/connectors/`, a `..` name escapes a per-tenant `custom_connectors/<id>` workspace and lands
// the poisoned member inside the shared `common` workspace. Such names are skipped at the source.
export function isValidPackageName(name: string): boolean {
    if (name.includes('..')) {
        return false
    }
    return VALID_SCOPED_NAME_REGEX.test(name) || VALID_UNSCOPED_NAME_REGEX.test(name)
}

function partitionValidConnectorNames(connectors: ConnectorPackage[]): { validConnectors: ConnectorPackage[], invalidConnectors: ConnectorPackage[] } {
    return {
        validConnectors: connectors.filter(connector => isValidPackageName(connector.connectorName)),
        invalidConnectors: connectors.filter(connector => !isValidPackageName(connector.connectorName)),
    }
}

async function rollbackInstallation(rootWorkspace: string, connectors: ConnectorPackage[]): Promise<void> {
    await Promise.all(connectors.map(connector => rm(path.resolve(rootWorkspace, relativeConnectorPath(connector)), {
        recursive: true,
        force: true,
    })))
}

async function tryInstallConnectorsIndividually(
    rootWorkspace: string,
    connectors: ConnectorPackage[],
    log: Logger,
): Promise<ConnectorPackage[]> {
    const failures: ConnectorPackage[] = []
    for (const connector of connectors) {
        const { error } = await tryCatch(async () =>
            bunRunner(log).install({
                path: rootWorkspace,
                filtersPath: [relativeConnectorPath(connector)],
            }),
        )
        if (error) {
            log.error({
                connector: `${connector.connectorName}@${connector.connectorVersion}`,
                error,
            }, '[connectorInstaller] Individual connector installation failed, rolling back')
            await rollbackInstallation(rootWorkspace, [connector])
            failures.push(connector)
        }
        else {
            await markConnectorsAsUsed(rootWorkspace, [connector])
        }
    }
    return failures
}

function groupConnectorsByPackagePath(connectors: ConnectorPackage[], basePath: string, getSettings: () => SandboxSettings): Record<string, ConnectorPackage[]> {
    const paths = cacheUtils(basePath)
    return groupBy(connectors, (connector) => {
        switch (connector.packageType) {
            case PackageType.ARCHIVE:
                return getCustomConnectorsPath(basePath, connector.tenantId, getSettings)
            case PackageType.REGISTRY: {
                if (connector.connectorType === ConnectorType.CUSTOM && !isNil(connector.tenantId)) {
                    return getCustomConnectorsPath(basePath, connector.tenantId, getSettings)
                }
                return paths.getGlobalCacheCommonPath()
            }
            default:
                throw new Error('Invalid package type')
        }
    })
}

async function createRootPackageJson({ path }: { path: string }): Promise<void> {
    const packageJsonPath = join(path, 'package.json')
    await fileSystemUtils.threadSafeMkdir(dirname(packageJsonPath))
    await writeFileAtomic(packageJsonPath, JSON.stringify({
        'name': 'fast-workspace',
        'version': '1.0.0',
        'workspaces': [
            'connectors/**',
        ],
    }, null, 2), 'utf8')
}

async function createConnectorPackageJson({ rootWorkspace, connectorPackage }: {
    rootWorkspace: string
    connectorPackage: ConnectorPackage
}): Promise<void> {
    const packageJsonPath = join(connectorPath(rootWorkspace, connectorPackage), 'package.json')

    const packageJson = {
        'name': `${connectorPackage.connectorName}-${connectorPackage.connectorVersion}`,
        'version': `${connectorPackage.connectorVersion}`,
        'dependencies': {
            [connectorPackage.connectorName]: bundleTgzPath(rootWorkspace, connectorPackage),
        },
    }
    await fileSystemUtils.threadSafeMkdir(dirname(packageJsonPath))
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8')
}

function bundleTgzPath(rootWorkspace: string, connector: ConnectorPackage): string {
    return join(connectorPath(rootWorkspace, connector), 'bundle.tgz')
}

// Downloads each connector tarball from the engine bundle endpoint (which 307-redirects to npm /
// signed-S3, or streams the custom archive) to a local .tgz. We download here — rather than handing
// the URL to `bun install` — because bun derives a cache directory name from the dependency spec,
// and a long signed-S3 / engine-token URL overflows the filesystem name limit (ENAMETOOLONG).
// `fetch` follows the redirect and carries the engine token in the Authorization header.
// ARCHIVE connectors are fetched by archiveId (they may not be registered in metadata yet, e.g. during
// EXTRACT_CONNECTOR_METADATA); REGISTRY connectors by name@version.
async function saveBundlesToDiskIfNotCached(rootWorkspace: string, connectors: ConnectorPackage[], { publicApiUrl, engineToken }: BundleSource): Promise<void> {
    await Promise.all(connectors.map(async (connector) => {
        const bundlePath = bundleTgzPath(rootWorkspace, connector)
        if (await fileSystemUtils.fileExists(bundlePath)) {
            return
        }
        const url = connectorBundleEndpointUrl(publicApiUrl, connector)
        const response = await fetch(url, { headers: { Authorization: `Bearer ${engineToken}` } })
        if (!response.ok) {
            throw new Error(`Failed to fetch connector bundle ${connector.connectorName}@${connector.connectorVersion}: ${response.status} ${response.statusText}`)
        }
        await fileSystemUtils.threadSafeMkdir(dirname(bundlePath))
        await writeFile(bundlePath, Buffer.from(await response.arrayBuffer()))
    }))
}

function connectorBundleEndpointUrl(publicApiUrl: string, connector: ConnectorPackage): string {
    const base = `${ensureTrailingSlash(publicApiUrl)}v1/engine/connectors/bundle`
    if (connector.packageType === PackageType.ARCHIVE) {
        return `${base}?archiveId=${encodeURIComponent(connector.archiveId)}`
    }
    return `${base}?name=${encodeURIComponent(connector.connectorName)}&version=${encodeURIComponent(connector.connectorVersion)}`
}

async function partitionConnectorsToInstall(rootWorkspace: string, connectors: ConnectorPackage[]): Promise<ConnectorInstallationResult> {
    const connectorsWithCheck = await Promise.all(
        connectors.map(async (connector) => {
            const installed = await connectorCheckIfAlreadyInstalled(rootWorkspace, connector)
            return { connector, installed }
        }),
    )

    const connectorsToInstall = connectorsWithCheck.filter(({ installed }) => !installed).map(({ connector }) => connector)

    return {
        connectorsToInstall,
    }
}

async function connectorCheckIfAlreadyInstalled(rootWorkspace: string, connector: ConnectorPackage): Promise<boolean> {
    const connectorFolder = connectorPath(rootWorkspace, connector)
    if (usedConnectorsMemoryCache[connectorFolder]) {
        return true
    }
    const readyExists = await fileSystemUtils.fileExists(join(connectorFolder, 'ready'))
    if (!readyExists) {
        return false
    }
    const nodeModulesExist = await fileSystemUtils.fileExists(join(connectorFolder, 'node_modules'))
    if (!nodeModulesExist) {
        await rm(join(connectorFolder, 'ready'), { force: true })
        return false
    }
    usedConnectorsMemoryCache[connectorFolder] = true
    return true
}

async function markConnectorsAsUsed(rootWorkspace: string, connectors: ConnectorPackage[]): Promise<void> {
    const writeToDiskJobs = connectors.map(async (connector) => {
        const connectorFolder = connectorPath(rootWorkspace, connector)
        await fileSystemUtils.threadSafeMkdir(connectorFolder)
        await writeFileAtomic(
            join(connectorFolder, 'ready'),
            'true',
        )
    })
    await Promise.all(writeToDiskJobs)
}

type InstallParams = {
    connectors: ConnectorPackage[]
    includeFilters: boolean
    publicApiUrl: string
    engineToken: string
}

type BundleSource = {
    publicApiUrl: string
    engineToken: string
}

type ConnectorInstallationResult = {
    connectorsToInstall: ConnectorPackage[]
}
