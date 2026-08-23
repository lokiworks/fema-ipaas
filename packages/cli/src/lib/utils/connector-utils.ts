import { readdir, stat } from 'node:fs/promises'
import * as path from 'path'
import { cwd } from 'node:process'
import { readPackageJson } from './files'
import { exec } from './exec'
import axios from 'axios'
import chalk from 'chalk'
import FormData from 'form-data';
import fs from 'fs';
import { prepareConnectorDistForPublish } from './prepare-connector-utils';

export const connectorsPath = () => path.join(cwd(), 'packages', 'connectors')
export const customConnectorPath = () => path.join(connectorsPath(), 'custom')

/**
 * Finds and returns the paths of specific connectors or all available connectors in a given directory.
 *
 * @param inputPath - The root directory to search for connectors. If not provided, a default path to custom connectors is used.
 * @param connectors - An optional array of connector names to search for. If not provided, all connectors in the directory are returned.
 * @returns A promise resolving to an array of strings representing the paths of the found connectors.
 */
export async function findConnectors(inputPath?: string, connectors?: string[]): Promise<string[]> {
    const connectorsPath = inputPath ?? customConnectorPath()
    const connectorsFolders = await traverseFolder(connectorsPath)
    if (connectors) {
        return connectors.flatMap((connector) => {
          const folder = connectorsFolders.find((p) => {
              const normalizedPath = path.normalize(p);
              return normalizedPath.endsWith(path.sep + connector);
          });
          if (!folder) {
              return [];
          }
          return [folder];
      });
    } else {
        return connectorsFolders
    }
}

/**
 * Finds and returns the path of a single connector. Exits the process if the connector is not found.
 *
 * @param connectorName - The name of the connector to search for.
 * @returns A promise resolving to a string representing the path of the found connector. If not found, the process exits.
 */
export async function findConnector(connectorName: string): Promise<string | null> {
    return (await findConnectors(connectorsPath(), [connectorName]))[0] ?? null;
}

export async function buildConnector(connectorFolder: string): Promise<{ outputFolder: string, outputFile: string }> {
    const packageJson = await readPackageJson(connectorFolder);

    await buildPackage(packageJson.name);

    const compiledPath = `packages/${removeStartingSlashes(connectorFolder).split(path.sep + 'packages')[1]}/dist`;

    await prepareConnectorDistForPublish(connectorFolder);

    const { stdout } = await exec('npm pack --json', { cwd: compiledPath });
    const tarFileName = JSON.parse(stdout)[0].filename;
    return {
        outputFolder: compiledPath,
        outputFile: path.join(compiledPath, tarFileName)
    };
}

export async function buildPackage(packageName: string) {
    await exec(`npx turbo run build --filter=${packageName} --force`);
    return {
        outputFolder: `dist/packages/${packageName}`,
    }
}

export async function publishConnectorFromFolder(
    {connectorFolder, apiUrl, apiKey, failOnError}:
  {connectorFolder: string,
  apiUrl: string,
  apiKey: string,
  failOnError: boolean,}
) {
    const packageJson = await readPackageJson(connectorFolder);

    await buildPackage(packageJson.name);

    const { outputFile } = await buildConnector(connectorFolder);
    const formData = new FormData();

    console.log(chalk.blue(`Uploading ${outputFile}`));
    formData.append('connectorArchive', fs.createReadStream(outputFile));
    formData.append('connectorName', packageJson.name);
    formData.append('connectorVersion', packageJson.version);
    formData.append('packageType', 'ARCHIVE');
    formData.append('scope', 'TENANT');

    try {
        await axios.post(`${apiUrl}/v1/connectors`, formData, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...formData.getHeaders()
            }
        });
        console.info(chalk.green(`Connector '${packageJson.name}' published.`));
    } catch (error) {
     
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 409) {
                console.info(chalk.yellow(`Connector '${packageJson.name}' and '${packageJson.version}' already published.`));
            } else if (error.response && Math.floor(error.response.status / 100) !== 2) {
                console.info(chalk.red(`Error publishing connector '${packageJson.name}',  ${error}` ));
                if (failOnError) {
                    console.info(chalk.yellow(`Terminating process due to publish failure for connector '${packageJson.name}' (fail-on-error is enabled)`));
                    process.exit(1);
                }
            } else {
                console.error(chalk.red(`Unexpected error: ${error.message}`));
                if (failOnError) {
                    console.info(chalk.yellow(`Terminating process due to unexpected error for connector '${packageJson.name}' (fail-on-error is enabled)`));
                    process.exit(1);
                }
            }
        } else {
            console.error(chalk.red(`Unexpected error: ${error.message}`));
            if (failOnError) {
              console.info(chalk.yellow(`Terminating process due to unexpected error for connector '${packageJson.name}' (fail-on-error is enabled)`));
              process.exit(1);
            }
        }
    }
}
async function traverseFolder(folderPath: string): Promise<string[]> {
    const paths: string[] = []
    const directoryExists = await stat(folderPath).catch(() => null)

    if (directoryExists && directoryExists.isDirectory()) {
        const files = await readdir(folderPath)

        for (const file of files) {
            const filePath = path.join(folderPath, file)
            const fileStats = await stat(filePath)
            if (fileStats.isDirectory() && file !== 'node_modules' && file !== 'dist') {
                paths.push(...await traverseFolder(filePath))
            }
            else if (file === 'package.json') {
                paths.push(folderPath)
            }
        }
    }
    return paths
}

export function displayNameToKebabCase(displayName: string): string {
    return displayName.toLowerCase().replace(/\s+/g, '-');
}

export function displayNameToCamelCase(input: string): string {
    const words = input.split(' ');
    const camelCaseWords = words.map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      } else {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
    });
    return camelCaseWords.join('');
  }

export const assertConnectorExists = async (connectorName: string | null) => {
    if (!connectorName) {
      console.error(chalk.red(`🚨 Connector ${connectorName} not found`));
      process.exit(1);
    }
  };


  export const removeStartingSlashes = (str: string) => {
    return str.startsWith('/') ? str.slice(1) : str;
  }

