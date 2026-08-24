import { EntityId, isNil } from '@fema-ipaas/core-utils'
import { ALL_PRINCIPAL_TYPES, ExecutionStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyReply } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import Mustache from 'mustache'
import { z } from 'zod'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { workspaceService } from '../../../workspace/workspace-service'
import { workflowVersionService } from '../../workflow-version/workflow-version.service'
import { findExecutionOrThrow } from '../execution-service'
import { resumePageHooks, ResumePageTheme } from './resume-page-hooks'
import { resumeService } from './resume-service'
import { waitpointService } from './waitpoint-service'
import { WaitpointStatus } from './waitpoint-types'

export const resumeController: FastifyPluginAsyncZod = async (app) => {
    /**
     * @deprecated A bare GET resumes the run (single-use), which lets an email link prefetch consume
     * the waitpoint. Kept unchanged for approval emails already delivered before the confirmation-page
     * rollout. New links use `/:id/waitpoints/:waitpointId/confirm`. See ADR 0005.
     */
    app.all('/:id/waitpoints/:waitpointId', ResumeByWaitpointRequest, async (req, reply) => {
        const headers = req.headers as Record<string, string>
        const queryParams = req.query as Record<string, string>
        await handleAsyncResume({ executionId: req.params.id, waitpointId: req.params.waitpointId, body: req.body, headers, queryParams, log: req.log, reply })
    })

    app.all('/:id/waitpoints/:waitpointId/sync', ResumeByWaitpointRequest, async (req, reply) => {
        const headers = req.headers as Record<string, string>
        const queryParams = req.query as Record<string, string>
        await handleSyncResume({ executionId: req.params.id, waitpointId: req.params.waitpointId, body: req.body, headers, queryParams, log: req.log, reply, correlationId: req.params.waitpointId })
    })

    /**
     * Scanner-safe resume. A GET/HEAD never consumes the waitpoint — it serves a confirmation page
     * whose Approve/Disapprove buttons POST back here; only the POST resumes. On open, the page reads
     * the waitpoint from the DB and shows an "already responded" state if the run has moved on.
     */
    app.all('/:id/waitpoints/:waitpointId/confirm', ResumeByWaitpointRequest, async (req, reply) => {
        const headers = req.headers as Record<string, string>
        const queryParams = req.query as Record<string, string>
        if (req.method === 'GET' || req.method === 'HEAD') {
            await serveConfirmationPage({ executionId: req.params.id, waitpointId: req.params.waitpointId, url: req.url, queryParams, log: req.log, reply })
            return
        }
        await handleConfirmResume({ executionId: req.params.id, waitpointId: req.params.waitpointId, action: queryParams.action, body: req.body, headers, queryParams, log: req.log, reply })
    })

    /**
     * @deprecated Deprecated since 2026-04-13. can be only removed after all paused jobs after deployment of this version to sink.
     * Handles resume for V0 waitpoints created by legacy connectors using run.pause() + generateResumeUrl().
     * The requestId param is NOT validated — executionId (an unguessable generateId) provides access control.
     */
    app.all('/:id/requests/:requestId', V0ResumeExecutionRequest, async (req, reply) => {
        const headers = req.headers as Record<string, string>
        const queryParams = req.query as Record<string, string>
        const waitpoint = await waitpointService(req.log).findPendingByVersion({ executionId: req.params.id, version: 'V0' })
        if (waitpoint) {
            await handleAsyncResume({ executionId: req.params.id, waitpointId: waitpoint.id, body: req.body, headers, queryParams, log: req.log, reply })
        }
        else {
            await handleLegacyAsyncResume({ executionId: req.params.id, body: req.body, headers, queryParams, log: req.log, reply })
        }
    })

    /**
     * @deprecated Deprecated since 2026-04-13. can be only removed after all paused jobs after deployment of this version to sink.
     */
    app.all('/:id/requests/:requestId/sync', V0ResumeExecutionRequest, async (req, reply) => {
        const headers = req.headers as Record<string, string>
        const queryParams = req.query as Record<string, string>
        const waitpoint = await waitpointService(req.log).findPendingByVersion({ executionId: req.params.id, version: 'V0' })
        if (waitpoint) {
            await handleSyncResume({ executionId: req.params.id, waitpointId: waitpoint.id, body: req.body, headers, queryParams, log: req.log, reply, correlationId: waitpoint.workerHandlerId ?? waitpoint.id })
        }
        else {
            await handleLegacySyncResume({ executionId: req.params.id, body: req.body, headers, queryParams, log: req.log, reply, correlationId: req.params.requestId })
        }
    })
}

