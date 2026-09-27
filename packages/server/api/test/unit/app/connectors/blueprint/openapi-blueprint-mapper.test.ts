import { BlueprintBodyType, BlueprintInputControl, BlueprintValueType } from '@fema-ipaas/shared'
import { openApiBlueprintMapper, OpenApiMappingError } from '../../../../../src/app/connectors/openapi/openapi-blueprint-mapper'

const SPEC = {
    openapi: '3.0.1',
    info: { title: 'Tickets', description: '内部 IT 工单的查询与创建接口' },
    servers: [{ url: 'https://tickets.example.com/api/v1/' }],
    components: {
        schemas: {
            NewTicket: { type: 'object', required: ['title'], properties: { title: { type: 'string', description: '标题' }, urgent: { type: 'boolean', description: '是否紧急' }, detail: { type: 'object', description: '详细信息' } } },
        },
    },
    paths: {
        '/tickets': {
            get: {
                operationId: 'listTickets',
                summary: '查询工单列表',
                tags: ['工单'],
                parameters: [
                    { name: 'status', in: 'query', description: '工单状态', schema: { type: 'string', enum: ['open', 'closed'] } },
                    { name: 'page', in: 'query', description: '页码', schema: { type: 'integer' } },
                    { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
                ],
                responses: { 200: { content: { 'application/json': { example: { total: 1, items: [{ id: 'T-1024' }] } } } } },
            },
            post: {
                operationId: 'createTicket',
                summary: '创建工单',
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/NewTicket' } } } },
                responses: { 201: { content: { 'application/json': { examples: { ok: { value: { id: 'T-1025' } } } } } } },
            },
        },
        '/tickets/{id}': {
            parameters: [{ name: 'id', in: 'path', required: true, description: '工单 ID', schema: { type: 'string' } }],
            get: { summary: '查询工单详情', responses: {} },
            head: { summary: 'ignored' },
        },
    },
}

describe('openApiBlueprintMapper', () => {
    it('maps servers[0], one operation per path and method, inputs and 200/201 examples', () => {
        const mapping = openApiBlueprintMapper.map({ document: SPEC, takenIdentifiers: ['custom_tickets'] })
        expect(mapping.baseUrl).toBe('https://tickets.example.com/api/v1')
        expect(mapping.identifier).toBe('custom_tickets2')
        expect(mapping.operations.map((operation) => [operation.key, operation.method, operation.path])).toEqual([
            ['list_tickets', 'GET', '/tickets'],
            ['create_ticket', 'POST', '/tickets'],
            ['get_tickets', 'GET', '/tickets/{id}'],
        ])
        const [list, create, detail] = mapping.operations
        expect(list.group).toBe('工单')
        expect(list.inputs.map((input) => [input.key, input.control, input.type])).toEqual([
            ['status', BlueprintInputControl.DROPDOWN, BlueprintValueType.STRING],
            ['page', BlueprintInputControl.TEXT, BlueprintValueType.NUMBER],
        ])
        expect(list.inputs[0].options).toEqual(['open', 'closed'])
        expect(list.request?.query).toEqual([{ key: 'status', value: '{{input.status}}' }, { key: 'page', value: '{{input.page}}' }])
        expect(list.sample).toEqual({ total: 1, items: [{ id: 'T-1024' }] })
        expect(create.inputs.map((input) => [input.key, input.required, input.control])).toEqual([
            ['title', true, BlueprintInputControl.TEXT],
            ['urgent', false, BlueprintInputControl.SWITCH],
            ['detail', false, BlueprintInputControl.CODE],
        ])
        expect(create.request?.bodyType).toBe(BlueprintBodyType.JSON)
        expect(create.request?.body).toBe('{\n  "title": "{{input.title}}",\n  "urgent": {{input.urgent}},\n  "detail": {{input.detail}}\n}')
        expect(create.sample).toEqual({ id: 'T-1025' })
        expect(detail.inputs.map((input) => [input.key, input.required])).toEqual([['id', true]])
        expect(detail.request?.query).toEqual([])
    })

    it('rejects documents that are not OpenAPI 3.x', () => {
        expect(() => openApiBlueprintMapper.map({ document: { swagger: '2.0', paths: {} }, takenIdentifiers: [] })).toThrow(OpenApiMappingError)
        expect(() => openApiBlueprintMapper.map({ document: { openapi: '3.0.0', paths: {} }, takenIdentifiers: [] })).toThrow('no operation')
    })

    it('leaves the base URL empty when the server is relative', () => {
        expect(openApiBlueprintMapper.map({ document: { ...SPEC, servers: [{ url: '/api' }] }, takenIdentifiers: [] }).baseUrl).toBe('')
    })
})
