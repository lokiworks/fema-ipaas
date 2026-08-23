import { Command } from "commander";
import { buildConnector, findConnector } from '../utils/connector-utils';
import chalk from "chalk";
import inquirer from "inquirer";

async function buildConnectors(connectorName: string) {
    const connectorFolder = await findConnector(connectorName);
    const { outputFolder } = await buildConnector(connectorFolder);
    console.info(chalk.green(`Connector '${connectorName}' built and packed successfully at ${outputFolder}.`));
}

export const buildConnectorCommand = new Command('build')
    .description('Build connectors without publishing')
    .argument('[name]', 'name of the connector to build')
    .option('--name <connectorName>', 'name of the connector to build')
    .action(async (positionalName, options) => {
        const connectorName = positionalName ?? options.name;
        const questions = [
            {
                type: 'input',
                name: 'name',
                message: 'Enter the connector folder name',
                placeholder: 'google-drive',
                when() {
                    return !connectorName
                }
            },
        ];
        const answers = await inquirer.prompt(questions);
        await buildConnectors(connectorName ?? answers.name);
    });
