import swagger from '@fastify/swagger'
import { ConnectorMetadata } from '@fema/connector-sdk'
import { isNil, spreadIfDefined } from '@fema/core-utils'
import { apVersionUtil, onCallService, UNKNOWN_VERSION, wideEvent } from '@fema/server-utils'
import { ApEnvironment, ApplicationEventName, ConnectionDeletedEvent, ConnectionUpsertedEvent, ConnectionWithoutSensitiveData, Execution, ExecutionFinishedEvent, ExecutionRetriedEvent, ExecutionStartedEvent, Folder, FolderCreatedEvent, FolderDeletedEvent, FolderUpdatedEvent, Template, UserEmailVerifiedEvent, UserInvitation, UserPasswordResetEvent, UserSignedInEvent, UserWithMetaInformation, Workflow, WorkflowActivatedEvent, WorkflowCreatedEvent, WorkflowDeactivatedEvent, WorkflowDeletedEvent, WorkflowPublishedEvent, WorkflowUpdatedEvent, WorkspaceWithLimits } from '@fema/shared'
import { createAdapter } from '@socket.io/redis-adapter'
import { FastifyBaseLogger, FastifyInstance, FastifyRequest, HTTPMethods } from 'fastify'
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod'
import Mustache from 'mustache'
import { globalRegistry } from 'zod/v4/core'
import { authenticationModule } from './authentication/authentication.module'
import { localAuthnModule } from './authentication/local-authn/local-authn.module'
import { otpModule } from './authentication/otp/otp-module'
import { connectionModule } from './connection/connection.module'
import { platformConnectionModule } from './connection/platform-connection.module'
import { communityConnectorsModule } from './connectors/community-connector-module'
import { connectorSyncService } from './connectors/connector-sync-service'
import { startDevConnectorWatcher } from './connectors/dev-connector-watcher'
import { connectorModule } from './connectors/metadata/connector-metadata-controller'
import { connectorMetadataService } from './connectors/metadata/connector-metadata-service'
import { collaborativeModule } from './core/collaborative/collaborative.module'
import { oidcModule } from './core/security/oidc/oidc.module'
import { rateLimitModule } from './core/security/rate-limit'
import { authenticationMiddleware } from './core/security/v2/authn/authentication-middleware'
import { authorizationMiddleware } from './core/security/v2/authz/authorization-middleware'
import { distributedLock, redisConnections } from './database/redis-connections'
import { fileModule } from './file/file.module'
import { flagModule } from './flags/flag.module'
import { domainHelper } from './helper/domain-helper'
import { clientLogsModule } from './helper/logs/client-logs.module'
import { openapiModule } from './helper/openapi/openapi.module'
import { system } from './helper/system/system'
import { AppSystemProp } from './helper/system/system-props'
import { SystemJobName } from './helper/system-jobs/common'
import { systemJobHandlers } from './helper/system-jobs/job-handlers'
import { systemJobsSchedule } from './helper/system-jobs/system-job'
import { systemSnapshot } from './helper/system-snapshot'
import { validateEnvPropsOnStartup } from './helper/system-validator'
import { shutdownTelemetry } from './helper/telemetry.utils'
import { platformModule } from './platform/platform.module'
import { storeEntryModule } from './store-entry/store-entry.module'
import { templateModule } from './template/template.module'
import { appEventRoutingModule } from './trigger/app-event-routing/app-event-routing.module'
import { triggerModule } from './trigger/trigger.module'
import { platformUserModule } from './user/platform/platform-user-module'
import { invitationModule } from './user-invitations/user-invitation.module'
import { variableModule } from './variable/variable.module'
import { webhookModule } from './webhooks/webhook-module'
import { engineResponseWatcher } from './workers/engine-response-watcher'
import { workerCapacity } from './workers/machine/worker-capacity'
import { migrateQueuesAndRunConsumers, workerModule } from './workers/worker-module'
import { executionModule } from './workflows/execution/execution-module'
import { folderModule } from './workflows/folder/folder.module'
import { humanInputModule } from './workflows/workflow/human-input/human-input.module'
import { workflowBackgroundJobs } from './workflows/workflow/workflow.jobs'
import { workflowModule } from './workflows/workflow.module'
import { workspaceBackgroundJobs } from './workspace/workspace.jobs'
import { workspaceModule } from './workspace/workspace.module'

