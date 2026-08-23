import { cwd } from 'node:process'
import chalk from 'chalk'
import { Command } from 'commander'
import { buildConnector } from '../utils/connector-utils'
import { buildConnectorManifest, writeConnectorManifest } from '../utils/connector-manifest'

export const packConnectorCommand = new Command('pack')
    .description('Build a connector and emit its registry manifest')
    .argument('[path]', 'path to the connector folder')
    .action(async (connectorPath?: string) => {
        const folder = connectorPath ?? cwd()
        const { outputFolder } = await buildConnector(folder)
        const manifest = await buildConnectorManifest(outputFolder)
        const manifestPath = await writeConnectorManifest(outputFolder, manifest)
        console.info(chalk.green(`Packed ${manifest.name}@${manifest.version}`))
        console.info(chalk.gray(`  ${manifest.actions.length} actions, ${manifest.triggers.length} triggers`))
        console.info(chalk.gray(`  manifest: ${manifestPath}`))
    })
