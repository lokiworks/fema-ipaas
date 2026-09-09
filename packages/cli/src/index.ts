import { Command } from 'commander';
import { createActionCommand } from './lib/commands/create-action';
import { createConnectorCommand } from './lib/commands/create-connector';
import { createTriggerCommand } from './lib/commands/create-trigger';
import { syncConnectorCommand } from './lib/commands/sync-connectors';
import { publishConnectorCommand } from './lib/commands/publish-connector';
import { buildConnectorCommand } from './lib/commands/build-connector';
import { bundleConnectorCommand } from './lib/commands/bundle-connector';
import { migrateConnectorCommand } from './lib/commands/migrate-connector';
import { packConnectorCommand } from './lib/commands/pack-connector';
import { validateConnectorCommand } from './lib/commands/validate-connector';
import { devConnectorCommand } from './lib/commands/dev-connector';
import { testConnectorCommand } from './lib/commands/test-connector';
import { generateWorkerTokenCommand } from './lib/commands/generate-worker-token';
import { generateTranslationFileForAllConnectorsCommand, generateTranslationFileForConnectorCommand } from './lib/commands/generate-translation-file-for-connector';
import { benchmarkCommand } from './lib/commands/benchmark';

const connectorCommand = new Command('connectors')
  .description('Manage connectors');

connectorCommand.addCommand(createConnectorCommand);
connectorCommand.addCommand(syncConnectorCommand);
connectorCommand.addCommand(publishConnectorCommand);
connectorCommand.addCommand(buildConnectorCommand);
connectorCommand.addCommand(bundleConnectorCommand);
connectorCommand.addCommand(migrateConnectorCommand);
connectorCommand.addCommand(validateConnectorCommand);
connectorCommand.addCommand(devConnectorCommand);
connectorCommand.addCommand(testConnectorCommand);
connectorCommand.addCommand(packConnectorCommand);
connectorCommand.addCommand(generateTranslationFileForConnectorCommand);
connectorCommand.addCommand(generateTranslationFileForAllConnectorsCommand);
const actionCommand = new Command('actions')
  .description('Manage actions');

actionCommand.addCommand(createActionCommand);

const triggerCommand = new Command('triggers')
  .description('Manage triggers')

triggerCommand.addCommand(createTriggerCommand)


const workerCommand = new Command('workers')
  .description('Manage workers')

workerCommand.addCommand(generateWorkerTokenCommand)

const projectCommand = new Command('project')
  .description('Manage projects')


const program = new Command();

program.version('0.0.1').description('FEMA Integration Platform CLI');

program.addCommand(connectorCommand);
program.addCommand(actionCommand);
program.addCommand(triggerCommand);
program.addCommand(workerCommand);
program.addCommand(projectCommand);
program.addCommand(benchmarkCommand);
program.parse(process.argv);
