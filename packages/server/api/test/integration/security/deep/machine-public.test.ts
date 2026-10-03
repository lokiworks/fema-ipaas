import { generateId } from '@fema-ipaas/core-utils'
import { ConnectorType, PackageType, PrincipalType, TemplateType } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { connectorCache } from '../../../../src/app/connectors/metadata/connector-cache'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import { createMockConnectorMetadata, createMockWorkflowVersion } from '../../../helpers/mocks'
import { setupTestEnvironment } from '../../../helpers/test-setup'
import { seed } from '../support/seed'
import { securityWorld, World } from '../support/world'

let world: World | null = null
let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

function currentWorld(): World {
    if (world === null) {
        throw new Error('world is not ready')
    }
    return world
}

function templateWorkflow(): Record<string, unknown> {
    const version = createMockWorkflowVersion({ valid: false })
    return { displayName: version.displayName, trigger: version.trigger, valid: false, schemaVersion: version.schemaVersion }
}

async function createCustomTemplate({ w }: { w: World }): Promise<string> {
    const response = await w.send({
        identity: 'tenantAdmin',
        request: {
            method: 'POST',
            url: '/v1/templates',
            body: { name: `tenant-private-${generateId()}`.slice(0, 30), summary: 's', description: 'd', author: 'a', categories: [], type: TemplateType.CUSTOM, metadata: null, workflows: [templateWorkflow()] },
        },
    })
    expect(response.status).toBe(201)
    return (response.json() as { id: string }).id
}

describe('templates maintained by a tenant admin', () => {
    it('are served by id to everyone as documented, but never listed to another tenant', async () => {
        const w = currentWorld()
        const templateId = await createCustomTemplate({ w })

        const own = await w.send({ identity: 'viewer', request: { method: 'GET', url: `/v1/templates/${templateId}` } })
        const otherTenant = await w.send({ identity: 'otherTenantAdmin', request: { method: 'GET', url: `/v1/templates/${templateId}` } })
        const anonymous = await w.send({ identity: 'anonymous', request: { method: 'GET', url: `/v1/templates/${templateId}` } })
        const listForOtherTenant = await w.send({ identity: 'otherTenantAdmin', request: { method: 'GET', url: '/v1/templates' } })

        expect([own.status, otherTenant.status, anonymous.status]).toEqual([200, 200, 200])
        expect(listForOtherTenant.text).not.toContain(templateId)
    })

    it('cannot be changed or deleted by another tenant', async () => {
        const w = currentWorld()
        const templateId = await createCustomTemplate({ w })

        const update = await w.send({ identity: 'otherTenantAdmin', request: { method: 'POST', url: `/v1/templates/${templateId}`, body: { name: 'pwned' } } })
        const remove = await w.send({ identity: 'otherTenantAdmin', request: { method: 'DELETE', url: `/v1/templates/${templateId}` } })

        expect([update.status, remove.status]).toEqual([403, 403])
        expect(await db.findOneBy('template', { id: templateId })).not.toBeNull()
    })

    it('lets only a tenant admin create a custom template', async () => {
        const w = currentWorld()
        const response = await w.send({
            identity: 'developer',
            request: {
                method: 'POST',
                url: '/v1/templates',
                body: { name: 'dev', summary: 's', description: 'd', author: 'a', categories: [], type: TemplateType.CUSTOM, metadata: null, workflows: [templateWorkflow()] },
            },
        })

        expect(response.status).toBe(403)
    })
})

describe('connector metadata only shows what the caller may see', () => {
    it('keeps the custom connectors of tenant 1 away from tenant 2 and from anonymous callers', async () => {
        const w = currentWorld()
        const name = `@sec/private-${generateId()}`.toLowerCase().slice(0, 40)
        await db.save('connector_metadata', createMockConnectorMetadata({ name, tenantId: w.scopes.A.tenant.id, connectorType: ConnectorType.CUSTOM, packageType: PackageType.ARCHIVE, displayName: 'Private A' }))
        await connectorCache(app!.log).setup()

        const own = await w.send({ identity: 'viewer', request: { method: 'GET', url: '/v1/connectors' } })
        const otherTenant = await w.send({ identity: 'otherTenantAdmin', request: { method: 'GET', url: '/v1/connectors' } })
        const anonymous = await w.send({ identity: 'anonymous', request: { method: 'GET', url: '/v1/connectors' } })
        const otherTenantByName = await w.send({ identity: 'otherTenantAdmin', request: { method: 'GET', url: `/v1/connectors/${encodeURIComponent(name)}` } })
        const anonymousByName = await w.send({ identity: 'anonymous', request: { method: 'GET', url: `/v1/connectors/${encodeURIComponent(name)}` } })
        const registryForOther = await w.send({ identity: 'otherTenantAdmin', request: { method: 'GET', url: '/v1/connectors/registry' } })

        expect(own.text).toContain(name)
        expect(otherTenant.text).not.toContain(name)
        expect(anonymous.text).not.toContain(name)
        expect([otherTenantByName.status, anonymousByName.status]).toEqual([404, 404])
        expect(registryForOther.text).not.toContain(name)
    })

    it('does not let a member trigger an instance wide connector sync or delete a connector', async () => {
        const w = currentWorld()
        const name = `@sec/to-delete-${generateId()}`.toLowerCase().slice(0, 40)
        const metadata = createMockConnectorMetadata({ name, tenantId: w.scopes.A.tenant.id, connectorType: ConnectorType.CUSTOM, packageType: PackageType.ARCHIVE })
        await db.save('connector_metadata', metadata)

        const sync = await w.send({ identity: 'viewer', request: { method: 'POST', url: '/v1/connectors/sync' } })
        const remove = await w.send({ identity: 'projectAdmin', request: { method: 'DELETE', url: `/v1/connectors/${metadata.id}` } })

        expect(sync.status).toBe(403)
        expect(remove.status).toBe(403)
        expect(await db.findOneBy('connector_metadata', { id: metadata.id })).not.toBeNull()
    })
})

