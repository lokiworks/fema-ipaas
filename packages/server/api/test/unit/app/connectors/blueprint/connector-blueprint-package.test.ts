import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { blueprintFactory, BlueprintHttpMethod } from '@fema-ipaas/shared'
import { connectorBlueprintPackage } from '../../../../../src/app/connectors/blueprint/connector-blueprint-package'

const definition = {
    ...blueprintFactory.definition({ displayName: '工单系统', description: '内部工单', iconColor: '#16A34A', baseUrl: 'https://tickets.example.com' }),
    operations: [blueprintFactory.operation({ key: 'list', name: '列表', method: BlueprintHttpMethod.GET, path: '/tickets', group: '' })],
}

describe('connectorBlueprintPackage', () => {
    it('writes an npm-style tarball that the system tar can read', () => {
        const manifest = connectorBlueprintPackage.manifest({ identifier: 'tickets', connectorName: '@fema-ipaas/connector-custom-tickets', packageVersion: '1.2.0', definition, draft: false })
        const archive = connectorBlueprintPackage.archive(manifest)
        const directory = mkdtempSync(join(tmpdir(), 'blueprint-package-'))
        try {
            const archivePath = join(directory, 'bundle.tgz')
            writeFileSync(archivePath, archive)
            const listing = execFileSync('tar', ['-tzf', archivePath]).toString('utf8').trim().split('\n')
            expect(listing).toEqual(['package/package.json', 'package/index.js', 'package/blueprint.json'])
            execFileSync('tar', ['-xzf', archivePath, '-C', directory])
            expect(JSON.parse(readFileSync(join(directory, 'package/package.json'), 'utf8'))).toEqual({ name: '@fema-ipaas/connector-custom-tickets', version: '1.2.0', main: 'index.js', private: true })
            expect(JSON.parse(readFileSync(join(directory, 'package/blueprint.json'), 'utf8')).definition.operations[0].key).toBe('list')
            expect(readFileSync(join(directory, 'package/index.js'), 'utf8')).toContain('globalThis.__femaConnectorBlueprintRuntime')
        }
        finally {
            rmSync(directory, { recursive: true, force: true })
        }
    })

    it('is byte-for-byte deterministic so an unchanged draft reuses its build', () => {
        const manifest = connectorBlueprintPackage.manifest({ identifier: 'tickets', connectorName: 'x', packageVersion: '1.0.0', definition, draft: true })
        expect(gunzipSync(connectorBlueprintPackage.archive(manifest)).equals(gunzipSync(connectorBlueprintPackage.archive(manifest)))).toBe(true)
        const first = connectorBlueprintPackage.draftVersion(definition)
        expect(connectorBlueprintPackage.draftVersion(definition)).toEqual(first)
        expect(first.packageVersion).toMatch(/^0\.0\.\d+$/)
        expect(connectorBlueprintPackage.draftVersion({ ...definition, baseUrl: 'https://other.example.com' }).hash).not.toBe(first.hash)
    })

    it('renders a letter logo as a data URL', () => {
        const logo = connectorBlueprintPackage.logoUrl({ displayName: 'crm', iconColor: '#E11D48' })
        const svg = Buffer.from(logo.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8')
        expect(svg).toContain('fill="#E11D48"')
        expect(svg).toContain('>C</text>')
        expect(connectorBlueprintPackage.logoUrl({ displayName: '<x>', iconColor: 'red' })).not.toContain('<x>')
    })
})