async function serveConfirmationPage({ executionId, waitpointId, url, queryParams, log, reply }: ConfirmationPageParams): Promise<void> {
    const execution = await findExecutionOrThrow(executionId)
    const theme = await resolveResumePageTheme({ workspaceId: execution.workspaceId, log })
    const waitpoint = await waitpointService(log).findByIdAndExecutionId({ waitpointId, executionId })
    const isOpen = !isNil(waitpoint) && waitpoint.status === WaitpointStatus.PENDING && execution.status === ExecutionStatus.PAUSED
    if (!isOpen) {
        await replyWithHtml({ reply, html: Mustache.render(STATUS_HTML_TEMPLATE, buildThemeView({ theme, extra: { title: ALREADY_TITLE, message: ALREADY_MESSAGE, success: false } })) })
        return
    }
    const workflowName = await resolveWorkflowName({ workflowVersionId: execution.workflowVersionId, log })
    const path = url.split('?')[0]
    const extra = {
        workflowName,
        approveUrl: buildActionUrl({ path, queryParams, action: 'approve' }),
        disapproveUrl: buildActionUrl({ path, queryParams, action: 'disapprove' }),
    }
    await replyWithHtml({ reply, html: Mustache.render(CONFIRM_HTML_TEMPLATE, buildThemeView({ theme, extra })) })
}

function buildActionUrl({ path, queryParams, action }: { path: string, queryParams: Record<string, string>, action: string }): string {
    const params = new URLSearchParams(queryParams)
    params.set('action', action)
    return `${path}?${params.toString()}`
}

async function handleConfirmResume({ executionId, waitpointId, action, body, headers, queryParams, log, reply }: ConfirmResumeParams): Promise<void> {
    const { execution, stale } = await resumeService(log).resumeFromWaitpoint({
        executionId,
        waitpointId,
        resumePayload: { body, headers, queryParams },
    })
    if (!acceptsHtml(headers)) {
        await reply.send({ message: stale ? EXPIRED_MESSAGE : RECORDED_MESSAGE })
        return
    }
    const theme = await resolveResumePageTheme({ workspaceId: execution.workspaceId, log })
    const extra = stale
        ? { title: ALREADY_TITLE, message: ALREADY_MESSAGE, success: false }
        : { title: RECORDED_TITLE, message: recordedMessageForAction(action), success: true }
    await replyWithHtml({ reply, html: Mustache.render(STATUS_HTML_TEMPLATE, buildThemeView({ theme, extra })) })
}

async function handleAsyncResume({ executionId, waitpointId, body, headers, queryParams, log, reply }: AsyncResumeHandlerParams): Promise<void> {
    const { stale } = await resumeService(log).resumeFromWaitpoint({
        executionId,
        waitpointId,
        resumePayload: { body, headers, queryParams },
    })
    await reply.send({ message: stale ? EXPIRED_MESSAGE : RECORDED_MESSAGE })
}

async function handleSyncResume({ executionId, waitpointId, body, headers, queryParams, log, reply, correlationId }: AsyncResumeHandlerParams & { correlationId: string }): Promise<void> {
    const response = await resumeService(log).handleSyncResumeWorkflow({
        runId: executionId,
        waitpointId,
        payload: { body, headers, queryParams },
        correlationId,
    })
    await reply.status(response.status).headers(response.headers).send(response.body)
}

async function handleLegacyAsyncResume({ executionId, body, headers, queryParams, log, reply }: LegacyResumeHandlerParams): Promise<void> {
    const { stale } = await resumeService(log).legacyResume({
        executionId,
        resumePayload: { body, headers, queryParams },
    })
    await reply.send({ message: stale ? EXPIRED_MESSAGE : RECORDED_MESSAGE })
}

async function handleLegacySyncResume({ executionId, body, headers, queryParams, log, reply, correlationId }: LegacyResumeHandlerParams & { correlationId: string }): Promise<void> {
    const response = await resumeService(log).legacySyncResume({
        runId: executionId,
        payload: { body, headers, queryParams },
        correlationId,
    })
    await reply.status(response.status).headers(response.headers).send(response.body)
}

async function resolveResumePageTheme({ workspaceId, log }: { workspaceId: string, log: FastifyBaseLogger }): Promise<ResumePageTheme> {
    const tenantId = await workspaceService(log).getTenantId(workspaceId)
    return resumePageHooks.get(log).getTheme({ tenantId })
}

async function resolveWorkflowName({ workflowVersionId, log }: { workflowVersionId: string, log: FastifyBaseLogger }): Promise<string | undefined> {
    const workflowVersion = await workflowVersionService(log).getOne(workflowVersionId)
    return workflowVersion?.displayName
}

function recordedMessageForAction(action: string | undefined): string {
    if (action === 'approve') {
        return 'You approved this request. You can close this page now.'
    }
    if (action === 'disapprove') {
        return 'You disapproved this request. You can close this page now.'
    }
    return RECORDED_MESSAGE
}

function buildThemeView({ theme, extra }: { theme: ResumePageTheme, extra: Record<string, unknown> }): Record<string, unknown> {
    return {
        websiteName: theme.websiteName,
        fullLogoUrl: theme.logos.fullLogoUrl,
        primaryColor: theme.colors.primary.default,
        ...extra,
    }
}

function acceptsHtml(headers: Record<string, string>): boolean {
    return (headers['accept'] ?? '').includes('text/html')
}

