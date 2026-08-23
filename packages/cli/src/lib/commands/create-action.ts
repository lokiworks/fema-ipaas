import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { assertConnectorExists, displayNameToCamelCase, displayNameToKebabCase, findConnector } from '../utils/connector-utils';
import { checkIfFileExists, makeFolderRecursive } from '../utils/files';
import { join } from 'node:path';

function createActionTemplate(displayName: string, description: string) {
  const camelCase = displayNameToCamelCase(displayName)
  const actionTemplate = `import { createAction, Property } from '@fema-ipaas/connector-sdk';

export const ${camelCase} = createAction({
  // auth: check https://github.com/lokiworks/fema-ipaas/docs/developers/connector-reference/authentication,
  name: '${camelCase}',
  displayName: '${displayName}',
  description: '${description}',
  props: {},
  async run() {
    // Action logic here
  },
});
`;

  return actionTemplate
}

const checkIfActionExists = async (actionPath: string) => {
  if (await checkIfFileExists(actionPath)) {
    console.log(chalk.red(`🚨 Action already exists at ${actionPath}`));
    process.exit(1);
  }
}
const createAction = async (connectorName: string, displayActionName: string, actionDescription: string) => {
  const actionTemplate = createActionTemplate(displayActionName, actionDescription)
  const actionName = displayNameToKebabCase(displayActionName)
  const connectorFolder = await findConnector(connectorName);
  assertConnectorExists(connectorFolder)
  console.log(chalk.blue(`Connector path: ${connectorFolder}`))
  const actionsFolder = join(connectorFolder, 'src', 'lib', 'actions')
  const actionPath = join(actionsFolder, `${actionName}.ts`)
  await checkIfActionExists(actionPath)

  await makeFolderRecursive(actionsFolder);
  await writeFile(actionPath, actionTemplate);
  console.log(chalk.yellow('✨'), `Action ${actionPath} created`);
};


export const createActionCommand = new Command('create')
  .description('Create a new action')
  .action(async () => {
    const questions = [
      {
        type: 'input',
        name: 'connectorName',
        message: 'Enter the connector folder name:',
        placeholder: 'google-drive',
      },
      {
        type: 'input',
        name: 'actionName',
        message: 'Enter the action display name',
      },
      {
        type: 'input',
        name: 'actionDescription',
        message: 'Enter the action description',
      }
    ];

    const answers = await inquirer.prompt(questions);
    createAction(answers.connectorName, answers.actionName, answers.actionDescription);
  });
