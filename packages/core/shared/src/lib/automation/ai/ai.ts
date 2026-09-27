import { BaseModelSchema, LlmProvider, Nullable } from '@fema-ipaas/core-utils'
import { WorkflowOperationRequest } from '@fema-ipaas/workflow-core'
import { z } from 'zod'
import { formErrors } from '../../form-errors'

export const MCP_CONNECTOR_NAME = '@fema-ipaas/connector-mcp'
export const AI_PROMPT_MAX_LENGTH = 4000

export enum AiFeature {
    GENERATE_WORKFLOW = 'GENERATE_WORKFLOW',
    COPILOT = 'COPILOT',
    ASK_MODEL = 'ASK_MODEL',
    AGENT = 'AGENT',
    AUTO_MAPPING = 'AUTO_MAPPING',
}

export enum CopilotMode {
    EXPLAIN = 'EXPLAIN',
    DIAGNOSE = 'DIAGNOSE',
    ASK = 'ASK',
    MODIFY = 'MODIFY',
}

export enum CopilotChangeKind {
    ADD_STEP = 'ADD_STEP',
    UPDATE_INPUT = 'UPDATE_INPUT',
    DELETE_STEP = 'DELETE_STEP',
    RENAME_STEP = 'RENAME_STEP',
}

export const AiUsageRecord = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    workflowId: Nullable(z.string()),
    executionId: Nullable(z.string()),
    userId: Nullable(z.string()),
    feature: z.enum(AiFeature),
    provider: z.enum(LlmProvider),
    model: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
})
export type AiUsageRecord = z.infer<typeof AiUsageRecord>

export const ReportAiUsageRequestBody = z.object({
    feature: z.enum(AiFeature),
    provider: z.enum(LlmProvider),
    model: z.string().max(200),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    workflowId: z.string().optional(),
    executionId: z.string().optional(),
})
export type ReportAiUsageRequestBody = z.infer<typeof ReportAiUsageRequestBody>

export const ListAiUsageRequestQuery = z.object({
    projectId: z.string(),
    createdAfter: z.string(),
    createdBefore: z.string(),
})
export type ListAiUsageRequestQuery = z.infer<typeof ListAiUsageRequestQuery>

const UsageTotals = z.object({
    calls: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
})

export const AiUsageSummary = z.object({
    totals: UsageTotals,
    byModel: z.array(UsageTotals.extend({ provider: z.enum(LlmProvider), model: z.string() })),
    byFeature: z.array(UsageTotals.extend({ feature: z.enum(AiFeature) })),
    byWorkflow: z.array(UsageTotals.extend({ workflowId: z.string(), displayName: z.string() })),
    daily: z.array(UsageTotals.extend({ date: z.string() })),
})
export type AiUsageSummary = z.infer<typeof AiUsageSummary>

export const WorkflowPlanStep = z.object({
    connectorName: z.string(),
    connectorDisplayName: z.string(),
    operationName: z.string(),
    operationDisplayName: z.string(),
    displayName: z.string(),
    input: z.record(z.string(), z.unknown()),
    requiresConnection: z.boolean(),
    connectionExternalId: Nullable(z.string()),
})
export type WorkflowPlanStep = z.infer<typeof WorkflowPlanStep>

export const WorkflowPlan = z.object({
    displayName: z.string(),
    summary: z.string(),
    trigger: WorkflowPlanStep,
    steps: z.array(WorkflowPlanStep),
    questions: z.array(z.string()),
    warnings: z.array(z.string()),
    omittedSteps: z.number(),
})
export type WorkflowPlan = z.infer<typeof WorkflowPlan>

export const PlanAnswer = z.object({
    question: z.string(),
    answer: z.string().max(1000),
})
export type PlanAnswer = z.infer<typeof PlanAnswer>

