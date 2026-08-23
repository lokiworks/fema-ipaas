import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import { buildPackage, findConnector, findConnectors } from '../utils/connector-utils';
import { makeFolderRecursive, readPackageJson } from '../utils/files';
import { join } from 'node:path';
import { exec } from '../utils/exec';
import { connectorTranslation } from '@fema/connector-sdk';
import { MAX_KEY_LENGTH_FOR_CORWDIN } from '@fema/shared';

const findConnectorInModule= async (connectorOutputFile: string) => {
    const module = await import(connectorOutputFile);
    const exports = Object.values(module);
    for (const e of exports) {
      if (e !== null && e !== undefined && e.constructor.name === 'Connector') {
          return e 
      }
      }
  
      throw new Error(`Connector not found in module, please check the connector output file ${connectorOutputFile}`);
}

const installDependencies = async (connectorFolder: string) => {
    console.log(chalk.blue(`Installing dependencies ${connectorFolder}`))
    await exec(`bun install`, {cwd: connectorFolder,})
    console.log(chalk.green(`Dependencies installed ${connectorFolder}`))
}


function getPropertyValue(object: Record<string, unknown>, path: string): unknown {
  const parsedKeys = path.split('.');
  if (parsedKeys[0] === '*') {
    return Object.values(object).map(item => getPropertyValue(item as Record<string, unknown>, parsedKeys.slice(1).join('.'))).filter(Boolean).flat()
  }
  const nextObject = object[parsedKeys[0]] as Record<string, unknown>;
  if (nextObject && parsedKeys.length > 1) {
    return getPropertyValue(nextObject, parsedKeys.slice(1).join('.'));
  }
  return nextObject;
}

const generateTranslationFileFromConnector = (connector: Record<string, unknown>) => { const translation: Record<string, string> = {}
  try {
    connectorTranslation.pathsToValuesToTranslate.forEach(path => {
      const value = getPropertyValue(connector, path)
      if (value) {
        if (typeof value === 'string') {
          translation[value.slice(0, MAX_KEY_LENGTH_FOR_CORWDIN)] = value
        }
        else if (Array.isArray(value)) {
          value.forEach(item => {
            translation[item.slice(0, MAX_KEY_LENGTH_FOR_CORWDIN)] = item
          })
        }
      }
    })
  }
  catch (err) {
    console.error(`error generating translation file for connector ${connector.name}:`, err)
  }

  return translation
}



const generateTranslationFile = async (connectorName: string) => {
  const connectorRoot = await findConnector(connectorName)
  const packageJson = await readPackageJson(connectorRoot)
  await buildPackage(packageJson.name)
  try{
    await installDependencies(connectorRoot)
    const connectorFromModule = await findConnectorInModule(connectorRoot);
    const i18n = generateTranslationFileFromConnector({actions: (connectorFromModule as any)._actions, triggers: (connectorFromModule as any)._triggers, description: (connectorFromModule as any).description, displayName: (connectorFromModule as any).displayName, auth: (connectorFromModule as any).auth});
    const i18nFolder = join(connectorRoot, 'src', 'i18n')
    await makeFolderRecursive(i18nFolder);
    await writeFile(join(i18nFolder, 'translation.json'), JSON.stringify(i18n, null, 2));
    console.log(chalk.yellow('✨'), `Translation file for connector created in ${i18nFolder}`);
  } catch (error) {
    console.error(chalk.red('❌'), `Error generating translation file for connector ${connectorName}, make sure you built the connector`,error);
  }
};


export const generateTranslationFileForConnectorCommand = new Command('generate-translation-file')
  .description('Generate i18n for a connector')
  .argument('<connectorName>', 'The name of the connector to generate i18n for')
  .action(async (connectorName: string) => {
    await generateTranslationFile(connectorName);
  });
  export const generateTranslationFileForAllConnectorsCommand = new Command('generate-translation-file-for-all-connectors')
  .description('Generate i18n for all connectors')
  .requiredOption('--shard-index <shardIndex>', 'Zero-based shard index to process', (value) => parseInt(value, 10))
  .requiredOption('--shard-total <shardTotal>', 'Total number of shards', (value) => parseInt(value, 10))
  .action(async ({shardIndex, shardTotal}: { shardIndex: number; shardTotal: number }) => {
    const connectorsDirectory = join(process.cwd(), 'packages', 'connectors', 'community')
    const connectors = (await findConnectors(connectorsDirectory)).map(connector => connector.split('/').pop());
    let totalTime = 0
    let indexAcrossAllConnectors = 0
    for (const connector of connectors) {
      if ((indexAcrossAllConnectors % shardTotal) !== shardIndex) {
        indexAcrossAllConnectors++
        continue
      }
      const time= performance.now()
      await generateTranslationFile(connector);
      console.log(chalk.yellow('✨'), `Translation file for connector ${connector} created in ${(performance.now() - time)/1000}s`)
      totalTime += (performance.now() - time)/1000
      indexAcrossAllConnectors++
    }
    console.log(chalk.yellow('✨'), `Total time taken to generate translation files for selected connectors: ${totalTime}s`)
  });
