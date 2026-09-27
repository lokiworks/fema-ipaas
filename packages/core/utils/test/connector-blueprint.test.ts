import { describe, expect, it } from 'vitest'
import {
    blueprintAvailability,
    blueprintChanges,
    BlueprintChangeType,
    BlueprintConnectorState,
    blueprintExpression,
    blueprintFactory,
    BlueprintHttpMethod,
    BlueprintInputControl,
    BlueprintIssueCode,
    blueprintOutput,
    blueprintProblems,
    blueprintRules,
    blueprintStatus,
    blueprintTemplate,
    BlueprintTriggerType,
    BlueprintValueType,
    BlueprintVersionError,
    blueprintVersions,
    BlueprintVersionStatus,
    BlueprintAuthType,
    BlueprintBodyType,
    BlueprintStatusUnmatched,
    BlueprintOptionsSource,
    BlueprintVersionAction,
} from '../src/lib/connector-blueprint'

function definitionWith(overrides: Partial<ReturnType<typeof blueprintFactory.definition>> = {}) {
    return {
        ...blueprintFactory.definition({ displayName: '工单系统', description: '内部工单', iconColor: '#2563EB', baseUrl: 'https://tickets.example.com/api' }),
        ...overrides,
    }
}

describe('blueprintRules', () => {
    it('accepts identifiers that start with a lowercase letter and stay within 40 characters', () => {
        expect(blueprintRules.isValidIdentifier('custom_crm')).toBe(true)
        expect(blueprintRules.isValidIdentifier('Custom')).toBe(false)
        expect(blueprintRules.isValidIdentifier('1crm')).toBe(false)
        expect(blueprintRules.isValidIdentifier('crm-api')).toBe(false)
        expect(blueprintRules.isValidIdentifier(`a${'b'.repeat(40)}`)).toBe(false)
        expect(blueprintRules.isValidIdentifier(`a${'b'.repeat(39)}`)).toBe(true)
    })

    it('derives a package-safe connector name from the identifier', () => {
        expect(blueprintRules.connectorNameOf('custom_crm')).toBe('@fema-ipaas/connector-custom-custom-crm')
        expect(blueprintRules.isBlueprintConnectorName('@fema-ipaas/connector-custom-crm')).toBe(true)
        expect(blueprintRules.isBlueprintConnectorName('@fema-ipaas/connector-gmail')).toBe(false)
    })

    it('slugs OpenAPI operation ids into keys', () => {
        expect(blueprintRules.slug('listTickets')).toBe('list_tickets')
        expect(blueprintRules.slug('GET /tickets/{id}')).toBe('get_tickets_id')
        expect(blueprintRules.slug('123')).toBe('op_123')
        expect(blueprintRules.uniqueKey({ base: 'list', taken: ['list', 'list2'] })).toBe('list3')
    })
})

