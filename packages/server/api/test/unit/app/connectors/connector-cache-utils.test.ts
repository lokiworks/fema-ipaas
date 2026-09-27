import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { env, mockListBuiltInConnectorNames, mockLoadDistConnectorsMetadata } = vi.hoisted(() => ({
    env: new Map<string, string>(),
    mockListBuiltInConnectorNames: vi.fn(async () => ['feishu', 'http']),
    mockLoadDistConnectorsMetadata: vi.fn(async () => [
        { name: '@fema-ipaas/connector-feishu', version: '1.2.3' },
        { name: '@fema-ipaas/connector-http', version: '0.11.19' },
    ]),
}))

vi.mock('../../../../src/app/helper/system/system', () => ({
    system: {
        get: (prop: string): string | undefined => env.get(prop),
        getBoolean: (prop: string): boolean | undefined => env.has(prop) ? env.get(prop) === 'true' : undefined,
    },
}))

vi.mock('../../../../src/app/connectors/metadata/utils/file-connectors-utils', () => ({
    fileConnectorsUtils: (): { listBuiltInConnectorNames: typeof mockListBuiltInConnectorNames, loadDistConnectorsMetadata: typeof mockLoadDistConnectorsMetadata } => ({
        listBuiltInConnectorNames: mockListBuiltInConnectorNames,
        loadDistConnectorsMetadata: mockLoadDistConnectorsMetadata,
    }),
}))

vi.mock('../../../../src/app/connectors/metadata/connector-cache', () => ({}))

const log = { warn: vi.fn(), info: vi.fn() } as unknown as FastifyBaseLogger

async function loadUtils(): Promise<typeof import('../../../../src/app/connectors/metadata/utils/connector-cache-utils')> {
    vi.resetModules()
    return import('../../../../src/app/connectors/metadata/utils/connector-cache-utils')
}

describe('localConnectorNames', () => {
    beforeEach(() => {
        env.clear()
        mockListBuiltInConnectorNames.mockClear()
    })

    it('uses every built connector when FEMA_DEV_CONNECTORS is unset', async () => {
        const utils = await loadUtils()
        expect(await utils.localConnectorNames(log)).toEqual(['feishu', 'http'])
    })

    it('uses the explicit dev list when FEMA_DEV_CONNECTORS is set', async () => {
        env.set('DEV_CONNECTORS', ' feishu ,')
        const utils = await loadUtils()
        expect(await utils.localConnectorNames(log)).toEqual(['feishu'])
        expect(mockListBuiltInConnectorNames).not.toHaveBeenCalled()
    })

    it('loads nothing when FEMA_DEV_CONNECTORS is an empty string', async () => {
        env.set('DEV_CONNECTORS', '')
        const utils = await loadUtils()
        expect(await utils.loadLocalConnectors(log)).toEqual([])
    })
})

describe('findBundledReplacement', () => {
    beforeEach(() => {
        env.clear()
    })

    it.each([
        ['1.2.0', '1.2.3'],
        ['1.2.3', '1.2.3'],
        ['1.0.0', '1.2.3'],
        ['~1.1.0', '1.2.3'],
    ])('resolves pinned %s to the bundled %s in the same major', async (pinned, bundled) => {
        const utils = await loadUtils()
        const connector = await utils.findBundledReplacement({ log, name: '@fema-ipaas/connector-feishu', version: pinned })
        expect(connector?.version).toBe(bundled)
    })

    it.each([
        ['a newer pin than the bundle', '@fema-ipaas/connector-feishu', '1.3.0'],
        ['a different major', '@fema-ipaas/connector-feishu', '2.0.0'],
        ['an older major', '@fema-ipaas/connector-feishu', '0.9.0'],
        ['an unknown connector', '@fema-ipaas/connector-slack', '1.2.3'],
        ['an invalid version', '@fema-ipaas/connector-feishu', 'latest-ish'],
        ['no version', '@fema-ipaas/connector-feishu', undefined],
    ])('returns nothing for %s', async (_case, name, version) => {
        const utils = await loadUtils()
        expect(await utils.findBundledReplacement({ log, name, version })).toBeUndefined()
    })
})
