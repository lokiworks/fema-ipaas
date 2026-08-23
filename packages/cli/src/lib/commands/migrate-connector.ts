import { basename } from 'node:path'
import { Command } from 'commander'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { findConnector, findConnectors, connectorsPath } from '../utils/connector-utils'
import { migrateConnectorUtils } from '../utils/migrate-connector-utils'

function reportMigration({ connectorFolder, label, dryRun }: { connectorFolder: string, label: string, dryRun: boolean }): void {
    const report = migrateConnectorUtils.migrateConnector({ connectorPath: connectorFolder, dryRun })
    const changes = report.repointedFiles.length + (report.manifestChanged ? 1 : 0) + (report.eslintChanged ? 1 : 0)
    if (changes === 0) {
        console.info(chalk.gray(`• ${label} — already conformant`))
        return
    }
    console.info(chalk.green(`${dryRun ? '[dry run] ' : ''}✓ ${label}`))
    if (report.repointedFiles.length > 0) {
        console.info(`    repointed imports in ${report.repointedFiles.length} file(s) → @fema-ipaas/connector-sdk`)
    }
    if (report.manifestChanged) {
        console.info('    updated package.json (dropped shared, added core build deps, moved tslib to devDependencies, added bundle script)')
    }
    if (report.eslintChanged) {
        console.info('    added the import-boundary lint rule')
    }
}

async function migrateByName({ connectorName, dryRun }: { connectorName: string, dryRun: boolean }): Promise<void> {
    const connectorFolder = await findConnector(connectorName)
    if (!connectorFolder) {
        console.error(chalk.red(`🚨 Connector '${connectorName}' not found under packages/connectors`))
        process.exit(1)
    }
    reportMigration({ connectorFolder, label: connectorName, dryRun })
}

async function migrateAll({ dryRun }: { dryRun: boolean }): Promise<void> {
    const folders = await findConnectors(connectorsPath())
    console.info(chalk.blue(`Migrating ${folders.length} connector(s)${dryRun ? ' (dry run)' : ''}...`))
    for (const folder of folders) {
        reportMigration({ connectorFolder: folder, label: basename(folder), dryRun })
    }
}

export const migrateConnectorCommand = new Command('migrate')
    .description('Migrate a connector to the self-contained bundle model: repoint imports to @fema-ipaas/connector-sdk, fix package.json, and add the import-boundary lint rule')
    .argument('[name]', 'name of the connector to migrate')
    .option('--name <connectorName>', 'name of the connector to migrate')
    .option('--all', 'migrate every connector under packages/connectors')
    .option('--dry-run', 'report the changes without writing them')
    .action(async (positionalName, options) => {
        const dryRun = options.dryRun ?? false
        if (options.all) {
            await migrateAll({ dryRun })
        }
        else {
            const connectorName = positionalName ?? options.name ?? (await inquirer.prompt([
                { type: 'input', name: 'name', message: 'Enter the connector folder name' },
            ])).name
            await migrateByName({ connectorName, dryRun })
        }
        if (!dryRun) {
            console.info(chalk.yellow('\nNext: build the connector to verify, e.g. `npm run build-connector <name>`'))
        }
    })
