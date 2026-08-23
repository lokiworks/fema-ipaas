/**
 * E2E integration test for full workflow execution.
 *
 * Tests the round-trip:
 *   executionService.start() → BullMQ queue → worker poll → sandbox engine execution → workflow run result
 *
 * Workflow structure:
 *   Webhook Trigger → Data Mapper (connector action) → Code Action
 *
 * Prerequisites:
 *   - Engine must be built (cache/v7/common/main.js)
 *   - bun must be available for connector installation
 *   - Redis (in-memory via FEMA_REDIS_TYPE=MEMORY) is started automatically
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    ExecutionType,
    WorkflowActionType,
    ExecutionStatus,
    WorkflowStatus,
    WorkflowTriggerType,
    WorkflowVersionState,
    PackageType,
    ConnectorScope,
    ConnectorType,
    RunEnvironment,
    StepOutputType,
    StreamStepProgress,
} from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { worker } from '../../../../../../worker/src/lib/worker'
import { databaseConnection } from '../../../../../src/app/database/database-connection'
import { executionService } from '../../../../../src/app/workflows/execution/execution-service'
import { db } from '../../../../helpers/db'
import { createTestContext } from '../../../../helpers/test-context'
import { setupE2eEnvironment } from '../../../../helpers/e2e-setup'
import {
    createMockWorkflow,
    createMockWorkflowVersion,
    createMockConnectorMetadata,
    mockAndSaveBasicSetup,
} from '../../../../helpers/mocks'

const CUSTOM_CONNECTOR_NAME = 'e2e-custom-echo'
const CUSTOM_CONNECTOR_VERSION = '0.0.1'
const customConnectorArchive = readFileSync(
    join(__dirname, '../../../../../src/assets/e2e-custom-echo-0.0.1.tgz'),
)

let app: FastifyInstance

beforeAll(async () => {
    const ctx = await setupE2eEnvironment()
    app = ctx.app
    await worker.start({
        apiUrl: ctx.apiUrl,
        socketUrl: { url: ctx.apiUrl, path: '/api/socket.io' },
        workerToken: ctx.workerToken,
    })
    await new Promise((resolve) => setTimeout(resolve, 5000))
}, 30_000)

afterAll(async () => {
    worker.stop()
    await app.close()
}, 15_000)

async function setupSubflowFixtures({ childAlwaysFails = false, retryOnFailure = false }: { childAlwaysFails?: boolean, retryOnFailure?: boolean } = {}) {
    const { mockPlatform, mockWorkspace } = await mockAndSaveBasicSetup()

    const webhookConnector = createMockConnectorMetadata({
        name: '@fema/connector-webhook',
        version: '0.1.29',
        platformId: undefined,
        packageType: PackageType.REGISTRY,
        connectorType: ConnectorType.OFFICIAL,
    })
    const subflowsConnector = createMockConnectorMetadata({
        name: '@fema/connector-subflows',
        version: '0.4.11',
        platformId: undefined,
        packageType: PackageType.REGISTRY,
        connectorType: ConnectorType.OFFICIAL,
    })
    await databaseConnection().getRepository('connector_metadata').save([webhookConnector, subflowsConnector])

    // Child Workflow: callableWorkflow trigger → code action → returnResponse action
    const childReturnResponseAction = {
        type: WorkflowActionType.CONNECTOR as const,
        name: 'step_2',
        displayName: 'Return Response',
        valid: true,
        settings: {
            connectorName: '@fema/connector-subflows',
            connectorVersion: '0.4.11',
            actionName: 'returnResponse',
            input: {
                mode: 'simple',
                response: {
                    response: {
                        greeting: '{{step_1[\'output\'].greeting}}',
                        processed: '{{step_1[\'output\'].processed}}',
                    },
                },
            },
            propertySettings: {},
            errorHandlingOptions: {},
        },
    }

    const childCodeAction = {
        type: WorkflowActionType.CODE as const,
        name: 'step_1',
        displayName: 'Transform Data',
        valid: true,
        settings: {
            sourceCode: {
                code: childAlwaysFails
                    ? 'export const code = async () => { throw new Error(\'deliberate subflow failure\') }'
                    : `export const code = async (inputs) => {
                    return {
                        greeting: 'Hello ' + inputs.name,
                        processed: true,
                    };
                }`,
                packageJson: '{}',
            },
            input: {
                name: '{{trigger[\'output\'].data.name}}',
            },
            errorHandlingOptions: {},
        },
        nextAction: childReturnResponseAction,
    }

    const childWorkflow = createMockWorkflow({
        workspaceId: mockWorkspace.id,
        status: WorkflowStatus.ENABLED,
    })

    const childWorkflowVersion = createMockWorkflowVersion({
        workflowId: childWorkflow.id,
        state: WorkflowVersionState.LOCKED,
        trigger: {
            type: WorkflowTriggerType.CONNECTOR,
            name: 'trigger',
            displayName: 'Callable Workflow',
            valid: true,
            lastUpdatedDate: new Date().toISOString(),
            settings: {
                connectorName: '@fema/connector-subflows',
                connectorVersion: '0.4.11',
                triggerName: 'callableWorkflow',
                input: {
                    mode: 'simple',
                    exampleData: {
                        sampleData: {
                            name: '',
                            greeting: '',
                        },
                    },
                },
                propertySettings: {},
            },
            nextAction: childCodeAction,
        },
    })

    await db.save('workflow', childWorkflow)
    await db.save('workflow_version', childWorkflowVersion)
    await db.update('workflow', childWorkflow.id, { publishedVersionId: childWorkflowVersion.id })

    // Parent Workflow: webhook trigger → callWorkflow action
    const parentCallWorkflowAction = {
        type: WorkflowActionType.CONNECTOR as const,
        name: 'step_1',
        displayName: 'Call Workflow',
        valid: true,
        settings: {
            connectorName: '@fema/connector-subflows',
            connectorVersion: '0.4.11',
            actionName: 'callWorkflow',
            input: {
                workflow: {
                    externalId: childWorkflow.externalId,
                    exampleData: {
                        sampleData: {
                            name: '',
                            greeting: '',
                        },
                    },
                },
                mode: 'simple',
                workflowProps: {
                    payload: {
                        name: '{{trigger[\'output\'].body.name}}',
                    },
                },
                waitForResponse: true,
            },
            propertySettings: {},
            errorHandlingOptions: retryOnFailure
                ? { retryOnFailure: { value: true }, continueOnFailure: { value: false } }
                : {},
        },
    }

    const parentWorkflow = createMockWorkflow({
        workspaceId: mockWorkspace.id,
    })
    await db.save('workflow', parentWorkflow)

    const parentWorkflowVersion = createMockWorkflowVersion({
        workflowId: parentWorkflow.id,
        state: WorkflowVersionState.DRAFT,
        trigger: {
            type: WorkflowTriggerType.CONNECTOR,
            name: 'trigger',
            displayName: 'Catch Webhook',
            valid: true,
            lastUpdatedDate: new Date().toISOString(),
            settings: {
                connectorName: '@fema/connector-webhook',
                connectorVersion: '0.1.29',
                triggerName: 'catch_webhook',
                input: { authType: 'none' },
                propertySettings: {},
            },
            nextAction: parentCallWorkflowAction,
        },
    })
    await db.save('workflow_version', parentWorkflowVersion)

    return { parentWorkflow, parentWorkflowVersion, childWorkflow, mockPlatform, mockWorkspace }
}

async function setupSubflowWithWebhookResponseFixtures() {
    const { mockPlatform, mockWorkspace } = await mockAndSaveBasicSetup()

    const webhookConnector = createMockConnectorMetadata({
        name: '@fema/connector-webhook',
        version: '0.1.29',
        platformId: undefined,
        packageType: PackageType.REGISTRY,
        connectorType: ConnectorType.OFFICIAL,
    })
    const subflowsConnector = createMockConnectorMetadata({
        name: '@fema/connector-subflows',
        version: '0.4.11',
        platformId: undefined,
        packageType: PackageType.REGISTRY,
        connectorType: ConnectorType.OFFICIAL,
    })
    await databaseConnection().getRepository('connector_metadata').save([webhookConnector, subflowsConnector])

    // Child workflow: callableWorkflow trigger → returnResponse (echoes back message)
    const childReturnResponseAction = {
        type: WorkflowActionType.CONNECTOR as const,
        name: 'step_1',
        displayName: 'Return Response',
        valid: true,
        settings: {
            connectorName: '@fema/connector-subflows',
            connectorVersion: '0.4.11',
            actionName: 'returnResponse',
            input: {
                mode: 'simple',
                response: {
                    response: {
                        echo: '{{trigger[\'output\'].data.message}}',
                    },
                },
            },
            propertySettings: {},
            errorHandlingOptions: {},
        },
    }

    const childWorkflow = createMockWorkflow({
        workspaceId: mockWorkspace.id,
        status: WorkflowStatus.ENABLED,
    })

    const childWorkflowVersion = createMockWorkflowVersion({
        workflowId: childWorkflow.id,
        state: WorkflowVersionState.LOCKED,
        trigger: {
            lastUpdatedDate: new Date().toISOString(),
            type: WorkflowTriggerType.CONNECTOR,
            name: 'trigger',
            displayName: 'Callable Workflow',
            valid: true,
            settings: {
                connectorName: '@fema/connector-subflows',
                connectorVersion: '0.4.11',
                triggerName: 'callableWorkflow',
                input: {
                    mode: 'simple',
                    exampleData: {
                        sampleData: {
                            message: '',
                        },
                    },
                },
                propertySettings: {},
            },
            nextAction: childReturnResponseAction,
        },
    })

    await db.save('workflow', childWorkflow)
    await db.save('workflow_version', childWorkflowVersion)
    await db.update('workflow', childWorkflow.id, { publishedVersionId: childWorkflowVersion.id })

    // Parent workflow: catch_webhook → callWorkflow (waitForResponse) → return_response (webhook).
    // Workflow must be ENABLED + LOCKED so the /sync webhook route accepts and executes it.
    const parentReturnResponseAction = {
        type: WorkflowActionType.CONNECTOR as const,
        name: 'step_2',
        displayName: 'Return Response',
        valid: true,
        settings: {
            connectorName: '@fema/connector-webhook',
            connectorVersion: '0.1.29',
            actionName: 'return_response',
            input: {
                responseType: 'json',
                respond: 'stop',
                fields: {
                    status: 200,
                    headers: {},
                    body: { echo: '{{step_1[\'output\'].data.echo}}' },
                },
            },
            propertySettings: {},
            errorHandlingOptions: {},
        },
    }

    const parentCallWorkflowAction = {
        type: WorkflowActionType.CONNECTOR as const,
        name: 'step_1',
        displayName: 'Call Workflow',
        valid: true,
        settings: {
            connectorName: '@fema/connector-subflows',
            connectorVersion: '0.4.11',
            actionName: 'callWorkflow',
            input: {
                workflow: {
                    externalId: childWorkflow.externalId,
                    exampleData: {
                        sampleData: {
                            message: '',
                        },
                    },
                },
                mode: 'simple',
                workflowProps: {
                    payload: {
                        message: '{{trigger[\'output\'].body.message}}',
                    },
                },
                waitForResponse: true,
            },
            propertySettings: {},
            errorHandlingOptions: {},
        },
        nextAction: parentReturnResponseAction,
    }

    const parentWorkflow = createMockWorkflow({
        workspaceId: mockWorkspace.id,
        status: WorkflowStatus.ENABLED,
    })
    await db.save('workflow', parentWorkflow)

    const parentWorkflowVersion = createMockWorkflowVersion({
        workflowId: parentWorkflow.id,
        state: WorkflowVersionState.LOCKED,
        trigger: {
            type: WorkflowTriggerType.CONNECTOR,
            name: 'trigger',
            displayName: 'Catch Webhook',
            valid: true,
            lastUpdatedDate: new Date().toISOString(),
            settings: {
                connectorName: '@fema/connector-webhook',
                connectorVersion: '0.1.29',
                triggerName: 'catch_webhook',
                input: { authType: 'none' },
                propertySettings: {},
            },
            nextAction: parentCallWorkflowAction,
        },
    })
    await db.save('workflow_version', parentWorkflowVersion)
    await db.update('workflow', parentWorkflow.id, { publishedVersionId: parentWorkflowVersion.id })

    return { parentWorkflow, parentWorkflowVersion, mockPlatform, mockWorkspace }
}

async function pollExecutionToCompletion(executionId: string, workspaceId: string) {
    const maxWaitMs = 120_000
    const pollIntervalMs = 500
    const start = Date.now()
    let result = await executionService(app.log).getOnePopulatedOrThrow({
        id: executionId,
        workspaceId,
    })

    while (
        (result.status === ExecutionStatus.QUEUED ||
            result.status === ExecutionStatus.RUNNING ||
            result.status === ExecutionStatus.PAUSED) &&
        Date.now() - start < maxWaitMs
    ) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
        result = await executionService(app.log).getOnePopulatedOrThrow({
            id: executionId,
            workspaceId,
        })
    }

    return result
}

describe('Execute Workflow E2E', () => {
    it('executes a webhook → data mapper → code workflow end-to-end', async () => {
        const { mockPlatform, mockWorkspace } = await mockAndSaveBasicSetup()

        // Save connector metadata records
        const webhookConnector = createMockConnectorMetadata({
            name: '@fema/connector-webhook',
            version: '0.1.29',
            platformId: undefined,
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
        })
        const dataMapperConnector = createMockConnectorMetadata({
            name: '@fema/connector-data-mapper',
            version: '0.3.15',
            platformId: undefined,
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
        })
        await databaseConnection().getRepository('connector_metadata').save([webhookConnector, dataMapperConnector])

        // Build the workflow: trigger → data mapper → code
        const codeAction = {
            type: WorkflowActionType.CODE as const,
            name: 'step_2',
            displayName: 'Transform',
            valid: true,
            settings: {
                sourceCode: {
                    code: `export const code = async (inputs) => {
                        return {
                            greeting: 'Hello ' + inputs.data.fullName,
                            contact: inputs.data.emailAddress,
                            processed: true,
                        };
                    }`,
                    packageJson: '{}',
                },
                input: {
                    data: '{{step_1[\'output\']}}',
                },
                errorHandlingOptions: {},
            },
        }

        const dataMapperAction = {
            type: WorkflowActionType.CONNECTOR as const,
            name: 'step_1',
            displayName: 'Map Data',
            valid: true,
            settings: {
                connectorName: '@fema/connector-data-mapper',
                connectorVersion: '0.3.15',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        fullName: '{{trigger[\'output\'].body.name}}',
                        emailAddress: '{{trigger[\'output\'].body.email}}',
                    },
                },
                propertySettings: {},
                errorHandlingOptions: {},
            },
            nextAction: codeAction,
        }

        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
        })
        await db.save('workflow', mockWorkflow)

        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
            state: WorkflowVersionState.DRAFT,
            trigger: {
                type: WorkflowTriggerType.CONNECTOR,
                name: 'trigger',
                displayName: 'Catch Webhook',
                valid: true,
                lastUpdatedDate: new Date().toISOString(),
                settings: {
                    connectorName: '@fema/connector-webhook',
                    connectorVersion: '0.1.29',
                    triggerName: 'catch_webhook',
                    input: { authType: 'none' },
                    propertySettings: {},
                },
                nextAction: dataMapperAction,
            },
        })
        await db.save('workflow_version', mockWorkflowVersion)

        // Start the workflow run directly (skip trigger execution)
        const execution = await executionService(app.log).start({
            workflowId: mockWorkflow.id,
            payload: { body: { name: 'John Doe', email: 'john@example.com' } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            workflowVersionId: mockWorkflowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        // Poll until workflow run completes
        const maxWaitMs = 120_000
        const pollIntervalMs = 500
        const start = Date.now()
        let result = await executionService(app.log).getOnePopulatedOrThrow({
            id: execution.id,
            workspaceId: mockWorkspace.id,
        })

        while (
            (result.status === ExecutionStatus.QUEUED || result.status === ExecutionStatus.RUNNING) &&
            Date.now() - start < maxWaitMs
        ) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
            result = await executionService(app.log).getOnePopulatedOrThrow({
                id: execution.id,
                workspaceId: mockWorkspace.id,
            })
        }
        console.log(result)
        // Assertions
        expect(result.status).toBe(ExecutionStatus.SUCCEEDED)
        expect(result.steps.step_1.output).toEqual(
            expect.objectContaining({
                fullName: 'John Doe',
                emailAddress: 'john@example.com',
            }),
        )
        expect(result.steps.step_2.output).toEqual(
            expect.objectContaining({
                greeting: 'Hello John Doe',
                contact: 'john@example.com',
                processed: true,
            }),
        )
    }, 120_000)

    it('installs a tar.gz custom connector and executes a workflow that runs its action', async () => {
        const ctx = await createTestContext(app)

        // Install the custom connector straight from its packed .tgz archive through the
        // real public API — this exercises archive upload → engine metadata extraction →
        // worker install, the full private-connector path.
        const formData = new FormData()
        formData.append(
            'connectorArchive',
            new Blob([customConnectorArchive], { type: 'application/gzip' }),
            'e2e-custom-echo-0.0.1.tgz',
        )
        formData.append('connectorName', CUSTOM_CONNECTOR_NAME)
        formData.append('connectorVersion', CUSTOM_CONNECTOR_VERSION)
        formData.append('packageType', PackageType.ARCHIVE)
        formData.append('scope', ConnectorScope.PLATFORM)

        const installResponse = await ctx.inject({
            method: 'POST',
            url: '/api/v1/connectors',
            body: formData,
        })
        // Surface the response body in the failure message so a regressed archive
        // upload is diagnosable from the CI log without re-running locally.
        expect(installResponse.statusCode, installResponse.body).toBe(StatusCodes.CREATED)

        const webhookConnector = createMockConnectorMetadata({
            name: '@fema/connector-webhook',
            version: '0.1.29',
            platformId: undefined,
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
        })
        await databaseConnection().getRepository('connector_metadata').save([webhookConnector])

        const echoAction = {
            type: WorkflowActionType.CONNECTOR as const,
            name: 'step_1',
            displayName: 'Echo Message',
            valid: true,
            settings: {
                connectorName: CUSTOM_CONNECTOR_NAME,
                connectorVersion: CUSTOM_CONNECTOR_VERSION,
                actionName: 'echo',
                input: {},
                propertySettings: {},
                errorHandlingOptions: {},
            },
        }

        const mockWorkflow = createMockWorkflow({ workspaceId: ctx.workspace.id })
        await db.save('workflow', mockWorkflow)

        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
            state: WorkflowVersionState.DRAFT,
            trigger: {
                type: WorkflowTriggerType.CONNECTOR,
                name: 'trigger',
                displayName: 'Catch Webhook',
                valid: true,
                lastUpdatedDate: new Date().toISOString(),
                settings: {
                    connectorName: '@fema/connector-webhook',
                    connectorVersion: '0.1.29',
                    triggerName: 'catch_webhook',
                    input: { authType: 'none' },
                    propertySettings: {},
                },
                nextAction: echoAction,
            },
        })
        await db.save('workflow_version', mockWorkflowVersion)

        const execution = await executionService(app.log).start({
            workflowId: mockWorkflow.id,
            payload: { body: { trigger: 'custom-connector' } },
            platformId: ctx.platform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            workflowVersionId: mockWorkflowVersion.id,
            workspaceId: ctx.workspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        const result = await pollExecutionToCompletion(execution.id, ctx.workspace.id)

        expect(result.status).toBe(ExecutionStatus.SUCCEEDED)
        expect(result.steps.step_1.output).toEqual(
            expect.objectContaining({ message: 'custom-connector-works' }),
        )
    }, 180_000)

    it('handles concurrent workflow run executions without jobs getting stuck', async () => {
        const { mockPlatform, mockWorkspace } = await mockAndSaveBasicSetup()

        const webhookConnector = createMockConnectorMetadata({
            name: '@fema/connector-webhook',
            version: '0.1.29',
            platformId: undefined,
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
        })
        await databaseConnection().getRepository('connector_metadata').save([webhookConnector])

        const codeAction = {
            type: WorkflowActionType.CODE as const,
            name: 'step_1',
            displayName: 'Process',
            valid: true,
            settings: {
                sourceCode: {
                    code: `export const code = async (inputs) => {
                        return { processed: true };
                    }`,
                    packageJson: '{}',
                },
                input: {},
                errorHandlingOptions: {},
            },
        }

        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
        })
        await db.save('workflow', mockWorkflow)

        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
            state: WorkflowVersionState.DRAFT,
            trigger: {
                type: WorkflowTriggerType.CONNECTOR,
                name: 'trigger',
                displayName: 'Catch Webhook',
                valid: true,
                lastUpdatedDate: new Date().toISOString(),
                settings: {
                    connectorName: '@fema/connector-webhook',
                    connectorVersion: '0.1.29',
                    triggerName: 'catch_webhook',
                    input: { authType: 'none' },
                    propertySettings: {},
                },
                nextAction: codeAction,
            },
        })
        await db.save('workflow_version', mockWorkflowVersion)

        const concurrentCount = 5

        const executions = await Promise.all(
            Array.from({ length: concurrentCount }, (_, i) =>
                executionService(app.log).start({
                    workflowId: mockWorkflow.id,
                    payload: { body: { index: i } },
                    platformId: mockPlatform.id,
                    executionType: ExecutionType.BEGIN,
                    environment: RunEnvironment.TESTING,
                    streamStepProgress: StreamStepProgress.NONE,
                    executeTrigger: false,
                    workflowVersionId: mockWorkflowVersion.id,
                    workspaceId: mockWorkspace.id,
                    workerHandlerId: undefined,
                    httpRequestId: undefined,
                    failParentOnFailure: undefined,
                }),
            ),
        )

        expect(executions).toHaveLength(concurrentCount)

        const maxWaitMs = 25_000
        const pollIntervalMs = 500
        const start = Date.now()

        const results = new Map<string, ExecutionStatus>()
        for (const run of executions) {
            results.set(run.id, run.status)
        }

        while (Date.now() - start < maxWaitMs) {
            const pending = [...results.entries()].filter(
                ([, status]) => status === ExecutionStatus.QUEUED || status === ExecutionStatus.RUNNING,
            )
            if (pending.length === 0) break

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))

            for (const [id] of pending) {
                const updated = await executionService(app.log).getOnePopulatedOrThrow({
                    id,
                    workspaceId: mockWorkspace.id,
                })
                results.set(id, updated.status)
            }
        }

        const statuses = [...results.values()]
        const succeeded = statuses.filter((s) => s === ExecutionStatus.SUCCEEDED).length
        const stuck = statuses.filter(
            (s) => s === ExecutionStatus.QUEUED || s === ExecutionStatus.RUNNING,
        ).length

        expect(stuck).toBe(0)
        expect(succeeded).toBe(concurrentCount)
    }, 30_000)

    it('executes parent → child subflow with wait-for-response', async () => {
        const { parentWorkflow, parentWorkflowVersion, mockPlatform, mockWorkspace } = await setupSubflowFixtures()

        const execution = await executionService(app.log).start({
            workflowId: parentWorkflow.id,
            payload: { body: { name: 'Alice' } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            workflowVersionId: parentWorkflowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        const result = await pollExecutionToCompletion(execution.id, mockWorkspace.id)

        expect(result.status).toBe(ExecutionStatus.SUCCEEDED)
        expect(result.steps.step_1.output).toEqual(
            expect.objectContaining({
                status: 'success',
                data: {
                    greeting: 'Hello Alice',
                    processed: true,
                },
            }),
        )
    }, 180_000)

    it('retry-on-failure of a wait-for-response Call Workflow retries the parent step and fails after maxAttempts without re-invoking the child subflow', async () => {
        const { parentWorkflow, parentWorkflowVersion, childWorkflow, mockPlatform, mockWorkspace } = await setupSubflowFixtures({
            childAlwaysFails: true,
            retryOnFailure: true,
        })

        const execution = await executionService(app.log).start({
            workflowId: parentWorkflow.id,
            payload: { body: { name: 'Alice' } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            workflowVersionId: parentWorkflowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        const result = await pollExecutionToCompletion(execution.id, mockWorkspace.id)
        const childRunCount = await databaseConnection()
            .getRepository('execution')
            .count({ where: { workflowId: childWorkflow.id } })

        expect(result.status).toBe(ExecutionStatus.FAILED)
        expect(childRunCount).toBe(1)
    }, 180_000)

    it('executes a webhook → delay_for → code workflow without infinite loop', async () => {
        const { mockPlatform, mockWorkspace } = await mockAndSaveBasicSetup()

        const webhookConnector = createMockConnectorMetadata({
            name: '@fema/connector-webhook',
            version: '0.1.29',
            platformId: undefined,
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
        })
        const delayConnector = createMockConnectorMetadata({
            name: '@fema/connector-delay',
            version: '0.3.26',
            platformId: undefined,
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
        })
        await databaseConnection().getRepository('connector_metadata').save([webhookConnector, delayConnector])

        const codeAction = {
            type: WorkflowActionType.CODE as const,
            name: 'step_2',
            displayName: 'After Delay',
            valid: true,
            settings: {
                sourceCode: {
                    code: `export const code = async (inputs) => {
                        return { resumed: true, timestamp: Date.now() };
                    }`,
                    packageJson: '{}',
                },
                input: {},
                errorHandlingOptions: {},
            },
        }

        const delayAction = {
            type: WorkflowActionType.CONNECTOR as const,
            name: 'step_1',
            displayName: 'Delay For',
            valid: true,
            settings: {
                connectorName: '@fema/connector-delay',
                connectorVersion: '0.3.26',
                actionName: 'delayFor',
                input: {
                    unit: 'seconds',
                    delayFor: 11,
                },
                propertySettings: {},
                errorHandlingOptions: {},
            },
            nextAction: codeAction,
        }

        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
        })
        await db.save('workflow', mockWorkflow)

        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
            state: WorkflowVersionState.DRAFT,
            trigger: {
                type: WorkflowTriggerType.CONNECTOR,
                name: 'trigger',
                displayName: 'Catch Webhook',
                valid: true,
                lastUpdatedDate: new Date().toISOString(),
                settings: {
                    connectorName: '@fema/connector-webhook',
                    connectorVersion: '0.1.29',
                    triggerName: 'catch_webhook',
                    input: { authType: 'none' },
                    propertySettings: {},
                },
                nextAction: delayAction,
            },
        })
        await db.save('workflow_version', mockWorkflowVersion)

        const execution = await executionService(app.log).start({
            workflowId: mockWorkflow.id,
            payload: { body: { test: true } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            workflowVersionId: mockWorkflowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        const result = await pollExecutionToCompletion(execution.id, mockWorkspace.id)
        expect(result.status).toBe(ExecutionStatus.SUCCEEDED)
        expect(result.steps.step_2.output).toEqual(
            expect.objectContaining({ resumed: true }),
        )
    }, 60_000)

    it('slices a >32 KB step output, persists it across a delay/resume, and materializes it for a downstream step', async () => {
        const { mockPlatform, mockWorkspace } = await mockAndSaveBasicSetup()

        const webhookConnector = createMockConnectorMetadata({
            name: '@fema/connector-webhook',
            version: '0.1.29',
            platformId: undefined,
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
        })
        const delayConnector = createMockConnectorMetadata({
            name: '@fema/connector-delay',
            version: '0.3.26',
            platformId: undefined,
            packageType: PackageType.REGISTRY,
            connectorType: ConnectorType.OFFICIAL,
        })
        await databaseConnection().getRepository('connector_metadata').save([webhookConnector, delayConnector])

        const referenceAction = {
            type: WorkflowActionType.CODE as const,
            name: 'step_3',
            displayName: 'Read Sliced Output',
            valid: true,
            settings: {
                sourceCode: {
                    code: `export const code = async (inputs) => ({
                        seenLength: inputs.received.length,
                        sample: inputs.received.slice(0, 5),
                    });`,
                    packageJson: '{}',
                },
                input: {
                    received: '{{step_1.output.big}}',
                },
                errorHandlingOptions: {},
            },
        }

        const delayAction = {
            type: WorkflowActionType.CONNECTOR as const,
            name: 'step_2',
            displayName: 'Delay For',
            valid: true,
            settings: {
                connectorName: '@fema/connector-delay',
                connectorVersion: '0.3.26',
                actionName: 'delayFor',
                input: {
                    unit: 'seconds',
                    delayFor: 2,
                },
                propertySettings: {},
                errorHandlingOptions: {},
            },
            nextAction: referenceAction,
        }

        const emitBigOutputAction = {
            type: WorkflowActionType.CODE as const,
            name: 'step_1',
            displayName: 'Emit 40 KB',
            valid: true,
            settings: {
                sourceCode: {
                    code: 'export const code = async () => ({ big: \'x\'.repeat(40000) });',
                    packageJson: '{}',
                },
                input: {},
                errorHandlingOptions: {},
            },
            nextAction: delayAction,
        }

        const mockWorkflow = createMockWorkflow({
            workspaceId: mockWorkspace.id,
        })
        await db.save('workflow', mockWorkflow)

        const mockWorkflowVersion = createMockWorkflowVersion({
            workflowId: mockWorkflow.id,
            state: WorkflowVersionState.DRAFT,
            trigger: {
                type: WorkflowTriggerType.CONNECTOR,
                name: 'trigger',
                displayName: 'Catch Webhook',
                valid: true,
                lastUpdatedDate: new Date().toISOString(),
                settings: {
                    connectorName: '@fema/connector-webhook',
                    connectorVersion: '0.1.29',
                    triggerName: 'catch_webhook',
                    input: { authType: 'none' },
                    propertySettings: {},
                },
                nextAction: emitBigOutputAction,
            },
        })
        await db.save('workflow_version', mockWorkflowVersion)

        const execution = await executionService(app.log).start({
            workflowId: mockWorkflow.id,
            payload: { body: { test: true } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            workflowVersionId: mockWorkflowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        const result = await pollExecutionToCompletion(execution.id, mockWorkspace.id)
        expect(result.status).toBe(ExecutionStatus.SUCCEEDED)
        // step_1 was offloaded to a EXECUTION_LOG_SLICE file; the journal stores a LogSliceRef.
        expect(result.steps.step_1.outputType).toBe(StepOutputType.SLICE)
        expect((result.steps.step_1.output as { fileId: string }).fileId).toEqual(expect.any(String))
        // step_3 ran after the delay/resume — its input was resolved by materializing the slice
        // through the unified /v1/files/:fileId GET endpoint.
        expect(result.steps.step_3.output).toEqual(
            expect.objectContaining({
                seenLength: 40_000,
                sample: 'xxxxx',
            }),
        )
    }, 60_000)

    it('executes parent → child subflow with wait-for-response in test step mode', async () => {
        const { parentWorkflow, parentWorkflowVersion, mockPlatform, mockWorkspace } = await setupSubflowFixtures()

        const execution = await executionService(app.log).start({
            workflowId: parentWorkflow.id,
            payload: { body: { name: 'Alice' } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.WEBSOCKET,
            executeTrigger: false,
            workflowVersionId: parentWorkflowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
            stepNameToTest: 'step_1',
        })

        const result = await pollExecutionToCompletion(execution.id, mockWorkspace.id)

        expect(result.status).toBe(ExecutionStatus.SUCCEEDED)
        expect(result.steps.step_1.output).toEqual(
            expect.objectContaining({
                status: 'success',
                data: {
                    greeting: 'Hello Alice',
                    processed: true,
                },
            }),
        )
    }, 180_000)

    it('executes webhook → call subflow (wait-for-response) → return webhook response', async () => {
        const { parentWorkflow } = await setupSubflowWithWebhookResponseFixtures()

        // Hit the real /sync route so workerHandlerId + httpRequestId are wired up,
        // enabling the webhook Return Response step to send back the HTTP response.
        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${parentWorkflow.id}/sync`,
            payload: { message: 'hello world' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual(expect.objectContaining({ echo: 'hello world' }))
    }, 180_000)
})
