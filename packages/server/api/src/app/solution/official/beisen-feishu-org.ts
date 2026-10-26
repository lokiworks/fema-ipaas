import { SolutionConfigType, SolutionPackage, SolutionWorkflow, WorkflowTrigger } from '@fema-ipaas/shared'
import { OfficialSolution } from '../official-solutions'
import { solutionPackageUtils } from '../solution-package-utils'
import { BEISEN, BEISEN_AUTH, BEISEN_VERSION, connectorStep, DATA_MAPPER, DEPARTMENT_TABLE, FEISHU, FEISHU_AUTH, FEISHU_VERSION, routerStep, STAMP } from './official-solution-builders'

function build(): OfficialSolution {
    const workflows = [converge(), wakeup({ scheduled: true }), wakeup({ scheduled: false })]
    const built = solutionPackageUtils.buildPackage({ workflows, tables: [DEPARTMENT_TABLE], manualChecks: [{ label: '飞书通讯录权限范围为全部成员', detail: '部门读写权限需要覆盖整棵同步树，先在飞书应用后台确认并发布权限。', who: '飞书管理员' }] })
    const config = [
        textConfig({ key: 'rootOrganizationId', label: '北森根组织 OId', value: '', steps: [{ stepName: 'source_tree', inputKey: 'rootOrganizationId' }, { stepName: 'plan', inputKey: 'rootSourceKey' }] }),
        textConfig({ key: 'rootDepartmentId', label: '飞书根部门 ID', value: '0', steps: [{ stepName: 'target_tree', inputKey: 'rootDepartmentId' }, { stepName: 'plan', inputKey: 'rootTargetId' }] }),
        textConfig({ key: 'archiveParentId', label: '归档父部门 ID（留空只通知）', value: '', steps: [{ stepName: 'plan', inputKey: 'archiveParentId' }] }),
        textConfig({ key: 'maxArchives', label: '每次最多归档部门数', value: '10', steps: [{ stepName: 'plan', inputKey: 'maxArchives' }] }),
        textConfig({ key: 'maxMoves', label: '每次最多移动部门数', value: '50', steps: [{ stepName: 'plan', inputKey: 'maxMoves' }] }),
        textConfig({ key: 'itChatId', label: 'IT 通知群 ID', value: '', steps: [{ stepName: 'notify', inputKey: 'chatId' }] }),
    ]
    const pkg: SolutionPackage = { ...built, config, checks: built.checks.map((check) => check.key === 'manual:1' ? { ...check, blocking: true } : check) }
    return { id: 'official-beisen-feishu-org', name: '北森 → 飞书 组织同步', summary: '按整棵组织树收敛，先父后子地绑定、创建、更新或归档部门，共用人员同步的部门映射表。', category: 'HR', version: '1.0', publishedAt: '2026-10-27T00:00:00.000Z', notes: '发布顺序：整树收敛子流程，再发布定时与组织变动唤醒。已有同名部门会绑定；停用只归档或通知，永不删除。根部门不改名。整树收敛并发上限为 1，归档与移动超过闸门时整轮停止。', package: pkg }
}