describe('instance flags and setup information', () => {
    it('never include a secret of the instance', async () => {
        const w = currentWorld()
        const response = await w.send({ identity: 'anonymous', request: { method: 'GET', url: '/v1/flags' } })
        const secrets = [process.env.FEMA_ENCRYPTION_KEY, process.env.FEMA_JWT_SECRET, process.env.FEMA_API_KEY].filter((value): value is string => value !== undefined && value.length > 6)

        expect(response.status).toBe(200)
        secrets.forEach((secret) => expect(response.text).not.toContain(secret))
        expect(response.text.toLowerCase()).not.toContain('password')
    })
})

describe('sign up and sign in', () => {
    it('refuses to register an email that was not invited once the instance has a tenant', async () => {
        const w = currentWorld()
        const email = `${generateId()}@example.com`.toLowerCase()

        const response = await w.send({
            identity: 'anonymous',
            request: { method: 'POST', url: '/v1/authentication/sign-up', body: { email, password: 'Sup3r-secret-pass!', firstName: 'a', lastName: 'b', trackEvents: false, newsLetter: false } },
        })

        expect(response.status).toBe(403)
        expect(await db.findOneBy('user_identity', { email })).toBeNull()
    })

    it('answers an unknown email and a wrong password in the same way', async () => {
        const w = currentWorld()
        const identity = await db.findOneBy<{ email: string }>('user_identity', { id: (await db.findOneBy<{ identityId: string }>('user', { id: w.actors.viewer.userId as string }))?.identityId as string })

        const unknown = await w.send({ identity: 'anonymous', request: { method: 'POST', url: '/v1/authentication/sign-in', body: { email: `${generateId()}@example.com`, password: 'whatever-password' } } })
        const wrongPassword = await w.send({ identity: 'anonymous', request: { method: 'POST', url: '/v1/authentication/sign-in', body: { email: identity?.email, password: 'whatever-password' } } })

        expect(unknown.status).toBe(wrongPassword.status)
        expect(unknown.json()).toEqual(wrongPassword.json())
    })
})

describe('public endpoints answer unknown or unauthorized callers without side effects', () => {
    it('answers a webhook for an unknown workflow with 410 and for a disabled workflow with 404 without running anything', async () => {
        const w = currentWorld()
        const disabled = await seed.workflow({ world: w, scope: 'A' })

        const unknown = await w.send({ identity: 'anonymous', request: { method: 'POST', url: `/v1/webhooks/${generateId()}`, body: {} } })
        const disabledResponse = await w.send({ identity: 'anonymous', request: { method: 'POST', url: `/v1/webhooks/${disabled.id}`, body: {} } })

        expect(unknown.status).toBe(410)
        expect(disabledResponse.status).toBe(404)
        expect(await db.findOneBy('execution', { workflowId: disabled.id })).toBeNull()
    })

    it('rejects an MCP call without a valid key', async () => {
        const w = currentWorld()
        const message = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
        const none = await w.send({ identity: 'anonymous', request: { method: 'POST', url: `/v1/mcp/${generateId()}`, body: message } })
        const fake = await w.sendAsToken({ token: 'mcp_not-a-real-key', request: { method: 'POST', url: `/v1/mcp/${generateId()}`, body: message } })
        const userToken = await w.sendAsToken({ token: w.actors.projectAdmin.token, request: { method: 'POST', url: `/v1/mcp/${generateId()}`, body: message } })

        expect([none.status, fake.status, userToken.status]).toEqual([401, 401, 401])
    })

    it('rejects file reads and signed step file reads with a made up token', async () => {
        const w = currentWorld()
        const fileId = generateId()
        const engineToken = await generateMockToken({ id: generateId(), type: PrincipalType.USER, tenant: { id: w.scopes.A.tenant.id } })

        const forged = await w.app.inject({ method: 'GET', url: `/api/v1/files/${fileId}`, query: { token: 'nope' } })
        const userTokenAsFileToken = await w.app.inject({ method: 'GET', url: `/api/v1/files/${fileId}`, query: { token: engineToken } })
        const signed = await w.app.inject({ method: 'GET', url: '/api/v1/step-files/signed', query: { token: 'nope' } })

        expect([forged.statusCode, userTokenAsFileToken.statusCode, signed.statusCode]).toEqual([401, 401, 401])
    })

    it('answers the public human input form of a workflow that has none with 404', async () => {
        const w = currentWorld()
        const plain = await seed.workflow({ world: w, scope: 'A' })

        const form = await w.send({ identity: 'anonymous', request: { method: 'GET', url: `/v1/human-input/form/${plain.id}` } })
        const draftForm = await w.send({ identity: 'anonymous', request: { method: 'GET', url: `/v1/human-input/form/${plain.id}`, query: { useDraft: true } } })
        const chat = await w.send({ identity: 'anonymous', request: { method: 'GET', url: `/v1/human-input/chat/${plain.id}` } })

        expect([form.status, draftForm.status, chat.status]).toEqual([404, 404, 404])
    })
})
