import { access } from 'node:fs/promises'
import path from 'node:path'
import chalk from 'chalk'
import { Command } from 'commander'
import { readPackageJson } from '../utils/files'
import { assertConnectorExists, buildPackage, findConnector } from '../utils/connector-utils'

export const testConnectorCommand = new Command('test')
    .description('Run one action of a connector and print what it returns')
    .argument('<name>', 'connector folder name, e.g. google-drive')
    .requiredOption('--action <actionName>', 'action to run')
    .option('--props <json>', 'action input as JSON', '{}')
    .option('--auth <json>', 'auth value as JSON')
    .option('--skip-build', 'use the existing build instead of rebuilding first')
    .action(async (name: string, options: TestOptions) => {
        const connectorFolder = await findConnector(name)
        await assertConnectorExists(connectorFolder)

        if (!options.skipBuild) {
            const packageJson = await readPackageJson(connectorFolder as string)
            await buildPackage(packageJson.name)
        }

        const connector = await loadConnector(connectorFolder as string)
        const result = await runConnectorAction({
            connector,
            actionName: options.action,
            propsValue: parseJson(options.props ?? '{}', '--props'),
            auth: options.auth === undefined ? undefined : parseJson(options.auth, '--auth'),
        })
        console.info(JSON.stringify(result, null, 2))
    })

export async function runConnectorAction({ connector, actionName, propsValue, auth }: RunConnectorActionParams): Promise<unknown> {
    const metadata = connector.metadata()
    const action = metadata.actions?.[actionName]
    if (action === undefined) {
        const available = Object.keys(metadata.actions ?? {})
        throw new Error(`${metadata.name} has no action named ${actionName}. Available: ${available.join(', ') || 'none'}`)
    }
    const { createMockActionContext } = await import('@fema-ipaas/connector-sdk')
    const context = createMockActionContext({ propsValue })
    return action.run({ ...context, auth })
}

export async function loadConnector(connectorFolder: string): Promise<ConnectorShape> {
    const distEntry = path.join(connectorFolder, 'dist', 'src', 'index.js')
    // Checked separately so that a connector whose own module throws on load reports its own
    // error instead of being reported as an unbuilt connector.
    const built = await access(distEntry).then(() => true).catch(() => false)
    if (!built) {
        throw new Error(`No build found at ${distEntry}. Drop --skip-build, or run the build first.`)
    }
    const imported = await import(distEntry)
    const exported = Object.values(imported).find(isConnectorLike)
    if (exported === undefined) {
        throw new Error(`Could not find a connector export in ${distEntry}`)
    }
    return exported
}

function isConnectorLike(value: unknown): value is ConnectorShape {
    return typeof value === 'object' && value !== null && 'metadata' in value && typeof Reflect.get(value, 'metadata') === 'function'
}

function parseJson(raw: string, flag: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('not an object')
        }
        return parsed
    }
    catch {
        console.error(chalk.red(`${flag} must be a JSON object`))
        process.exit(1)
    }
}

type TestOptions = {
    action: string
    props?: string
    auth?: string
    skipBuild?: boolean
}

type RunConnectorActionParams = {
    connector: ConnectorShape
    actionName: string
    propsValue: Record<string, unknown>
    auth?: unknown
}

export type ConnectorShape = {
    metadata: () => {
        name: string
        actions?: Record<string, { run: (context: unknown) => Promise<unknown> }>
    }
}