describe('blueprintVersions', () => {
    it('requires x.y and a version greater than every published one', () => {
        expect(blueprintVersions.newVersionError({ version: '1', existing: [] })).toBe(BlueprintVersionError.FORMAT)
        expect(blueprintVersions.newVersionError({ version: '1.0.0', existing: [] })).toBe(BlueprintVersionError.FORMAT)
        expect(blueprintVersions.newVersionError({ version: '1.0', existing: [] })).toBeNull()
        expect(blueprintVersions.newVersionError({ version: '1.2', existing: ['1.2.3'] })).toBe(BlueprintVersionError.NOT_GREATER)
        expect(blueprintVersions.newVersionError({ version: '1.10', existing: ['1.9.0', '1.2.3'] })).toBeNull()
        expect(blueprintVersions.newVersionError({ version: '1.1', existing: ['1.10.0'] })).toBe(BlueprintVersionError.NOT_GREATER)
        expect(blueprintVersions.newVersionError({ version: '0.0', existing: [] })).toBe(BlueprintVersionError.FORMAT)
        expect(blueprintVersions.newVersionError({ version: '0.1', existing: [] })).toBeNull()
    })

    it('moves version states only along the allowed transitions', () => {
        expect(blueprintVersions.nextStatus({ status: BlueprintVersionStatus.CANARY, action: BlueprintVersionAction.PROMOTE })).toBe(BlueprintVersionStatus.FULL)
        expect(blueprintVersions.nextStatus({ status: BlueprintVersionStatus.CANARY, action: BlueprintVersionAction.STOP_CANARY })).toBe(BlueprintVersionStatus.STOPPED)
        expect(blueprintVersions.nextStatus({ status: BlueprintVersionStatus.FULL, action: BlueprintVersionAction.STOP })).toBe(BlueprintVersionStatus.STOPPED)
        expect(blueprintVersions.nextStatus({ status: BlueprintVersionStatus.STOPPED, action: BlueprintVersionAction.RESTORE })).toBe(BlueprintVersionStatus.FULL)
        expect(blueprintVersions.nextStatus({ status: BlueprintVersionStatus.FULL, action: BlueprintVersionAction.PROMOTE })).toBeNull()
        expect(blueprintVersions.nextStatus({ status: BlueprintVersionStatus.STOPPED, action: BlueprintVersionAction.STOP })).toBeNull()
    })

    it('suggests the next minor version and maps package versions', () => {
        expect(blueprintVersions.suggestNext([])).toBe('1.0')
        expect(blueprintVersions.suggestNext(['1.2.4', '1.9.0'])).toBe('1.10')
        expect(blueprintVersions.packageVersionOf({ version: '2.3', patch: 1 })).toBe('2.3.1')
        expect(blueprintVersions.displayOf('2.3.1')).toBe('2.3')
        expect(blueprintVersions.patchOf('2.3.1')).toBe(1)
    })
})

describe('blueprintAvailability', () => {
    const rules = [
        { version: '1.0', status: BlueprintVersionStatus.FULL, canaryProjectIds: [] },
        { version: '1.1', status: BlueprintVersionStatus.CANARY, canaryProjectIds: ['p_canary'] },
        { version: '0.9', status: BlueprintVersionStatus.STOPPED, canaryProjectIds: [] },
    ]
    const packageVersions = ['0.9.0', '1.0.0', '1.0.1', '1.1.0']

    it('offers the canary version only inside canary projects', () => {
        expect(blueprintAvailability.pickSelectable({ rules, packageVersions, projectId: 'p_canary' })).toBe('1.1.0')
        expect(blueprintAvailability.pickSelectable({ rules, packageVersions, projectId: 'p_other' })).toBe('1.0.1')
        expect(blueprintAvailability.pickSelectable({ rules, packageVersions, projectId: undefined })).toBe('1.0.1')
    })

    it('refuses to run a canary version outside its projects but keeps stopped versions running', () => {
        expect(blueprintAvailability.isRunnable({ rules, packageVersion: '1.1.0', projectId: 'p_other' })).toBe(false)
        expect(blueprintAvailability.isRunnable({ rules, packageVersion: '1.1.0', projectId: 'p_canary' })).toBe(true)
        expect(blueprintAvailability.isRunnable({ rules, packageVersion: '0.9.0', projectId: 'p_other' })).toBe(true)
        expect(blueprintAvailability.isRunnable({ rules: [], packageVersion: '3.0.0', projectId: 'p_other' })).toBe(true)
    })

    it('takes the connector offline once every version stopped', () => {
        expect(blueprintAvailability.pickSelectable({ rules: [{ version: '1.0', status: BlueprintVersionStatus.STOPPED, canaryProjectIds: [] }], packageVersions: ['1.0.0'], projectId: 'p' })).toBeNull()
        expect(blueprintAvailability.connectorState([{ version: '1.0', status: BlueprintVersionStatus.STOPPED, canaryProjectIds: [] }]).state).toBe(BlueprintConnectorState.OFFLINE)
        expect(blueprintAvailability.connectorState([]).state).toBe(BlueprintConnectorState.DRAFT)
        expect(blueprintAvailability.connectorState(rules)).toEqual({ state: BlueprintConnectorState.PUBLISHED, currentVersion: '1.0' })
    })
})

