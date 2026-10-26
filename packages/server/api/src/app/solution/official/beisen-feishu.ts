import { ReconciliationRuleBody, SolutionConfigType, SolutionPackage, SolutionWorkflow, workflowStructureUtil, WorkflowTrigger } from '@fema-ipaas/shared'
import type { OfficialSolution } from '../official-solutions'
import { solutionPackageUtils } from '../solution-package-utils'
import { beisenTrigger, connectorStep, DATA_MAPPER, DEPARTMENT_OID, DEPARTMENT_TABLE, FEISHU, FEISHU_AUTH, FEISHU_VERSION, ref, routerStep, STORE, STORE_VERSION } from './official-solution-builders'

function buildBeisenFeishuSolution(): OfficialSolution {
    const workflows = [withDepartmentRecovery(onboardWorkflow()), withDepartmentRecovery(transferWorkflow()), leaveWorkflow(), repairWorkflow()]
    const built = solutionPackageUtils.buildPackage({
        workflows,
        tables: [DEPARTMENT_TABLE],
        manualChecks: MANUAL_CHECKS,
    })
    const pkg: SolutionPackage = {
        ...built,
        reconciliationRules: [peopleReconciliation()],
        config: [
            {
                key: 'hrChatId',
                label: 'HR 通知群的群 ID',
                type: SolutionConfigType.TEXT,
                options: [],
                defaultValue: '',
                hint: '新员工的飞书账号开通后，在这个群里通知。群 ID 以 oc_ 开头，机器人必须已经在群里',
                affectsWorkflows: ['onboard', 'repair'],
                patches: [{ workflowKey: 'onboard', stepName: 'notify_hr', inputKey: 'chatId' }, { workflowKey: 'repair', stepName: 'active_notify_hr', inputKey: 'chatId' }],
            },
            {
                key: 'itChatId',
                label: 'IT 通知群的群 ID',
                type: SolutionConfigType.TEXT,
                options: [],
                defaultValue: '',
                hint: '员工离职、飞书账号暂停后，在这个群里提醒回收设备。机器人必须已经在群里',
                affectsWorkflows: ['leave', 'repair'],
                patches: [{ workflowKey: 'leave', stepName: 'notify_it', inputKey: 'chatId' }, { workflowKey: 'repair', stepName: 'left_notify_it', inputKey: 'chatId' }],
            },
            { key: 'rootOrganizationId', label: '北森根组织 OId（全量对账）', type: SolutionConfigType.TEXT, options: [], defaultValue: '', affectsWorkflows: ['repair'], patches: [] },
            { key: 'orgWorkflow', label: '组织整树收敛子流程的外部 ID', type: SolutionConfigType.TEXT, options: [], defaultValue: '', hint: '先安装并发布组织同步方案，再填写其收敛子流程的 externalId。缺部门对照时会等待它完成后重新查表。', affectsWorkflows: ['onboard', 'transfer', 'repair'], patches: [{ workflowKey: 'onboard', stepName: 'recover_department', inputKey: 'workflowId' }, { workflowKey: 'transfer', stepName: 'recover_department', inputKey: 'workflowId' }, { workflowKey: 'repair', stepName: 'active_recover_department', inputKey: 'workflowId' }] },
        ],
    }
    return {
        id: 'official-beisen-feishu',
        name: '北森 → 飞书 人员同步',
        summary: '北森员工入职、调岗、离职后，自动在飞书开通账号、同步部门、暂停账号，并通知 HR 群和 IT 群。',
        category: 'HR',
        version: '1.2',
        notes: '同一员工的变动按工号排队逐条处理；调岗去重键加上任职开始日，调回原部门不再被当成重复；HR 群和 IT 群的通知先查记录、发完再记下，消息本身再带去重键（飞书一小时内丢弃同一个键的重复消息），运行被打断后重跑不会漏发，一小时内也不会重发',
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
        orderKeyPath: EMPLOYEE_KEY,
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
                nextAction: connectorStep({
                    name: 'ensure_department', displayName: '确认现有账号部门', connectorName: FEISHU, connectorVersion: FEISHU_VERSION, actionName: 'update_user', retry: true, input: { auth: FEISHU_AUTH, openId: '{{provision.output.open_id}}', departmentId: '{{map_department.output.departmentId}}' },
                    nextAction: connectorStep({
                        name: 'check_notified',
                        displayName: '查是否已通知过',
                        connectorName: STORE,
                        connectorVersion: STORE_VERSION,
                        actionName: 'get',
                        input: { key: ONBOARD_NOTIFIED_KEY, store_scope: 'COLLECTION' },
                        nextAction: routerStep({
                            name: 'only_when_not_notified',
                            displayName: '没通知过才通知',
                            condition: { operator: 'DOES_NOT_EXIST', firstValue: '{{check_notified[\'output\']}}' },
                            branchName: '还没通知',
                            fallbackName: '已通知过',
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
                                    dedupeKey: ONBOARD_NOTIFIED_KEY,
                                },
                                nextAction: connectorStep({
                                    name: 'mark_notified',
                                    displayName: '记下已通知',
                                    connectorName: STORE,
                                    connectorVersion: STORE_VERSION,
                                    actionName: 'put',
                                    input: { key: ONBOARD_NOTIFIED_KEY, value: 'sent', store_scope: 'COLLECTION' },
                                }),
                            }),
                        }),
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
        dedupeKey: '{{trigger.recordInfo.jobNumber}}-{{trigger.recordInfo.oIdDepartment}}-{{trigger.recordInfo.startDate}}',
        dedupeDays: 30,
        orderKeyPath: EMPLOYEE_KEY,
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
                        name: 'check_notified',
                        displayName: '查是否已通知过',
                        connectorName: STORE,
                        connectorVersion: STORE_VERSION,
                        actionName: 'get',
                        input: { key: LEAVE_NOTIFIED_KEY, store_scope: 'COLLECTION' },
                        nextAction: routerStep({
                            name: 'only_when_not_notified',
                            displayName: '没通知过才通知',
                            condition: { operator: 'DOES_NOT_EXIST', firstValue: '{{check_notified[\'output\']}}' },
                            branchName: '还没通知',
                            fallbackName: '已通知过',
                            child: connectorStep({
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
                                    dedupeKey: LEAVE_NOTIFIED_KEY,
                                },
                                nextAction: connectorStep({
                                    name: 'mark_notified',
                                    displayName: '记下已通知',
                                    connectorName: STORE,
                                    connectorVersion: STORE_VERSION,
                                    actionName: 'put',
                                    input: { key: LEAVE_NOTIFIED_KEY, value: 'sent', store_scope: 'COLLECTION' },
                                }),
                            }),
                        }),
                    }),
                }),
            }),
        }),
    })
    return { key: 'leave', name: '员工离职暂停飞书账号', description: '北森离职生效后暂停飞书账号（数据保留、可恢复），并通知 IT 回收设备。', trigger, schemaVersion: null }
}

