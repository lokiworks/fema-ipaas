import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MANIFEST_SCHEMA_VERSION = '1'
export const MANIFEST_FILE_NAME = 'connector-manifest.json'

export async function buildConnectorManifest(distFolder: string): Promise<ConnectorManifest> {
    const metadata = await readConnectorMetadata(distFolder)
    const packageJson = await readPackageJson(distFolder)
    return {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        name: metadata.name,
        displayName: metadata.displayName,
        version: metadata.version,
        authTypes: authTypesOf(metadata),
        actions: Object.keys(metadata.actions ?? {}),
        triggers: Object.keys(metadata.triggers ?? {}),
        runtime: {
            node: packageJson.engines?.node ?? '>=20',
        },
    }
}

export async function writeConnectorManifest(distFolder: string, manifest: ConnectorManifest): Promise<string> {
    const manifestPath = path.join(distFolder, MANIFEST_FILE_NAME)
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
    return manifestPath
}

async function readConnectorMetadata(distFolder: string): Promise<ConnectorMetadataShape> {
    const modulePath = path.join(distFolder, 'src', 'index.js')
    const imported = await import(modulePath)
    const exported = Object.values(imported).find(isConnectorLike)
    if (exported === undefined) {
        throw new Error(`Could not find a connector export in ${modulePath}`)
    }
    return exported.metadata()
}

async function readPackageJson(distFolder: string): Promise<PackageJsonShape> {
    const raw = await readFile(path.join(distFolder, 'package.json'), 'utf-8')
    return JSON.parse(raw)
}

function isConnectorLike(value: unknown): value is { metadata: () => ConnectorMetadataShape } {
    return typeof value === 'object' && value !== null && 'metadata' in value && typeof Reflect.get(value, 'metadata') === 'function'
}

function authTypesOf(metadata: ConnectorMetadataShape): string[] {
    const auth = metadata.auth
    if (auth === undefined || auth === null) {
        return []
    }
    const entries = Array.isArray(auth) ? auth : [auth]
    return [...new Set(entries.map((entry) => entry.type).filter((type): type is string => typeof type === 'string'))]
}

type ConnectorMetadataShape = {
    name: string
    displayName: string
    version: string
    auth?: { type?: string } | { type?: string }[] | null
    actions?: Record<string, unknown>
    triggers?: Record<string, unknown>
}

type PackageJsonShape = {
    engines?: { node?: string }
}

export type ConnectorManifest = {
    schemaVersion: string
    name: string
    displayName: string
    version: string
    authTypes: string[]
    actions: string[]
    triggers: string[]
    runtime: { node: string }
}
