import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ConnectorShape, loadConnector, runConnectorAction } from './test-connector'

const echoConnector: ConnectorShape = {
    metadata: () => ({
        name: 'echo',
        actions: {
            echo: {
                run: async (context: unknown) => context,
            },
        },
    }),
}

describe('running one action of a connector', () => {
    it('hands the action its input and its auth', async () => {
        const result = await runConnectorAction({
            connector: echoConnector,
            actionName: 'echo',
            propsValue: { greeting: 'hello' },
            auth: 'token',
        })
        expect(result).toMatchObject({ propsValue: { greeting: 'hello' }, auth: 'token' })
    })

    it('names the actions that do exist when the one asked for does not', async () => {
        await expect(
            runConnectorAction({ connector: echoConnector, actionName: 'nope', propsValue: {} }),
        ).rejects.toThrow('Available: echo')
    })

    it('points at the missing build instead of failing on an import error', async () => {
        const folder = await mkdtemp(path.join(tmpdir(), 'connector-test-empty-'))
        await expect(loadConnector(folder)).rejects.toThrow('No build found')
    })
})
