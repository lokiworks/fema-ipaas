import { describe, expect, it } from 'vitest'
import {
    dataMapping,
    MappingFieldType,
    MappingIssueCode,
    MappingIssueSeverity,
    MappingMissingBehavior,
    MappingTableData,
    MappingTransformType,
} from '../src/lib/data-mapping'

const materials: MappingTableData = {
    id: 'mt_materials',
    name: '物料编码对照',
    rows: [{ k: 'M-1024', v: '100231-0001' }, { k: 'M-2048', v: '100231-0002' }],
    missingBehavior: MappingMissingBehavior.ERROR,
    defaultValue: null,
}

describe('dataMapping.evaluate', () => {
    it('applies transform chains in order', () => {
        const result = dataMapping.evaluate({
            spec: {
                fields: [
                    { id: '1', target: 'amount', source: ' 1,280.456 ', transforms: [{ type: MappingTransformType.TRIM }, { type: MappingTransformType.NUMBER }, { type: MappingTransformType.ROUND, arg: '2' }] },
                    { id: '2', target: 'date', source: '2026/09/18', transforms: [{ type: MappingTransformType.DATE, arg: 'YYYY-MM-DD' }] },
                    { id: '3', target: 'source', source: '', constant: undefined, transforms: [{ type: MappingTransformType.DEFAULT, arg: 'Web' }] },
                    { id: '4', target: 'tags', source: 'a， b ,c', transforms: [{ type: MappingTransformType.SPLIT, arg: '，' }] },
                ],
            },
            tables: [],
        })
        expect(result.value).toEqual({ amount: 1280.46, date: '2026-09-18', source: 'Web', tags: ['a', 'b ,c'] })
        expect(result.rows.every((row) => row.error === null)).toBe(true)
    })

    it('maps list items one by one through a lookup table', () => {
        const result = dataMapping.evaluate({
            spec: {
                fields: [{
                    id: 'entries',
                    target: 'FEntity',
                    source: [{ code: 'M-1024', qty: '20' }, { code: 'M-2048', qty: '5' }],
                    transforms: [],
                    each: [
                        { id: 'a', target: 'FMaterialId', itemPath: 'code', transforms: [{ type: MappingTransformType.LOOKUP, arg: 'mt_materials' }] },
                        { id: 'b', target: 'FQty', itemPath: 'qty', transforms: [{ type: MappingTransformType.NUMBER }] },
                    ],
                }],
            },
            tables: [materials],
        })
        expect(result.value).toEqual({ FEntity: [{ FMaterialId: '100231-0001', FQty: 20 }, { FMaterialId: '100231-0002', FQty: 5 }] })
    })

    it('reports missing lookup keys according to the table behavior', () => {
        const spec = { fields: [{ id: '1', target: 'code', source: 'M-9999', transforms: [{ type: MappingTransformType.LOOKUP, arg: 'mt_materials' }] }] }
        expect(dataMapping.evaluate({ spec, tables: [materials] }).rows[0].error).toContain('M-9999')
        expect(dataMapping.evaluate({ spec, tables: [{ ...materials, missingBehavior: MappingMissingBehavior.DEFAULT, defaultValue: 'X' }] }).value).toEqual({ code: 'X' })
        expect(dataMapping.evaluate({ spec, tables: [{ ...materials, missingBehavior: MappingMissingBehavior.PASSTHROUGH }] }).value).toEqual({ code: 'M-9999' })
    })

    it('stops a chain at the first error', () => {
        const result = dataMapping.evaluate({
            spec: { fields: [{ id: '1', target: 'n', source: 'abc', transforms: [{ type: MappingTransformType.NUMBER }, { type: MappingTransformType.ROUND }] }] },
            tables: [],
        })
        expect(result.rows[0].error).toContain('abc')
        expect(result.rows[0].value).toBe('abc')
    })

    it('collects the lookup tables a spec needs', () => {
        expect(dataMapping.lookupTableIds({
            fields: [
                { id: '1', target: 'a', transforms: [{ type: MappingTransformType.LOOKUP, arg: 't1' }] },
                { id: '2', target: 'b', transforms: [], each: [{ id: 'x', target: 'y', transforms: [{ type: MappingTransformType.LOOKUP, arg: 't2' }, { type: MappingTransformType.LOOKUP, arg: 't1' }] }] },
            ],
        })).toEqual(['t1', 't2'])
    })
})

const provisionTarget = {
    connectorName: '@fema-ipaas/connector-feishu',
    actionName: 'provision_user',
    fields: [
        { name: 'name', type: MappingFieldType.STRING, required: true },
        { name: 'mobile', type: MappingFieldType.STRING, required: true },
        { name: 'departmentId', type: MappingFieldType.STRING, required: true },
        { name: 'employeeType', type: MappingFieldType.NUMBER, required: true, options: [1, 2, 3] },
        { name: 'startDate', type: MappingFieldType.DATE, required: false },
        { name: 'positions', type: MappingFieldType.ARRAY, required: false, item: [{ name: 'title', type: MappingFieldType.STRING, required: true }, { name: 'level', type: MappingFieldType.NUMBER, required: false }] },
    ],
}

