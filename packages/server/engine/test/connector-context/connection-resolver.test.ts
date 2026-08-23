import { ContextVersion } from '@fema/connector-sdk'
import { ConnectionStatus, ConnectionType, ConnectionExpiredError, ConnectionLoadingError, ConnectionNotFoundError, ConnectionConnectorMismatchError, FetchError } from '@fema/shared'
import { createConnectionResolver } from '../../src/lib/connector-context/connection-resolver'

const RESOLVER_PARAMS = {
    workspaceId: 'workspace-123',
    apiUrl: 'http://localhost:3000/',
    engineToken: 'test-token',
    contextVersion: ContextVersion.V1,
}

function makeConnection({ status = ConnectionStatus.ACTIVE, type = ConnectionType.SECRET_TEXT, value = { type: ConnectionType.SECRET_TEXT, secret_text: 'my-secret' }, connectorName = '@fema/connector-slack' }: {
    status?: ConnectionStatus
    type?: ConnectionType
    value?: Record<string, unknown>
    connectorName?: string
} = {}) {
    return {
        id: 'conn-1',
        name: 'my-connection',
        connectorName,
        status,
        value: { ...value, type },
    }
}

describe('connection-resolver service', () => {

    beforeEach(() => {
        vi.restoreAllMocks()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('V1 happy path returns connection.value', async () => {
        const connection = makeConnection()
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
            JSON.stringify(connection),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ))

        const resolver = createConnectionResolver(RESOLVER_PARAMS)
        const result = await resolver.obtain('my-connection')

        expect(result).toEqual(connection.value)
    })

    it('V0 SECRET_TEXT returns connection.value.secret_text', async () => {
        const connection = makeConnection({
            type: ConnectionType.SECRET_TEXT,
            value: { type: ConnectionType.SECRET_TEXT, secret_text: 'my-secret' },
        })
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
            JSON.stringify(connection),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ))

        const resolver = createConnectionResolver({ ...RESOLVER_PARAMS, contextVersion: undefined })
        const result = await resolver.obtain('my-connection')

        expect(result).toBe('my-secret')
    })

    it('V0 CUSTOM_AUTH returns connection.value.props', async () => {
        const customProps = { apiKey: 'abc', domain: 'example.com' }
        const connection = makeConnection({
            type: ConnectionType.CUSTOM_AUTH,
            value: { type: ConnectionType.CUSTOM_AUTH, props: customProps },
        })
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
            JSON.stringify(connection),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ))

        const resolver = createConnectionResolver({ ...RESOLVER_PARAMS, contextVersion: undefined })
        const result = await resolver.obtain('my-connection')

        expect(result).toEqual(customProps)
    })

    it('V0 other types returns connection.value', async () => {
        const connection = makeConnection({
            type: ConnectionType.OAUTH2,
            value: { type: ConnectionType.OAUTH2, access_token: 'tok' },
        })
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
            JSON.stringify(connection),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ))

        const resolver = createConnectionResolver({ ...RESOLVER_PARAMS, contextVersion: undefined })
        const result = await resolver.obtain('my-connection')

        expect(result).toEqual(connection.value)
    })

    it('throws ConnectionNotFoundError on 404', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))

        const resolver = createConnectionResolver(RESOLVER_PARAMS)
        await expect(resolver.obtain('missing')).rejects.toThrow(ConnectionNotFoundError)
    })

    it('throws ConnectionExpiredError when status is ERROR', async () => {
        const connection = makeConnection({ status: ConnectionStatus.ERROR })
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
            JSON.stringify(connection),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ))

        const resolver = createConnectionResolver(RESOLVER_PARAMS)
        await expect(resolver.obtain('my-connection')).rejects.toThrow(ConnectionExpiredError)
    })

    it('retries a transient network failure and resolves', async () => {
        const connection = makeConnection()
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValue(new Response(
                JSON.stringify(connection),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ))

        const resolver = createConnectionResolver(RESOLVER_PARAMS)
        const result = await drainRetries(resolver.obtain('my-connection'))

        expect(result).toEqual(connection.value)
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('retries a transient 500 and resolves', async () => {
        const connection = makeConnection()
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce(new Response(null, { status: 500 }))
            .mockResolvedValue(new Response(
                JSON.stringify(connection),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ))

        const resolver = createConnectionResolver(RESOLVER_PARAMS)
        const result = await drainRetries(resolver.obtain('my-connection'))

        expect(result).toEqual(connection.value)
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('throws ConnectionLoadingError when 500 outlives the retries', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))

        const resolver = createConnectionResolver(RESOLVER_PARAMS)
        await expect(drainRetries(resolver.obtain('my-connection'))).rejects.toThrow(ConnectionLoadingError)
        expect(fetchSpy).toHaveBeenCalledTimes(4)
    })

    it('throws FetchError when the network failure outlives the retries', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

        const resolver = createConnectionResolver(RESOLVER_PARAMS)
        await expect(drainRetries(resolver.obtain('my-connection'))).rejects.toThrow(FetchError)
        expect(fetchSpy).toHaveBeenCalledTimes(4)
    })

    describe('FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING', () => {
        const connectorName = '@fema/connector-slack'

        afterEach(() => {
            delete process.env.FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING
        })

        const mockFetchReturning = (connectionConnectorName: string) => {
            vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
                JSON.stringify(makeConnection({ connectorName: connectionConnectorName })),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ))
        }

        it('throws ConnectionConnectorMismatchError for another connector when enabled', async () => {
            process.env.FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING = 'true'
            mockFetchReturning('@fema/connector-google-sheets')

            const resolver = createConnectionResolver({ ...RESOLVER_PARAMS, connectorName })
            await expect(resolver.obtain('my-connection')).rejects.toThrow(ConnectionConnectorMismatchError)
        })

        it('resolves a connection for the same connector when enabled', async () => {
            process.env.FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING = 'true'
            mockFetchReturning(connectorName)

            const resolver = createConnectionResolver({ ...RESOLVER_PARAMS, connectorName })
            await expect(resolver.obtain('my-connection')).resolves.toEqual({
                type: ConnectionType.SECRET_TEXT,
                secret_text: 'my-secret',
            })
        })

        it('resolves a connection for another connector when disabled', async () => {
            mockFetchReturning('@fema/connector-google-sheets')

            const resolver = createConnectionResolver({ ...RESOLVER_PARAMS, connectorName })
            await expect(resolver.obtain('my-connection')).resolves.toEqual({
                type: ConnectionType.SECRET_TEXT,
                secret_text: 'my-secret',
            })
        })

        it('throws ConnectionConnectorMismatchError for a step with no connector of its own when enabled', async () => {
            process.env.FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING = 'true'
            mockFetchReturning('@fema/connector-google-sheets')

            const resolver = createConnectionResolver(RESOLVER_PARAMS)
            await expect(resolver.obtain('my-connection')).rejects.toThrow(ConnectionConnectorMismatchError)
        })

        it('resolves for a step with no connector of its own when disabled', async () => {
            mockFetchReturning('@fema/connector-google-sheets')

            const resolver = createConnectionResolver(RESOLVER_PARAMS)
            await expect(resolver.obtain('my-connection')).resolves.toEqual({
                type: ConnectionType.SECRET_TEXT,
                secret_text: 'my-secret',
            })
        })
    })
})

async function drainRetries<T>(pending: Promise<T>): Promise<T> {
    pending.catch(() => undefined)
    await vi.runAllTimersAsync()
    return pending
}
