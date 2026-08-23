/**
 * E2E integration test for full flow execution.
 *
 * Tests the round-trip:
 *   flowRunService.start() → BullMQ queue → worker poll → sandbox engine execution → flow run result
 *
 * Flow structure:
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
    FlowActionType,
    FlowRunStatus,
    FlowStatus,
    FlowTriggerType,
    FlowVersionState,
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
import { flowRunService } from '../../../../../src/app/flows/flow-run/flow-run-service'
import { db } from '../../../../helpers/db'
import { createTestContext } from '../../../../helpers/test-context'
import { setupE2eEnvironment } from '../../../../helpers/e2e-setup'
import {
    createMockFlow,
    createMockFlowVersion,
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

    // Child Flow: callableFlow trigger → code action → returnResponse action
    const childReturnResponseAction = {
        type: FlowActionType.CONNECTOR as const,
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
        type: FlowActionType.CODE as const,
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

    const childFlow = createMockFlow({
        workspaceId: mockWorkspace.id,
        status: FlowStatus.ENABLED,
    })

    const childFlowVersion = createMockFlowVersion({
        flowId: childFlow.id,
        state: FlowVersionState.LOCKED,
        trigger: {
            type: FlowTriggerType.CONNECTOR,
            name: 'trigger',
            displayName: 'Callable Flow',
            valid: true,
            lastUpdatedDate: new Date().toISOString(),
            settings: {
                connectorName: '@fema/connector-subflows',
                connectorVersion: '0.4.11',
                triggerName: 'callableFlow',
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

    await db.save('flow', childFlow)
    await db.save('flow_version', childFlowVersion)
    await db.update('flow', childFlow.id, { publishedVersionId: childFlowVersion.id })

    // Parent Flow: webhook trigger → callFlow action
    const parentCallFlowAction = {
        type: FlowActionType.CONNECTOR as const,
        name: 'step_1',
        displayName: 'Call Flow',
        valid: true,
        settings: {
            connectorName: '@fema/connector-subflows',
            connectorVersion: '0.4.11',
            actionName: 'callFlow',
            input: {
                flow: {
                    externalId: childFlow.externalId,
                    exampleData: {
                        sampleData: {
                            name: '',
                            greeting: '',
                        },
                    },
                },
                mode: 'simple',
                flowProps: {
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

    const parentFlow = createMockFlow({
        workspaceId: mockWorkspace.id,
    })
    await db.save('flow', parentFlow)

    const parentFlowVersion = createMockFlowVersion({
        flowId: parentFlow.id,
        state: FlowVersionState.DRAFT,
        trigger: {
            type: FlowTriggerType.CONNECTOR,
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
            nextAction: parentCallFlowAction,
        },
    })
    await db.save('flow_version', parentFlowVersion)

    return { parentFlow, parentFlowVersion, childFlow, mockPlatform, mockWorkspace }
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

    // Child flow: callableFlow trigger → returnResponse (echoes back message)
    const childReturnResponseAction = {
        type: FlowActionType.CONNECTOR as const,
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

    const childFlow = createMockFlow({
        workspaceId: mockWorkspace.id,
        status: FlowStatus.ENABLED,
    })

    const childFlowVersion = createMockFlowVersion({
        flowId: childFlow.id,
        state: FlowVersionState.LOCKED,
        trigger: {
            lastUpdatedDate: new Date().toISOString(),
            type: FlowTriggerType.CONNECTOR,
            name: 'trigger',
            displayName: 'Callable Flow',
            valid: true,
            settings: {
                connectorName: '@fema/connector-subflows',
                connectorVersion: '0.4.11',
                triggerName: 'callableFlow',
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

    await db.save('flow', childFlow)
    await db.save('flow_version', childFlowVersion)
    await db.update('flow', childFlow.id, { publishedVersionId: childFlowVersion.id })

    // Parent flow: catch_webhook → callFlow (waitForResponse) → return_response (webhook).
    // Flow must be ENABLED + LOCKED so the /sync webhook route accepts and executes it.
    const parentReturnResponseAction = {
        type: FlowActionType.CONNECTOR as const,
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

    const parentCallFlowAction = {
        type: FlowActionType.CONNECTOR as const,
        name: 'step_1',
        displayName: 'Call Flow',
        valid: true,
        settings: {
            connectorName: '@fema/connector-subflows',
            connectorVersion: '0.4.11',
            actionName: 'callFlow',
            input: {
                flow: {
                    externalId: childFlow.externalId,
                    exampleData: {
                        sampleData: {
                            message: '',
                        },
                    },
                },
                mode: 'simple',
                flowProps: {
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

    const parentFlow = createMockFlow({
        workspaceId: mockWorkspace.id,
        status: FlowStatus.ENABLED,
    })
    await db.save('flow', parentFlow)

    const parentFlowVersion = createMockFlowVersion({
        flowId: parentFlow.id,
        state: FlowVersionState.LOCKED,
        trigger: {
            type: FlowTriggerType.CONNECTOR,
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
            nextAction: parentCallFlowAction,
        },
    })
    await db.save('flow_version', parentFlowVersion)
    await db.update('flow', parentFlow.id, { publishedVersionId: parentFlowVersion.id })

    return { parentFlow, parentFlowVersion, mockPlatform, mockWorkspace }
}

async function pollFlowRunToCompletion(flowRunId: string, workspaceId: string) {
    const maxWaitMs = 120_000
    const pollIntervalMs = 500
    const start = Date.now()
    let result = await flowRunService(app.log).getOnePopulatedOrThrow({
        id: flowRunId,
        workspaceId,
    })

    while (
        (result.status === FlowRunStatus.QUEUED ||
            result.status === FlowRunStatus.RUNNING ||
            result.status === FlowRunStatus.PAUSED) &&
        Date.now() - start < maxWaitMs
    ) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
        result = await flowRunService(app.log).getOnePopulatedOrThrow({
            id: flowRunId,
            workspaceId,
        })
    }

    return result
}

describe('Execute Flow E2E', () => {
    it('executes a webhook → data mapper → code flow end-to-end', async () => {
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

        // Build the flow: trigger → data mapper → code
        const codeAction = {
            type: FlowActionType.CODE as const,
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
            type: FlowActionType.CONNECTOR as const,
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

        const mockFlow = createMockFlow({
            workspaceId: mockWorkspace.id,
        })
        await db.save('flow', mockFlow)

        const mockFlowVersion = createMockFlowVersion({
            flowId: mockFlow.id,
            state: FlowVersionState.DRAFT,
            trigger: {
                type: FlowTriggerType.CONNECTOR,
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
        await db.save('flow_version', mockFlowVersion)

        // Start the flow run directly (skip trigger execution)
        const flowRun = await flowRunService(app.log).start({
            flowId: mockFlow.id,
            payload: { body: { name: 'John Doe', email: 'john@example.com' } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            flowVersionId: mockFlowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        // Poll until flow run completes
        const maxWaitMs = 120_000
        const pollIntervalMs = 500
        const start = Date.now()
        let result = await flowRunService(app.log).getOnePopulatedOrThrow({
            id: flowRun.id,
            workspaceId: mockWorkspace.id,
        })

        while (
            (result.status === FlowRunStatus.QUEUED || result.status === FlowRunStatus.RUNNING) &&
            Date.now() - start < maxWaitMs
        ) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
            result = await flowRunService(app.log).getOnePopulatedOrThrow({
                id: flowRun.id,
                workspaceId: mockWorkspace.id,
            })
        }
        console.log(result)
        // Assertions
        expect(result.status).toBe(FlowRunStatus.SUCCEEDED)
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

    it('installs a tar.gz custom connector and executes a flow that runs its action', async () => {
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
            type: FlowActionType.CONNECTOR as const,
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

        const mockFlow = createMockFlow({ workspaceId: ctx.workspace.id })
        await db.save('flow', mockFlow)

        const mockFlowVersion = createMockFlowVersion({
            flowId: mockFlow.id,
            state: FlowVersionState.DRAFT,
            trigger: {
                type: FlowTriggerType.CONNECTOR,
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
        await db.save('flow_version', mockFlowVersion)

        const flowRun = await flowRunService(app.log).start({
            flowId: mockFlow.id,
            payload: { body: { trigger: 'custom-connector' } },
            platformId: ctx.platform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            flowVersionId: mockFlowVersion.id,
            workspaceId: ctx.workspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        const result = await pollFlowRunToCompletion(flowRun.id, ctx.workspace.id)

        expect(result.status).toBe(FlowRunStatus.SUCCEEDED)
        expect(result.steps.step_1.output).toEqual(
            expect.objectContaining({ message: 'custom-connector-works' }),
        )
    }, 180_000)

    it('handles concurrent flow run executions without jobs getting stuck', async () => {
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
            type: FlowActionType.CODE as const,
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

        const mockFlow = createMockFlow({
            workspaceId: mockWorkspace.id,
        })
        await db.save('flow', mockFlow)

        const mockFlowVersion = createMockFlowVersion({
            flowId: mockFlow.id,
            state: FlowVersionState.DRAFT,
            trigger: {
                type: FlowTriggerType.CONNECTOR,
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
        await db.save('flow_version', mockFlowVersion)

        const concurrentCount = 5

        const flowRuns = await Promise.all(
            Array.from({ length: concurrentCount }, (_, i) =>
                flowRunService(app.log).start({
                    flowId: mockFlow.id,
                    payload: { body: { index: i } },
                    platformId: mockPlatform.id,
                    executionType: ExecutionType.BEGIN,
                    environment: RunEnvironment.TESTING,
                    streamStepProgress: StreamStepProgress.NONE,
                    executeTrigger: false,
                    flowVersionId: mockFlowVersion.id,
                    workspaceId: mockWorkspace.id,
                    workerHandlerId: undefined,
                    httpRequestId: undefined,
                    failParentOnFailure: undefined,
                }),
            ),
        )

        expect(flowRuns).toHaveLength(concurrentCount)

        const maxWaitMs = 25_000
        const pollIntervalMs = 500
        const start = Date.now()

        const results = new Map<string, FlowRunStatus>()
        for (const run of flowRuns) {
            results.set(run.id, run.status)
        }

        while (Date.now() - start < maxWaitMs) {
            const pending = [...results.entries()].filter(
                ([, status]) => status === FlowRunStatus.QUEUED || status === FlowRunStatus.RUNNING,
            )
            if (pending.length === 0) break

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))

            for (const [id] of pending) {
                const updated = await flowRunService(app.log).getOnePopulatedOrThrow({
                    id,
                    workspaceId: mockWorkspace.id,
                })
                results.set(id, updated.status)
            }
        }

        const statuses = [...results.values()]
        const succeeded = statuses.filter((s) => s === FlowRunStatus.SUCCEEDED).length
        const stuck = statuses.filter(
            (s) => s === FlowRunStatus.QUEUED || s === FlowRunStatus.RUNNING,
        ).length

        expect(stuck).toBe(0)
        expect(succeeded).toBe(concurrentCount)
    }, 30_000)

    it('executes parent → child subflow with wait-for-response', async () => {
        const { parentFlow, parentFlowVersion, mockPlatform, mockWorkspace } = await setupSubflowFixtures()

        const flowRun = await flowRunService(app.log).start({
            flowId: parentFlow.id,
            payload: { body: { name: 'Alice' } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            flowVersionId: parentFlowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        const result = await pollFlowRunToCompletion(flowRun.id, mockWorkspace.id)

        expect(result.status).toBe(FlowRunStatus.SUCCEEDED)
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

    it('retry-on-failure of a wait-for-response Call Flow retries the parent step and fails after maxAttempts without re-invoking the child subflow', async () => {
        const { parentFlow, parentFlowVersion, childFlow, mockPlatform, mockWorkspace } = await setupSubflowFixtures({
            childAlwaysFails: true,
            retryOnFailure: true,
        })

        const flowRun = await flowRunService(app.log).start({
            flowId: parentFlow.id,
            payload: { body: { name: 'Alice' } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            flowVersionId: parentFlowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        const result = await pollFlowRunToCompletion(flowRun.id, mockWorkspace.id)
        const childRunCount = await databaseConnection()
            .getRepository('flow_run')
            .count({ where: { flowId: childFlow.id } })

        expect(result.status).toBe(FlowRunStatus.FAILED)
        expect(childRunCount).toBe(1)
    }, 180_000)

    it('executes a webhook → delay_for → code flow without infinite loop', async () => {
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
            type: FlowActionType.CODE as const,
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
            type: FlowActionType.CONNECTOR as const,
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

        const mockFlow = createMockFlow({
            workspaceId: mockWorkspace.id,
        })
        await db.save('flow', mockFlow)

        const mockFlowVersion = createMockFlowVersion({
            flowId: mockFlow.id,
            state: FlowVersionState.DRAFT,
            trigger: {
                type: FlowTriggerType.CONNECTOR,
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
        await db.save('flow_version', mockFlowVersion)

        const flowRun = await flowRunService(app.log).start({
            flowId: mockFlow.id,
            payload: { body: { test: true } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            flowVersionId: mockFlowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        const result = await pollFlowRunToCompletion(flowRun.id, mockWorkspace.id)
        expect(result.status).toBe(FlowRunStatus.SUCCEEDED)
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
            type: FlowActionType.CODE as const,
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
            type: FlowActionType.CONNECTOR as const,
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
            type: FlowActionType.CODE as const,
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

        const mockFlow = createMockFlow({
            workspaceId: mockWorkspace.id,
        })
        await db.save('flow', mockFlow)

        const mockFlowVersion = createMockFlowVersion({
            flowId: mockFlow.id,
            state: FlowVersionState.DRAFT,
            trigger: {
                type: FlowTriggerType.CONNECTOR,
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
        await db.save('flow_version', mockFlowVersion)

        const flowRun = await flowRunService(app.log).start({
            flowId: mockFlow.id,
            payload: { body: { test: true } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.NONE,
            executeTrigger: false,
            flowVersionId: mockFlowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
        })

        const result = await pollFlowRunToCompletion(flowRun.id, mockWorkspace.id)
        expect(result.status).toBe(FlowRunStatus.SUCCEEDED)
        // step_1 was offloaded to a FLOW_RUN_LOG_SLICE file; the journal stores a LogSliceRef.
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
        const { parentFlow, parentFlowVersion, mockPlatform, mockWorkspace } = await setupSubflowFixtures()

        const flowRun = await flowRunService(app.log).start({
            flowId: parentFlow.id,
            payload: { body: { name: 'Alice' } },
            platformId: mockPlatform.id,
            executionType: ExecutionType.BEGIN,
            environment: RunEnvironment.TESTING,
            streamStepProgress: StreamStepProgress.WEBSOCKET,
            executeTrigger: false,
            flowVersionId: parentFlowVersion.id,
            workspaceId: mockWorkspace.id,
            workerHandlerId: undefined,
            httpRequestId: undefined,
            failParentOnFailure: undefined,
            stepNameToTest: 'step_1',
        })

        const result = await pollFlowRunToCompletion(flowRun.id, mockWorkspace.id)

        expect(result.status).toBe(FlowRunStatus.SUCCEEDED)
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
        const { parentFlow } = await setupSubflowWithWebhookResponseFixtures()

        // Hit the real /sync route so workerHandlerId + httpRequestId are wired up,
        // enabling the webhook Return Response step to send back the HTTP response.
        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/webhooks/${parentFlow.id}/sync`,
            payload: { message: 'hello world' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual(expect.objectContaining({ echo: 'hello world' }))
    }, 180_000)
})
