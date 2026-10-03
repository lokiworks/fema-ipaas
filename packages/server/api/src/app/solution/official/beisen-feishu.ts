import { MappingMissingBehavior } from '@fema-ipaas/core-utils'
import { SolutionConfigType, SolutionPackage, SolutionWorkflow, WorkflowTrigger } from '@fema-ipaas/shared'
import type { OfficialSolution } from '../official-solutions'
import { solutionPackageUtils } from '../solution-package-utils'

function buildBeisenFeishuSolution(): OfficialSolution {
    const workflows = [onboardWorkflow(), transferWorkflow(), leaveWorkflow()]
    const built = solutionPackageUtils.buildPackage({
        workflows,
        tables: [DEPARTMENT_TABLE],
        manualChecks: MANUAL_CHECKS,
    })
    const pkg: SolutionPackage = {
        ...built,
        config: [
            {
                key: 'hrChatId',
                label: 'HR 通知群的群 ID',
                type: SolutionConfigType.TEXT,
                options: [],
                defaultValue: '',
                hint: '新员工的飞书账号开通后，在这个群里通知。群 ID 以 oc_ 开头，机器人必须已经在群里',
                affectsWorkflows: ['onboard'],
                patches: [{ workflowKey: 'onboard', stepName: 'notify_hr', inputKey: 'chatId' }],
            },
            {
                key: 'itChatId',
                label: 'IT 通知群的群 ID',
                type: SolutionConfigType.TEXT,
                options: [],
                defaultValue: '',
                hint: '员工离职、飞书账号暂停后，在这个群里提醒回收设备。机器人必须已经在群里',
                affectsWorkflows: ['leave'],
                patches: [{ workflowKey: 'leave', stepName: 'notify_it', inputKey: 'chatId' }],
            },
        ],
    }
    return {
        id: 'official-beisen-feishu',
        name: '北森 → 飞书 人员同步',
        summary: '北森员工入职、调岗、离职后，自动在飞书开通账号、同步部门、暂停账号，并通知 HR 群和 IT 群。',
        category: 'HR',
        version: '1.0',
        notes: '首个版本：入职开通、调岗同步部门、离职暂停账号',
        publishedAt: '2026-10-03T00:00:00.000Z',
        package: pkg,
    }
}

function onboardWorkflow(): SolutionWorkflow {
    const trigger = beisenTrigger({
        displayName: '北森员工入职',
        statusScope: 'ONBOARDING',
        changeTypes: ['1', '2'],
        dedupeKey: '{{trigger.recordInfo.jobNumber}}',
        dedupeDays: 7,
        nextAction: connectorStep({
            name: 'map_department',
            displayName: '部门对照',
            connectorName: DATA_MAPPER,
            connectorVersion: '~0.4.0',
            actionName: 'map_fields',
            input: {
                mapping: { fields: [{ id: 'department', target: 'departmentId', source: DEPARTMENT_OID, transforms: [{ type: 'LOOKUP', arg: DEPARTMENT_TABLE.id }] }] },
                failOnError: true,
            },
            nextAction: connectorStep({
                name: 'provision',
                displayName: '开通飞书账号',
                connectorName: FEISHU,
                connectorVersion: FEISHU_VERSION,
                actionName: 'provision_user',
                retry: true,
                input: {
                    auth: FEISHU_AUTH,
                    name: ref('employeeInfo', 'name'),
                    mobile: ref('employeeInfo', 'mobilePhone'),
                    departmentId: '{{map_department[\'output\'][\'departmentId\']}}',
                    employeeType: 1,
                    email: ref('employeeInfo', 'workEmail'),
                    employeeNo: ref('recordInfo', 'jobNumber'),
                },
                nextAction: routerStep({
                    name: 'only_when_created',
                    displayName: '只在新开通时通知',
                    condition: { operator: 'BOOLEAN_IS_TRUE', firstValue: '{{provision[\'output\'][\'created\']}}' },
                    branchName: '新开通',
                    fallbackName: '账号已存在',
                    child: connectorStep({
                        name: 'notify_hr',
                        displayName: '通知 HR 群',
                        connectorName: FEISHU,
                        connectorVersion: FEISHU_VERSION,
                        actionName: 'send_group_message',
                        input: {
                            auth: FEISHU_AUTH,
                            chatId: '',
                            messageType: 'text',
                            content: `${ref('employeeInfo', 'name')}（工号 ${ref('recordInfo', 'jobNumber')}）的飞书账号已开通`,
                        },
                    }),
                }),
            }),
        }),
    })
    return { key: 'onboard', name: '员工入职开通飞书账号', description: '北森入职后，按部门对照在飞书开通账号，新开通时在 HR 群通知。', trigger, schemaVersion: null }
}

