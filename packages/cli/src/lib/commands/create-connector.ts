import chalk from 'chalk';
import { Command } from 'commander';
import { mkdir, readdir, writeFile } from 'fs/promises';
import inquirer from 'inquirer';
import path from 'node:path';

const validateConnectorName = async (connectorName: string) => {
  console.log(chalk.yellow('Validating connector name....'));
  const connectorNamePattern = /^(?![._])[a-z0-9-]{1,214}$/;
  if (!connectorNamePattern.test(connectorName)) {
    console.log(
      chalk.red(
        `🚨 Invalid connector name: ${connectorName}. Connector names can only contain lowercase letters, numbers, and hyphens.`
      )
    );
    process.exit(1);
  }
};

const validatePackageName = async (packageName: string) => {
  console.log(chalk.yellow('Validating package name....'));
  const packageNamePattern = /^(?:@[a-zA-Z0-9-]+\/)?[a-zA-Z0-9-]+$/;
  if (!packageNamePattern.test(packageName)) {
    console.log(
      chalk.red(
        `🚨 Invalid package name: ${packageName}. Package names can only contain lowercase letters, numbers, and hyphens.`
      )
    );
    process.exit(1);
  }
};

const checkIfConnectorExists = async (connectorName: string, connectorType: string) => {
  const connectorPath = path.resolve('packages', 'connectors', connectorType, connectorName);
  try {
    await readdir(connectorPath);
    console.log(chalk.red(`🚨 Connector already exists at ${connectorPath}`));
    process.exit(1);
  } catch {
    // Directory does not exist, which is expected
  }
};

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const scaffoldConnector = async (
  connectorName: string,
  packageName: string,
  connectorType: string
) => {
  const baseDir = path.resolve('packages', 'connectors', connectorType, connectorName);
  const srcDir = path.join(baseDir, 'src');
  const libDir = path.join(srcDir, 'lib');
  const i18nDir = path.join(srcDir, 'i18n');

  // Create directory structure
  await mkdir(libDir, { recursive: true });
  await mkdir(i18nDir, { recursive: true });

  // Create package.json
  const packageJson = {
    name: packageName,
    version: '0.0.1',
    type: 'commonjs',
    main: './dist/src/index.js',
    types: './dist/src/index.d.ts',
    dependencies: {
      '@fema-ipaas/connector-common': 'workspace:*',
      '@fema-ipaas/connector-sdk': 'workspace:*',
      '@fema-ipaas/connector-types': 'workspace:*',
      '@fema-ipaas/core-utils': 'workspace:*',
    },
    devDependencies: {
      tslib: '2.6.2',
    },
    scripts: {
      build: 'tsc -p tsconfig.lib.json && cp package.json dist/',
      bundle: 'node ../../../../dist/packages/cli/src/index.js connectors bundle',
      lint: "eslint 'src/**/*.ts'",
    },
  };
  await writeFile(
    path.join(baseDir, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n'
  );

  // Create tsconfig.json
  const tsconfig = {
    extends: '../../../../tsconfig.base.json',
    compilerOptions: {
      module: 'commonjs',
      forceConsistentCasingInFileNames: true,
      strict: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
    },
    files: [],
    include: [],
    references: [{ path: './tsconfig.lib.json' }],
  };
  await writeFile(
    path.join(baseDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2) + '\n'
  );

  // Create tsconfig.lib.json
  const tsconfigLib = {
    extends: './tsconfig.json',
    compilerOptions: {
      rootDir: '.',
      baseUrl: '.',
      paths: {},
      outDir: './dist',
      declaration: true,
      declarationMap: true,
      types: ['node'],
    },
    include: ['src/**/*.ts'],
    exclude: ['jest.config.ts', 'src/**/*.spec.ts', 'src/**/*.test.ts'],
  };
  await writeFile(
    path.join(baseDir, 'tsconfig.lib.json'),
    JSON.stringify(tsconfigLib, null, 2) + '\n'
  );

  // Create .eslintrc.json
  const eslintConfig = {
    extends: ['../../../../.eslintrc.json'],
    ignorePatterns: ['!**/*'],
    overrides: [
      { files: ['*.ts', '*.tsx', '*.js', '*.jsx'], rules: {} },
      {
        files: ['*.ts', '*.tsx'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                'lodash',
                'lodash/*',
                '@fema-ipaas/core-*',
                '@fema-ipaas/server*',
                '@fema-ipaas/engine',
                '@fema-ipaas/shared',
              ],
            },
          ],
        },
      },
      { files: ['*.js', '*.jsx'], rules: {} },
    ],
  };
  await writeFile(
    path.join(baseDir, '.eslintrc.json'),
    JSON.stringify(eslintConfig, null, 2) + '\n'
  );

  // Create index.ts
  const connectorNameCamelCase = connectorName
    .split('-')
    .map((s, i) => {
      if (i === 0) {
        return s;
      }
      return s[0].toUpperCase() + s.substring(1);
    })
    .join('');

  const indexTemplate = `import { createConnector, ConnectorAuth } from '@fema-ipaas/connector-sdk';

export const ${connectorNameCamelCase} = createConnector({
  displayName: '${capitalizeFirstLetter(connectorName)}',
  description: '',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.fema.local/connectors/${connectorName}.png',
  authors: [],
  actions: [],
  triggers: [],
});
`;

  await writeFile(path.join(srcDir, 'index.ts'), indexTemplate);
};

export const createConnector = async (
  connectorName: string,
  packageName: string,
  connectorType: string
) => {
  await validateConnectorName(connectorName);
  await validatePackageName(packageName);
  await checkIfConnectorExists(connectorName, connectorType);
  await scaffoldConnector(connectorName, packageName, connectorType);
  console.log(chalk.green('✨  Done!'));
  console.log(
    chalk.yellow(
      `The connector has been generated at: packages/connectors/${connectorType}/${connectorName}`
    )
  );
};

export const createConnectorCommand = new Command('create')
  .description('Create a new connector')
  .action(async () => {
    const questions = [
      {
        type: 'input',
        name: 'connectorName',
        message: 'Enter the connector name:',
      },
      {
        type: 'input',
        name: 'packageName',
        message: 'Enter the package name:',
        default: (answers: Record<string, string>) =>
          `@fema-ipaas/connector-${answers.connectorName}`,
        when: (answers: Record<string, string>) =>
          answers.connectorName !== undefined,
      },
      {
        type: 'list',
        name: 'connectorType',
        message: 'Select the connector type:',
        choices: ['community', 'custom'],
        default: 'community',
      },
    ];

    const answers = await inquirer.prompt(questions);
    createConnector(answers.connectorName, answers.packageName, answers.connectorType);
  });