const departments: MappingTableData = {
    id: 'mt_dept',
    name: '北森部门到飞书部门',
    rows: [{ k: '20301', v: 'od-rd' }],
    missingBehavior: MappingMissingBehavior.ERROR,
    defaultValue: null,
}

function row(id: string, target: string, source: unknown, transforms: { type: MappingTransformType, arg?: string }[] = []) {
    return { id, target, source, transforms }
}

function codes(issues: { code: MappingIssueCode }[]): MappingIssueCode[] {
    return issues.map((candidate) => candidate.code)
}

describe('dataMapping target schema', () => {
    const complete = [
        row('1', 'name', ' 张三 ', [{ type: MappingTransformType.TRIM }]),
        row('2', 'mobile', '13800000001'),
        row('3', 'departmentId', 20301, [{ type: MappingTransformType.STRING }, { type: MappingTransformType.LOOKUP, arg: 'mt_dept' }]),
        row('4', 'employeeType', '1', [{ type: MappingTransformType.NUMBER }]),
    ]

    it('passes when every required field is mapped with the right type', () => {
        const result = dataMapping.evaluate({ spec: { fields: complete, destination: provisionTarget }, tables: [departments] })
        expect(result.issues).toEqual([])
        expect(result.value).toEqual({ name: '张三', mobile: '13800000001', departmentId: 'od-rd', employeeType: 1 })
    })

    it('flags required fields that have no source before any run', () => {
        const issues = dataMapping.validateSpec({ fields: complete.slice(0, 2), destination: provisionTarget })
        expect(issues.filter((candidate) => candidate.code === MappingIssueCode.REQUIRED_UNMAPPED).map((candidate) => candidate.target)).toEqual(['departmentId', 'employeeType'])
    })

    it('flags a text value given to a number field and says how to fix it', () => {
        const fields = [...complete.slice(0, 3), row('4', 'employeeType', '1')]
        const result = dataMapping.evaluate({ spec: { fields, destination: provisionTarget }, tables: [departments] })
        const mismatch = result.issues.find((candidate) => candidate.code === MappingIssueCode.TYPE_MISMATCH)
        expect(mismatch?.target).toBe('employeeType')
        expect(dataMapping.describeIssue(mismatch ?? result.issues[0])).toContain('转数字')
        expect(result.rows.find((candidate) => candidate.id === '4')?.error).toContain('需要数字')
    })

    it('flags numbers given to text fields and values outside the options', () => {
        const fields = [...complete.slice(0, 1), row('2', 'mobile', 13800000001), complete[2], row('4', 'employeeType', 9)]
        const result = dataMapping.evaluate({ spec: { fields, destination: provisionTarget }, tables: [departments] })
        expect(codes(result.issues)).toEqual(expect.arrayContaining([MappingIssueCode.TYPE_MISMATCH, MappingIssueCode.OPTION_NOT_ALLOWED]))
    })

    it('flags a required field whose value turns out empty', () => {
        const fields = [row('1', 'name', ''), ...complete.slice(1)]
        const result = dataMapping.evaluate({ spec: { fields, destination: provisionTarget }, tables: [departments] })
        expect(codes(result.issues)).toContain(MappingIssueCode.REQUIRED_EMPTY)
    })

    it('flags targets the action does not have and rows without a target name', () => {
        const fields = [...complete, row('5', 'nickname', 'x'), row('6', ' ', 'y')]
        const issues = dataMapping.validateSpec({ fields, destination: provisionTarget })
        expect(codes(issues)).toEqual(expect.arrayContaining([MappingIssueCode.UNKNOWN_TARGET, MappingIssueCode.TARGET_EMPTY]))
    })

    it('flags a lookup value the mapping table does not know and names the table', () => {
        const fields = [complete[0], complete[1], row('3', 'departmentId', 20399, [{ type: MappingTransformType.STRING }, { type: MappingTransformType.LOOKUP, arg: 'mt_dept' }]), complete[3]]
        const result = dataMapping.evaluate({ spec: { fields, destination: provisionTarget }, tables: [departments] })
        const miss = result.rows.find((candidate) => candidate.id === '3')
        expect(miss?.error).toContain('20399')
        expect(miss?.error).toContain('北森部门到飞书部门')
        expect(blockingCodes(result.issues)).toContain(MappingIssueCode.LOOKUP_MISS)
    })

    it('points at the list item that lacks a field, as an error when the item field is required', () => {
        const positions = {
            id: 'p',
            target: 'positions',
            source: [{ title: '后端', level: '3' }, { level: '5' }],
            transforms: [],
            each: [
                { id: 'a', target: 'title', itemPath: 'title', transforms: [] },
                { id: 'b', target: 'level', itemPath: 'level', transforms: [{ type: MappingTransformType.NUMBER }] },
            ],
        }
        const result = dataMapping.evaluate({ spec: { fields: [...complete, positions], destination: provisionTarget }, tables: [departments] })
        const missing = result.issues.find((candidate) => candidate.code === MappingIssueCode.ITEM_FIELD_MISSING)
        expect(missing?.target).toBe('positions[2].title')
        expect(missing?.severity).toBe(MappingIssueSeverity.ERROR)
        expect(result.value['positions']).toEqual([{ title: '后端', level: 3 }, { title: undefined, level: 5 }])
    })

    it('treats a missing optional item field as a warning', () => {
        const positions = {
            id: 'p',
            target: 'positions',
            source: [{ title: '后端' }],
            transforms: [],
            each: [
                { id: 'a', target: 'title', itemPath: 'title', transforms: [] },
                { id: 'b', target: 'level', itemPath: 'level', transforms: [] },
            ],
        }
        const result = dataMapping.evaluate({ spec: { fields: [positions], destination: { ...provisionTarget, fields: [provisionTarget.fields[5]] } }, tables: [] })
        expect(result.issues.map((candidate) => candidate.severity)).toEqual([MappingIssueSeverity.WARNING])
    })

    it('flags item values of the wrong type with the item number', () => {
        const positions = {
            id: 'p',
            target: 'positions',
            source: [{ title: '后端', level: 'senior' }],
            transforms: [],
            each: [
                { id: 'a', target: 'title', itemPath: 'title', transforms: [] },
                { id: 'b', target: 'level', itemPath: 'level', transforms: [{ type: MappingTransformType.NUMBER }] },
            ],
        }
        const result = dataMapping.evaluate({ spec: { fields: [positions], destination: { ...provisionTarget, fields: [provisionTarget.fields[5]] } }, tables: [] })
        expect(dataMapping.describeIssue(result.issues[0])).toContain('第 1 项')
        expect(result.rows[0].error).toContain('senior')
    })
})

