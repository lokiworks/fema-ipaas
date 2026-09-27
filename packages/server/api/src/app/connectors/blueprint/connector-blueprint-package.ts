import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { ConnectorBlueprintDefinition, ConnectorBlueprintManifest } from '@fema-ipaas/shared'

export const connectorBlueprintPackage = {
    manifest({ identifier, connectorName, packageVersion, definition, draft }: ManifestParams): ConnectorBlueprintManifest {
        return {
            schemaVersion: MANIFEST_SCHEMA_VERSION,
            identifier,
            connectorName,
            packageVersion,
            logoUrl: connectorBlueprintPackage.logoUrl({ displayName: definition.displayName, iconColor: definition.iconColor }),
            draft,
            definition,
        }
    },
    archive(manifest: ConnectorBlueprintManifest): Buffer {
        const packageJson = JSON.stringify({ name: manifest.connectorName, version: manifest.packageVersion, main: 'index.js', private: true }, null, 2)
        return gzipSync(tarOf([
            { path: 'package/package.json', content: Buffer.from(`${packageJson}\n`, 'utf8') },
            { path: 'package/index.js', content: Buffer.from(ENTRY_SOURCE, 'utf8') },
            { path: 'package/blueprint.json', content: Buffer.from(JSON.stringify(manifest), 'utf8') },
        ]))
    },
    draftVersion(definition: ConnectorBlueprintDefinition): { hash: string, packageVersion: string } {
        const hash = createHash('sha256').update(JSON.stringify(definition)).digest('hex')
        return { hash, packageVersion: `0.0.${parseInt(hash.slice(0, 8), 16)}` }
    },
    logoUrl({ displayName, iconColor }: { displayName: string, iconColor: string }): string {
        const letter = [...displayName.trim()][0] ?? '?'
        const text = /[a-z]/.test(letter) ? letter.toUpperCase() : letter
        const color = /^#[0-9a-fA-F]{3,8}$/.test(iconColor) ? iconColor : DEFAULT_ICON_COLOR
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="43" font-size="30" font-family="sans-serif" text-anchor="middle" fill="#ffffff">${escapeXml(text)}</text></svg>`
        return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
    },
    tarOf,
}

function tarOf(entries: TarEntry[]): Buffer {
    const blocks = entries.flatMap((entry) => [headerOf(entry), padded(entry.content)])
    return Buffer.concat([...blocks, Buffer.alloc(BLOCK_SIZE * 2)])
}

function headerOf(entry: TarEntry): Buffer {
    const header = Buffer.alloc(BLOCK_SIZE)
    writeField({ header, offset: 0, length: 100, value: entry.path })
    writeField({ header, offset: 100, length: 8, value: '0000644\0' })
    writeField({ header, offset: 108, length: 8, value: '0000000\0' })
    writeField({ header, offset: 116, length: 8, value: '0000000\0' })
    writeField({ header, offset: 124, length: 12, value: `${entry.content.length.toString(8).padStart(11, '0')}\0` })
    writeField({ header, offset: 136, length: 12, value: `${'0'.padStart(11, '0')}\0` })
    writeField({ header, offset: 148, length: 8, value: '        ' })
    writeField({ header, offset: 156, length: 1, value: '0' })
    writeField({ header, offset: 257, length: 6, value: 'ustar\0' })
    writeField({ header, offset: 263, length: 2, value: '00' })
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    writeField({ header, offset: 148, length: 8, value: `${checksum.toString(8).padStart(6, '0')}\0 ` })
    return header
}

function writeField({ header, offset, length, value }: { header: Buffer, offset: number, length: number, value: string }): void {
    Buffer.from(value, 'utf8').copy(header, offset, 0, length)
}

function padded(content: Buffer): Buffer {
    const remainder = content.length % BLOCK_SIZE
    return remainder === 0 ? content : Buffer.concat([content, Buffer.alloc(BLOCK_SIZE - remainder)])
}

function escapeXml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const BLOCK_SIZE = 512
const MANIFEST_SCHEMA_VERSION = 1
const DEFAULT_ICON_COLOR = '#2563EB'
const ENTRY_SOURCE = `"use strict";
const manifest = require("./blueprint.json");
const runtime = globalThis.__femaConnectorBlueprintRuntime;
if (!runtime || typeof runtime.build !== "function") {
  throw new Error("This connector was built with the connector devkit and can only run inside the platform engine");
}
exports.connector = runtime.build(manifest);
`

type ManifestParams = {
    identifier: string
    connectorName: string
    packageVersion: string
    definition: ConnectorBlueprintDefinition
    draft: boolean
}

type TarEntry = {
    path: string
    content: Buffer
}
