import { isNil, ProjectId, TenantId, tryCatch } from '@fema-ipaas/core-utils'
import {
    errorHandlingUtils,
    Execution,
    ExecutionStatus,
    RunEnvironment,
    RunVerificationResult,
    StepOutput,
    StepOutputStatus,
    VERIFICATION_DEFAULT_WINDOW_HOURS,
    WorkflowActionType,
    workflowStructureUtil,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { IsNull, MoreThanOrEqual, Not } from 'typeorm'
import { ActionRunOutcome, actionRunService, ActionRunStatus } from '../action-run/action-run.service'
import { issueSideEffects } from '../issue/issue-side-effects'
import { issueService } from '../issue/issue.service'
import { projectService } from '../project/project-service'
import { executionRepo, executionService } from '../workflows/execution/execution-service'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { VerificationRule, verificationRules } from './verification-rules'

export const verificationService = (log: FastifyBaseLogger, deps: VerificationDeps = defaultDeps(log)) => ({
    async run({ projectId, tenantId, sinceHours = VERIFICATION_DEFAULT_WINDOW_HOURS }: RunParams): Promise<RunVerificationResult> {
        const since = dayjs().subtract(sinceHours, 'hour').toISOString()
        const candidates = await executionRepo().find({
            where: {
                projectId,
                environment: RunEnvironment.PRODUCTION,
                status: ExecutionStatus.SUCCEEDED,
                businessKey: Not(IsNull()),
                archivedAt: IsNull(),
                finishTime: MoreThanOrEqual(since),
            },
            order: { finishTime: 'DESC' },
            take: MAX_CANDIDATES,
        })
        const versions = await loadVersions({ log, versionIds: [...new Set(candidates.map((execution) => execution.workflowVersionId))] })
        const verifiable = candidates.filter((execution) => verifiableSteps({ version: versions.get(execution.workflowVersionId) }).length > 0)
        const truncated = verifiable.length > MAX_RUNS_CHECKED || candidates.length === MAX_CANDIDATES
        const planned = (await Promise.all(verifiable.slice(0, MAX_RUNS_CHECKED).map(async (execution) => {
            const version = versions.get(execution.workflowVersionId)
            if (isNil(version) || isNil(execution.businessKey)) {
                return []
            }
            const steps = await deps.readSteps({ execution })
            return planRun({ execution, version, steps, businessKey: execution.businessKey })
        }))).flat()
        const checks = await executePlans({ deps, tenantId, projectId, plans: supersede({ plans: planned }) })
        const issueIds = await recordOutcomes({ log, projectId, outcomes: checks, versions })
        const skippedRuns = candidates.length - verifiable.length
        return {
            checked: checks.filter((outcome) => outcome.kind !== OutcomeKind.SKIPPED).length,
            matched: checks.filter((outcome) => outcome.kind === OutcomeKind.MATCHED).length,
            mismatched: checks.filter((outcome) => outcome.kind === OutcomeKind.MISMATCHED).length,
            unreadable: checks.filter((outcome) => outcome.kind === OutcomeKind.UNREADABLE).length,
            skipped: skippedRuns + checks.filter((outcome) => outcome.kind === OutcomeKind.SKIPPED).length,
            truncated,
            issueIds,
            problems: checks
                .filter((outcome) => outcome.kind === OutcomeKind.MISMATCHED || outcome.kind === OutcomeKind.UNREADABLE)
                .slice(0, MAX_PROBLEMS_LISTED)
                .map((outcome) => ({ businessKey: outcome.businessKey, stepName: outcome.stepName, outcome: outcome.kind === OutcomeKind.MISMATCHED ? 'MISMATCHED' : 'UNREADABLE', detail: outcome.detail })),
        }
    },

    async runForAllProjects(): Promise<void> {
        const rows = await executionRepo().createQueryBuilder('execution')
            .select('DISTINCT execution."projectId"', 'projectId')
            .where('execution.environment = :environment', { environment: RunEnvironment.PRODUCTION })
            .andWhere('execution.status = :status', { status: ExecutionStatus.SUCCEEDED })
            .andWhere('execution."businessKey" IS NOT NULL')
            .andWhere('execution."finishTime" >= :since', { since: dayjs().subtract(VERIFICATION_DEFAULT_WINDOW_HOURS, 'hour').toISOString() })
            .getRawMany<{ projectId: string }>()
        await rows.reduce<Promise<void>>(async (previous, row) => {
            await previous
            const { error } = await tryCatch(async () => {
                const tenantId = await projectService(log).getTenantId(row.projectId)
                await this.run({ projectId: row.projectId, tenantId })
            })
            if (!isNil(error)) {
                log.error({ error, project: { id: row.projectId } }, '[verificationService#runForAllProjects] Verification failed')
            }
        }, Promise.resolve())
    },
})

async function loadVersions({ log, versionIds }: { log: FastifyBaseLogger, versionIds: string[] }): Promise<Map<string, WorkflowVersion>> {
    const loaded = await Promise.all(versionIds.map(async (id) => [id, await workflowVersionService(log).getOne(id)] as const))
    return new Map(loaded.flatMap(([id, version]) => (isNil(version) ? [] : [[id, version] as const])))
}

function verifiableSteps({ version }: { version: WorkflowVersion | undefined }): VerifiableStep[] {
    if (isNil(version)) {
        return []
    }
    return workflowStructureUtil.getAllSteps(version.trigger).flatMap((step) => {
        if (step.type !== WorkflowActionType.CONNECTOR || step.skip === true) {
            return []
        }
        const rule = verificationRules.ruleFor({ connectorName: step.settings.connectorName, actionName: step.settings.actionName ?? '' })
        const auth = step.settings.input['auth']
        return isNil(rule) || typeof auth !== 'string' ? [] : [{ name: step.name, displayName: step.displayName, connectorName: step.settings.connectorName, rule, auth }]
    })
}

function planRun({ execution, version, steps, businessKey }: PlanRunParams): Plan[] {
    return verifiableSteps({ version }).map((target): Plan => {
        const base = { workflowId: version.workflowId, stepName: target.name, stepDisplayName: target.displayName, executionId: execution.id, businessKey }
        const stepOutput = steps?.[target.name]
        if (isNil(stepOutput) || stepOutput.status !== StepOutputStatus.SUCCEEDED) {
            return { base, target, skipped: 'the step did not run in this run', finishedAt: finishedAtOf(execution) }
        }
        const readInput = target.rule.readInput({ input: stepOutput.input, output: stepOutput.output })
        if (isNil(readInput)) {
            return { base, target, skipped: 'the run log does not hold what is needed to read the result back', finishedAt: finishedAtOf(execution) }
        }
        const openId = readInput['openId']
        const subject = typeof openId === 'string' ? `${target.connectorName}:${openId}:${target.rule.aspect}` : null
        return { base, target, stepOutput, readInput, subject, finishedAt: finishedAtOf(execution) }
    })
}

function readableFailure(raw: string | null): string {
    const readable = isNil(raw) ? '' : errorHandlingUtils.classifyErrorMessage({ message: raw, timedOut: false }).message
    return readable.length > 0 ? readable : 'the read-back failed'
}

function finishedAtOf(execution: Execution): number {
    return isNil(execution.finishTime) ? 0 : dayjs(execution.finishTime).valueOf()
}

function supersede({ plans }: { plans: Plan[] }): Plan[] {
    const newestBySubject = new Map<string, number>()
    plans.forEach((plan) => {
        if (!isNil(plan.subject) && plan.skipped === undefined) {
            newestBySubject.set(plan.subject, Math.max(newestBySubject.get(plan.subject) ?? 0, plan.finishedAt))
        }
    })
    return plans.map((plan) => {
        const newest = isNil(plan.subject) ? undefined : newestBySubject.get(plan.subject)
        return !isNil(newest) && plan.finishedAt < newest && plan.skipped === undefined
            ? { ...plan, skipped: 'a later run wrote the same thing to this account' }
            : plan
    })
}

async function executePlans({ deps, tenantId, projectId, plans }: ExecutePlansParams): Promise<CheckOutcome[]> {
    return plans.reduce<Promise<CheckOutcome[]>>(async (accPromise, plan) => {
        const acc = await accPromise
        if (plan.skipped !== undefined || isNil(plan.stepOutput) || isNil(plan.readInput)) {
            return [...acc, { ...plan.base, kind: OutcomeKind.SKIPPED, detail: plan.skipped ?? 'nothing to read back' }]
        }
        const read = await deps.runConnectorAction({
            tenantId,
            projectId,
            connectorName: plan.target.connectorName,
            actionName: plan.target.rule.readAction,
            input: { ...plan.readInput, auth: plan.target.auth },
        })
        if (read.status !== ActionRunStatus.SUCCEEDED) {
            return [...acc, { ...plan.base, kind: OutcomeKind.UNREADABLE, detail: readableFailure(read.errorMessage) }]
        }
        const judgement = plan.target.rule.judge({ input: plan.stepOutput.input, output: plan.stepOutput.output, actual: read.output })
        if (isNil(judgement)) {
            return [...acc, { ...plan.base, kind: OutcomeKind.SKIPPED, detail: 'nothing to compare' }]
        }
        return [...acc, { ...plan.base, kind: judgement.ok ? OutcomeKind.MATCHED : OutcomeKind.MISMATCHED, detail: judgement.detail }]
    }, Promise.resolve([]))
}

async function recordOutcomes({ log, projectId, outcomes, versions }: RecordOutcomesParams): Promise<string[]> {
    const byStep = new Map<string, CheckOutcome[]>()
    outcomes.forEach((outcome) => {
        const key = `${outcome.workflowId}:${outcome.stepName}`
        byStep.set(key, [...(byStep.get(key) ?? []), outcome])
    })
    const groups = [...byStep.values()]
    const touched = await groups.reduce<Promise<string[]>>(async (accPromise, group) => {
        const acc = await accPromise
        const first = group[0]
        const version = [...versions.values()].find((candidate) => candidate.workflowId === first.workflowId)
        if (isNil(version)) {
            return acc
        }
        const mismatches = group.filter((outcome) => outcome.kind === OutcomeKind.MISMATCHED)
        if (mismatches.length > 0) {
            await mismatches.reduce<Promise<void>>(async (previous, outcome) => {
                await previous
                await issueSideEffects(log).onDrift({
                    projectId,
                    workflowVersion: version,
                    stepName: outcome.stepName,
                    stepDisplayName: outcome.stepDisplayName,
                    businessKey: outcome.businessKey,
                    executionId: outcome.executionId,
                    detail: outcome.detail,
                })
            }, Promise.resolve())
            return [...acc, first.stepName]
        }
        const hasUnreadable = group.some((outcome) => outcome.kind === OutcomeKind.UNREADABLE)
        const matched = group.some((outcome) => outcome.kind === OutcomeKind.MATCHED)
        if (matched && !hasUnreadable) {
            await issueService(log).resolveDrift({ projectId, workflowId: first.workflowId, stepName: first.stepName })
        }
        return acc
    }, Promise.resolve([]))
    return touched
}

function defaultDeps(log: FastifyBaseLogger): VerificationDeps {
    return {
        runConnectorAction: (params) => actionRunService(log).runConnectorAction(params),
        readSteps: ({ execution }) => executionService(log).getStepsOrNull({ execution }),
    }
}

const MAX_CANDIDATES = 2000
const MAX_RUNS_CHECKED = 200
const MAX_PROBLEMS_LISTED = 20

enum OutcomeKind {
    MATCHED = 'MATCHED',
    MISMATCHED = 'MISMATCHED',
    UNREADABLE = 'UNREADABLE',
    SKIPPED = 'SKIPPED',
}

export type VerificationDeps = {
    runConnectorAction: (params: { tenantId: string, projectId: string, connectorName: string, actionName: string, input: Record<string, unknown> }) => Promise<ActionRunOutcome>
    readSteps: (params: { execution: Execution }) => Promise<Record<string, StepOutput> | null>
}

type RunParams = {
    projectId: ProjectId
    tenantId: TenantId
    sinceHours?: number
}

type VerifiableStep = {
    name: string
    displayName: string
    connectorName: string
    rule: VerificationRule
    auth: string
}

type CheckOutcome = {
    kind: OutcomeKind
    workflowId: string
    stepName: string
    stepDisplayName: string
    executionId: string
    businessKey: string
    detail: string
}

type PlanRunParams = {
    execution: Execution
    version: WorkflowVersion
    steps: Record<string, StepOutput> | null
    businessKey: string
}

type Plan = {
    base: Omit<CheckOutcome, 'kind' | 'detail'>
    target: VerifiableStep
    stepOutput?: StepOutput
    readInput?: Record<string, unknown>
    subject?: string | null
    skipped?: string
    finishedAt: number
}

type ExecutePlansParams = {
    deps: VerificationDeps
    tenantId: TenantId
    projectId: ProjectId
    plans: Plan[]
}

type RecordOutcomesParams = {
    log: FastifyBaseLogger
    projectId: ProjectId
    outcomes: CheckOutcome[]
    versions: Map<string, WorkflowVersion>
}
