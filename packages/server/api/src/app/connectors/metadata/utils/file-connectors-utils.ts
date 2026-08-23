import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cwd } from 'node:process'
import { sep } from 'path'
import { Connector, ConnectorMetadata, connectorTranslation } from '@fema-ipaas/connector-sdk'
import { extractConnectorFromModule } from '@fema-ipaas/shared'
import clearModule from 'clear-module'
import { FastifyBaseLogger } from 'fastify'
import { AppSystemProp, environmentVariables } from '../../../helper/system/system-props'

const SOURCE_CONNECTORS_PATH = resolve(cwd(), 'packages', 'connectors')

export const fileConnectorsUtils = (log: FastifyBaseLogger) => ({

    getPackageNameFromFolderPath: async (folderPath: string): Promise<string> => {
        const packageJson = await readFile(join(folderPath, 'package.json'), 'utf-8').then(JSON.parse)
        return packageJson.name
    },

    getConnectorDependencies: async (folderPath: string): Promise<Record<string, string> | null> => {
        try {
            const packageJson =  await readFile(join(folderPath, 'package.json'), 'utf-8').then(JSON.parse)
            if (!packageJson.dependencies) {
                return null
            }
            return packageJson.dependencies
        }
        catch (e) {
            return null
        }
    },

    findDistConnectorPathByPackageName: async (packageName: string): Promise<string | null> => {
        const paths = await findAllDistConnectorsFolders(SOURCE_CONNECTORS_PATH)
        for (const path of paths) {
            try {
                const packageJsonName = await fileConnectorsUtils(log).getPackageNameFromFolderPath(path)
                if (packageJsonName === packageName) {
                    return path
                }
            }
            catch (e) {
                log.error({
                    name: 'findDistConnectorPathByPackageName',
                    message: JSON.stringify(e),
                }, 'Error finding dist connector path by package name')
            }
        }
        return null
    },

    findSourceConnectorPathByConnectorName: async (connectorName: string): Promise<string | null> => {
        const connectorsPath = await findAllConnectorsFolder(SOURCE_CONNECTORS_PATH)
        const connectorPath = connectorsPath.find((p) => p.endsWith(sep + connectorName))
        return connectorPath ?? null
    },

    loadDistConnectorsMetadata: async (connectorsNames: string[]): Promise<ConnectorMetadata[]> => {
        try {
            const devConnectors = await findAllDistConnectorsFolders(SOURCE_CONNECTORS_PATH)
            const paths = devConnectors.filter(path => connectorsNames.some(name => path.endsWith(sep + name + sep + 'dist')))
            const connectors = await Promise.all(paths.map((p) => loadConnectorFromFolder(p)))
            return connectors.filter((p): p is ConnectorMetadata => p !== null)
        }
        catch (e) {
            const err = e as Error
            log.warn({ error: err }, '[fileConnectorMetadataService#loadDistConnectorsMetadata] Failed to load connectors from folder')
            return []
        }
    },


    clearConnectorModuleCache: (distFolderPath: string): void => {
        const indexPath = join(distFolderPath, 'src', 'index')
        const packageJsonPath = join(distFolderPath, 'package.json')
        clearModule(indexPath)
        clearModule(packageJsonPath)
    },
})

const findAllConnectorsFolder = async (folderPath: string): Promise<string[]> => {
    const paths = []
    const files = await readdir(folderPath)

    const ignoredFiles = ['node_modules', 'dist', 'framework', 'common']
    for (const file of files) {
        const filePath = join(folderPath, file)
        const fileStats = await stat(filePath)
        if (
            fileStats.isDirectory() &&
            !ignoredFiles.includes(file)
        ) {
            paths.push(...(await findAllConnectorsFolder(filePath)))
        }
        else if (file === 'package.json') {
            paths.push(folderPath)
        }
    }
    return paths
}

const findAllDistConnectorsFolders = async (sourceConnectorsPath: string): Promise<string[]> => {
    const sourceFolders = await findAllConnectorsFolder(sourceConnectorsPath)
    const distFolders = []
    for (const folder of sourceFolders) {
        const distPath = join(folder, 'dist')
        try {
            const distStats = await stat(distPath)
            if (distStats.isDirectory()) {
                distFolders.push(distPath)
            }
        }
        catch {
            // dist folder doesn't exist for this connector, skip
        }
    }
    return distFolders
}

const loadConnectorFromFolder = async (
    folderPath: string,
): Promise<ConnectorMetadata | null> => {
    const indexPath = join(folderPath, 'src', 'index')
    const packageJsonPath = join(folderPath, 'package.json')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const packageJson = require(packageJsonPath)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require(indexPath)
    const { name: connectorName, version: connectorVersion } = packageJson
    const connector = extractConnectorFromModule<Connector>({
        module,
        connectorName,
        connectorVersion,
    })
    const originalMetadata = connector.metadata()
    const loadTranslations = environmentVariables.getBooleanEnvironment(AppSystemProp.LOAD_TRANSLATIONS_FOR_DEV_CONNECTORS)
    const i18n = loadTranslations ? await connectorTranslation.initializeI18n(folderPath) : undefined
    const metadata: ConnectorMetadata = {
        ...originalMetadata,
        name: connectorName,
        version: connectorVersion,
        authors: connector.authors,
        directoryPath: folderPath,
        i18n,
    }

    return metadata
}