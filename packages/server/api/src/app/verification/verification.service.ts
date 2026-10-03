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
import pLimit from 'p-limit'
import { ActionRunOutcome, actionRunService, ActionRunStatus } from '../action-run/action-run.service'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { issueSideEffects } from '../issue/issue-side-effects'
import { issueService } from '../issue/issue.service'
import { projectService } from '../project/project-service'
import { executionRepo, executionService } from '../workflows/execution/execution-service'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { VerificationRule, verificationRules } from './verification-rules'

export const verificationService = (log: FastifyBaseLogger, deps: VerificationDeps = defaultDeps(log)) => ({
    async run({ projectId, tenantId, sinceHours = VERIFICATION_DEFAULT_WINDOW_HOURS }: RunParams): Promise<RunVerificationResult> {
        const since = dayjs().subtract(sinceHours, 'hour').toISOString()
        const scanned = await scanCandidates({ log, deps, tenantId, projectId, since, limits: limitsFromSystem() })
        const checks = scanned.outcomes
        const issueIds = await recordOutcomes({ log, projectId, outcomes: checks, versions: scanned.versions })
        const skippedRuns = scanned.candidateCount - scanned.verifiableCount
        return {
            checked: checks.filter((outcome) => outcome.kind !== OutcomeKind.SKIPPED).length,
            matched: checks.filter((outcome) => outcome.kind === OutcomeKind.MATCHED).length,
            mismatched: checks.filter((outcome) => outcome.kind === OutcomeKind.MISMATCHED).length,
            unreadable: checks.filter((outcome) => outcome.kind === OutcomeKind.UNREADABLE).length,
            skipped: skippedRuns + checks.filter((outcome) => outcome.kind === OutcomeKind.SKIPPED).length,
            truncated: scanned.truncated,
            issueIds,
            problems: checks
                .filter((outcome) => outcome.kind === OutcomeKind.MISMATCHED || outcome.kind === OutcomeKind.UNREADABLE)
                .slice(0, MAX_PROBLEMS_LISTED)
                .map((outcome) => ({ businessKey: outcome.businessKey, stepName: outcome.stepName, outcome: outcome.kind === OutcomeKind.MISMATCHED ? 'MISMATCHED' : 'UNREADABLE', detail: outcome.detail })),
        }
    },

    async runForAllProjects(): Promise<void> {
        const rows: { projectId: string }[] = await executionRepo().query(PROJECTS_WITH_CANDIDATES_SQL, [dayjs().subtract(VERIFICATION_DEFAULT_WINDOW_HOURS, 'hour').toISOString()])
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

async function scanCandidates({ log, deps, tenantId, projectId, since, limits }: ScanParams): Promise<ScanResult> {
    const startedAt = Date.now()
    const pace = pacerOf({ readsPerSecond: limits.readsPerSecond, sleep: deps.sleep ?? sleepFor })
    const readLimit = pLimit(READ_STEPS_CONCURRENCY)
    const initial: ScanResult = { outcomes: [], versions: new Map(), candidateCount: 0, verifiableCount: 0, truncated: false }
    const step = async ({ state, cursor, seen }: { state: ScanResult, cursor: Cursor | null, seen: Set<string> }): Promise<ScanResult> => {
        if (Date.now() - startedAt > limits.timeBudgetMs || state.candidateCount >= MAX_CANDIDATES) {
            return { ...state, truncated: true }
        }
        const { executions: page, next: nextCursor } = await loadCandidatePage({ projectId, since, cursor })
        if (page.length === 0) {
            return state
        }
        const versions = await loadMissingVersions({ log, known: state.versions, versionIds: page.map((execution) => execution.workflowVersionId) })
        const verifiable = page.filter((execution) => verifiableSteps({ version: versions.get(execution.workflowVersionId) }).length > 0)
        const planned = (await Promise.all(verifiable.map((execution) => readLimit(async () => {
            const version = versions.get(execution.workflowVersionId)
            if (isNil(version) || isNil(execution.businessKey)) {
                return []
            }
            const steps = await deps.readSteps({ execution })
            return planRun({ execution, version, steps, businessKey: execution.businessKey })
        })))).flat()
        const plans = supersede({ plans: planned, seen })
        const outcomes = await executePlans({ deps, tenantId, projectId, plans, pace })
        const next: ScanResult = {
            outcomes: [...state.outcomes, ...outcomes],
            versions,
            candidateCount: state.candidateCount + page.length,
            verifiableCount: state.verifiableCount + verifiable.length,
            truncated: false,
        }
        if (page.length < CANDIDATE_PAGE) {
            return next
        }
        const nextSeen = new Set([...seen, ...planned.flatMap((plan) => (plan.skipped === undefined && !isNil(plan.subject) ? [plan.subject] : []))])
        return step({ state: next, cursor: nextCursor, seen: nextSeen })
    }
    return step({ state: initial, cursor: null, seen: new Set() })
}

async function loadCandidatePage({ projectId, since, cursor }: { projectId: ProjectId, since: string, cursor: Cursor | null }): Promise<CandidatePage> {
    const builder = executionRepo().createQueryBuilder('execution')
        .addSelect('execution."finishTime"::text', 'finish_cursor')
        .where('execution."projectId" = :projectId', { projectId })
        .andWhere(CANDIDATE_PREDICATE_SQL)
        .andWhere('execution."finishTime" >= :since', { since })
    const bounded = isNil(cursor)
        ? builder
        : builder.andWhere('(execution."finishTime", execution.id) < (:cursorFinishTime::timestamptz, :cursorId)', { cursorFinishTime: cursor.finishTime, cursorId: cursor.id })
    const { entities, raw } = await bounded
        .orderBy('execution."finishTime"', 'DESC')
        .addOrderBy('execution.id', 'DESC')
        .limit(CANDIDATE_PAGE)
        .getRawAndEntities<{ finish_cursor: string }>()
    const lastRaw = raw[raw.length - 1]
    const last = entities[entities.length - 1]
    return {
        executions: entities,
        next: isNil(lastRaw) || isNil(last) ? null : { finishTime: lastRaw.finish_cursor, id: last.id },
    }
}

async function loadMissingVersions({ log, known, versionIds }: { log: FastifyBaseLogger, known: Map<string, WorkflowVersion>, versionIds: string[] }): Promise<Map<string, WorkflowVersion>> {
    const missing = [...new Set(versionIds)].filter((id) => !known.has(id))
    const loaded = await loadVersions({ log, versionIds: missing })
    return new Map([...known, ...loaded])
}

function limitsFromSystem(): ScanLimits {
    return {
        readsPerSecond: Math.max(1, system.getNumberOrThrow(AppSystemProp.VERIFICATION_READS_PER_SECOND)),
        timeBudgetMs: Math.max(1, system.getNumberOrThrow(AppSystemProp.VERIFICATION_TIME_BUDGET_MINUTES)) * 60 * 1000,
    }
}

function pacerOf({ readsPerSecond, sleep }: { readsPerSecond: number, sleep: (ms: number) => Promise<void> }): () => Promise<void> {
    const gapMs = 1000 / readsPerSecond
    const state = { nextAt: 0 }
    return async () => {
        const waitMs = state.nextAt - Date.now()
        if (waitMs > 0) {
            await sleep(waitMs)
        }
        state.nextAt = Math.max(Date.now(), state.nextAt) + gapMs
    }
}

function sleepFor(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

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

function supersede({ plans, seen }: { plans: Plan[], seen: Set<string> }): Plan[] {
    const newestBySubject = new Map<string, number>()
    plans.forEach((plan) => {
        if (!isNil(plan.subject) && plan.skipped === undefined) {
            newestBySubject.set(plan.subject, Math.max(newestBySubject.get(plan.subject) ?? 0, plan.finishedAt))
        }
    })
    return plans.map((plan) => {
        const newest = isNil(plan.subject) ? undefined : newestBySubject.get(plan.subject)
        const supersededInPage = !isNil(newest) && plan.finishedAt < newest
        const supersededEarlier = !isNil(plan.subject) && seen.has(plan.subject)
        return (supersededInPage || supersededEarlier) && plan.skipped === undefined
            ? { ...plan, skipped: 'a later run wrote the same thing to this account' }
            : plan
    })
}

async function executePlans({ deps, tenantId, projectId, plans, pace }: ExecutePlansParams): Promise<CheckOutcome[]> {
    return plans.reduce<Promise<CheckOutcome[]>>(async (accPromise, plan) => {
        const acc = await accPromise
        if (plan.skipped !== undefined || isNil(plan.stepOutput) || isNil(plan.readInput)) {
            return [...acc, { ...plan.base, kind: OutcomeKind.SKIPPED, detail: plan.skipped ?? 'nothing to read back' }]
        }
        await pace()
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

const CANDIDATE_PREDICATE_SQL = `execution.environment = '${RunEnvironment.PRODUCTION}' AND execution.status = '${ExecutionStatus.SUCCEEDED}' AND execution."businessKey" IS NOT NULL AND execution."archivedAt" IS NULL`
const PROJECTS_WITH_CANDIDATES_SQL = `SELECT project.id AS "projectId" FROM project
    WHERE project.deleted IS NULL AND EXISTS (
        SELECT 1 FROM execution
        WHERE execution."projectId" = project.id AND ${CANDIDATE_PREDICATE_SQL} AND execution."finishTime" >= $1
    )`
const CANDIDATE_PAGE = 200
const MAX_CANDIDATES = 50000
const READ_STEPS_CONCURRENCY = 10
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
    sleep?: (ms: number) => Promise<void>
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
    pace: () => Promise<void>
}

type CandidatePage = {
    executions: Execution[]
    next: Cursor | null
}

type Cursor = {
    finishTime: string
    id: string
}

type ScanLimits = {
    readsPerSecond: number
    timeBudgetMs: number
}

type ScanParams = {
    log: FastifyBaseLogger
    deps: VerificationDeps
    tenantId: TenantId
    projectId: ProjectId
    since: string
    limits: ScanLimits
}

type ScanResult = {
    outcomes: CheckOutcome[]
    versions: Map<string, WorkflowVersion>
    candidateCount: number
    verifiableCount: number
    truncated: boolean
}

type RecordOutcomesParams = {
    log: FastifyBaseLogger
    projectId: ProjectId
    outcomes: CheckOutcome[]
    versions: Map<string, WorkflowVersion>
}
