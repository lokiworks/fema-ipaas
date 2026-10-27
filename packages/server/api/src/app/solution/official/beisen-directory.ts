import { isObject, SolutionCheckKind, SolutionConfigType, SolutionPackage, WorkflowActionType, workflowStructureUtil, WorkflowTrigger } from '@fema-ipaas/shared'
import type { OfficialSolution } from '../official-solutions'
import { solutionPackageUtils } from '../solution-package-utils'
import { beisenFeishuSolution } from './beisen-feishu'
import { beisenFeishuOrgSolution } from './beisen-feishu-org'

function people({ target }: { target: Target }): OfficialSolution {
    const original = beisenFeishuSolution()
    const pkg = adapt({ pkg: original.package, target, organization: false })
    const pendingPatches = pkg.workflows.flatMap((workflow) => workflowStructureUtil.getAllSteps(workflow.trigger).filter((step) => step.type === WorkflowActionType.CONNECTOR && step.settings.actionName === 'suspend_user').map((step) => ({ workflowKey: workflow.key, stepName: step.name, inputKey: 'pendingDepartmentId' })))
    const config = target === 'dingtalk' ? [...pkg.config, { key: 'pendingDepartmentId', label: '待离职部门 ID', type: SolutionConfigType.TEXT, options: [], defaultValue: '', affectsWorkflows: ['leave', 'repair'], patches: pendingPatches }] : pkg.config
    const rules = pkg.reconciliationRules.map((rule) => ({ ...rule, target: { ...rule.target, keyPath: 'employee_no', input: { rootDepartmentId: '1', ...(target === 'dingtalk' ? { pendingDepartmentId: 'config:pendingDepartmentId' } : {}) } }, expectations: rule.expectations.map((expectation) => target === 'dingtalk' && expectation.aspect === 'suspension' ? { ...expectation, expect: { kind: 'FLAG', targetPath: 'pending_resignation', value: true } } : expectation) }))
    return { ...original, id: `official-beisen-${target}`, name: `北森 → ${labelOf(target)} 人员同步`, summary: target === 'dingtalk' ? '入职开通、调岗同步；离职移入待离职部门并通知管理员办理离职，账号仍然可用。' : '入职开通、调岗同步、离职停用企业微信成员，并通过自建应用通知 HR 与 IT。', version: '1.0', notes: target === 'dingtalk' ? '钉钉没有暂停账号接口。离职只移动部门，账号保持可用，并标记为「待管理员办理离职」；管理员必须在钉钉后台完成离职。管理员工作通知单独发送，先查后记；发送结果不确定时由问题中心要求人工确认。' : '通讯录写入使用 Contact Secret，成员读取和应用消息使用 App Secret。userid 使用北森工号，权限范围须覆盖同步树。', package: SolutionPackage.parse({ ...pkg, config, reconciliationRules: rules }) }
}

function organization({ target }: { target: Target }): OfficialSolution {
    const original = beisenFeishuOrgSolution()
    return { ...original, id: `official-beisen-${target}-org`, name: `北森 → ${labelOf(target)} 组织同步`, summary: '整树收敛、绑定优先、先父后子，停用只移动到归档部门或通知，永不删除。', package: adapt({ pkg: original.package, target, organization: true }) }
}

