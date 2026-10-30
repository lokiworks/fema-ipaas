import { AgentMcpServerInfo, AgentMcpServerProblemCode, agentMcpServers, isNil } from '@fema-ipaas/core-utils'
import {
    BranchExecutionType,
    scheduleUtils,
    singleValueConditions,
    triggerRunSettingsUtils,
    WorkflowAction,
    WorkflowActionType,
    workflowReferenceUtil,
    workflowStructureUtil,
    WorkflowTrigger,
    WorkflowTriggerType,
    WorkflowVersion,
} from '@fema-ipaas/shared'

function find({ version, context }: { version: WorkflowVersion, context: PublishValidationContext }): PublishProblem[] {
    const steps = collectSteps(version.trigger)
    const stepNames = new Set(steps.map(({ step }) => step.name))
    const loopNames = new Set(steps.filter(({ step }) => step.type === WorkflowActionType.LOOP_ON_ITEMS).map(({ step }) => step.name))
    return steps
        .filter(({ step }) => !isSkipped(step))
        .flatMap((entry) => problemsOfStep({ entry, context, stepNames, loopNames }))
}

function describe(problems: PublishProblem[]): string {
    const shown = problems.slice(0, MAX_PROBLEMS_SHOWN).map((problem) => `「${problem.stepDisplayName}」${problem.reason}`)
    const hidden = problems.length - shown.length
    return `流程还有 ${problems.length} 个问题，修好后才能发布：${shown.join('；')}${hidden > 0 ? `；另有 ${hidden} 个` : ''}`
}

function problemsOfStep({ entry, context, stepNames, loopNames }: { entry: StepEntry, context: PublishValidationContext, stepNames: Set<string>, loopNames: Set<string> }): PublishProblem[] {
    const { step } = entry
    const reasons = [
        ...structureReasons({ step, context }),
        ...referenceReasons({ entry, stepNames, loopNames }),
    ]
    const incomplete = reasons.length === 0 && !step.valid && step.type !== WorkflowTriggerType.EMPTY && connectorIsKnown({ step, context }) ? [REASON_INCOMPLETE] : []
    return [...reasons, ...incomplete].map((reason) => ({ stepName: step.name, stepDisplayName: step.displayName, reason }))
}

function structureReasons({ step, context }: { step: WorkflowAction | WorkflowTrigger, context: PublishValidationContext }): string[] {
    switch (step.type) {
        case WorkflowTriggerType.EMPTY:
            return ['还没有选择触发器']
        case WorkflowTriggerType.CONNECTOR:
            return [
                ...connectorReasons({ step, context, operationName: step.settings.triggerName, isTrigger: true }),
                ...triggerReasons({ step }),
            ]
        case WorkflowActionType.CONNECTOR:
            return [
                ...connectorReasons({ step, context, operationName: step.settings.actionName, isTrigger: false }),
                ...agentReasons({ step, context }),
            ]
        case WorkflowActionType.ROUTER:
            return routerReasons({ step })
        case WorkflowActionType.PARALLEL:
            return step.settings.branches.length < 2 ? ['并行分支至少要有 2 个'] : []
        case WorkflowActionType.LOOP_ON_ITEMS:
            return isBlank(step.settings.items) ? ['循环的数据来源还没填'] : []
        case WorkflowActionType.CODE:
            return isBlank(step.settings.sourceCode.code) ? ['代码是空的'] : []
        case WorkflowActionType.COMPONENT:
            return []
    }
}

function connectorReasons({ step, context, operationName, isTrigger }: { step: WorkflowAction | WorkflowTrigger, context: PublishValidationContext, operationName: string | undefined, isTrigger: boolean }): string[] {
    if (step.type !== WorkflowActionType.CONNECTOR && step.type !== WorkflowTriggerType.CONNECTOR) {
        return []
    }
    const connector = context.connectors[step.settings.connectorName]
    if (connector?.status === ConnectorSpecStatus.MISSING) {
        return [`用到的连接器「${step.settings.connectorName}」在这个实例里不可用`]
    }
    if (isBlank(operationName)) {
        return ['还没有选择操作']
    }
    if (isNil(connector)) {
        return []
    }
    const operation = (isTrigger ? connector.triggers : connector.actions)[operationName ?? '']
    if (isNil(operation)) {
        return ['选择的操作在这个连接器里不存在']
    }
    const input = readRecord(step.settings.input)
    const missing = operation.props
        .filter((prop) => prop.required && prop.name !== AUTH_PROPERTY && isBlank(input[prop.name]))
        .map((prop) => `缺少必填项「${prop.displayName}」`)
    return [
        ...connectionReasons({ step, context, requiresAuth: connector.requiresAuth && operation.requiresAuth }),
        ...missing,
    ]
}