function transferWorkflow(): SolutionWorkflow {
    const trigger = beisenTrigger({
        displayName: '北森员工调岗',
        statusScope: 'ACTIVE',
        changeTypes: ['7', '9'],
        dedupeKey: '{{trigger.recordInfo.jobNumber}}-{{trigger.recordInfo.oIdDepartment}}',
        dedupeDays: 30,
        nextAction: connectorStep({
            name: 'find_user',
            displayName: '按手机号找飞书账号',
            connectorName: FEISHU,
            connectorVersion: FEISHU_VERSION,
            actionName: 'find_user',
            input: { auth: FEISHU_AUTH, lookupBy: 'mobile', value: `+86${ref('employeeInfo', 'mobilePhone')}` },
            nextAction: routerStep({
                name: 'only_when_found',
                displayName: '飞书里有这个人才更新',
                condition: { operator: 'BOOLEAN_IS_TRUE', firstValue: '{{find_user[\'output\'][\'found\']}}' },
                branchName: '有飞书账号',
                fallbackName: '没有飞书账号',
                child: connectorStep({
                    name: 'map_department',
                    displayName: '部门对照',
                    connectorName: DATA_MAPPER,
                    connectorVersion: '~0.4.0',
                    actionName: 'map_fields',
                    input: {
                        mapping: { fields: [{ id: 'department', target: 'departmentId', source: DEPARTMENT_OID, transforms: [{ type: 'LOOKUP', arg: DEPARTMENT_TABLE.id }] }] },
                        failOnError: true,
                    },
                    nextAction: connectorStep({
                        name: 'update_department',
                        displayName: '更新飞书部门',
                        connectorName: FEISHU,
                        connectorVersion: FEISHU_VERSION,
                        actionName: 'update_user',
                        retry: true,
                        input: {
                            auth: FEISHU_AUTH,
                            openId: '{{find_user[\'output\'][\'open_id\']}}',
                            departmentId: '{{map_department[\'output\'][\'departmentId\']}}',
                        },
                    }),
                }),
            }),
        }),
    })
    return { key: 'transfer', name: '员工调岗同步部门', description: '北森调岗后，把飞书账号的部门改成对应部门。', trigger, schemaVersion: null }
}

function leaveWorkflow(): SolutionWorkflow {
    const trigger = beisenTrigger({
        displayName: '北森员工离职',
        statusScope: 'LEFT',
        changeTypes: [],
        dedupeKey: '{{trigger.recordInfo.jobNumber}}',
        dedupeDays: 30,
        serial: true,
        nextAction: connectorStep({
            name: 'find_user',
            displayName: '按手机号找飞书账号',
            connectorName: FEISHU,
            connectorVersion: FEISHU_VERSION,
            actionName: 'find_user',
            input: { auth: FEISHU_AUTH, lookupBy: 'mobile', value: `+86${ref('employeeInfo', 'mobilePhone')}` },
            nextAction: routerStep({
                name: 'only_when_found',
                displayName: '飞书里有这个人才暂停',
                condition: { operator: 'BOOLEAN_IS_TRUE', firstValue: '{{find_user[\'output\'][\'found\']}}' },
                branchName: '有飞书账号',
                fallbackName: '没有飞书账号',
                child: connectorStep({
                    name: 'suspend',
                    displayName: '暂停飞书账号',
                    connectorName: FEISHU,
                    connectorVersion: FEISHU_VERSION,
                    actionName: 'suspend_user',
                    retry: true,
                    input: { auth: FEISHU_AUTH, openId: '{{find_user[\'output\'][\'open_id\']}}' },
                    nextAction: connectorStep({
                        name: 'notify_it',
                        displayName: '通知 IT 回收设备',
                        connectorName: FEISHU,
                        connectorVersion: FEISHU_VERSION,
                        actionName: 'send_group_message',
                        input: {
                            auth: FEISHU_AUTH,
                            chatId: '',
                            messageType: 'text',
                            content: `${ref('employeeInfo', 'name')}（工号 ${ref('recordInfo', 'jobNumber')}）已离职，飞书账号已暂停，请回收设备`,
                        },
                    }),
                }),
            }),
        }),
    })
    return { key: 'leave', name: '员工离职暂停飞书账号', description: '北森离职生效后暂停飞书账号（数据保留、可恢复），并通知 IT 回收设备。', trigger, schemaVersion: null }
}

function beisenTrigger({ displayName, statusScope, changeTypes, dedupeKey, dedupeDays, serial, nextAction }: BeisenTriggerParams): WorkflowTrigger {
    return WorkflowTrigger.parse({
        name: 'trigger',
        type: 'CONNECTOR_TRIGGER',
        valid: true,
        displayName,
        lastUpdatedDate: STAMP,
        settings: {
            connectorName: BEISEN,
            connectorVersion: BEISEN_VERSION,
            triggerName: 'employee_changed',
            input: {
                auth: BEISEN_AUTH,
                statusScope,
                queryType: 2,
                timezone: 'Asia/Shanghai',
                ...(changeTypes.length > 0 ? { filterColumn: 'recordInfo.changeTypeOID', filterValues: changeTypes } : {}),
            },
            propertySettings: {},
            dedupe: { enabled: true, keyPath: dedupeKey, windowSeconds: dedupeDays * 24 * 60 * 60 },
            ...(serial ? { concurrency: { maxConcurrentRuns: 1 } } : {}),
        },
        nextAction,
    })
}