function withDepartmentRecovery(workflow: SolutionWorkflow): SolutionWorkflow {
    const original = workflow.trigger.nextAction
    if (!original) return workflow
    const call = connectorStep({ name: 'recover_department', displayName: '先收敛组织再查部门', connectorName: '@fema-ipaas/connector-subflows', connectorVersion: '~0.6.0', actionName: 'callWorkflow', input: { workflowId: '', mode: 'advanced', workflowProps: { payload: {} }, waitForResponse: true } })
    const route = routerStep({ name: 'missing_department', displayName: '部门对照缺失时自动补齐组织', condition: { operator: 'BOOLEAN_IS_FALSE', firstValue: '{{lookup_department.output.found}}' }, branchName: '先同步组织', fallbackName: '对照已存在', child: call })
    const lookup = connectorStep({ name: 'lookup_department', displayName: '先检查部门对照', connectorName: DATA_MAPPER, connectorVersion: '~0.5.0', actionName: 'get_mapping_value', input: { tableId: DEPARTMENT_TABLE.id, key: DEPARTMENT_OID }, nextAction: { ...route, nextAction: original } })
    return { ...workflow, trigger: WorkflowTrigger.parse({ ...workflow.trigger, nextAction: lookup }) }
}

function repairWorkflow(): SolutionWorkflow {
    const active = prefixedSteps({ workflow: withDepartmentRecovery(onboardWorkflow()), prefix: 'active_' })
    const left = prefixedSteps({ workflow: leaveWorkflow(), prefix: 'left_' })
    const route = routerStep({ name: 'current_status', displayName: '按最新人员状态处理', condition: { operator: 'TEXT_EXACTLY_MATCHES', firstValue: '{{trigger.output.recordInfo.employeeStatus}}', secondValue: '8', caseSensitive: true }, branchName: '离职暂停', fallbackName: '在职开通并同步部门', child: left })
    const trigger = WorkflowTrigger.parse({ name: 'trigger', type: 'CONNECTOR_TRIGGER', displayName: '人员状态补齐', valid: true, lastUpdatedDate: '2026-10-27T00:00:00.000Z', settings: { connectorName: '@fema-ipaas/connector-subflows', connectorVersion: '~0.6.0', triggerName: 'callableWorkflow', input: { mode: 'advanced', exampleData: { sampleData: {} } }, propertySettings: {}, concurrency: { maxConcurrentRuns: 0, orderKeyPath: '{{trigger.recordInfo.jobNumber}}' } }, nextAction: { ...route, children: [left, active] } })
    return { key: 'repair', name: '按当前人员状态补齐飞书账号', description: '对账补齐前已重新读取北森，按最新人员状态走相同的开通、部门、暂停和通知逻辑。', schemaVersion: null, trigger }
}