function agentReasons({ step, context }: { step: WorkflowAction, context: PublishValidationContext }): string[] {
    if (step.type !== WorkflowActionType.CONNECTOR || step.settings.connectorName !== AI_CONNECTOR || step.settings.actionName !== AGENT_ACTION || isNil(context.mcpServers)) {
        return []
    }
    const input = readRecord(step.settings.input)
    return agentMcpServers.inspect({
        entries: agentMcpServers.read(input['mcpServers']),
        servers: context.mcpServers,
        allowedTools: agentMcpServers.readNames(input['allowedTools']),
    }).map((problem) => {
        switch (problem.code) {
            case AgentMcpServerProblemCode.SERVER_MISSING:
                return `选的 MCP 服务器「${problem.server}」已被删除，或在当前项目里不可用`
            case AgentMcpServerProblemCode.SERVER_BROKEN:
                return `MCP 服务器「${problem.server}」现在连不上，恢复连接后才能发布`
            case AgentMcpServerProblemCode.TOOL_MISSING:
                return `允许的工具「${problem.tool ?? ''}」在选的服务器上已经不存在`
        }
    })
}

function connectionReasons({ step, context, requiresAuth }: { step: WorkflowAction | WorkflowTrigger, context: PublishValidationContext, requiresAuth: boolean }): string[] {
    const ids = workflowReferenceUtil.connectionIdsOf(step)
    if (ids.length === 0) {
        const auth = readRecord(readSettings(step)['input'])[AUTH_PROPERTY]
        return requiresAuth && isBlank(auth) ? ['还没有选择连接'] : []
    }
    if (isNil(context.connectionIds)) {
        return []
    }
    const known = context.connectionIds
    return ids.filter((externalId) => !known.has(externalId)).map((externalId) => `选的连接「${externalId}」不存在或已被删除`)
}

function triggerReasons({ step }: { step: WorkflowTrigger }): string[] {
    if (step.type !== WorkflowTriggerType.CONNECTOR) {
        return []
    }
    const { connectorName, triggerName, dedupe } = step.settings
    const input = readRecord(step.settings.input)
    const scheduled = scheduleUtils.isScheduleConnector(connectorName)
    const cron = scheduled && triggerName === CRON_TRIGGER && !isBlank(input['cronExpression']) && !scheduleUtils.validateCron(String(input['cronExpression']))
        ? ['Cron 表达式不合法']
        : []
    const interval = scheduled && triggerName === INTERVAL_TRIGGER && !isBlank(input['minutes']) && !(Number(input['minutes']) > 0)
        ? ['间隔分钟数要大于 0']
        : []
    const dedupeError = dedupe?.enabled === true ? triggerRunSettingsUtils.validateKeyPath(dedupe.keyPath) : null
    return [...cron, ...interval, ...(isNil(dedupeError) ? [] : ['去重键写得不对，要写成触发器输出里的字段'])]
}

function routerReasons({ step }: { step: WorkflowAction }): string[] {
    if (step.type !== WorkflowActionType.ROUTER) {
        return []
    }
    return step.settings.branches.flatMap((branch) => {
        if (branch.branchType !== BranchExecutionType.CONDITION) {
            return []
        }
        const conditions = branch.conditions.flat()
        if (conditions.length === 0) {
            return [`分支「${branch.branchName}」没有设置条件`]
        }
        const incomplete = conditions.some((condition) => {
            const needsSecond = isNil(condition.operator) || !singleValueConditions.includes(condition.operator)
            const second = 'secondValue' in condition ? condition.secondValue : ''
            return isBlank(condition.firstValue) || (needsSecond && isBlank(second))
        })
        return incomplete ? [`分支「${branch.branchName}」的条件没填完整`] : []
    })
}

function referenceReasons({ entry, stepNames, loopNames }: { entry: StepEntry, stepNames: Set<string>, loopNames: Set<string> }): string[] {
    const { step, upstream, loops } = entry
    if (step.type === WorkflowTriggerType.EMPTY) {
        return []
    }
    const settings = readRecord(step.settings)
    const references = workflowReferenceUtil.extractFromValue(REFERENCE_SETTINGS.map((key) => settings[key]))
    const unique = [...new Map(references.map((reference) => [`${reference.root}|${reference.path.join('.')}`, reference])).values()]
    return unique.flatMap((reference) => {
        if (reference.root === VARIABLES_ROOT) {
            return []
        }
        if (stepNames.has(reference.root)) {
            if (!upstream.includes(reference.root)) {
                return [`引用的步骤不在它的上游：${reference.token}`]
            }
            const loopVariable = workflowReferenceUtil.stepOutputPath(reference.path)[0] ?? ''
            const outsideLoop = loopNames.has(reference.root) && LOOP_VARIABLES.includes(loopVariable) && !loops.includes(reference.root)
            return outsideLoop ? [`在循环外面用了循环变量：${reference.token}`] : []
        }
        return STEP_NAME_PATTERN.test(reference.root) ? [`引用了已删除的步骤：${reference.token}`] : []
    })
}

