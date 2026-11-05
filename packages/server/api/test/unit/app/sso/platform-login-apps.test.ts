import { SsoRegion } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ value: null as unknown }))

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({
        findOneBy: async () => (store.value === null ? null : { id: 'PLATFORM_LOGIN_CONFIG', value: store.value }),
        save: async (row: { value: unknown }) => {
            store.value = row.value
        },
    }),
}))
vi.mock('../../../../src/app/helper/encryption', () => ({
    encryptUtils: {
        encryptString: async (value: string) => ({ iv: 'iv', data: `enc:${value}`, keyId: 'current' }),
        decryptString: async (value: { data: string }) => value.data.replace('enc:', ''),
        isEncryptedWithCurrentKey: async (value: { keyId?: string }) => value.keyId === 'current',
    },
}))

async function loadService() {
    const { platformLoginAppsService } = await import('../../../../src/app/sso/platform-login-apps.service')
    return platformLoginAppsService
}

describe('platform login apps', () => {
    beforeEach(() => {
        store.value = null
    })

    it('shows nothing when no app was configured', async () => {
        const service = await loadService()
        expect(await service.listPublic()).toEqual([])
        expect(await service.listEnabledKinds()).toEqual([])
        expect(await service.getRuntime({ kind: 'FEISHU' })).toBeNull()
    })

    it('stores the secret encrypted and never shows it', async () => {
        const service = await loadService()
        const apps = await service.save({ kind: 'FEISHU', request: { enabled: true, appId: 'cli_1', appSecret: 'secret-1', region: 'LARK', allowSelfSignup: true } })
        expect(apps).toEqual([{ kind: 'FEISHU', enabled: true, appId: 'cli_1', hasAppSecret: true, region: 'LARK', allowSelfSignup: true }])
        expect(JSON.stringify(store.value)).not.toContain('"secret-1"')
        expect(JSON.stringify(store.value)).toContain('enc:secret-1')
    })

    it('hands the decrypted secret to the sign-in flow only while the app is on', async () => {
        const service = await loadService()
        await service.save({ kind: 'FEISHU', request: { enabled: true, appId: 'cli_1', appSecret: 'secret-1', region: null, allowSelfSignup: false } })
        expect(await service.getRuntime({ kind: 'FEISHU' })).toEqual({ kind: 'FEISHU', appId: 'cli_1', appSecret: 'secret-1', region: SsoRegion.FEISHU, allowSelfSignup: false })
        await service.save({ kind: 'FEISHU', request: { enabled: false, appId: 'cli_1', region: null, allowSelfSignup: false } })
        expect(await service.getRuntime({ kind: 'FEISHU' })).toBeNull()
        expect(await service.listEnabledKinds()).toEqual([])
    })

    it('keeps the earlier secret when a save carries none', async () => {
        const service = await loadService()
        await service.save({ kind: 'WECOM', request: { enabled: true, appId: 'wwprov', appSecret: 'first', region: null, allowSelfSignup: false } })
        await service.save({ kind: 'WECOM', request: { enabled: true, appId: 'wwprov2', region: null, allowSelfSignup: true } })
        expect((await service.getRuntime({ kind: 'WECOM' }))?.appSecret).toBe('first')
        expect((await service.getRuntime({ kind: 'WECOM' }))?.appId).toBe('wwprov2')
    })

    it('requires a secret the first time', async () => {
        const service = await loadService()
        await expect(service.save({ kind: 'DINGTALK', request: { enabled: true, appId: 'k', region: null, allowSelfSignup: false } })).rejects.toThrow()
    })

    it('lists the enabled kinds and removes one', async () => {
        const service = await loadService()
        await service.save({ kind: 'FEISHU', request: { enabled: true, appId: 'a', appSecret: 's', region: null, allowSelfSignup: false } })
        await service.save({ kind: 'DINGTALK', request: { enabled: false, appId: 'b', appSecret: 's', region: null, allowSelfSignup: false } })
        expect(await service.listEnabledKinds()).toEqual(['FEISHU'])
        expect((await service.remove({ kind: 'FEISHU' })).map((app) => app.kind)).toEqual(['DINGTALK'])
    })

    it('re-encrypts secrets written under an older key', async () => {
        const service = await loadService()
        store.value = { apps: [{ kind: 'FEISHU', enabled: true, appId: 'a', appSecret: { iv: 'iv', data: 'enc:old', keyId: 'retired' }, region: null, allowSelfSignup: false }] }
        expect(await service.rotateSecrets()).toBe(1)
        expect(await service.rotateSecrets()).toBe(0)
        expect((await service.getRuntime({ kind: 'FEISHU' }))?.appSecret).toBe('old')
    })

    it('treats a damaged stored value as no apps', async () => {
        const service = await loadService()
        store.value = { apps: 'broken' }
        expect(await service.listPublic()).toEqual([])
    })
})
