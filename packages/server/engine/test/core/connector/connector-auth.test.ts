import { ConnectorAuth, ConnectorAuthProperty, PropertyType } from '@fema-ipaas/connector-sdk'
import { ConnectionType, ConnectionValue, ConnectorPackage } from '@fema-ipaas/shared'
import { connectorAuth } from '../../../src/lib/core/connector/connector-auth'
import { CollectedHooks, ConnectorDescription } from '../../../src/lib/core/connector/connector-protocol'
import { connectorRunner } from '../../../src/lib/core/connector/connector-runner'

const CONNECTOR = { connectorName: '@fema-ipaas/connector-test', connectorVersion: '1.0.0' } as unknown as ConnectorPackage

const HOOKS: CollectedHooks = { hookResponse: {}, listeners: [] } as unknown as CollectedHooks

const SECRET_TEXT_AUTH = ConnectorAuth.SecretText({ displayName: 'API Key', required: true })
const CUSTOM_AUTH = ConnectorAuth.CustomAuth({ displayName: 'Custom', required: true, props: {} })

const SECRET_TEXT_VALUE: ConnectionValue = { type: ConnectionType.SECRET_TEXT, secret_text: 'my-secret' }
const CUSTOM_AUTH_VALUE: ConnectionValue = { type: ConnectionType.CUSTOM_AUTH, props: { apiKey: 'k' } }

function makeDescription({ auth, paths }: MakeDescriptionParams): ConnectorDescription {
    return {
        metadata: { auth } as unknown as ConnectorDescription['metadata'],
        functionPaths: paths,
        hasPath: (path: string[]) => paths.includes(path.join('.')),
    }
}

function operationFor(auth: ConnectionValue) {
    return {
        connector: CONNECTOR,
        auth,
        internalApiUrl: 'http://internal',
        publicApiUrl: 'http://public',
    }
}

describe('connector-auth callMethod', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('unwraps the connector value from the { result, hooks } wrapper', async () => {
        vi.spyOn(connectorRunner, 'describe').mockResolvedValue(makeDescription({ auth: SECRET_TEXT_AUTH, paths: ['auth.validate'] }))
        vi.spyOn(connectorRunner, 'call').mockResolvedValue({ result: { valid: true }, hooks: HOOKS })

        const result = await connectorAuth.callMethod({ operation: operationFor(SECRET_TEXT_VALUE), authValueType: ConnectionType.SECRET_TEXT, methodPath: ['validate'] })

        expect(result).toEqual({ called: true, property: SECRET_TEXT_AUTH, result: { valid: true } })
    })

    it('unwraps the refresh result so access_token is reachable', async () => {
        vi.spyOn(connectorRunner, 'describe').mockResolvedValue(makeDescription({ auth: CUSTOM_AUTH, paths: ['auth.refresh.generate'] }))
        vi.spyOn(connectorRunner, 'call').mockResolvedValue({ result: { access_token: 'tok', expires_in: 60 }, hooks: HOOKS })

        const result = await connectorAuth.callMethod({ operation: operationFor(CUSTOM_AUTH_VALUE), authValueType: ConnectionType.CUSTOM_AUTH, methodPath: ['refresh', 'generate'] })

        expect(result).toEqual({ called: true, property: CUSTOM_AUTH, result: { access_token: 'tok', expires_in: 60 } })
    })

    it('passes the resolved path, argument and slash-normalized server url to the runner', async () => {
        vi.spyOn(connectorRunner, 'describe').mockResolvedValue(makeDescription({ auth: SECRET_TEXT_AUTH, paths: ['auth.validate'] }))
        const call = vi.spyOn(connectorRunner, 'call').mockResolvedValue({ result: { valid: true }, hooks: HOOKS })

        await connectorAuth.callMethod({ operation: operationFor(SECRET_TEXT_VALUE), authValueType: ConnectionType.SECRET_TEXT, methodPath: ['validate'] })

        expect(call).toHaveBeenCalledWith({
            connector: expect.objectContaining({ connectorName: '@fema-ipaas/connector-test', connectorVersion: '1.0.0' }),
            path: ['auth', 'validate'],
            args: [{ auth: 'my-secret', server: { apiUrl: 'http://internal/', publicUrl: 'http://public' } }],
        })
    })

    it('selects the indexed auth path when the connector exposes an auth array', async () => {
        vi.spyOn(connectorRunner, 'describe').mockResolvedValue(makeDescription({ auth: [SECRET_TEXT_AUTH, CUSTOM_AUTH], paths: ['auth.1.validate'] }))
        const call = vi.spyOn(connectorRunner, 'call').mockResolvedValue({ result: { valid: true }, hooks: HOOKS })

        await connectorAuth.callMethod({ operation: operationFor(CUSTOM_AUTH_VALUE), authValueType: ConnectionType.CUSTOM_AUTH, methodPath: ['validate'] })

        expect(call).toHaveBeenCalledWith(expect.objectContaining({ path: ['auth', '1', 'validate'] }))
    })

    it('returns called:false when the connector declares no auth', async () => {
        vi.spyOn(connectorRunner, 'describe').mockResolvedValue(makeDescription({ auth: undefined, paths: [] }))
        const call = vi.spyOn(connectorRunner, 'call')

        const result = await connectorAuth.callMethod({ operation: operationFor(SECRET_TEXT_VALUE), authValueType: ConnectionType.SECRET_TEXT, methodPath: ['validate'] })

        expect(result).toEqual({ called: false })
        expect(call).not.toHaveBeenCalled()
    })

    it('returns called:false with the property when the method path is absent', async () => {
        vi.spyOn(connectorRunner, 'describe').mockResolvedValue(makeDescription({ auth: SECRET_TEXT_AUTH, paths: [] }))
        const call = vi.spyOn(connectorRunner, 'call')

        const result = await connectorAuth.callMethod({ operation: operationFor(SECRET_TEXT_VALUE), authValueType: ConnectionType.SECRET_TEXT, methodPath: ['validate'] })

        expect(result).toEqual({ called: false, property: SECRET_TEXT_AUTH })
        expect(call).not.toHaveBeenCalled()
    })

    it('returns called:false with mismatch when the connection value type does not fit the property', async () => {
        vi.spyOn(connectorRunner, 'describe').mockResolvedValue(makeDescription({ auth: SECRET_TEXT_AUTH, paths: ['auth.validate'] }))
        const call = vi.spyOn(connectorRunner, 'call')

        const result = await connectorAuth.callMethod({ operation: operationFor(CUSTOM_AUTH_VALUE), authValueType: ConnectionType.SECRET_TEXT, methodPath: ['validate'] })

        expect(result).toEqual({ called: false, property: SECRET_TEXT_AUTH, mismatch: true })
        expect(call).not.toHaveBeenCalled()
    })
})

type MakeDescriptionParams = {
    auth: ConnectorAuthProperty | ConnectorAuthProperty[] | undefined
    paths: string[]
}
