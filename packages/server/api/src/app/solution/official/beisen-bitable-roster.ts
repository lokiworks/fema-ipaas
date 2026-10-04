import { MappingMissingBehavior, MappingTransformType } from '@fema-ipaas/core-utils'
import { SolutionConfigType, SolutionPackage, SolutionWorkflow } from '@fema-ipaas/shared'
import type { OfficialSolution } from '../official-solutions'
import { solutionPackageUtils } from '../solution-package-utils'
import { beisenTrigger, connectorStep, DATA_MAPPER, FEISHU, FEISHU_AUTH, FEISHU_VERSION, ref } from './official-solution-builders'

function buildBeisenBitableRosterSolution(): OfficialSolution {
    const built = solutionPackageUtils.buildPackage({
        workflows: [rosterWorkflow()],
        tables: [DEPARTMENT_NAME_TABLE],
        manualChecks: MANUAL_CHECKS,
    })
    const pkg: SolutionPackage = {
        ...built,
        config: [
            {
                key: 'appToken',
                label: '多维表格的 App Token',
                type: SolutionConfigType.TEXT,
                options: [],
                defaultValue: '',
                hint: '打开多维表格，复制浏览器地址栏里 /base/ 后面那一串字符',
                affectsWorkflows: ['roster'],
                patches: [{ workflowKey: 'roster', stepName: 'append_row', inputKey: 'appToken' }],
            },
            {
                key: 'tableId',
                label: '数据表 ID',
                type: SolutionConfigType.TEXT,
                options: [],
                defaultValue: '',
                hint: '数据表的 ID，以 tbl 开头，在多维表格地址栏 table= 后面',
                affectsWorkflows: ['roster'],
                patches: [{ workflowKey: 'roster', stepName: 'append_row', inputKey: 'tableId' }],
            },
        ],
    }
    return {
        id: 'official-beisen-bitable-roster',
        name: '北森员工信息 → 飞书多维表格 花名册',
        summary: '北森员工入职或调岗后，把姓名、工号、手机号、邮箱、部门名称、入职日期按字段映射整理成一行，写进飞书多维表格。',
        category: 'HR',
        version: '1.0',
        notes: '首个版本：入职、重聘、调岗各记一行，部门用映射表把北森 OId 换成部门名称',
        publishedAt: '2026-10-05T00:00:00.000Z',
        package: pkg,
    }
}

function rosterWorkflow(): SolutionWorkflow {
    const trigger = beisenTrigger({
        displayName: '北森员工信息变更',
        statusScope: 'ACTIVE',
        changeTypes: ['1', '2', '7', '9'],
        dedupeKey: '{{trigger.recordInfo.jobNumber}}-{{trigger.recordInfo.oIdDepartment}}',
        dedupeDays: 30,
        nextAction: connectorStep({
            name: 'map_roster',
            displayName: '整理成花名册一行',
            connectorName: DATA_MAPPER,
            connectorVersion: '~0.4.0',
            actionName: 'map_fields',
            input: {
                mapping: {
                    fields: [
                        { id: 'name', target: '姓名', source: ref('employeeInfo', 'name'), transforms: [{ type: MappingTransformType.TRIM }] },
                        { id: 'job', target: '工号', source: ref('recordInfo', 'jobNumber'), transforms: [] },
                        { id: 'mobile', target: '手机号', source: ref('employeeInfo', 'mobilePhone'), transforms: [] },
                        { id: 'email', target: '邮箱', source: ref('employeeInfo', 'workEmail'), transforms: [{ type: MappingTransformType.TRIM }, { type: MappingTransformType.LOWER }] },
                        { id: 'department', target: '部门', source: ref('recordInfo', 'oIdDepartment'), transforms: [{ type: MappingTransformType.STRING }, { type: MappingTransformType.LOOKUP, arg: DEPARTMENT_NAME_TABLE.id }] },
                        { id: 'start', target: '入职日期', source: ref('recordInfo', 'startDate'), transforms: [{ type: MappingTransformType.DATE, arg: 'YYYY-MM-DD' }] },
                    ],
                },
                failOnError: true,
            },
            nextAction: connectorStep({
                name: 'append_row',
                displayName: '写入多维表格',
                connectorName: FEISHU,
                connectorVersion: FEISHU_VERSION,
                actionName: 'create_bitable_record',
                retry: true,
                input: {
                    auth: FEISHU_AUTH,
                    appToken: '',
                    tableId: '',
                    fields: '{{map_roster[\'output\']}}',
                },
            }),
        }),
    })
    return { key: 'roster', name: '员工信息写入多维表格', description: '北森员工入职、重聘、调岗后，整理成一行写进飞书多维表格。', trigger, schemaVersion: null }
}

const DEPARTMENT_NAME_TABLE = {
    id: 'mt_beisen_department_name',
    key: 'department_name',
    name: '北森部门到部门名称',
    description: '用北森任职部门的 OId 查部门名称，写进花名册的「部门」列',
    keyLabel: '北森部门 OId',
    valueLabel: '部门名称',
    missingBehavior: MappingMissingBehavior.ERROR,
    defaultValue: null,
    rows: [],
}

const MANUAL_CHECKS = [
    { label: '北森连接器已勾选「员工信息」和「任职记录」两个对象', detail: '缺一个，北森会返回权限异常。字段权限也要允许读到姓名、手机号、邮箱、工号和部门', who: '北森管理员' },
    { label: '多维表格里已建好与映射结果同名的列：姓名、工号、手机号、邮箱、部门、入职日期', detail: '写入时列名必须完全一致，否则飞书会拒绝。想用别的列名，安装后在工作流里打开「整理成花名册一行」，把目标字段名改成你的列名', who: '安装的人' },
    { label: '飞书应用已开通多维表格权限，并且是这个多维表格的协作者', detail: '缺权限时飞书返回「没有访问权限」，在问题中心能看到并定位到这一步', who: '飞书管理员' },
    { label: '映射表里已填好北森部门 OId 对应的部门名称', detail: '映射表缺少对应关系时，这一步会明确失败并写明缺哪个值；映射表的「覆盖率」会列出最近运行里还没有对照的部门，一键补上', who: '安装的人' },
]

export const beisenBitableRosterSolution = buildBeisenBitableRosterSolution
