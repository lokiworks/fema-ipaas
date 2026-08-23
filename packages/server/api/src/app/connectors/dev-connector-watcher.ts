import { spawn } from 'node:child_process'
import { copyFile, cp } from 'node:fs/promises'
import { join } from 'path'
import { isNil } from '@fema-ipaas/core-utils'
import { memoryLock } from '@fema-ipaas/server-utils'
import { WebsocketClientEvent } from '@fema-ipaas/shared'
import chokidar from 'chokidar'
import { FastifyInstance } from 'fastify'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { invalidateDevConnectorCache } from './metadata/utils/connector-cache-utils'
import { fileConnectorsUtils } from './metadata/utils/file-connectors-utils'

const CONNECTORS_BUILDER_MUTEX_KEY = 'connectors-builder'

async function buildConnectors(app: FastifyInstance, connectorsInfo: ConnectorInfo[]): Promise<void> {
    if (connectorsInfo.length === 0) return

    for (const connector of connectorsInfo) {
        if (!/^[A-Za-z0-9-]+$/.test(connector.connectorName)) {
            throw new Error(`Connector package name contains invalid character: ${connector.connectorName}`)
        }
    }

    const connectorFilters = connectorsInfo.map(p => `--filter=${p.packageName}`)
    const filterArgs = [
        '--filter=@fema-ipaas/connector-sdk',
        '--filter=@fema-ipaas/connector-common',
        '--filter=@fema-ipaas/shared',
        ...connectorFilters,
        '--force',
    ]
    app.log.info(`Building ${connectorsInfo.length} connector(s): ${connectorsInfo.map(p => p.connectorName).join(',')}...`)

    const lock = await memoryLock.acquire(CONNECTORS_BUILDER_MUTEX_KEY)
    try {
        const startTime = performance.now()
        await spawnAndWait('npx', ['turbo', 'run', 'build', ...filterArgs])
        const buildTime = (performance.now() - startTime) / 1000

        app.log.info(`Build completed in ${buildTime.toFixed(2)} seconds`)

        const utils = fileConnectorsUtils(app.log)
        await Promise.all(connectorsInfo.map(async (connector) => {
            await copyPackageJsonToDist(connector.connectorDirectory)
            await copyI18nToDist(connector.connectorDirectory)
            const distPath = await utils.findDistConnectorPathByPackageName(connector.packageName)
            if (distPath) {
                utils.clearConnectorModuleCache(distPath)
            }
        }))

        invalidateDevConnectorCache()
        app.io.emit(WebsocketClientEvent.REFRESH_CONNECTOR)
        app.log.info('Changes are ready! Please refresh the frontend to see the new updates.')
    }
    catch (error) {
        app.log.error({ error }, 'Failed to run build process...')
    }
    finally {
        await lock.release()
    }
}

export async function startDevConnectorWatcher(app: FastifyInstance): Promise<void> {
    const devConnectorsConfig = system.get(AppSystemProp.DEV_CONNECTORS)
    if (isNil(devConnectorsConfig) || devConnectorsConfig.trim() === '') return

    const connectorsNames = [...new Set(devConnectorsConfig.split(',').map(n => n.trim()))]
    const utils = fileConnectorsUtils(app.log)

    const resolvedInfos = await Promise.all(connectorsNames.map(async (connectorName) => {
        const connectorDirectory = await utils.findSourceConnectorPathByConnectorName(connectorName)
        if (isNil(connectorDirectory)) {
            app.log.warn(`Connector directory not found for: ${connectorName}`)
            return null
        }
        const packageName = await utils.getPackageNameFromFolderPath(connectorDirectory)
        return { connectorName, connectorDirectory, packageName }
    }))
    const connectorInfos: ConnectorInfo[] = resolvedInfos.filter((info): info is ConnectorInfo => info !== null)

    if (connectorInfos.length === 0) return

    const rebuilding = new Set<string>()
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
    const pendingRebuild = new Set<string>()

    const watchPaths = connectorInfos.flatMap(p => [
        join(p.connectorDirectory, 'src'),
        join(p.connectorDirectory, 'package.json'),
    ])

    const triggerBuild = async (connectorInfo: ConnectorInfo) => {
        rebuilding.add(connectorInfo.connectorName)
        try {
            await buildConnectors(app, [connectorInfo])
        }
        finally {
            rebuilding.delete(connectorInfo.connectorName)
        }
        if (pendingRebuild.has(connectorInfo.connectorName)) {
            pendingRebuild.delete(connectorInfo.connectorName)
            void triggerBuild(connectorInfo)
        }
    }

    const watcher = chokidar.watch(watchPaths, { ignoreInitial: true })

    watcher.on('all', (_event, filePath) => {
        const connectorInfo = connectorInfos.find(p => filePath.startsWith(p.connectorDirectory))
        if (!connectorInfo) return

        clearTimeout(debounceTimers.get(connectorInfo.connectorName))
        debounceTimers.set(connectorInfo.connectorName, setTimeout(() => {
            debounceTimers.delete(connectorInfo.connectorName)
            if (rebuilding.has(connectorInfo.connectorName)) {
                pendingRebuild.add(connectorInfo.connectorName)
                return
            }
            void triggerBuild(connectorInfo)
        }, 300))
    })

    watcher.on('error', (error) => {
        app.log.error({ error }, 'File watcher error')
    })

    for (const connectorInfo of connectorInfos) {
        app.log.info(`Watching for changes: ${connectorInfo.connectorName}`)
    }

    const cleanup = async () => {
        await watcher.close()
        for (const timer of debounceTimers.values()) {
            clearTimeout(timer)
        }
    }
    process.once('SIGINT', () => void cleanup())
    process.once('SIGTERM', () => void cleanup())
}

function spawnAndWait(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: false,
        })
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
            }
            else {
                reject(new Error(`Command "${cmd}" exited with code ${code}`))
            }
        })
        child.on('error', reject)
    })
}

async function copyPackageJsonToDist(sourceDir: string): Promise<void> {
    const distDir = join(sourceDir, 'dist')
    await copyFile(join(sourceDir, 'package.json'), join(distDir, 'package.json'))
}

async function copyI18nToDist(sourceDir: string): Promise<void> {
    const i18nSrc = join(sourceDir, 'src', 'i18n')
    const distDir = join(sourceDir, 'dist')
    try {
        await cp(i18nSrc, join(distDir, 'src', 'i18n'), { recursive: true })
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
}

type ConnectorInfo = {
    packageName: string
    connectorName: string
    connectorDirectory: string
}
