import { Command } from "commander";
import { publishConnectorFromFolder, findConnector, assertConnectorExists } from '../utils/connector-utils';
import chalk from "chalk";
import inquirer from 'inquirer';
import * as dotenv from 'dotenv';

dotenv.config({path: 'packages/server/api/.env'});

async function publishConnector(
    {apiUrl, apiKey, connectorName, failOnError}:
    {apiUrl: string,
    apiKey: string,
    connectorName: string,
    failOnError: boolean,}
) {
    const connectorFolder = await findConnector(connectorName);
    assertConnectorExists(connectorFolder)
    await publishConnectorFromFolder({
        connectorFolder,
        apiUrl,
        apiKey,
        failOnError
    });
}

function assertNullOrUndefinedOrEmpty(value: any, message: string) {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        console.error(chalk.red(message));
        process.exit(1);
    }
}

export const publishConnectorCommand = new Command('publish')
    .description('Publish connectors to the tenant')
    .option('-f, --fail-on-error', 'Exit the process if an error occurs while syncing a connector', false)
    .action(async (command) => {
        const questions = [
            {
                type: 'input',
                name: 'name',
                message: 'Enter the connector folder name',
                placeholder: 'google-drive',
            },
            {
                type: 'input',
                name: 'apiUrl',
                message: 'Enter the API URL',
                placeholder: 'https://github.com/lokiworks/fema-ipaas/api',
            },
            {
                type: 'list',
                name: 'apiKeySource',
                message: 'Select the API Key source',
                choices: ['Env Variable (FEMA_API_KEY)', 'Manually'],
                default: 'Env Variable (FEMA_API_KEY)'
            }
        ]

        const answers = await inquirer.prompt(questions);
        if (answers.apiKeySource === 'Manually') {
            const apiKeyAnswers = await inquirer.prompt([{
                type: 'input',
                name: 'apiKey',
                message: 'Enter the API Key',
            }]);
            answers.apiKey = apiKeyAnswers.apiKey;
        }
        const apiKey = answers.apiKeySource === 'Env Variable (FEMA_API_KEY)' ? process.env.FEMA_API_KEY : answers.apiKey;
        assertNullOrUndefinedOrEmpty(answers.name, 'Connector name is required');
        assertNullOrUndefinedOrEmpty(answers.apiUrl, 'API URL is required');
        assertNullOrUndefinedOrEmpty(apiKey, 'API Key is required');
        const apiUrlWithoutTrailSlash = answers.apiUrl.replace(/\/$/, '');
        const { failOnError } = command;

        await publishConnector({
            apiUrl: apiUrlWithoutTrailSlash,
            apiKey,
            connectorName: answers.name,
            failOnError
        });
    });
