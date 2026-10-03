import { Permission } from '@fema-ipaas/core-utils'
import { db } from '../../../helpers/db'
import { MatrixCase } from '../support/matrix'
import { workspaceSeed } from '../support/workspace-seed'

function dataStoreBody({ name }: { name: string }): Record<string, unknown> {
    return { name, description: 'sec', ttlDays: 10 }
}

export const workspaceVariableCases: MatrixCase[] = [
    {
        id: 'GET /v1/variables',
        access: { type: 'project', permission: Permission.READ_VARIABLE },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            const variable = await workspaceSeed.variable({ world, scope })
            return { request: { method: 'GET', url: '/v1/variables', query: { projectId: world.scopes[scope].project.id } }, state: { value: variable.value } }
        },
        afterAllowed: async ({ prepared, response }) => {
            expect(response.text).not.toContain(String(prepared.state?.value))
        },
    },
    {
        id: 'GET /v1/variables/owners',
        access: { type: 'project', permission: Permission.READ_VARIABLE },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await workspaceSeed.variable({ world, scope })
            return { request: { method: 'GET', url: '/v1/variables/owners', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'POST /v1/variables',
        access: { type: 'project', permission: Permission.WRITE_VARIABLE },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const name = workspaceSeed.uniqueName({ prefix: 'SEC_NEW' })
            return {
                request: { method: 'POST', url: '/v1/variables', body: { projectId: world.scopes[scope].project.id, name, value: 'plain-secret' } },
                state: { name },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('variable', { name: String(prepared.state?.name) })).toBeNull()
        },
        afterAllowed: async ({ response }) => {
            expect(response.text).not.toContain('plain-secret')
        },
    },
    {
        id: 'POST /v1/variables/:id',
        access: { type: 'project', permission: Permission.WRITE_VARIABLE },
        prepare: async ({ world, scope }) => {
            const variable = await workspaceSeed.variable({ world, scope })
            const before = await db.findOneBy<{ value: unknown }>('variable', { id: variable.id })
            return {
                request: { method: 'POST', url: `/v1/variables/${variable.id}`, body: { value: 'overwritten-secret' } },
                state: { variableId: variable.id, before: JSON.stringify(before?.value) },
            }
        },
        afterDenied: async ({ prepared }) => {
            const after = await db.findOneBy<{ value: unknown }>('variable', { id: String(prepared.state?.variableId) })
            expect(JSON.stringify(after?.value)).toBe(String(prepared.state?.before))
        },
        afterAllowed: async ({ response }) => {
            expect(response.text).not.toContain('overwritten-secret')
        },
    },
    {
        id: 'POST /v1/variables/:id/reveal',
        access: { type: 'project', permission: Permission.WRITE_VARIABLE },
        prepare: async ({ world, scope }) => {
            const variable = await workspaceSeed.variable({ world, scope })
            return { request: { method: 'POST', url: `/v1/variables/${variable.id}/reveal`, body: {} }, state: { value: variable.value } }
        },
        afterDenied: async ({ prepared, response }) => {
            expect(response.text).not.toContain(String(prepared.state?.value))
        },
        afterAllowed: async ({ prepared, response }) => {
            expect(response.text).toContain(String(prepared.state?.value))
        },
    },
    {
        id: 'DELETE /v1/variables/:id',
        access: { type: 'project', permission: Permission.WRITE_VARIABLE },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const variable = await workspaceSeed.variable({ world, scope })
            return { request: { method: 'DELETE', url: `/v1/variables/${variable.id}` }, state: { variableId: variable.id } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('variable', { id: String(prepared.state?.variableId) })).not.toBeNull()
        },
    },
]

