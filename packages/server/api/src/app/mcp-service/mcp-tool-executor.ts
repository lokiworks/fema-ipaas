import { randomBytes } from 'node:crypto'
import { generateId, isNil, tryCatch } from '@fema-ipaas/core-utils'
import {
    EngineHttpResponse,
    McpCredentialMode,
    McpServiceTool,
    McpToolSourceType,
    McpToolTriggerKind,
    PrincipalType,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { actionRunService, ActionRunStatus } from '../action-run/action-run.service'
import { connectionAccessService } from '../connection/connection-access.service'
import { connectionAvailability } from '../connection/connection-service/connection-availability'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { domainHelper } from '../helper/domain-helper'
import { projectRepo } from '../project/project-repo'
import { webhookService, WebhookWorkflowVersionToRun } from '../webhooks/webhook.service'
import { engineResponseWatcher } from '../workers/engine-response-watcher'
import { McpServiceMemberSchema, McpServiceSchema } from './mcp-service.entity'
import { McpCallerContext, mcpToolModel } from './mcp-tool-model'
import { mcpToolSources } from './mcp-tool-sources'

export const mcpToolExecutor = (log: FastifyBaseLogger) => ({
    async call({ service, tool, provided, caller, clientName }: CallParams): Promise<McpToolOutcome> {
        const context: McpCallerContext = {
            userEmail: caller.user?.email ?? '',
            userId: caller.user?.id ?? '',
            userName: caller.user?.name ?? '',
            clientName,
        }
        const args = mcpToolModel.resolveArguments({ tool, provided, context })
        const source = tool.source
        if (source.type === McpToolSourceType.WORKFLOW) {
            return { ...(await callWorkflow({ log, service, workflowId: source.workflowId, toolName: tool.name, args })), resolvedArguments: args }
        }
        return { ...(await callConnectorAction({ log, service, tool, connectorName: source.connectorName, actionName: source.actionName, args, caller })), resolvedArguments: args }
    },
})

export const mcpSubflowCallbacks = {
    publish,
}

async function publish({ log, serverId, requestId, token, body }: PublishParams): Promise<void> {
    await engineResponseWatcher(log).publish(serverId, requestId, { token, body })
}

async function callWorkflow({ log, service, workflowId, toolName, args }: CallWorkflowParams): Promise<ToolResult> {
    const target = await mcpToolSources(log).resolveWorkflowTarget({ projectId: service.projectId, workflowId })
    if (isNil(target)) {
        return toolError(`Tool ${toolName} is not available. Its workflow may have been unpublished.`)
    }
    if (!target.enabled) {
        return toolError(`Tool ${toolName} is turned off. Turn its workflow on to use it.`)
    }
    if (target.kind === McpToolTriggerKind.SUBFLOW) {
        return callSubflow({ log, workflowId, args, toolName })
    }
    const { data, error } = await tryCatch(() => webhookService.handleWebhook({
        logger: log,
        workflowId,
        async: false,
        saveSampleData: false,
        execute: true,
        failParentOnFailure: false,
        workflowVersionToRun: WebhookWorkflowVersionToRun.LOCKED_FALL_BACK_TO_LATEST,
        data: async () => ({
            method: 'POST',
            headers: { 'content-type': 'application/json', ...target.headers },
            body: args,
            queryParams: {},
        }),
    }))
    if (!isNil(error) || isNil(data)) {
        log.warn({ error, mcpService: { id: service.id }, workflow: { id: workflowId } }, '[mcpToolExecutor#callWorkflow] Workflow call failed')
        return toolError('The workflow could not be run')
    }
    return fromHttpResponse(data)
}

async function callSubflow({ log, workflowId, args, toolName }: CallSubflowParams): Promise<ToolResult> {
    const requestId = generateId()
    const token = randomBytes(CALLBACK_TOKEN_BYTES).toString('base64url')
    const serverId = engineResponseWatcher(log).getServerId()
    const callbackUrl = await domainHelper.getInternalApiUrl({ path: `v1/mcp-callbacks/${serverId}/${requestId}?token=${token}` })
    const answer = engineResponseWatcher(log).oneTimeListener<unknown>(requestId, true, SUBFLOW_TIMEOUT_MS, null)
    const { data: dispatched, error } = await tryCatch(() => webhookService.handleWebhook({
        logger: log,
        workflowId,
        async: true,
        saveSampleData: false,
        execute: true,
        failParentOnFailure: false,
        workflowVersionToRun: WebhookWorkflowVersionToRun.LOCKED_FALL_BACK_TO_LATEST,
        data: async () => ({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: { data: args, callbackUrl },
            queryParams: {},
        }),
    }))
    if (!isNil(error) || isNil(dispatched) || dispatched.status >= StatusCodes.BAD_REQUEST) {
        log.warn({ error, workflow: { id: workflowId } }, '[mcpToolExecutor#callSubflow] Could not start the subflow')
        return toolError(`Tool ${toolName} could not start its workflow`)
    }
    const received = CallbackEnvelope.safeParse(await answer)
    if (!received.success || received.data.token !== token) {
        return toolError(`Tool ${toolName} started its workflow, but the workflow did not return a response within ${SUBFLOW_TIMEOUT_MS / 1000} seconds. Add a "Return Response" step to the workflow, and check its run history before retrying.`)
    }
    const reply = CallbackBody.safeParse(received.data.body)
    if (!reply.success) {
        return toolResult({ body: received.data.body, isError: false })
    }
    return toolResult({ body: reply.data.data ?? null, isError: reply.data.status === 'error' })
}

async function callConnectorAction({ log, service, tool, connectorName, actionName, args, caller }: CallConnectorParams): Promise<ToolResult> {
    const tenantId = await tenantOf({ service })
    const needsAuth = await mcpToolSources(log).connectorNeedsAuth({ tenantId, connectorName, actionName })
    const connection = needsAuth ? await pickConnection({ log, service, tenantId, connectorName, caller }) : NO_CONNECTION
    if (!connection.ok) {
        return toolError(connection.message)
    }
    const outcome = await actionRunService(log).runConnectorAction({
        tenantId,
        projectId: service.projectId,
        connectorName,
        actionName,
        input: {
            ...args,
            ...(isNil(connection.externalId) ? {} : { auth: `{{connections['${connection.externalId}']}}` }),
        },
    })
    switch (outcome.status) {
        case ActionRunStatus.SUCCEEDED:
            return toolResult({ body: outcome.output, isError: false })
        case ActionRunStatus.TIMEOUT:
            return toolError(outcome.neverStarted
                ? `Tool ${tool.name} did not start in time; nothing was run. It is safe to retry.`
                : `Tool ${tool.name} did not finish in time. It may still have run, so check the target system before retrying.`)
        default:
            return toolError(outcome.errorMessage ?? `Tool ${tool.name} failed`)
    }
}

async function pickConnection({ log, service, tenantId, connectorName, caller }: PickConnectionParams): Promise<PickedConnection> {
    const externalId = service.credentialMode === McpCredentialMode.DEVELOPER
        ? service.fixedConnections[connectorName]
        : caller.member?.connections[connectorName]
    const settingsHint = `Open the MCP service "${service.name}" in the platform and choose your ${connectorName} connection under "Connections".`
    if (isNil(externalId)) {
        return {
            ok: false,
            message: service.credentialMode === McpCredentialMode.USER
                ? `This tool acts with your own account and you have not authorized it yet. ${settingsHint}`
                : service.credentialMode === McpCredentialMode.CONSUMER
                    ? `This tool needs a connection chosen by your team. ${settingsHint}`
                    : 'The service owner has not configured a connection for this tool.',
        }
    }
    const connection = await connectionsRepo().findOneBy(connectionAvailability.whereAvailableIn({ projectId: service.projectId, where: { tenantId, externalId } }))
    if (isNil(connection)) {
        return { ok: false, message: 'The connection configured for this tool no longer exists or is not available in the project of the service.' }
    }
    const principalId = service.credentialMode === McpCredentialMode.DEVELOPER ? service.ownerId : caller.user?.id
    if (!isNil(principalId)) {
        const permission = await connectionAccessService(log).permissionFor({ connection, principal: { id: principalId, type: PrincipalType.USER, tenantId } })
        if (isNil(permission)) {
            return { ok: false, message: 'The connection configured for this tool is no longer shared with the person who configured it.' }
        }
    }
    return { ok: true, externalId }
}

async function tenantOf({ service }: { service: McpServiceSchema }): Promise<string> {
    const project = await projectRepo().findOne({ where: { id: service.projectId }, select: ['id', 'tenantId'] })
    return project?.tenantId ?? ''
}

function fromHttpResponse(response: EngineHttpResponse): ToolResult {
    return toolResult({ body: response.body, isError: response.status >= StatusCodes.BAD_REQUEST })
}

function toolResult({ body, isError }: { body: unknown, isError: boolean }): ToolResult {
    const text = typeof body === 'string' ? body : JSON.stringify(body ?? null)
    const structured = typeof body === 'object' && !isNil(body) && !Array.isArray(body) ? RecordValue.parse(body) : null
    return { isError, text, structured }
}

function toolError(text: string): ToolResult {
    return { isError: true, text, structured: null }
}

const NO_CONNECTION: PickedConnection = { ok: true, externalId: null }
const SUBFLOW_TIMEOUT_MS = 110 * 1000
const CALLBACK_TOKEN_BYTES = 24

const RecordValue = z.record(z.string(), z.unknown())

const CallbackEnvelope = z.object({
    token: z.string(),
    body: z.unknown(),
})

const CallbackBody = z.object({
    status: z.enum(['success', 'error']).optional(),
    data: z.unknown(),
})


type CallParams = {
    service: McpServiceSchema
    tool: McpServiceTool
    provided: Record<string, unknown>
    caller: McpCaller
    clientName: string
}

type CallWorkflowParams = {
    log: FastifyBaseLogger
    service: McpServiceSchema
    workflowId: string
    toolName: string
    args: Record<string, unknown>
}

type CallSubflowParams = {
    log: FastifyBaseLogger
    workflowId: string
    toolName: string
    args: Record<string, unknown>
}

type CallConnectorParams = {
    log: FastifyBaseLogger
    service: McpServiceSchema
    tool: McpServiceTool
    connectorName: string
    actionName: string
    args: Record<string, unknown>
    caller: McpCaller
}

type PickConnectionParams = {
    log: FastifyBaseLogger
    service: McpServiceSchema
    tenantId: string
    connectorName: string
    caller: McpCaller
}

type PickedConnection = { ok: true, externalId: string | null } | { ok: false, message: string }

type PublishParams = {
    log: FastifyBaseLogger
    serverId: string
    requestId: string
    token: string
    body: unknown
}

type ToolResult = {
    isError: boolean
    text: string
    structured: Record<string, unknown> | null
}

export type McpCaller = {
    member: McpServiceMemberSchema | null
    user: { id: string, email: string, name: string } | null
}

export type McpToolOutcome = ToolResult & {
    resolvedArguments: Record<string, unknown>
}