function converge(): SolutionWorkflow {
    const tableId = DEPARTMENT_TABLE.id
    const saveBinding = connectorStep({ name: 'save_created_binding', displayName: '保存部门绑定', connectorName: DATA_MAPPER, connectorVersion: '~0.5.0', actionName: 'upsert_mapping_rows', input: { tableId, rows: [{ key: '{{resolve.output.sourceKey}}', value: '{{upsert.output.open_department_id}}' }], onConflict: '{{resolve.output.onConflict}}' } })
    const upsert = connectorStep({ name: 'upsert', displayName: '创建或更新部门', connectorName: FEISHU, connectorVersion: FEISHU_VERSION, actionName: 'upsert_department', input: { auth: FEISHU_AUTH, customDepartmentId: '{{resolve.output.customDepartmentId}}', targetDepartmentId: '{{resolve.output.targetId}}', name: '{{resolve.output.name}}', parentDepartmentId: '{{resolve.output.parentDepartmentId}}', order: '{{resolve.output.order}}' }, retry: true, nextAction: saveBinding })
    const bind = connectorStep({ name: 'bind', displayName: '绑定已有部门', connectorName: DATA_MAPPER, connectorVersion: '~0.5.0', actionName: 'upsert_mapping_rows', input: { tableId, rows: [{ key: '{{resolve.output.sourceKey}}', value: '{{resolve.output.targetId}}' }], onConflict: 'KEEP' } })
    const archive = connectorStep({ name: 'archive', displayName: '归档停用部门', connectorName: FEISHU, connectorVersion: FEISHU_VERSION, actionName: 'archive_department', input: { auth: FEISHU_AUTH, departmentId: '{{resolve.output.targetId}}', archiveParentId: '{{plan.output.archiveParentId}}' }, retry: true })
    const route = {
        type: 'ROUTER', name: 'apply_change', displayName: '按变更类型执行', valid: true, lastUpdatedDate: STAMP,
        settings: { executionType: 'EXECUTE_FIRST_MATCH', branches: ['UPSERT', 'BIND', 'ARCHIVE'].map((value) => ({ branchType: 'CONDITION', branchName: value, conditions: [[{ operator: 'TEXT_EXACTLY_MATCHES', firstValue: '{{resolve.output.kind}}', secondValue: value, caseSensitive: true }]] })).concat([{ branchType: 'FALLBACK', branchName: '仅汇总通知', conditions: [] }]) }, children: [upsert, bind, archive, null],
    }
    const resolve = connectorStep({ name: 'resolve', displayName: '解析当前操作', connectorName: ORG_SYNC, connectorVersion: '~0.1.0', actionName: 'resolve_operation', input: { operation: '{{changes.output.item}}', source: '{{source_tree.output.items}}', bindings: '{{latest_bindings.output.bindings}}', rootSourceKey: '{{plan.output.rootSourceKey}}', rootTargetId: '{{plan.output.rootTargetId}}' }, nextAction: route })
    const latest = connectorStep({ name: 'latest_bindings', displayName: '读取最新部门绑定', connectorName: DATA_MAPPER, connectorVersion: '~0.5.0', actionName: 'get_mapping_rows', input: { tableId }, nextAction: resolve })
    const response = connectorStep({ name: 'respond', displayName: '返回同步结果', connectorName: SUBFLOWS, connectorVersion: '~0.6.0', actionName: 'returnResponse', input: { mode: 'advanced', response: { response: '{{plan.output}}' } } })
    const notify = routerStep({ name: 'has_notices', displayName: '有停用或孤儿组织时通知', condition: { operator: 'NUMBER_IS_GREATER_THAN', firstValue: '{{plan.output.noticeCount}}', secondValue: '0' }, branchName: '需要处理', fallbackName: '无须通知', child: connectorStep({ name: 'notify', displayName: '通知 IT 处理组织差异', connectorName: FEISHU, connectorVersion: FEISHU_VERSION, actionName: 'send_group_message', input: { auth: FEISHU_AUTH, chatId: '', messageType: 'text', content: '组织同步需要管理员检查：{{plan.output.noticeText}}', dedupeKey: 'org-notice:{{plan.output.noticeText}}' } }) })
    const loop = { type: 'LOOP_ON_ITEMS', name: 'changes', displayName: '先父后子地应用变更', valid: true, lastUpdatedDate: STAMP, settings: { items: '{{plan.output.ops}}' }, firstLoopAction: latest, nextAction: { ...notify, nextAction: response } }
    const rootBinding = connectorStep({ name: 'root_binding', displayName: '确认根部门绑定', connectorName: DATA_MAPPER, connectorVersion: '~0.5.0', actionName: 'upsert_mapping_rows', input: { tableId, rows: [{ key: '{{plan.output.rootSourceKey}}', value: '{{plan.output.rootTargetId}}' }], onConflict: 'KEEP' }, nextAction: loop })
    const plan = connectorStep({ name: 'plan', displayName: '计算整树变更计划与闸门', connectorName: ORG_SYNC, connectorVersion: '~0.1.0', actionName: 'plan_tree_sync', input: { source: '{{source_tree.output.items}}', target: '{{target_tree.output.items}}', bindings: '{{bindings.output.bindings}}', rootSourceKey: '', rootTargetId: '0', archiveParentId: '', failOnOrphans: true, maxArchives: 10, maxMoves: 50 }, nextAction: rootBinding })
    const bindings = connectorStep({ name: 'bindings', displayName: '读取部门绑定', connectorName: DATA_MAPPER, connectorVersion: '~0.5.0', actionName: 'get_mapping_rows', input: { tableId }, nextAction: plan })
    const target = connectorStep({ name: 'target_tree', displayName: '读取飞书整棵部门树', connectorName: FEISHU, connectorVersion: FEISHU_VERSION, actionName: 'enumerate_departments', input: { auth: FEISHU_AUTH, rootDepartmentId: '0', allPages: true, pageSize: 50 }, nextAction: bindings })
    const source = connectorStep({ name: 'source_tree', displayName: '读取北森整棵组织树', connectorName: BEISEN, connectorVersion: BEISEN_VERSION, actionName: 'enumerate_organizations', input: { auth: BEISEN_AUTH, rootOrganizationId: '', allPages: true, pageSize: 300 }, nextAction: target })
    const trigger = WorkflowTrigger.parse({ name: 'trigger', type: 'CONNECTOR_TRIGGER', displayName: '整树收敛子流程', valid: true, lastUpdatedDate: STAMP, settings: { connectorName: SUBFLOWS, connectorVersion: '~0.6.0', triggerName: 'callableWorkflow', input: { mode: 'advanced', exampleData: { sampleData: {} } }, propertySettings: {}, concurrency: { maxConcurrentRuns: 1 } }, nextAction: source })
    return { key: 'converge', name: '组织整树收敛', description: '共享的组织收敛子流程，先发布此工作流。', schemaVersion: null, trigger }
}

