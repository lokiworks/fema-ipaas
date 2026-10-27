import { FetchError } from '@fema-ipaas/workflow-core'
import { createWorkflowsContext } from '../../src/lib/connector-context/workflows'

afterEach(() => vi.restoreAllMocks())

it('validates workflow summaries while preserving additional version fields', async () => {
    const response = { data: [{ id: 'workflow', externalId: 'callable', version: { id: 'version', displayName: 'Callable', valid: true, trigger: { name: 'trigger' } } }], next: null, previous: null }
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(response)))
    const context = createWorkflowsContext({ engineToken: 'token', internalApiUrl: 'http://localhost/', workflowId: 'workflow', workflowVersionId: 'version' })
    expect(await context.list({ externalIds: ['callable'] })).toEqual(response)
})

it('rejects a malformed workflow page instead of passing unchecked data to a connector', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'workflow', version: null }], next: null, previous: null })))
    const context = createWorkflowsContext({ engineToken: 'token', internalApiUrl: 'http://localhost/', workflowId: 'workflow', workflowVersionId: 'version' })
    await expect(context.list({})).rejects.toThrow()
})

it('preserves HTTP failures from the workflow endpoint', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 403 }))
    const context = createWorkflowsContext({ engineToken: 'token', internalApiUrl: 'http://localhost/', workflowId: 'workflow', workflowVersionId: 'version' })
    await expect(context.list({})).rejects.toThrow(FetchError)
})