async function replyWithHtml({ reply, html }: { reply: FastifyReply, html: string }): Promise<void> {
    await reply
        .type('text/html')
        .header('Content-Security-Policy', RESUME_PAGE_CSP)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'no-store')
        .send(html)
}

const ResumeByWaitpointRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        params: z.object({
            id: EntityId,
            waitpointId: z.string(),
        }),
    },
}

const V0ResumeExecutionRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
    schema: {
        params: z.object({
            id: EntityId,
            requestId: z.string(),
        }),
    },
}

const RECORDED_MESSAGE = 'Your response has been recorded. You can close this page now.'
const EXPIRED_MESSAGE = 'This link has expired. The action may have already been processed.'
const RECORDED_TITLE = 'Response recorded'
const ALREADY_TITLE = 'Already responded'
const ALREADY_MESSAGE = 'This request has already been responded to. There is nothing left to do here.'

const RESUME_PAGE_CSP = 'default-src \'none\'; style-src \'unsafe-inline\'; form-action \'self\'; img-src \'self\' https: http: data:'

const RESUME_PAGE_STYLE = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #0a0a0a; background: #fafafa; background-image: radial-gradient(#e4e4e7 1px, transparent 1px); background-size: 20px 20px; }
    .card { width: 440px; max-width: 100%; background: #fff; border: 1px solid #e5e5e5; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); overflow: hidden; }
    .head { padding: 28px 32px 0; }
    .logo { height: 24px; margin-bottom: 22px; }
    .badge { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
    .badge svg { width: 22px; height: 22px; }
    .badge-amber { background: #fffbeb; border: 1px solid #fde68a; color: #b45309; }
    .badge-green { background: #ecfdf5; border: 1px solid #a7f3d0; color: #059669; }
    h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.015em; margin: 0 0 8px; color: #0a0a0a; }
    p { font-size: 14px; line-height: 1.55; color: #737373; margin: 0 0 24px; }
    .chip { margin: 0 32px; padding: 12px 14px; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px; display: flex; align-items: center; gap: 8px; }
    .chip svg { width: 15px; height: 15px; color: #737373; flex-shrink: 0; }
    .chip .name { font-size: 12.5px; color: #404040; font-weight: 500; }
    .chip .state { margin-left: auto; font-size: 11px; color: #737373; }
    .actions { display: flex; gap: 10px; padding: 24px 32px 28px; margin: 0; }
    .btn { flex: 1; height: 36px; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
    .btn svg { width: 14px; height: 14px; }
    .btn-destructive { background: #ef4444; }
`

const CLOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
const CHECK_CIRCLE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
const ACTIVITY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

const CONFIRM_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{websiteName}}</title>
<style>${RESUME_PAGE_STYLE}</style>
</head>
<body>
<div class="card">
<div class="head">
{{#fullLogoUrl}}<img class="logo" src="{{fullLogoUrl}}" alt="{{websiteName}}">{{/fullLogoUrl}}
<div class="badge badge-amber">${CLOCK_SVG}</div>
<h1>Confirm your response</h1>
<p>A workflow is paused and waiting for your response. Please confirm to continue.</p>
</div>
{{#workflowName}}
<div class="chip">${ACTIVITY_SVG}<span class="name">{{workflowName}}</span><span class="state">Paused</span></div>
{{/workflowName}}
<form method="POST" class="actions">
<button type="submit" class="btn btn-destructive" formaction="{{disapproveUrl}}">${X_SVG}Disapprove</button>
<button type="submit" class="btn" style="background:{{primaryColor}}" formaction="{{approveUrl}}">${CHECK_SVG}Approve</button>
</form>
</div>
</body>
</html>`

const STATUS_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{websiteName}}</title>
<style>${RESUME_PAGE_STYLE}</style>
</head>
<body>
<div class="card">
<div class="head">
{{#fullLogoUrl}}<img class="logo" src="{{fullLogoUrl}}" alt="{{websiteName}}">{{/fullLogoUrl}}
{{#success}}<div class="badge badge-green">${CHECK_CIRCLE_SVG}</div>{{/success}}
{{^success}}<div class="badge badge-amber">${CLOCK_SVG}</div>{{/success}}
<h1>{{title}}</h1>
<p>{{message}}</p>
</div>
</div>
</body>
</html>`

type ConfirmationPageParams = {
    executionId: string
    waitpointId: string
    url: string
    queryParams: Record<string, string>
    log: FastifyBaseLogger
    reply: FastifyReply
}

type ConfirmResumeParams = {
    executionId: string
    waitpointId: string
    action: string | undefined
    body: unknown
    headers: Record<string, string>
    queryParams: Record<string, string>
    log: FastifyBaseLogger
    reply: FastifyReply
}

type AsyncResumeHandlerParams = {
    executionId: string
    waitpointId: string
    body: unknown
    headers: Record<string, string>
    queryParams: Record<string, string>
    log: FastifyBaseLogger
    reply: FastifyReply
}

type LegacyResumeHandlerParams = {
    executionId: string
    body: unknown
    headers: Record<string, string>
    queryParams: Record<string, string>
    log: FastifyBaseLogger
    reply: FastifyReply
}