export const GenerateWorkflowPlanRequestBody = z.object({
    projectId: z.string(),
    modelConnectionExternalId: z.string().min(1, formErrors.required),
    prompt: z.string().trim().min(1, formErrors.required).max(AI_PROMPT_MAX_LENGTH, 'aiPromptTooLong'),
    answers: z.array(PlanAnswer).max(10).optional(),
})
export type GenerateWorkflowPlanRequestBody = z.infer<typeof GenerateWorkflowPlanRequestBody>

export const ApplyWorkflowPlanRequestBody = z.object({
    projectId: z.string(),
    plan: WorkflowPlan,
    folderId: z.string().optional(),
})
export type ApplyWorkflowPlanRequestBody = z.infer<typeof ApplyWorkflowPlanRequestBody>

export const ApplyWorkflowPlanResponse = z.object({
    workflowId: z.string(),
})
export type ApplyWorkflowPlanResponse = z.infer<typeof ApplyWorkflowPlanResponse>

export const CopilotRequestBody = z.object({
    projectId: z.string(),
    workflowId: z.string(),
    modelConnectionExternalId: z.string().min(1, formErrors.required),
    mode: z.enum(CopilotMode),
    question: z.string().trim().max(AI_PROMPT_MAX_LENGTH, 'aiPromptTooLong').optional(),
})
export type CopilotRequestBody = z.infer<typeof CopilotRequestBody>

export const CopilotStepRef = z.object({
    name: z.string(),
    displayName: z.string(),
})
export type CopilotStepRef = z.infer<typeof CopilotStepRef>

export const CopilotDiagnosis = z.object({
    failuresLast7Days: z.number(),
    lastFailureAt: Nullable(z.string()),
    failedStep: Nullable(CopilotStepRef),
})
export type CopilotDiagnosis = z.infer<typeof CopilotDiagnosis>

export const CopilotChange = z.object({
    kind: z.enum(CopilotChangeKind),
    stepName: z.string(),
    displayName: z.string(),
    detail: z.string(),
})
export type CopilotChange = z.infer<typeof CopilotChange>

export const CopilotProposal = z.object({
    summary: z.string(),
    changes: z.array(CopilotChange),
    operations: z.array(WorkflowOperationRequest),
    affectedStepNames: z.array(z.string()),
    rejected: z.array(z.string()),
    unsupported: Nullable(z.string()),
})
export type CopilotProposal = z.infer<typeof CopilotProposal>

export const CopilotResponse = z.object({
    answer: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    referencedSteps: z.array(CopilotStepRef).optional(),
    diagnosis: CopilotDiagnosis.optional(),
    proposal: CopilotProposal.optional(),
})
export type CopilotResponse = z.infer<typeof CopilotResponse>

export const AiModelConnection = z.object({
    externalId: z.string(),
    displayName: z.string(),
    provider: z.enum(LlmProvider),
    model: z.string(),
})
export type AiModelConnection = z.infer<typeof AiModelConnection>

export const FieldMappingSource = z.object({
    path: z.string().max(300),
    sample: z.string().max(200),
})
export type FieldMappingSource = z.infer<typeof FieldMappingSource>

export const SuggestFieldMappingRequestBody = z.object({
    projectId: z.string(),
    modelConnectionExternalId: z.string().min(1, formErrors.required),
    targets: z.array(z.string().max(200)).min(1).max(50),
    sources: z.array(FieldMappingSource).min(1).max(300),
})
export type SuggestFieldMappingRequestBody = z.infer<typeof SuggestFieldMappingRequestBody>

export const FieldMappingSuggestion = z.object({
    target: z.string(),
    sourcePath: z.string(),
    confidence: z.number(),
})
export type FieldMappingSuggestion = z.infer<typeof FieldMappingSuggestion>

export const SuggestFieldMappingResponse = z.object({
    suggestions: z.array(FieldMappingSuggestion),
    inputTokens: z.number(),
    outputTokens: z.number(),
})
export type SuggestFieldMappingResponse = z.infer<typeof SuggestFieldMappingResponse>
