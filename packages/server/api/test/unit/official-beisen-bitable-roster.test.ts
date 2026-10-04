import { SolutionPackage, workflowStructureUtil } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { OFFICIAL_SOLUTIONS } from '../../src/app/solution/official-solutions'
import { solutionMappingCheck } from '../../src/app/solution/solution-mapping-check'
import { solutionPackageUtils } from '../../src/app/solution/solution-package-utils'

const official = OFFICIAL_SOLUTIONS.find((solution) => solution.id === 'official-beisen-bitable-roster')

function pkg(): SolutionPackage {
    if (official === undefined) {
        throw new Error('official solution missing')
    }
    return official.package
}

describe('official Beisen to Bitable roster solution', () => {
    it('is a valid package with one workflow and the department name table', () => {
        const parsed = SolutionPackage.parse(pkg())
        expect(parsed.workflows.map((workflow) => workflow.key)).toEqual(['roster'])
        expect(parsed.mappingTables.map((table) => table.key)).toEqual(['department_name'])
        expect(parsed.mappingTables[0].rows).toEqual([])
    })

    it('needs a Beisen and a Feishu connection and asks for the Bitable by config', () => {
        expect(pkg().connections.map((slot) => slot.connectorName).sort()).toEqual(['@fema-ipaas/connector-beisen', '@fema-ipaas/connector-feishu'])
        expect(pkg().config.map((item) => item.key)).toEqual(['appToken', 'tableId'])
        expect(pkg().config.every((item) => item.defaultValue === '')).toBe(true)
    })

    it('passes the same mapping validation the editor and publishing use', () => {
        expect(solutionMappingCheck.problems({ pkg: pkg() })).toEqual([])
    })

    it('is stopped by that validation when the mapping is broken', () => {
        const broken = JSON.parse(JSON.stringify(pkg()).replace('YYYY-MM-DD', 'yyyy-MM-dd'))
        const problems = solutionMappingCheck.problems({ pkg: SolutionPackage.parse(broken) })
        expect(problems).toHaveLength(1)
        expect(problems[0]).toContain('入职日期')
        expect(problems[0]).toContain('无法识别')
    })

    it('is stopped when a lookup points at a table the package does not carry', () => {
        const broken = SolutionPackage.parse({ ...pkg(), mappingTables: [] })
        expect(solutionMappingCheck.problems({ pkg: broken })).toEqual(['员工信息写入多维表格 · 整理成花名册一行：映射表不在方案里'])
    })

    it('fills the bitable ids, connections and the table id when installed', () => {
        const items = pkg().config
        const instantiated = pkg().workflows.map((workflow) => solutionPackageUtils.instantiate({
            workflow,
            items,
            config: { appToken: 'bascnApp', tableId: 'tblRoster' },
            connections: { '@fema-ipaas/connector-beisen': 'beisen-real', '@fema-ipaas/connector-feishu': 'feishu-real' },
            tableIdByKey: new Map([['department_name', 'tbl_dept']]),
        }))
        const text = JSON.stringify(instantiated)
        expect(text).not.toContain('table:')
        expect(text).toContain('tbl_dept')
        const append = workflowStructureUtil.getAllSteps(instantiated[0]).find((step) => step.name === 'append_row')
        expect(append?.settings?.input).toMatchObject({ appToken: 'bascnApp', tableId: 'tblRoster', auth: '{{connections[\'feishu-real\']}}' })
    })
})