function prefixedSteps({ workflow, prefix }: { workflow: SolutionWorkflow, prefix: string }) {
    const names = workflowStructureUtil.getAllSteps(workflow.trigger).filter((step) => step.name !== workflow.trigger.name).map((step) => step.name)
    const rewritten = WorkflowTrigger.parse(replaceReferences({ value: workflow.trigger, names, prefix }))
    const trigger = workflowStructureUtil.transferStep(rewritten, (step) => step.name === workflow.trigger.name ? step : { ...step, name: `${prefix}${step.name}` })
    return WorkflowTrigger.parse(trigger).nextAction
}

function replaceReferences({ value, names, prefix }: { value: unknown, names: string[], prefix: string }): unknown {
    if (typeof value === 'string') return names.reduce((text, name) => text.replaceAll(`{{${name}.`, `{{${prefix}${name}.`).replaceAll(`{{${name}[`, `{{${prefix}${name}[`), value)
    if (Array.isArray(value)) return value.map((item: unknown) => replaceReferences({ value: item, names, prefix }))
    if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceReferences({ value: item, names, prefix })]))
    return value
}

function peopleReconciliation() {
    const active = [{ path: 'recordInfo.employeeStatus', in: ['2', '3', '7'] }]
    const left = [{ path: 'recordInfo.employeeStatus', in: ['8'] }]
    const body = ReconciliationRuleBody.parse({ projectId: '', name: '北森人员状态与飞书账号', workflowId: '', source: { connectorName: '@fema-ipaas/connector-beisen', actionName: 'enumerate_employees', connectionExternalId: '', input: { rootOrganizationId: 'config:rootOrganizationId', recentDeparturesDays: 30 }, keyPath: 'recordInfo.jobNumber' }, target: { connectorName: FEISHU, actionName: 'enumerate_users', connectionExternalId: '', input: { rootDepartmentId: '0' }, keyPath: 'employee_no' }, expectations: [{ aspect: 'account', when: active, expect: { kind: 'EXISTS' } }, { aspect: 'department', when: active, expect: { kind: 'CONTAINS', sourcePath: 'recordInfo.oIdDepartment', targetPath: 'department_ids', mappingTableId: 'table:department' } }, { aspect: 'suspension', when: left, expect: { kind: 'FLAG', targetPath: 'is_frozen', value: true } }], repair: { readActionName: 'get_employee_record', keyInput: 'employeeNo' } })
    const { projectId: _project, workflowId: _workflow, ...template } = body
    return { ...template, key: 'people', workflowKey: 'repair' }
}

const EMPLOYEE_KEY = '{{trigger.recordInfo.jobNumber}}'

const ONBOARD_NOTIFIED_KEY = `onboard-notified:${ref('recordInfo', 'jobNumber')}:${ref('recordInfo', 'startDate')}`

const LEAVE_NOTIFIED_KEY = `leave-notified:${ref('recordInfo', 'jobNumber')}:${ref('recordInfo', 'lastWorkDate')}`



const MANUAL_CHECKS = [
    { label: '北森连接器已勾选「员工信息」和「任职记录」两个对象', detail: '缺一个，北森会返回权限异常。字段权限也要允许读到手机号、工号、部门和人员状态', who: '北森管理员' },
    { label: '北森返回的手机号没有被脱敏', detail: '脱敏的手机号（如 129****1283）开通不了飞书账号。在连接器的字段权限里放开手机号', who: '北森管理员' },
    { label: '北森开放平台的授信 IP 包含本实例的出口 IP', detail: '不在白名单时北森会拒绝调用', who: '北森管理员' },
    { label: '飞书应用已开通所需权限，且通讯录权限范围覆盖要同步的部门', detail: '更新通讯录、通过手机号或邮箱获取用户 ID、以应用身份发消息；范围之外的部门无法开通账号', who: '飞书管理员' },
    { label: '映射表里已填好北森部门 OId 对应的飞书部门 ID', detail: '映射表缺少对应关系时，开通和调岗会明确失败，在问题中心修好映射表后可以重放', who: '安装的人' },
    { label: '用一名测试员工验证入职和离职都能从北森读到', detail: '北森只返回审批生效的记录，离职要过了最后工作日才算生效；先在北森造一个测试员工，确认触发器测试能读到', who: 'HR 或实施顾问' },
]

export const beisenFeishuSolution = buildBeisenFeishuSolution