function adapt({ pkg, target, organization }: { pkg: SolutionPackage, target: Target, organization: boolean }): SolutionPackage {
    const rewritten = SolutionPackage.parse(rewrite({ value: pkg, target }))
    const workflows = rewritten.workflows.map((workflow) => ({ ...workflow, trigger: WorkflowTrigger.parse(workflowStructureUtil.transferStep(workflow.trigger, (step) => {
        if (step.type !== WorkflowActionType.CONNECTOR || step.settings.connectorName !== `@fema-ipaas/connector-${target}`) return step
        const input = step.settings.input
        const action = step.settings.actionName
        let converted: Record<string, unknown> = { ...input }
        if (action === 'find_user') converted = { auth: input['auth'], userid: '{{trigger.output.recordInfo.jobNumber}}' }
        if (action === 'provision_user') {
            const { employeeNo, employeeType: _type, ...rest } = input; converted = { ...rest, userid: employeeNo } 
        }
        if (action === 'update_user' || action === 'suspend_user') {
            const { openId, ...rest } = input; converted = { ...rest, userid: openId } 
        }
        if (action === 'send_group_message') {
            const { chatId, messageType: _type, ...rest } = input; converted = { ...rest, userid: chatId } 
        }
        return { ...step, settings: { ...step.settings, connectorVersion: '~0.1.0', actionName: action === 'send_group_message' ? target === 'wecom' ? 'send_app_message' : 'send_work_notice' : action, input: converted } }
    })) }))
    const tables = rewritten.mappingTables.map((table) => ({ ...table, id: table.key === 'department' ? `mt_beisen_department_${target}` : `table:${table.key}` }))
    const manualChecks = [{ label: `${labelOf(target)}应用已授权通讯录读写与消息权限`, detail: target === 'wecom' ? '配置可信 IP、双 Secret；应用可见范围覆盖所有同步成员与部门。' : '应用通讯录范围覆盖整树，待离职部门已创建，管理员已了解移动部门不会停用账号。', who: `${labelOf(target)}管理员` }]
    const built = solutionPackageUtils.buildPackage({ workflows, tables, manualChecks })
    const config = rewritten.config.map((item) => ({ ...item, label: item.key === 'hrChatId' ? 'HR 通知接收人 userid' : item.key === 'itChatId' ? 'IT / 管理员通知接收人 userid' : item.label, hint: item.key.endsWith('ChatId') ? target === 'wecom' ? '多个人用 | 分隔；接收人须在自建应用可见范围内。' : '多个人用逗号分隔；离职通知需要管理员在后台办理离职。' : item.hint, defaultValue: organization && item.key === 'rootDepartmentId' ? '1' : item.defaultValue, patches: item.patches.map((patch) => patch.inputKey === 'chatId' ? { ...patch, inputKey: 'userid' } : patch) }))
    const connectionChecks = rewritten.checks.filter((check) => check.kind === SolutionCheckKind.CONNECTION)
    const otherChecks = built.checks.filter((check) => check.kind !== SolutionCheckKind.CONNECTION).map((check) => check.kind === SolutionCheckKind.MANUAL ? { ...check, blocking: true } : check)
    return SolutionPackage.parse({ ...built, connections: rewritten.connections, config, reconciliationRules: rewritten.reconciliationRules, checks: [...connectionChecks, ...otherChecks] })
}

function rewrite({ value, target }: { value: unknown, target: Target }): unknown {
    if (typeof value === 'string') return value.replaceAll('@fema-ipaas/connector-feishu', `@fema-ipaas/connector-${target}`).replaceAll('feishu-connection', `${target}-connection`).replaceAll('mt_beisen_department', `mt_beisen_department_${target}`).replaceAll('[\'open_id\']', '[\'userid\']').replaceAll('.open_id', '.userid').replaceAll('.open_department_id', '.id').replaceAll('飞书账号已暂停', target === 'dingtalk' ? '已移到待离职部门，账号仍可用，请管理员在钉钉后台办理离职并回收设备' : '企业微信账号已停用').replaceAll('暂停飞书账号', target === 'dingtalk' ? '移动到待离职部门，账号不暂停' : '停用企业微信账号').replaceAll('暂停飞书', target === 'dingtalk' ? '移动到待离职部门（不暂停）' : '停用企业微信').replaceAll('onboard-notified:', `${target}:onboard-notified:`).replaceAll('leave-notified:', `${target}:leave-notified:`).replaceAll('飞书', labelOf(target))
    if (Array.isArray(value)) return value.map((item: unknown) => rewrite({ value: item, target }))
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite({ value: item, target })]))
    return value
}

function labelOf(target: Target): string {
    return target === 'wecom' ? '企业微信' : '钉钉' 
}

export const beisenDirectorySolutions = { people, organization }
type Target = 'wecom' | 'dingtalk'
