
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { resolve, join, relative, dirname } from 'node:path'
import { cwd } from 'node:process'
import * as semver from 'semver'
import { tryCatch } from '@fema/core-utils'
import { readPackageJson } from './files'
import { StatusCodes } from 'http-status-codes'
import { connectorTranslation, ConnectorMetadata } from '@fema/connector-sdk'

const LOAD_CONNECTOR_METADATA_CHILD = resolve(
    __dirname,
    '..',
    'connectors',
    'load-connector-metadata-child.mjs',
)

type LoadedConnectorChildPayload = {
    metadata: Omit<ConnectorMetadata, 'name' | 'version'>;
    minimumSupportedRelease: string | null;
    maximumSupportedRelease: string | null;
    authors: string[];
};

export const FEMA_CLOUD_API_BASE = 'https://github.com/lokiworks/fema-ipaas/api/v1';
export const CONNECTORS_FOLDER = 'packages/connectors'
export const COMMUNITY_CONNECTOR_FOLDER = 'packages/connectors/community'
export const NON_CONNECTORS_PACKAGES = ['@fema/connector-sdk', '@fema/connector-common']

const validateSupportedRelease = (minRelease: string | undefined, maxRelease: string | undefined) => {
    if (minRelease !== undefined && !semver.valid(minRelease)) {
        throw Error(`[validateSupportedRelease] "minimumSupportedRelease" should be a valid semver version`)
    }

    if (maxRelease !== undefined && !semver.valid(maxRelease)) {
        throw Error(`[validateSupportedRelease] "maximumSupportedRelease" should be a valid semver version`)
    }

    if (minRelease !== undefined && maxRelease !== undefined && semver.gt(minRelease, maxRelease)) {
        throw Error(`[validateSupportedRelease] "minimumSupportedRelease" should be less than "maximumSupportedRelease"`)
    }
}

const validateMetadata = (connectorMetadata: ConnectorMetadata): void => {
    console.info(`[validateMetadata] connectorName=${connectorMetadata.name}`)
    validateSupportedRelease(
        connectorMetadata.minimumSupportedRelease,
        connectorMetadata.maximumSupportedRelease,
    )
}


export function getCommunityConnectorFolder(connectorName: string): string {
    return join(COMMUNITY_CONNECTOR_FOLDER, connectorName)
}


export async function findAllConnectorsDirectoryInSource(): Promise<string[]> {
    const connectorsPath = resolve(cwd(), 'packages', 'connectors')
    const paths = await traverseFolder(connectorsPath)
    return paths.map(p => relative(cwd(), p))
}

export const connectorMetadataExists = async (
    connectorName: string,
    connectorVersion: string
): Promise<boolean> => {
    const cloudResponse = await fetch(
        `${FEMA_CLOUD_API_BASE}/connectors/${connectorName}?version=${connectorVersion}`
    );

    const connectorExist: Record<number, boolean> = {
        [StatusCodes.OK]: true,
        [StatusCodes.NOT_FOUND]: false
    };

    if (
        connectorExist[cloudResponse.status] === null ||
        connectorExist[cloudResponse.status] === undefined
    ) {
        throw new Error(await cloudResponse.text());
    }

    return connectorExist[cloudResponse.status];
};

export async function findNewConnectors(): Promise<FindNewConnectorsResult> {
    const changedDistPaths = getChangedConnectorsDistPaths()
    const paths = changedDistPaths ?? await findAllDistPaths()

    console.info(`[findNewConnectors] scanning ${paths.length} dist paths${changedDistPaths ? ' (scoped to changed)' : ' (all)'}`)

    const connectors: ConnectorMetadata[] = []
    const failures: ConnectorLoadFailure[] = []

    // Adding batches because of memory limit when we have a lot of connectors
    const batchSize = 75
    for (let i = 0; i < paths.length; i += batchSize) {
        const batch = paths.slice(i, i + batchSize)
        const batchResults = await Promise.all(batch.map(async (folderPath) => {
            const { data, error } = await tryCatch(async () => {
                const packageJson = await readPackageJson(folderPath);
                if (NON_CONNECTORS_PACKAGES.includes(packageJson.name)) {
                    return null;
                }
                const exists = await connectorMetadataExists(packageJson.name, packageJson.version)
                if (exists) {
                    return null;
                }
                return loadConnectorFromFolder(folderPath)
            })
            if (error !== null) {
                return { path: folderPath, error: error.message } satisfies ConnectorLoadFailure
            }
            return data
        }))

        for (const result of batchResults) {
            if (result === null) {
                continue
            }
            if ('error' in result) {
                failures.push(result)
            }
            else {
                connectors.push(result)
            }
        }
    }

    return { connectors, failures };
}

function getChangedConnectorsDistPaths(): string[] | null {
    const changedConnectors = process.env['CHANGED_CONNECTORS']
    if (!changedConnectors || changedConnectors.trim() === '') {
        return null
    }
    return changedConnectors.split('\n').filter(Boolean).map(p => {
        return resolve(cwd(), p, 'dist')
    }).filter(p => {
        const exists = existsSync(join(p, 'package.json'))
        if (!exists) {
            console.info(`[getChangedConnectorsDistPaths] skipping, no build output at ${p}`)
        }
        return exists
    })
}

async function findAllDistPaths(): Promise<string[]> {
    const sourceConnectorsPath = resolve(cwd(), 'packages', 'connectors')
    const sourceFolders = await traverseFolder(sourceConnectorsPath)
    const distPaths: string[] = []
    for (const folder of sourceFolders) {
        const distPath = join(folder, 'dist')
        const distPackageJson = join(distPath, 'package.json')
        if (existsSync(distPackageJson)) {
            distPaths.push(distPath)
        }
    }
    return distPaths
}

async function traverseFolder(folderPath: string): Promise<string[]> {
    const paths: string[] = []
    const directoryExists = await stat(folderPath).catch(() => null)

    if (directoryExists && directoryExists.isDirectory()) {
        const files = await readdir(folderPath)

        for (const file of files) {
            const filePath = join(folderPath, file)
            const fileStats = await stat(filePath)
            if (fileStats.isDirectory() && file !== 'node_modules' && file !== 'dist') {
                paths.push(...await traverseFolder(filePath))
            }
            else if (file === 'package.json') {
                paths.push(folderPath)
            }
        }
    }
    return paths
}

async function loadConnectorFromFolder(folderPath: string): Promise<ConnectorMetadata> {
    const packageJson = await readPackageJson(folderPath);
    const payload = loadConnectorViaChildProcess(folderPath);
    const connectorSourcePath = dirname(folderPath)
    const i18n = await connectorTranslation.initializeI18n(connectorSourcePath)
    const metadata: ConnectorMetadata = {
        ...payload.metadata,
        name: packageJson.name,
        version: packageJson.version,
        i18n,
        authors: payload.authors,
        directoryPath: folderPath,
        minimumSupportedRelease: payload.minimumSupportedRelease ?? '0.0.0',
        maximumSupportedRelease: payload.maximumSupportedRelease ?? '99999.99999.9999',
    };

    validateMetadata(metadata);
    return metadata;
}

function loadConnectorViaChildProcess(folderPath: string): LoadedConnectorChildPayload {
    const stdout = execFileSync('node', [LOAD_CONNECTOR_METADATA_CHILD, folderPath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: 64 * 1024 * 1024,
    })
    return JSON.parse(stdout) as LoadedConnectorChildPayload
}

type ConnectorLoadFailure = {
    path: string
    error: string
}

type FindNewConnectorsResult = {
    connectors: ConnectorMetadata[]
    failures: ConnectorLoadFailure[]
}

