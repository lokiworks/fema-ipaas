import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cwd } from 'node:process'
import chalk from 'chalk'
import { Command } from 'commander'

export const validateConnectorCommand = new Command('validate')
    .description('Check a connector package for the metadata the registry requires')
    .argument('[path]', 'path to the connector folder')
    .action(async (connectorPath?: string) => {
        const folder = connectorPath ?? cwd()
        const problems = await validateConnector(folder)
        if (problems.length === 0) {
            console.info(chalk.green(`${folder} looks publishable.`))
            return
        }
        for (const problem of problems) {
            console.error(chalk.red(`✖ ${problem}`))
        }
        process.exitCode = 1
    })

export async function validateConnector(folder: string): Promise<string[]> {
    const raw = await readFile(path.join(folder, 'package.json'), 'utf-8').catch(() => null)
    if (raw === null) {
        return [`No package.json in ${folder}`]
    }
    const packageJson = JSON.parse(raw)
    const problems: string[] = []
    if (typeof packageJson.name !== 'string' || !packageJson.name.startsWith('@fema-ipaas/connector-')) {
        problems.push('name must start with @fema-ipaas/connector-')
    }
    if (typeof packageJson.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
        problems.push('version must be an exact semver, e.g. 1.0.0')
    }
    if (typeof packageJson.main !== 'string') {
        problems.push('main is required so the registry can load the built entry point')
    }
    const dependencies: Record<string, string> = packageJson.dependencies ?? {}
    const forbidden = Object.keys(dependencies).filter((dependency) => dependency === '@fema-ipaas/shared')
    if (forbidden.length > 0) {
        problems.push('connectors must not depend on @fema-ipaas/shared — use @fema-ipaas/connector-sdk')
    }
    const wildcards = Object.entries(dependencies)
        .filter(([name, range]) => !name.startsWith('@fema-ipaas/') && /[\^~*x]/.test(range))
        .map(([name]) => name)
    if (wildcards.length > 0) {
        problems.push(`dependencies must be pinned to exact versions: ${wildcards.join(', ')}`)
    }
    return problems
}
