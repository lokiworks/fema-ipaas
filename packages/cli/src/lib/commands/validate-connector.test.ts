import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { validateConnector } from './validate-connector'

async function connectorFolder(packageJson: unknown): Promise<string> {
    const folder = await mkdtemp(path.join(tmpdir(), 'connector-validate-'))
    await writeFile(path.join(folder, 'package.json'), JSON.stringify(packageJson), 'utf-8')
    return folder
}

const VALID = {
    name: '@fema-ipaas/connector-example',
    version: '1.0.0',
    main: './src/index.js',
    dependencies: { '@fema-ipaas/connector-sdk': 'workspace:*', axios: '1.6.0' },
}

describe('validateConnector', () => {
    it('accepts a well-formed connector package', async () => {
        expect(await validateConnector(await connectorFolder(VALID))).toEqual([])
    })

    it('reports a missing package.json rather than throwing', async () => {
        const folder = await mkdtemp(path.join(tmpdir(), 'connector-validate-empty-'))
        expect(await validateConnector(folder)).toHaveLength(1)
    })

    it('rejects a name outside the connector scope', async () => {
        const problems = await validateConnector(await connectorFolder({ ...VALID, name: 'example' }))
        expect(problems).toContain('name must start with @fema-ipaas/connector-')
    })

    it('rejects a non-exact version', async () => {
        const problems = await validateConnector(await connectorFolder({ ...VALID, version: '^1.0.0' }))
        expect(problems).toContain('version must be an exact semver, e.g. 1.0.0')
    })

    it('rejects a dependency on the thick shared package', async () => {
        const problems = await validateConnector(await connectorFolder({
            ...VALID,
            dependencies: { '@fema-ipaas/shared': 'workspace:*' },
        }))
        expect(problems).toContain('connectors must not depend on @fema-ipaas/shared — use @fema-ipaas/connector-sdk')
    })

    it('rejects unpinned third-party dependencies but allows workspace ranges', async () => {
        const problems = await validateConnector(await connectorFolder({
            ...VALID,
            dependencies: { '@fema-ipaas/connector-sdk': 'workspace:*', axios: '^1.6.0' },
        }))
        expect(problems).toEqual(['dependencies must be pinned to exact versions: axios'])
    })
})