describe('blueprintTemplate', () => {
    it('reads dotted and indexed paths, with or without braces', () => {
        const source = { body: { items: [{ id: 'T-1' }], code: 0 } }
        expect(blueprintTemplate.readPath({ source, path: 'body.items[0].id' })).toBe('T-1')
        expect(blueprintTemplate.readPath({ source, path: '{{body.items.0.id}}' })).toBe('T-1')
        expect(blueprintTemplate.readPath({ source, path: 'body.code' })).toBe(0)
        expect(blueprintTemplate.readPath({ source, path: '' })).toBe(source)
    })

    it('renders JSON bodies with typed and quoted placeholders', () => {
        const rendered = blueprintTemplate.renderJson({
            template: '{ "title": "{{input.title}}", "urgent": {{input.urgent}}, "detail": {{input.detail}}, "note": "id={{input.id}}", "missing": {{input.nope}} }',
            vars: { input: { title: 'VPN "down"', urgent: true, detail: { a: 1 }, id: 7 } },
        })
        expect(JSON.parse(rendered)).toEqual({ title: 'VPN "down"', urgent: true, detail: { a: 1 }, note: 'id=7', missing: null })
    })

    it('flags JSON templates that are invalid even after substitution', () => {
        expect(blueprintTemplate.jsonError('{ "a": {{input.a}} }')).toBe(false)
        expect(blueprintTemplate.jsonError('{ "a": }')).toBe(true)
        expect(blueprintTemplate.jsonError('')).toBe(false)
    })

    it('builds a request from the default config of an operation', () => {
        const operation = {
            ...blueprintFactory.operation({ key: 'get_ticket', name: '查询工单', method: BlueprintHttpMethod.GET, path: '/tickets/{id}', group: '' }),
            inputs: [
                { ...blueprintFactory.input({ key: 'id', label: 'ID' }), required: true },
                blueprintFactory.input({ key: 'status', label: '状态' }),
                blueprintFactory.input({ key: 'owner', label: '负责人' }),
            ],
        }
        const request = blueprintTemplate.resolveRequest(operation)
        const built = blueprintTemplate.buildRequest({
            baseUrl: 'https://tickets.example.com/api/',
            method: operation.method,
            path: operation.path,
            request,
            vars: { input: { id: 'T 1', status: 'open' } },
        })
        expect(built.url).toBe('https://tickets.example.com/api/tickets/T%201')
        expect(built.query).toEqual({ status: 'open' })
        expect(built.body).toBeNull()
    })

    it('builds a JSON body by default for POST operations', () => {
        const request = blueprintTemplate.defaultRequest({
            method: BlueprintHttpMethod.POST,
            path: '/tickets',
            inputs: [blueprintFactory.input({ key: 'title', label: '标题' }), { ...blueprintFactory.input({ key: 'urgent', label: '紧急' }), type: BlueprintValueType.BOOLEAN }],
        })
        expect(request.bodyType).toBe(BlueprintBodyType.JSON)
        const built = blueprintTemplate.buildRequest({ baseUrl: 'https://x.test', method: BlueprintHttpMethod.POST, path: '/tickets', request, vars: { input: { title: 'a', urgent: false } } })
        expect(JSON.parse(built.body ?? '')).toEqual({ title: 'a', urgent: false })
    })

    it('reports references to inputs that do not exist', () => {
        expect(blueprintTemplate.unknownInputRefs({ texts: ['/a/{id}', '{{input.name}}', '{{authData.token}}'], inputKeys: ['name'] })).toEqual(['id'])
    })
})

describe('blueprintExpression', () => {
    it('evaluates comparisons, boolean logic and parentheses', () => {
        const values = { mode: 'advanced', count: 3, enabled: true, empty: '' }
        expect(blueprintExpression.evaluate({ expression: "input.mode == 'advanced'", values })).toBe(true)
        expect(blueprintExpression.evaluate({ expression: "mode != 'advanced'", values })).toBe(false)
        expect(blueprintExpression.evaluate({ expression: 'count > 2 && enabled', values })).toBe(true)
        expect(blueprintExpression.evaluate({ expression: '!(count > 2) || empty', values })).toBe(false)
        expect(blueprintExpression.evaluate({ expression: 'missing == null', values })).toBe(true)
        expect(blueprintExpression.evaluate({ expression: '', values })).toBe(true)
    })

    it('validates syntax and lists referenced inputs', () => {
        expect(blueprintExpression.isValid("input.mode == 'a'")).toBe(true)
        expect(blueprintExpression.isValid('input.mode ==')).toBe(false)
        expect(blueprintExpression.isValid("(a == 'x'")).toBe(false)
        expect(blueprintExpression.references("input.mode == 'a' && settings.level > 1")).toEqual(['mode', 'level'])
    })
})

