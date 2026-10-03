import { isNil, ProjectId, TenantId, tryCatch } from '@fema-ipaas/core-utils'
import {
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
        const latestPerKey = verifiable.filter((execution, index) => verifiable.findIndex((other) => other.businessKey === execution.businessKey) === index)
        const truncated = latestPerKey.length > MAX_RUNS_CHECKED || candidates.length === MAX_CANDIDATES
        const chosen = latestPerKey.slice(0, MAX_RUNS_CHECKED)
        const checks = await chosen.reduce<Promise<CheckOutcome[]>>(async (accPromise, execution) => {
            const acc = await accPromise
            const version = versions.get(execution.workflowVersionId)
            if (isNil(version) || isNil(execution.businessKey)) {
                return acc
            }
            const steps = await deps.readSteps({ execution })
            const outcomes = await verifyRun({ deps, tenantId, projectId, execution, version, steps, businessKey: execution.businessKey })
            return [...acc, ...outcomes]
        }, Promise.resolve([]))
        const issueIds = await recordOutcomes({ log, projectId, outcomes: checks, versions })
        const skippedRuns = candidates.length - latestPerKey.length
        return {
            checked: checks.filter((outcome) => outcome.kind !== OutcomeKind.SKIPPED).length,
            matched: checks.filter((outcome) => outcome.kind === OutcomeKind.MATCHED).length,
            mismatched: checks.filter((outcome) => outcome.kind === OutcomeKind.MISMATCHED).length,
            unreadable: checks.filter((outcome) => outcome.kind === OutcomeKind.UNREADABLE).length,
            skipped: skippedRuns + checks.filter((outcome) => outcome.kind === OutcomeKind.SKIPPED).length,
            truncated,
            issueIds,
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

async function verifyRun({ deps, tenantId, projectId, execution, version, steps, businessKey }: VerifyRunParams): Promise<CheckOutcome[]> {
    const targets = verifiableSteps({ version })
    return targets.reduce<Promise<CheckOutcome[]>>(async (accPromise, target) => {
        const acc = await accPromise
        const base = { workflowId: version.workflowId, stepName: target.name, stepDisplayName: target.displayName, executionId: execution.id, businessKey }
        const stepOutput = steps?.[target.name]
        if (isNil(stepOutput) || stepOutput.status !== StepOutputStatus.SUCCEEDED) {
            return [...acc, { ...base, kind: OutcomeKind.SKIPPED, detail: 'the step did not run in this run' }]
        }
        const readInput = target.rule.readInput({ input: stepOutput.input, output: stepOutput.output })
        if (isNil(readInput)) {
            return [...acc, { ...base, kind: OutcomeKind.SKIPPED, detail: 'the run log does not hold what is needed to read the result back' }]
        }
        const read = await deps.runConnectorAction({
            tenantId,
            projectId,
            connectorName: target.connectorName,
            actionName: target.rule.readAction,
            input: { ...readInput, auth: target.auth },
        })
        if (read.status !== ActionRunStatus.SUCCEEDED) {
            return [...acc, { ...base, kind: OutcomeKind.UNREADABLE, detail: read.errorMessage ?? 'the read-back failed' }]
        }
        const judgement = target.rule.judge({ input: stepOutput.input, output: stepOutput.output, actual: read.output })
        if (isNil(judgement)) {
            return [...acc, { ...base, kind: OutcomeKind.SKIPPED, detail: 'nothing to compare' }]
        }
        return [...acc, { ...base, kind: judgement.ok ? OutcomeKind.MATCHED : OutcomeKind.MISMATCHED, detail: judgement.detail }]
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

type VerifyRunParams = {
    deps: VerificationDeps
    tenantId: TenantId
    projectId: ProjectId
    execution: { id: string }
    version: WorkflowVersion
    steps: Record<string, StepOutput> | null
    businessKey: string
}

type RecordOutcomesParams = {
    log: FastifyBaseLogger
    projectId: ProjectId
    outcomes: CheckOutcome[]
    versions: Map<string, WorkflowVersion>
}