export const setupApp = async (app: FastifyInstance): Promise<FastifyInstance> => {

    app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, async (_request: FastifyRequest, payload: unknown) => {
        return payload as Buffer
    })

    registerOpenApiSchemas()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await app.register(swagger as any, {
        hideUntagged: true,
        transform: jsonSchemaTransform,
        transformObject: jsonSchemaTransformObject,
        openapi: {
            openapi: '3.1.0',
            servers: [
                {
                    url: '/api',
                    description: 'This instance',
                },
            ],
            components: {
                securitySchemes: {
                    apiKey: {
                        type: 'http',
                        description: 'Use your api key generated from the admin console',
                        scheme: 'bearer',
                    },
                },
                schemas: {
                    'global-connection': { $ref: '#/components/schemas/connection' },
                },
            },
            info: {
                title: 'FEMA Integration Platform API',
                version: '0.0.0',
            },
        },
    })


    await app.register(rateLimitModule)
    app.addHook('onResponse', async (request, reply) => {
        // eslint-disable-next-line                                                                                                                                                                                                                     
        reply.header('x-request-id', request.id)
    })
    app.addHook('onRequest', async (request, reply) => {
        const route = app.hasRoute({
            method: request.method as HTTPMethods,
            url: request.routeOptions.url!,
        })
        request.log = request.log.child({ route: request.routeOptions.url })
        if (!route) {
            return reply.code(404).send({
                statusCode: 404,
                error: 'Not Found',
                message: 'Route not found',
            })
        }
    })

    app.addHook('preHandler', authenticationMiddleware)

    // Enrich the current wide-event with tenant identifiers resolved by the auth middleware.
    // request.principal is set by authenticationMiddleware; for public routes it may be
    // undefined (the middleware returns early), so we guard with a try/catch.
    app.addHook('preHandler', (request, _reply, done) => {
        try {
            const principal = request.principal
            const workspaceId = extractWorkspaceId(principal)
            const platformId = extractPlatformId(principal)
            wideEvent.set({
                ...spreadIfDefined('workspace', isNil(workspaceId) ? undefined : { id: workspaceId }),
                ...spreadIfDefined('platform', isNil(platformId) ? undefined : { id: platformId }),
                ...spreadIfDefined('principalType', principal?.type),
            })
        }
        catch {
            // principal getter may throw before auth completes — safe to ignore
        }
        done()
    })

    app.addHook('preHandler', authorizationMiddleware)

    await systemJobsSchedule(app.log).init()
    await app.register(fileModule)
    await app.register(flagModule)
    await app.register(storeEntryModule)
    await app.register(folderModule)
    await connectorSyncService(app.log).setup()
    await connectorMetadataService(app.log).setup()
    await app.register(connectorModule)
    await app.register(communityConnectorsModule)
    await app.register(collaborativeModule)
    await app.register(workflowModule)
    await app.register(executionModule)
    await app.register(webhookModule)
    await app.register(connectionModule)
    await app.register(platformConnectionModule)
    await app.register(variableModule)
    await app.register(openapiModule)
    await app.register(appEventRoutingModule)
    await app.register(authenticationModule)
    await app.register(otpModule)
    await app.register(localAuthnModule)
    await app.register(triggerModule)
    await app.register(platformModule)
    await app.register(workspaceModule)
    await app.register(humanInputModule)
    await app.register(platformUserModule)
    await app.register(invitationModule)
    await app.register(workerModule)
    await workerCapacity.setup()
    await app.register(oidcModule)
    await app.register(templateModule)

    const clientLogsEnabled = system.get(AppSystemProp.LOG_FILE) === 'true'
    if (clientLogsEnabled) {
        await app.register(clientLogsModule)
    }

    systemJobHandlers.registerJobHandler(SystemJobName.DELETE_WORKFLOW, (data) => workflowBackgroundJobs(app.log).deleteWorkflowHandler(data))
    systemJobHandlers.registerJobHandler(SystemJobName.HARD_DELETE_WORKSPACE, (data) => workspaceBackgroundJobs(app.log).hardDeleteWorkspaceHandler(data))

    app.get(
        '/redirect',
        async (
            request: FastifyRequest<{ Querystring: { code: string } }>,
            reply,
        ) => {
            const code = request.query.code
            if (!code) {
                return reply.type('text/plain').send('The code is missing in url')
            }
            return reply
                .type('text/html')
                .header('Content-Security-Policy', 'default-src \'none\'; script-src \'unsafe-inline\'')
                .header('X-Content-Type-Options', 'nosniff')
                .send(Mustache.render(REDIRECT_HTML_TEMPLATE, { code }))
        },
    )

    await validateEnvPropsOnStartup(app.log)

    const isCanaryApp = system.getBoolean(AppSystemProp.IS_CANARY_APP) ?? false
    if (isCanaryApp) {
        app.log.info('[setupApp] Skipping system jobs worker on canary app instance')
    }
    else {
        await systemJobsSchedule(app.log).startWorker()
    }

    app.addHook('onClose', async () => {
        app.log.info('Shutting down')
        await systemJobsSchedule(app.log).close()
        await redisConnections.destroy()
        await distributedLock(app.log).destroy()
        await engineResponseWatcher(app.log).shutdown()
        await shutdownTelemetry()
    })

    return app
}