describe('blueprintStatus', () => {
    const config = blueprintStatus.defaults()

    it('treats business code 0 as success and falls back to HTTP status', () => {
        expect(blueprintStatus.evaluate({ config, httpStatus: 200, headers: {}, body: { code: 0 } }).success).toBe(true)
        expect(blueprintStatus.evaluate({ config, httpStatus: 200, headers: {}, body: { id: 1 } }).success).toBe(true)
        expect(blueprintStatus.evaluate({ config, httpStatus: 200, headers: {}, body: { code: 99, message: 'bad' } })).toMatchObject({ success: false, retry: false, message: 'bad' })
    })

    it('marks 401 as not retryable and 429 / 500 as retryable', () => {
        expect(blueprintStatus.evaluate({ config, httpStatus: 401, headers: {}, body: {} })).toMatchObject({ success: false, retry: false })
        expect(blueprintStatus.evaluate({ config, httpStatus: 429, headers: {}, body: {} })).toMatchObject({ success: false, retry: true })
        expect(blueprintStatus.evaluate({ config, httpStatus: 500, headers: {}, body: {} })).toMatchObject({ success: false, retry: true })
        expect(blueprintStatus.evaluate({ config, httpStatus: 404, headers: {}, body: {} }).success).toBe(false)
    })

    it('honours unmatched = SUCCESS only for successful HTTP responses', () => {
        const lenient = { ...config, unmatched: BlueprintStatusUnmatched.SUCCESS }
        expect(blueprintStatus.evaluate({ config: lenient, httpStatus: 200, headers: {}, body: { code: 7 } }).success).toBe(true)
        expect(blueprintStatus.evaluate({ config: lenient, httpStatus: 404, headers: {}, body: {} }).success).toBe(false)
    })
})

describe('blueprintOutput', () => {
    it('derives an output tree from a pasted sample', () => {
        expect(blueprintOutput.fields({ total: 1, items: [{ id: 'T', owner: { name: 'a' } }], meta: {} })).toEqual([
            { key: 'total' },
            { key: 'items', listItems: [{ key: 'id' }, { key: 'owner', children: [{ key: 'name' }] }] },
            { key: 'meta' },
        ])
    })
})

describe('blueprintChanges', () => {
    const listOp = blueprintFactory.operation({ key: 'list', name: '列表', method: BlueprintHttpMethod.GET, path: '/list', group: '' })
    const createOp = blueprintFactory.operation({ key: 'create', name: '创建', method: BlueprintHttpMethod.POST, path: '/create', group: '' })
    const baseline = definitionWith({ operations: [listOp, createOp] })

    it('groups additions, updates and removals by operation, trigger and config', () => {
        const draft = definitionWith({
            baseUrl: 'https://tickets.example.com/api/v2',
            operations: [{ ...listOp, name: '列表 v2' }, blueprintFactory.operation({ key: 'close', name: '关闭', method: BlueprintHttpMethod.POST, path: '/close', group: '' })],
            triggers: [blueprintFactory.trigger({ key: 'updated', name: '更新', type: BlueprintTriggerType.POLLING })],
        })
        const changes = blueprintChanges.compute({ baseline, draft })
        expect(changes.map((change) => [change.id, change.change])).toEqual([
            ['config', BlueprintChangeType.UPDATE],
            ['operation:close', BlueprintChangeType.ADD],
            ['operation:list', BlueprintChangeType.UPDATE],
            ['operation:create', BlueprintChangeType.REMOVE],
            ['trigger:updated', BlueprintChangeType.ADD],
        ])
        expect(changes[0].changedFields).toEqual(['baseUrl'])
        expect(changes[2].changedFields).toEqual(['name'])
        expect(blueprintChanges.includesRemoval({ changes, changeIds: ['operation:create'] })).toBe(true)
        expect(blueprintChanges.includesRemoval({ changes, changeIds: ['operation:list'] })).toBe(false)
    })

    it('applies only the picked changes and keeps the rest as draft', () => {
        const draft = definitionWith({
            baseUrl: 'https://tickets.example.com/api/v2',
            operations: [{ ...listOp, name: '列表 v2' }, blueprintFactory.operation({ key: 'close', name: '关闭', method: BlueprintHttpMethod.POST, path: '/close', group: '' })],
        })
        const published = blueprintChanges.apply({ baseline, draft, changeIds: ['operation:close'] })
        expect(published.baseUrl).toBe('https://tickets.example.com/api')
        expect(published.operations.map((operation) => [operation.key, operation.name])).toEqual([['list', '列表'], ['close', '关闭'], ['create', '创建']])
        expect(blueprintChanges.compute({ baseline: published, draft }).map((change) => change.id)).toEqual(['config', 'operation:list', 'operation:create'])
    })

    it('treats everything as new on the first publish', () => {
        const draft = definitionWith({ operations: [listOp] })
        expect(blueprintChanges.compute({ baseline: null, draft }).map((change) => change.change)).toEqual([BlueprintChangeType.ADD, BlueprintChangeType.ADD])
        expect(blueprintChanges.apply({ baseline: null, draft, changeIds: ['operation:list'] }).displayName).toBe('工单系统')
    })
})