describe('dataMapping dates', () => {
    const date = (value: unknown, pattern: string) => dataMapping.evaluate({ spec: { fields: [row('d', 'x', value, [{ type: MappingTransformType.DATE, arg: pattern }])] }, tables: [] })

    it('keeps the calendar day of a date-only value in every time zone', () => {
        expect(date('2026/10/08', 'YYYY-MM-DD').value).toEqual({ x: '2026-10-08' })
        expect(date('2026-10-08', 'YYYY/MM/DD').value).toEqual({ x: '2026/10/08' })
        expect(date('2026年10月8日', 'YYYY-MM-DD').value).toEqual({ x: '2026-10-08' })
        expect(date('20261008', 'YYYY-MM-DD').value).toEqual({ x: '2026-10-08' })
    })

    it('keeps the wall clock of a timestamp as written', () => {
        expect(date('2026-10-08T23:30:15', 'YYYY-MM-DD HH:mm:ss').value).toEqual({ x: '2026-10-08 23:30:15' })
        expect(date('2026-10-08T23:30:15+08:00', 'HH:mm').value).toEqual({ x: '23:30' })
    })

    it('formats epoch values in China time', () => {
        expect(date(Date.UTC(2026, 9, 8, 16, 30), 'YYYY-MM-DD HH:mm').value).toEqual({ x: '2026-10-09 00:30' })
        expect(date(Math.floor(Date.UTC(2026, 9, 8, 16, 30) / 1000), 'YYYY-MM-DD HH:mm').value).toEqual({ x: '2026-10-09 00:30' })
    })

    it('rejects impossible dates and unreadable text', () => {
        expect(codes(date('2026-13-45', 'YYYY-MM-DD').issues)).toEqual([MappingIssueCode.DATE_INVALID])
        expect(codes(date('2026-02-30', 'YYYY-MM-DD').issues)).toEqual([MappingIssueCode.DATE_INVALID])
        expect(codes(date('下周一', 'YYYY-MM-DD').issues)).toEqual([MappingIssueCode.DATE_INVALID])
    })

    it('rejects date patterns that would silently produce garbage', () => {
        expect(dataMapping.isValidDatePattern('yyyy-MM-dd')).toBe(false)
        expect(dataMapping.isValidDatePattern('YYYY-MM-DDTHH:mm:ss')).toBe(true)
        expect(dataMapping.isValidDatePattern('YYYY年MM月DD日')).toBe(true)
        expect(dataMapping.isValidDatePattern('abc')).toBe(false)
        const result = date('2026-10-08', 'yyyy-MM-dd')
        expect(codes(result.issues)).toEqual([MappingIssueCode.DATE_PATTERN_INVALID])
        expect(result.rows[0].error).toContain('yyyy-MM-dd')
        expect(codes(dataMapping.validateSpec({ fields: [row('d', 'x', '2026-10-08', [{ type: MappingTransformType.DATE, arg: 'dd/mm/yyyy' }])] }))).toEqual([MappingIssueCode.DATE_PATTERN_INVALID])
    })

    it('flags a lookup that has no table chosen', () => {
        expect(codes(dataMapping.validateSpec({ fields: [row('l', 'x', 'a', [{ type: MappingTransformType.LOOKUP }])] }))).toEqual([MappingIssueCode.LOOKUP_TABLE_NOT_SELECTED])
    })
})

function blockingCodes(issues: Parameters<typeof dataMapping.blockingIssues>[0]): MappingIssueCode[] {
    return codes(dataMapping.blockingIssues(issues))
}