export async function getAdapter() {
    const redisConnectionInstance = await redisConnections.useExisting()
    const sub = redisConnectionInstance.duplicate()
    const pub = redisConnectionInstance.duplicate()
    return createAdapter(pub, sub, {
        requestsTimeout: 30000,
    })
}


export async function appPostBoot(app: FastifyInstance): Promise<void> {

    app.log.info(`Integration platform started on ${await domainHelper.getPublicApiUrl({ path: '' })}`)

    const environment = system.get(AppSystemProp.ENVIRONMENT)
    const connectors = process.env.FEMA_DEV_CONNECTORS

    assertReleaseReadable(app.log)
    systemSnapshot.start({ log: app.log })
    await migrateQueuesAndRunConsumers(app)
    app.log.info('Queues migrated and consumers run')
    if (environment === ApEnvironment.DEVELOPMENT) {
        app.log.warn(
            `[WARNING]: The application is running in ${environment} mode.`,
        )
        app.log.warn(
            `[WARNING]: This is only shows connectors specified in FEMA_DEV_CONNECTORS ${connectors} environment variable.`,
        )
    }
    void startDevConnectorWatcher(app)
}

// Front-loads the release-read failure signal to boot time. Without this the only alert is
// emitted lazily on the first worker poll (worker-rpc-service.ts), so a mis-packaged app that
// no worker has polled yet looks healthy. A '0.0.0' read fail-closes the dispatch gate and will
// NOT self-heal on deploy completion, so page immediately and log at error (see the "Release
// Version Detection" section in packages/server/AGENTS.md).
function assertReleaseReadable(log: FastifyBaseLogger): void {
    const version = apVersionUtil.getCurrentRelease()
    if (version !== UNKNOWN_VERSION) {
        log.info({ release: { version } }, '[appPostBoot] Release version detected from package.json')
        return
    }
    log.error({ release: { version } }, '[appPostBoot] App could not read its release version from package.json (reported as 0.0.0); worker dispatch is gated and will NOT self-heal until the deployment is fixed (check cwd/packaging)')
    onCallService(log, system.get(AppSystemProp.PAGE_ONCALL_WEBHOOK)).page({
        code: 'RELEASE_VERSION_UNREADABLE',
        message: 'App could not read its release version from package.json (reported as 0.0.0) at startup; worker dispatch is gated and will NOT self-heal until the deployment is fixed (check cwd/packaging)',
        params: { appVersion: version },
    }).catch((pageError) => {
        log.error({ pageError }, '[appPostBoot] Failed to send on-call page for unreadable release version')
    })
}