function connectorIsKnown({ step, context }: { step: WorkflowAction | WorkflowTrigger, context: PublishValidationContext }): boolean {
    if (step.type !== WorkflowActionType.CONNECTOR && step.type !== WorkflowTriggerType.CONNECTOR) {
        return true
    }
    return !isNil(context.connectors[step.settings.connectorName])
}

function collectSteps(trigger: WorkflowTrigger): StepEntry[] {
    return [
        { step: trigger, upstream: [], loops: [] },
        ...walkChain({ head: trigger.nextAction, upstream: [trigger.name], loops: [] }),
    ]
}

function walkChain({ head, upstream, loops }: { head: WorkflowAction | undefined | null, upstream: string[], loops: string[] }): StepEntry[] {
    if (isNil(head)) {
        return []
    }
    const inside = [...upstream, head.name]
    const children = childChains(head).flatMap((child) => walkChain({
        head: child.head,
        upstream: inside,
        loops: child.isLoop ? [...loops, head.name] : loops,
    }))
    return [
        { step: head, upstream, loops },
        ...children,
        ...walkChain({ head: head.nextAction, upstream: [...inside, ...workflowStructureUtil.getStepsVisibleAfterJoin(head).map(({ step }) => step.name)], loops }),
    ]
}

function childChains(step: WorkflowAction): { head: WorkflowAction | undefined | null, isLoop: boolean }[] {
    switch (step.type) {
        case WorkflowActionType.LOOP_ON_ITEMS:
            return [{ head: step.firstLoopAction, isLoop: true }]
        case WorkflowActionType.ROUTER:
        case WorkflowActionType.PARALLEL:
            return step.children.map((child) => ({ head: child, isLoop: false }))
        case WorkflowActionType.CODE:
        case WorkflowActionType.CONNECTOR:
        case WorkflowActionType.COMPONENT:
            return [
                { head: step.continueOnFailureBranches?.onSuccess, isLoop: false },
                { head: step.continueOnFailureBranches?.onFailure, isLoop: false },
            ]
    }
}

function isSkipped(step: WorkflowAction | WorkflowTrigger): boolean {
    return 'skip' in step && step.skip === true
}

function isBlank(value: unknown): boolean {
    if (isNil(value)) {
        return true
    }
    if (typeof value === 'string') {
        return value.trim().length === 0
    }
    if (Array.isArray(value)) {
        return value.length === 0
    }
    return hasOnlyBlankKeys(value)
}

function hasOnlyBlankKeys(value: unknown): boolean {
    if (typeof value !== 'object' || isNil(value)) {
        return false
    }
    const keys = Object.keys(value)
    return keys.length > 0 && keys.every((key) => key.trim().length === 0)
}

function readRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || isNil(value) || Array.isArray(value)) {
        return {}
    }
    return Object.fromEntries(Object.entries(value))
}

function readSettings(step: WorkflowAction | WorkflowTrigger): Record<string, unknown> {
    return readRecord(step.settings)
}

export const workflowPublishValidator = { find, describe }

export enum ConnectorSpecStatus {
    LOADED = 'LOADED',
    MISSING = 'MISSING',
}

const AUTH_PROPERTY = 'auth'
const AI_CONNECTOR = '@fema-ipaas/connector-ai'
const AGENT_ACTION = 'run_agent'
const CRON_TRIGGER = 'cron_expression'
const INTERVAL_TRIGGER = 'every_x_minutes'
const VARIABLES_ROOT = 'variables'
const LOOP_VARIABLES = ['item', 'index']
const STEP_NAME_PATTERN = /^(trigger|step_\d+)$/
const REFERENCE_SETTINGS = ['input', 'items', 'branches']
const REASON_INCOMPLETE = '配置还不完整，请打开这一步检查'
const MAX_PROBLEMS_SHOWN = 12

export type OperationSpec = {
    requiresAuth: boolean
    props: { name: string, displayName: string, required: boolean }[]
}

export type ConnectorSpec =
    | { status: ConnectorSpecStatus.MISSING }
    | { status: ConnectorSpecStatus.LOADED, requiresAuth: boolean, actions: Record<string, OperationSpec>, triggers: Record<string, OperationSpec> }

export type PublishValidationContext = {
    connectors: Record<string, ConnectorSpec | undefined>
    connectionIds: Set<string> | null
    mcpServers?: AgentMcpServerInfo[] | null
}

export type PublishProblem = {
    stepName: string
    stepDisplayName: string
    reason: string
}

type StepEntry = {
    step: WorkflowAction | WorkflowTrigger
    upstream: string[]
    loops: string[]
}
