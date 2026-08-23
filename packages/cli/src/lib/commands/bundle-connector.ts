import { cwd } from 'node:process'
import { Command } from 'commander'
import chalk from 'chalk'
import { prepareConnectorDistForPublish } from '../utils/prepare-connector-utils'

async function bundleConnectorInDir(connectorPath: string): Promise<void> {
    await prepareConnectorDistForPublish(connectorPath)
    console.info(chalk.green(`Bundled connector at ${connectorPath}.`))
}

export const bundleConnectorCommand = new Command('bundle')
    .description('Bundle a single connector in place (turbo runs this per package)')
    .argument('[path]', 'path to the connector folder')
    .action(async (connectorPath?: string) => {
        await bundleConnectorInDir(connectorPath ?? cwd())
    })
