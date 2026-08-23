import fs from 'fs/promises'
import path from 'path'
import { isNil } from '@fema-ipaas/core-utils'
import { EngineGenericError, getConnectorNameFromAlias, getPackageAliasForConnector, trimVersionFromAlias } from '@fema-ipaas/shared'
import { utils } from '../../utils'
import { ConnectorRef } from './connector-runner'

export const connectorPath = {
    resolve: async ({ connectorName, connectorVersion, devConnectors }: ConnectorRef): Promise<string> => {
        const packageName = getPackageAlias({ connectorName, connectorVersion, devConnectors })
        const connectorPath = devConnectors.includes(getConnectorNameFromAlias(packageName))
            ? await findInDistFolder(packageName)
            : await traverseAllParentFoldersToFindConnector(packageName)
        if (isNil(connectorPath)) {
            throw new EngineGenericError('ConnectorNotFoundError', `Connector not found for package: ${packageName}`)
        }
        return connectorPath
    },

}

function getPackageAlias({ connectorName, connectorVersion, devConnectors }: ConnectorRef): string {
    if (devConnectors.includes(getConnectorNameFromAlias(connectorName))) {
        return connectorName
    }

    return getPackageAliasForConnector({
        connectorName,
        connectorVersion,
    })
}

async function findInDistFolder(packageName: string): Promise<string | null> {
    const sourceConnectorsPath = path.resolve('packages/connectors')
    if (!await utils.folderExists(sourceConnectorsPath)) {
        return null
    }
    const distPackageJsonPaths = await findDistPackageJsonFiles(sourceConnectorsPath)
    for (const packageJsonPath of distPackageJsonPaths) {
        const { data: result } = await utils.tryCatchAndThrowOnEngineError(async () => {
            const content = await fs.readFile(packageJsonPath, 'utf-8')
            const packageJson = JSON.parse(content)
            if (packageJson.name === packageName) {
                return path.join(path.dirname(packageJsonPath), 'src', 'index.js')
            }
            return null
        })
        if (result) {
            return result
        }
    }
    return null
}

async function findDistPackageJsonFiles(dirPath: string): Promise<string[]> {
    const results: string[] = []
    const ignoredDirs = ['node_modules', '.turbo', 'framework', 'common']

    async function scanDir(currentPath: string): Promise<void> {
        const items = await fs.readdir(currentPath, { withFileTypes: true })
        for (const item of items) {
            if (!item.isDirectory() || ignoredDirs.includes(item.name)) {
                continue
            }
            const fullPath = path.join(currentPath, item.name)
            if (item.name === 'dist') {
                const pkgJson = path.join(fullPath, 'package.json')
                if (await utils.folderExists(pkgJson)) {
                    results.push(pkgJson)
                }
            }
            else {
                await scanDir(fullPath)
            }
        }
    }

    await scanDir(dirPath)
    return results
}


async function traverseAllParentFoldersToFindConnector(packageName: string): Promise<string | null> {
    const trimmedName = trimVersionFromAlias(packageName)
    const customPaths = (process.env.FEMA_CUSTOM_CONNECTORS_PATHS ?? '').split(':').filter(Boolean)
    for (const customPath of customPaths) {
        const entry = await resolveInstalledConnectorEntry(path.resolve(customPath, 'connectors', packageName), trimmedName)
        if (!isNil(entry)) {
            return entry
        }
    }

    const rootDir = path.parse(__dirname).root
    let currentDir = __dirname
    const maxIterations = currentDir.split(path.sep).length
    for (let i = 0; i < maxIterations; i++) {
        const entry = await resolveInstalledConnectorEntry(path.resolve(currentDir, 'connectors', packageName), trimmedName)
        if (!isNil(entry)) {
            return entry
        }

        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir || currentDir === rootDir) {
            break
        }
        currentDir = parentDir
    }
    return null
}

// A connector entry is resolved from its package.json "main" (defaulting to src/index.js).
// Registry/dev installs keep the package nested in node_modules; a packed-archive bundle is
// extracted straight to the install-folder root. Try the nested package first, then the root.
async function resolveInstalledConnectorEntry(connectorFolder: string, trimmedName: string): Promise<string | null> {
    const packageDir = path.join(connectorFolder, 'node_modules', trimmedName)
    if (await utils.folderExists(packageDir)) {
        return resolveEntryFromPackageDir(packageDir)
    }
    // Only return an entry that actually exists: a half-installed registry folder also has a
    // stub package.json (no "main") at this point, for which resolveEntryFromPackageDir would
    // otherwise return a non-existent src/index.js — fall through to a clean ConnectorNotFoundError.
    const rootManifest = path.join(connectorFolder, 'package.json')
    if (await utils.folderExists(rootManifest)) {
        const rootEntry = await resolveEntryFromPackageDir(connectorFolder)
        if (await utils.folderExists(rootEntry)) {
            return rootEntry
        }
    }
    return null
}

async function resolveEntryFromPackageDir(packageDir: string): Promise<string> {
    const { data: mainEntry } = await utils.tryCatchAndThrowOnEngineError(async () => {
        const packageJson = JSON.parse(await fs.readFile(path.join(packageDir, 'package.json'), 'utf-8'))
        if (isNil(packageJson.main)) {
            return null
        }
        const resolved = path.join(packageDir, packageJson.main)
        return await utils.folderExists(resolved) ? resolved : null
    })
    return mainEntry ?? path.join(packageDir, 'src', 'index.js')
}
