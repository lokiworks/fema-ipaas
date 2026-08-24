import path from 'node:path'
import chalk from 'chalk'
import { Command } from 'commander'
import { assertConnectorExists, buildPackage, findConnector } from '../utils/connector-utils'
import { readPackageJson } from '../utils/files'

const DEBOUNCE_MS = 300

export const devConnectorCommand = new Command('dev')
    .description('Rebuild a connector whenever its source changes')
    .argument('<name>', 'connector folder name, e.g. google-drive')
    .action(async (name: string) => {
        const connectorFolder = await findConnector(name)
        await assertConnectorExists(connectorFolder)
        const packageJson = await readPackageJson(connectorFolder as string)
        const sourceFolder = path.join(connectorFolder as string, 'src')

        await rebuild(packageJson.name)
        console.info(chalk.gray(`Watching ${sourceFolder}. Ctrl-C to stop.`))

        const { watch } = await import('node:fs')
        let pending: NodeJS.Timeout | null = null
        watch(sourceFolder, { recursive: true }, () => {
            if (pending !== null) {
                clearTimeout(pending)
            }
            // Editors write a file in several syscalls and formatters touch many files at once,
            // so a rebuild per event would queue builds behind a single save.
            pending = setTimeout(() => {
                pending = null
                void rebuild(packageJson.name)
            }, DEBOUNCE_MS)
        })
    })

async function rebuild(packageName: string): Promise<void> {
    const startedAt = Date.now()
    try {
        await buildPackage(packageName)
        console.info(chalk.green(`Rebuilt ${packageName} in ${Date.now() - startedAt}ms`))
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`Build failed: ${message}`))
    }
}
