import { safeHttp } from '@fema-ipaas/server-utils'
import { SsoLoginErrorCode } from '@fema-ipaas/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dingtalkClient } from '../../../../src/app/sso/dingtalk-client'
import { wecomClient } from '../../../../src/app/sso/wecom-client'

describe('wecom client', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('builds the scan-to-login address of a self-built app', () => {
        const url = new URL(wecomClient.buildAuthorizationUrl({ corpId: 'ww1', agentId: '1000002', redirectUri: 'https://ipaas.test/cb', state: 's' }))
        expect(url.searchParams.get('login_type')).toBe('CorpApp')
        expect(url.searchParams.get('appid')).toBe('ww1')
        expect(url.searchParams.get('agentid')).toBe('1000002')
        expect(url.searchParams.get('state')).toBe('s')
    })

    it('builds the scan-to-login address of a service provider', () => {
        const url = new URL(wecomClient.buildProviderAuthorizationUrl({ providerCorpId: 'wwprov', redirectUri: 'https://ipaas.test/cb', state: 's' }))
        expect(url.searchParams.get('login_type')).toBe('ServiceApp')
        expect(url.searchParams.get('appid')).toBe('wwprov')
    })

    it('reads the member id, mail and name and keys the enterprise by corp id', async () => {
        vi.spyOn(safeHttp.axios, 'get').mockImplementation(async (url: string) => {
            if (url.endsWith('/cgi-bin/gettoken')) return { data: { errcode: 0, access_token: 'tok' } }
            if (url.endsWith('/cgi-bin/auth/getuserinfo')) return { data: { errcode: 0, userid: 'zhangsan' } }
            return { data: { errcode: 0, name: '张三', biz_mail: 'Zhang@Acme.test' } }
        })
        const profile = await wecomClient.fetchProfile({ corpId: 'ww1', secret: 'sec', code: 'c' })
        expect(profile).toEqual({ subject: 'zhangsan', email: 'zhang@acme.test', fullName: '张三', enterpriseKey: 'ww1' })
    })

    it('still signs the member in when the contact lookup is not permitted', async () => {
        vi.spyOn(safeHttp.axios, 'get').mockImplementation(async (url: string) => {
            if (url.endsWith('/cgi-bin/gettoken')) return { data: { errcode: 0, access_token: 'tok' } }
            if (url.endsWith('/cgi-bin/auth/getuserinfo')) return { data: { errcode: 0, userid: 'zhangsan' } }
            return { data: { errcode: 60011, errmsg: 'no privilege' } }
        })
        const profile = await wecomClient.fetchProfile({ corpId: 'ww1', secret: 'sec', code: 'c' })
        expect(profile.email).toBe('')
        expect(profile.subject).toBe('zhangsan')
    })

    it('rejects an account that is not a member of the enterprise', async () => {
        vi.spyOn(safeHttp.axios, 'get').mockImplementation(async (url: string) => {
            if (url.endsWith('/cgi-bin/gettoken')) return { data: { errcode: 0, access_token: 'tok' } }
            return { data: { errcode: 0, openid: 'external' } }
        })
        await expect(wecomClient.fetchProfile({ corpId: 'ww1', secret: 'sec', code: 'c' })).rejects.toMatchObject({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH })
    })

    it('tells a bad secret apart from a bad code', async () => {
        vi.spyOn(safeHttp.axios, 'get').mockResolvedValue({ data: { errcode: 40001, errmsg: 'invalid credential' } })
        await expect(wecomClient.fetchProfile({ corpId: 'ww1', secret: 'bad', code: 'c' })).rejects.toMatchObject({ code: SsoLoginErrorCode.CLIENT_REJECTED })
        vi.spyOn(safeHttp.axios, 'get').mockResolvedValue({ data: { errcode: 40029, errmsg: 'invalid code' } })
        await expect(wecomClient.fetchProfile({ corpId: 'ww1', secret: 'sec', code: 'bad' })).rejects.toMatchObject({ code: SsoLoginErrorCode.CODE_REJECTED })
    })

    it('reads the enterprise of a service provider login', async () => {
        vi.spyOn(safeHttp.axios, 'post').mockImplementation(async (url: string) => {
            if (url.endsWith('/cgi-bin/service/get_provider_token')) return { data: { errcode: 0, provider_access_token: 'ptok' } }
            return { data: { errcode: 0, usertype: 1, user_info: { userid: 'lisi', name: '李四' }, corp_info: { corpid: 'wwcust' } } }
        })
        const profile = await wecomClient.fetchProviderProfile({ providerCorpId: 'wwprov', providerSecret: 'ps', authCode: 'a' })
        expect(profile).toEqual({ subject: 'lisi', email: '', fullName: '李四', enterpriseKey: 'wwcust' })
    })
})

describe('dingtalk client', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('asks for the corp id scope only when the enterprise matters', () => {
        const plain = new URL(dingtalkClient.buildAuthorizationUrl({ appKey: 'k', redirectUri: 'https://ipaas.test/cb', state: 's', withCorpId: false }))
        const withCorp = new URL(dingtalkClient.buildAuthorizationUrl({ appKey: 'k', redirectUri: 'https://ipaas.test/cb', state: 's', withCorpId: true }))
        expect(plain.searchParams.get('scope')).toBe('openid')
        expect(withCorp.searchParams.get('scope')).toBe('openid corpid')
        expect(withCorp.searchParams.get('client_id')).toBe('k')
        expect(withCorp.searchParams.get('response_type')).toBe('code')
    })

    it('uses the union id as the subject and reports the enterprise', async () => {
        vi.spyOn(safeHttp.axios, 'post').mockResolvedValue({ data: { accessToken: 'at', corpId: 'ding-corp' } })
        vi.spyOn(safeHttp.axios, 'get').mockResolvedValue({ data: { nick: '王五', unionId: 'u1', openId: 'o1', email: 'Wang@Acme.test' } })
        const profile = await dingtalkClient.fetchProfile({ appKey: 'k', appSecret: 's', code: 'c' })
        expect(profile).toEqual({ subject: 'u1', email: 'wang@acme.test', fullName: '王五', enterpriseKey: 'ding-corp' })
    })

    it('falls back to the open id and tolerates a missing mail and corp id', async () => {
        vi.spyOn(safeHttp.axios, 'post').mockResolvedValue({ data: { accessToken: 'at' } })
        vi.spyOn(safeHttp.axios, 'get').mockResolvedValue({ data: { nick: '赵六', openId: 'o2' } })
        const profile = await dingtalkClient.fetchProfile({ appKey: 'k', appSecret: 's', code: 'c' })
        expect(profile).toMatchObject({ subject: 'o2', email: '', enterpriseKey: null })
    })

    it('rejects an answer without an access token', async () => {
        vi.spyOn(safeHttp.axios, 'post').mockResolvedValue({ data: {} })
        await expect(dingtalkClient.fetchProfile({ appKey: 'k', appSecret: 's', code: 'c' })).rejects.toMatchObject({ code: SsoLoginErrorCode.CODE_REJECTED })
    })
})
