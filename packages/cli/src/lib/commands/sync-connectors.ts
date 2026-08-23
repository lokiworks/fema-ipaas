import { Command } from "commander";
import { findConnectors, publishConnectorFromFolder } from '../utils/connector-utils';
import chalk from "chalk";
import { join } from "path";

async function syncConnectors(
  params:
  {apiUrl: string,
  apiKey: string,
  connectors: string[] | null,
  failOnError: boolean,}
) {
  const connectorsDirectory = join(process.cwd(), 'packages', 'connectors', 'custom')
  const connectorFolders = await findConnectors(connectorsDirectory, params.connectors);
    for (const connectorFolder of connectorFolders) {
      await publishConnectorFromFolder({
        connectorFolder,
       ...params
      });
    }
}

export const syncConnectorCommand = new Command('sync')
    .description('Find new connectors versions and sync them with the database')
    .requiredOption('-h, --apiUrl <url>', 'API URL ex: https://github.com/lokiworks/fema-ipaas/api')
    .option('-p, --connectors <connectors...>', 'Specify one or more connector names to sync. ' +
      'If not provided, all custom connectors in the directory will be synced.')
    .option('-f, --fail-on-error', 'Exit the process if an error occurs while syncing a connector', false)
    .action(async (options) => {
        const apiKey = process.env.FEMA_API_KEY;
        const connectors = options.connectors ? [...new Set<string>(options.connectors)] : null;
        const failOnError = options.failOnError;
        if (!apiKey) {
            console.error(chalk.red('FEMA_API_KEY environment variable is required'));
            process.exit(1);
        }
        await syncConnectors({
          apiUrl: options.apiUrl.replace(/\/$/, ''),
          apiKey,
          connectors,
          failOnError
        });
    });