describe('blueprintProblems.publish', () => {
    it('lists every blocking issue with where to fix it', () => {
        const draft = definitionWith({
            description: '',
            baseUrl: 'ftp://nope',
            auth: blueprintFactory.auth({ type: BlueprintAuthType.API_KEY, name: 'Key', description: '' }),
            operations: [blueprintFactory.operation({ key: 'bad', name: '坏操作', method: BlueprintHttpMethod.GET, path: 'no-slash', group: '' })],
        })
        const codes = blueprintProblems.publish({ definition: draft, authPublished: false }).map((entry) => [entry.code, entry.key])
        expect(codes).toEqual([
            [BlueprintIssueCode.DESCRIPTION_MISSING, null],
            [BlueprintIssueCode.BASE_URL_INVALID, null],
            [BlueprintIssueCode.AUTH_NOT_PUBLISHED, null],
            [BlueprintIssueCode.OPERATION_INVALID, 'bad'],
        ])
    })

    it('passes a complete connector', () => {
        const operation = {
            ...blueprintFactory.operation({ key: 'list', name: '列表', method: BlueprintHttpMethod.GET, path: '/list', group: '' }),
            inputs: [{ ...blueprintFactory.input({ key: 'kind', label: '类型' }), control: BlueprintInputControl.DROPDOWN, options: ['a'], visibleIf: "input.x == 'y'", pattern: '^a$' }],
        }
        expect(blueprintProblems.publish({ definition: definitionWith({ operations: [operation] }), authPublished: false })).toEqual([])
    })

    it('rejects a dynamic dropdown without a source operation and a bad visibility expression', () => {
        const input = { ...blueprintFactory.input({ key: 'k', label: 'K' }), control: BlueprintInputControl.DROPDOWN, optionsSource: BlueprintOptionsSource.OPERATION, visibleIf: 'a ==' }
        expect(blueprintProblems.input({ input, operationKeys: [] })).toEqual(['VISIBILITY', 'OPTIONS_OPERATION'])
        expect(blueprintProblems.input({ input: { ...input, visibleIf: '', optionsOperation: 'list' }, operationKeys: ['list'] })).toEqual([])
    })

    it('validates polling trigger limits', () => {
        const trigger = blueprintFactory.trigger({ key: 'poll', name: '轮询', type: BlueprintTriggerType.POLLING })
        expect(blueprintProblems.trigger({ trigger, operationKeys: [] })).toEqual([])
        expect(blueprintProblems.trigger({ trigger: { ...trigger, polling: { ...trigger.polling, intervalMinutes: 1441 } }, operationKeys: [] })).toEqual(['INTERVAL'])
        expect(blueprintProblems.trigger({ trigger: { ...trigger, polling: { ...trigger.polling, intervalMinutes: 0, dedupeKey: '' } }, operationKeys: [] })).toEqual(['INTERVAL', 'DEDUPE_KEY'])
    })
})