function connectorStep({ name, displayName, connectorName, connectorVersion, actionName, input, retry, nextAction }: ConnectorStepParams): Record<string, unknown> {
    return {
        type: 'CONNECTOR',
        name,
        displayName,
        valid: true,
        lastUpdatedDate: STAMP,
        settings: {
            connectorName,
            connectorVersion,
            actionName,
            input,
            propertySettings: {},
            errorHandlingOptions: retry ? { retryOnFailure: { value: true }, continueOnFailure: { value: false } } : {},
        },
        ...(nextAction ? { nextAction } : {}),
    }
}

function routerStep({ name, displayName, condition, branchName, fallbackName, child }: RouterStepParams): Record<string, unknown> {
    return {
        type: 'ROUTER',
        name,
        displayName,
        valid: true,
        lastUpdatedDate: STAMP,
        settings: {
            executionType: 'EXECUTE_FIRST_MATCH',
            branches: [
                { branchType: 'CONDITION', branchName, conditions: [[condition]] },
                { branchType: 'FALLBACK', branchName: fallbackName },
            ],
        },
        children: [child, null],
    }
}

function ref(section: 'employeeInfo' | 'recordInfo', field: string): string {
    return `{{trigger['output']['${section}']['${field}']}}`
}

const BEISEN = '@fema-ipaas/connector-beisen'
const FEISHU = '@fema-ipaas/connector-feishu'
const DATA_MAPPER = '@fema-ipaas/connector-data-mapper'
const BEISEN_VERSION = '~0.3.0'
const FEISHU_VERSION = '~0.3.1'
const BEISEN_AUTH = '{{connections[\'beisen-connection\']}}'
const FEISHU_AUTH = '{{connections[\'feishu-connection\']}}'
const STAMP = '2026-10-03T00:00:00.000Z'
const DEPARTMENT_OID = '{{trigger[\'output\'][\'recordInfo\'][\'oIdDepartment\']}}'

const DEPARTMENT_TABLE = {
    id: 'mt_beisen_department',
    key: 'department',
    name: '北森部门到飞书部门',
    description: '用北森任职部门的 OId 查飞书部门 ID',
    keyLabel: '北森部门 OId',
    valueLabel: '飞书部门 ID',
    missingBehavior: MappingMissingBehavior.ERROR,
    defaultValue: null,
    rows: [],
}

const MANUAL_CHECKS = [
    { label: '北森连接器已勾选「员工信息」和「任职记录」两个对象', detail: '缺一个，北森会返回权限异常。字段权限也要允许读到手机号、工号、部门和人员状态', who: '北森管理员' },
    { label: '北森返回的手机号没有被脱敏', detail: '脱敏的手机号（如 129****1283）开通不了飞书账号。在连接器的字段权限里放开手机号', who: '北森管理员' },
    { label: '北森开放平台的授信 IP 包含本实例的出口 IP', detail: '不在白名单时北森会拒绝调用', who: '北森管理员' },
    { label: '飞书应用已开通所需权限，且通讯录权限范围覆盖要同步的部门', detail: '更新通讯录、通过手机号或邮箱获取用户 ID、以应用身份发消息；范围之外的部门无法开通账号', who: '飞书管理员' },
    { label: '映射表里已填好北森部门 OId 对应的飞书部门 ID', detail: '映射表缺少对应关系时，开通和调岗会明确失败，在问题中心修好映射表后可以重放', who: '安装的人' },
    { label: '用一名测试员工验证入职和离职都能从北森读到', detail: '北森只返回审批生效的记录，离职要过了最后工作日才算生效；先在北森造一个测试员工，确认触发器测试能读到', who: 'HR 或实施顾问' },
]

type BeisenTriggerParams = {
    displayName: string
    statusScope: 'ACTIVE' | 'LEFT' | 'ONBOARDING' | 'ALL'
    changeTypes: string[]
    dedupeKey: string
    dedupeDays: number
    serial?: boolean
    nextAction: Record<string, unknown>
}

type ConnectorStepParams = {
    name: string
    displayName: string
    connectorName: string
    connectorVersion: string
    actionName: string
    input: Record<string, unknown>
    retry?: boolean
    nextAction?: Record<string, unknown>
}

type RouterStepParams = {
    name: string
    displayName: string
    condition: Record<string, unknown>
    branchName: string
    fallbackName: string
    child: Record<string, unknown>
}

export const beisenFeishuSolution = buildBeisenFeishuSolution