export const workspaceDataStoreCases: MatrixCase[] = [
    {
        id: 'GET /v1/data-stores',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await workspaceSeed.dataStore({ world, scope })
            return { request: { method: 'GET', url: '/v1/data-stores', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'POST /v1/data-stores',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const name = workspaceSeed.uniqueName({ prefix: 'sec-new-store' })
            return {
                request: { method: 'POST', url: '/v1/data-stores', body: { projectId: world.scopes[scope].project.id, ...dataStoreBody({ name }) } },
                state: { name },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('data_store', { name: String(prepared.state?.name) })).toBeNull()
        },
    },
    {
        id: 'POST /v1/data-stores/:id',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const store = await workspaceSeed.dataStore({ world, scope })
            const name = workspaceSeed.uniqueName({ prefix: 'sec-renamed-store' })
            return {
                request: { method: 'POST', url: `/v1/data-stores/${store.id}`, body: dataStoreBody({ name }) },
                state: { storeId: store.id, name },
            }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ name: string }>('data_store', { id: String(prepared.state?.storeId) })
            expect(row?.name).not.toBe(String(prepared.state?.name))
        },
    },
    {
        id: 'DELETE /v1/data-stores/:id',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const store = await workspaceSeed.dataStore({ world, scope })
            return { request: { method: 'DELETE', url: `/v1/data-stores/${store.id}` }, state: { storeId: store.id } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('data_store', { id: String(prepared.state?.storeId) })).not.toBeNull()
        },
    },
    {
        id: 'GET /v1/data-stores/:id/records',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const store = await workspaceSeed.dataStore({ world, scope })
            await workspaceSeed.dataStoreRecord({ world, scope, storeId: store.id, key: 'k1' })
            return { request: { method: 'GET', url: `/v1/data-stores/${store.id}/records` } }
        },
    },
    {
        id: 'POST /v1/data-stores/:id/records',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const store = await workspaceSeed.dataStore({ world, scope })
            return {
                request: { method: 'POST', url: `/v1/data-stores/${store.id}/records`, body: { mode: 'CREATE', key: 'written', value: 'v' } },
                state: { storeId: store.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await workspaceSeed.countRows({ entity: 'store-entry', where: { dataStoreId: String(prepared.state?.storeId) } })).toBe(0)
        },
    },
    {
        id: 'DELETE /v1/data-stores/:id/records',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const store = await workspaceSeed.dataStore({ world, scope })
            await workspaceSeed.dataStoreRecord({ world, scope, storeId: store.id, key: 'k1' })
            return { request: { method: 'DELETE', url: `/v1/data-stores/${store.id}/records`, query: { key: 'k1' } }, state: { storeId: store.id } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await workspaceSeed.countRows({ entity: 'store-entry', where: { dataStoreId: String(prepared.state?.storeId) } })).toBe(1)
        },
    },
    {
        id: 'POST /v1/data-stores/:id/clear',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const store = await workspaceSeed.dataStore({ world, scope })
            await workspaceSeed.dataStoreRecord({ world, scope, storeId: store.id, key: 'k1' })
            return { request: { method: 'POST', url: `/v1/data-stores/${store.id}/clear`, body: {} }, state: { storeId: store.id } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await workspaceSeed.countRows({ entity: 'store-entry', where: { dataStoreId: String(prepared.state?.storeId) } })).toBe(1)
        },
    },
]

export const workspaceMappingTableCases: MatrixCase[] = [
    {
        id: 'GET /v1/mapping-tables',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await workspaceSeed.mappingTable({ world, scope })
            return { request: { method: 'GET', url: '/v1/mapping-tables', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/mapping-tables/:id',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const table = await workspaceSeed.mappingTable({ world, scope })
            return { request: { method: 'GET', url: `/v1/mapping-tables/${table.id}` } }
        },
    },
    {
        id: 'GET /v1/mapping-tables/:id/references',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const table = await workspaceSeed.mappingTable({ world, scope })
            return { request: { method: 'GET', url: `/v1/mapping-tables/${table.id}/references` } }
        },
    },
    {
        id: 'POST /v1/mapping-tables',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const name = workspaceSeed.uniqueName({ prefix: 'sec-new-map' }).slice(0, 30)
            return {
                request: { method: 'POST', url: '/v1/mapping-tables', body: workspaceSeed.mappingTableBody({ projectId: world.scopes[scope].project.id, name }) },
                state: { name },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('mapping_table', { name: String(prepared.state?.name) })).toBeNull()
        },
    },
    {
        id: 'POST /v1/mapping-tables/:id',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const table = await workspaceSeed.mappingTable({ world, scope })
            return {
                request: { method: 'POST', url: `/v1/mapping-tables/${table.id}`, body: { ...workspaceSeed.mappingTableBody({ projectId: world.scopes[scope].project.id, name: table.name }), description: 'changed-by-matrix' } },
                state: { tableId: table.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ description: string }>('mapping_table', { id: String(prepared.state?.tableId) })
            expect(row?.description).not.toBe('changed-by-matrix')
        },
    },
    {
        id: 'DELETE /v1/mapping-tables/:id',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const table = await workspaceSeed.mappingTable({ world, scope })
            return { request: { method: 'DELETE', url: `/v1/mapping-tables/${table.id}` }, state: { tableId: table.id } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('mapping_table', { id: String(prepared.state?.tableId) })).not.toBeNull()
        },
    },
]