function extractPlatformId(principal: { platform?: { id?: string } } | null | undefined): string | undefined {
    return principal?.platform?.id
}

function extractWorkspaceId(principal: { workspaceId?: string } | null | undefined): string | undefined {
    return principal?.workspaceId
}

function registerOpenApiSchemas() {
    globalRegistry.add(WorkflowCreatedEvent, { id: ApplicationEventName.WORKFLOW_CREATED })
    globalRegistry.add(WorkflowUpdatedEvent, { id: ApplicationEventName.WORKFLOW_UPDATED })
    globalRegistry.add(WorkflowDeletedEvent, { id: ApplicationEventName.WORKFLOW_DELETED })
    globalRegistry.add(WorkflowPublishedEvent, { id: ApplicationEventName.WORKFLOW_PUBLISHED })
    globalRegistry.add(WorkflowActivatedEvent, { id: ApplicationEventName.WORKFLOW_ACTIVATED })
    globalRegistry.add(WorkflowDeactivatedEvent, { id: ApplicationEventName.WORKFLOW_DEACTIVATED })
    globalRegistry.add(ConnectionUpsertedEvent, { id: ApplicationEventName.CONNECTION_UPSERTED })
    globalRegistry.add(ConnectionDeletedEvent, { id: ApplicationEventName.CONNECTION_DELETED })
    globalRegistry.add(FolderCreatedEvent, { id: ApplicationEventName.FOLDER_CREATED })
    globalRegistry.add(FolderUpdatedEvent, { id: ApplicationEventName.FOLDER_UPDATED })
    globalRegistry.add(FolderDeletedEvent, { id: ApplicationEventName.FOLDER_DELETED })
    globalRegistry.add(ExecutionStartedEvent, { id: ApplicationEventName.EXECUTION_STARTED })
    globalRegistry.add(ExecutionFinishedEvent, { id: ApplicationEventName.EXECUTION_FINISHED })
    globalRegistry.add(ExecutionRetriedEvent, { id: ApplicationEventName.EXECUTION_RETRIED })
    globalRegistry.add(UserSignedInEvent, { id: ApplicationEventName.USER_SIGNED_IN })
    globalRegistry.add(UserPasswordResetEvent, { id: ApplicationEventName.USER_PASSWORD_RESET })
    globalRegistry.add(UserEmailVerifiedEvent, { id: ApplicationEventName.USER_EMAIL_VERIFIED })
    globalRegistry.add(Template, { id: 'template' })
    globalRegistry.add(Folder, { id: 'folder' })
    globalRegistry.add(UserWithMetaInformation, { id: 'user' })
    globalRegistry.add(UserInvitation, { id: 'user-invitation' })
    globalRegistry.add(WorkspaceWithLimits, { id: 'workspace' })
    globalRegistry.add(Workflow, { id: 'workflow' })
    globalRegistry.add(Execution, { id: 'execution' })
    globalRegistry.add(ConnectionWithoutSensitiveData, { id: 'connection' })
    globalRegistry.add(ConnectorMetadata, { id: 'connector' })
}

const REDIRECT_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Redirect</title></head>
<body>
Redirect successful, this window should close now.
<meta id="ap-oauth-code" content="{{code}}">
<script>
(function () {
    var el = document.getElementById('ap-oauth-code');
    var code = el ? el.getAttribute('content') : null;
    if (window.opener && code) {
        window.opener.postMessage({ code: code }, '*');
    }
})();
</script>
</body>
</html>`