function wakeup({ scheduled }: { scheduled: boolean }): SolutionWorkflow {
    const call = connectorStep({ name: 'converge_tree', displayName: '调用整树收敛', connectorName: SUBFLOWS, connectorVersion: '~0.6.0', actionName: 'callWorkflow', input: { workflowId: 'workflow:converge', mode: 'advanced', workflowProps: { payload: {} }, waitForResponse: false } })
    const trigger = WorkflowTrigger.parse({ name: 'trigger', type: 'CONNECTOR_TRIGGER', valid: true, displayName: scheduled ? '每 15 分钟检查组织树' : '北森组织变动', lastUpdatedDate: STAMP, settings: { connectorName: scheduled ? '@fema-ipaas/connector-schedule' : BEISEN, connectorVersion: scheduled ? '~0.1.0' : BEISEN_VERSION, triggerName: scheduled ? 'every_x_minutes' : 'organization_changed', input: scheduled ? { minutes: 15 } : { auth: BEISEN_AUTH }, propertySettings: {}, dedupe: { enabled: !scheduled, keyPath: 'org-tree', windowSeconds: 60 } }, nextAction: call })
    return { key: scheduled ? 'scheduled' : 'changed', name: scheduled ? '定时检查组织树' : '组织变动唤醒整树同步', schemaVersion: null, trigger }
}

function textConfig({ key, label, value, steps }: { key: string, label: string, value: string, steps: { stepName: string, inputKey: string }[] }) {
    return { key, label, required: key !== 'archiveParentId', type: SolutionConfigType.TEXT, options: [], defaultValue: value, affectsWorkflows: ['converge'], patches: steps.map((step) => ({ workflowKey: 'converge', ...step })) }
}

const ORG_SYNC = '@fema-ipaas/connector-org-sync'
const SUBFLOWS = '@fema-ipaas/connector-subflows'

export const beisenFeishuOrgSolution = build
