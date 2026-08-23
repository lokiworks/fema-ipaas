import {
    BranchExecutionType,
    BranchOperator,
    BranchTextCondition,
    CodeAction,
    WorkflowAction,
    WorkflowActionType,
    WorkflowOperationRequest,
    workflowOperations,
    WorkflowOperationType,
    workflowStructureUtil,
    WorkflowTrigger,
    WorkflowTriggerType,
    WorkflowVersion,
    WorkflowVersionState,
    LoopOnItemsAction,
    ConnectorAction,
    PropertyExecutionType,
    RouterAction,
    RouterExecutionType,
    SourceCode,
    StepLocationRelativeToParent,
} from '../../src'
import { _getImportOperations } from '../../src/lib/workflows/operations/import-workflow'

const workflowVersionWithBranching: WorkflowVersion = {
    id: 'pj0KQ7Aypoa9OQGHzmKDl',
    created: '2023-05-24T00:16:41.353Z',
    updated: '2023-05-24T00:16:41.353Z',
    workflowId: 'lod6JEdKyPlvrnErdnrGa',
    updatedBy: '',
    displayName: 'Standup Reminder',
    agentIds: [],
    notes: [],
    trigger: {
        name: 'trigger',
        type: WorkflowTriggerType.CONNECTOR,
        valid: true,
        settings: {
            input: {
                cronExpression: '25 10 * * 0,1,2,3,4',
            },
            connectorName: 'schedule',
            connectorVersion: '0.0.2',
            propertySettings: {
                'cronExpression': {
                    type: PropertyExecutionType.MANUAL,
                },
            },
            triggerName: 'cron_expression',
        },
        nextAction: {
            name: 'step_1',
            type: WorkflowActionType.ROUTER,
            valid: true,
            settings: {
                branches: [
                    {
                        conditions: [
                            [
                                {
                                    operator: BranchOperator.TEXT_CONTAINS,
                                    firstValue: '1',
                                    secondValue: '1',
                                    caseSensitive: true,
                                },
                            ],
                        ],
                        branchType: BranchExecutionType.CONDITION,
                        branchName: 'step_4',
                    },
                ],
                executionType: RouterExecutionType.EXECUTE_ALL_MATCH,
            },
            nextAction: {
                name: 'step_4',
                type: WorkflowActionType.CONNECTOR,
                valid: true,
                settings: {
                    input: {
                        key: '1',
                    },
                    connectorName: 'store',
                    connectorVersion: '0.2.6',
                    actionName: 'get',
                    propertySettings: {
                        'key': {
                            type: PropertyExecutionType.MANUAL,
                        },
                    },
                },
                displayName: 'Get',
            },
            displayName: 'Router',
            children: [
                {
                    name: 'step_3',
                    type: WorkflowActionType.CODE,
                    valid: true,
                    settings: {
                        input: {},
                        sourceCode: {
                            code: 'test',
                            packageJson: '{}',
                        },
                    },
                    displayName: 'Code',
                },
                {
                    name: 'step_2',
                    type: WorkflowActionType.CONNECTOR,
                    valid: true,
                    settings: {
                        input: {
                            content: 'MESSAGE',
                            webhook_url: 'WEBHOOK_URL',
                        },
                        connectorName: 'discord',
                        connectorVersion: '0.2.1',
                        actionName: 'send_message_webhook',
                        propertySettings: {
                            'content': {
                                type: PropertyExecutionType.MANUAL,
                            },
                            'webhook_url': {
                                type: PropertyExecutionType.MANUAL,
                            },
                        },
                    },
                    displayName: 'Send Message Webhook',
                },
            ],
        },
        displayName: 'Cron Expression',
    },
    connectionIds: [],
    valid: true,
    state: WorkflowVersionState.DRAFT,
}

function createCodeAction(name: string): WorkflowAction {
    return {
        name,
        displayName: 'Code',
        type: WorkflowActionType.CODE,
        valid: true,
        settings: {
            sourceCode: {
                code: 'test',
                packageJson: '{}',
            },
            input: {},
        },
    }
}
const emptyScheduleWorkflowVersion: WorkflowVersion = {
    notes: [],
    id: 'pj0KQ7Aypoa9OQGHzmKDl',
    created: '2023-05-24T00:16:41.353Z',
    updated: '2023-05-24T00:16:41.353Z',
    workflowId: 'lod6JEdKyPlvrnErdnrGa',
    displayName: 'Standup Reminder',
    updatedBy: '',
    agentIds: [],
    trigger: {
        name: 'trigger',
        type: WorkflowTriggerType.CONNECTOR,
        valid: true,
        settings: {
            input: {
                cronExpression: '25 10 * * 0,1,2,3,4',
            },
            connectorName: 'schedule',
            connectorVersion: '0.0.2',
            propertySettings: {
                'cronExpression': {
                    type: PropertyExecutionType.MANUAL,
                },
            },
            triggerName: 'cron_expression',
        },
        displayName: 'Cron Expression',
    },
    valid: true,
    state: WorkflowVersionState.DRAFT,
    connectionIds: [],
}

describe('Workflow Helper', () => {
    it('should lock a workflow', () => {
        const operation: WorkflowOperationRequest = {
            type: WorkflowOperationType.LOCK_WORKFLOW,
            request: {
                workflowId: workflowVersionWithBranching.workflowId,
            },
        }
        const result = workflowOperations.apply(workflowVersionWithBranching, operation)
        expect(result.state).toEqual(WorkflowVersionState.LOCKED)
    })

    it('should delete branch', () => {
        const operation: WorkflowOperationRequest = {
            type: WorkflowOperationType.DELETE_ACTION,
            request: {
                names: [workflowVersionWithBranching.trigger.nextAction!.name],
            },
        }
        const result = workflowOperations.apply(workflowVersionWithBranching, operation)
        const expectedWorkflowVersion: WorkflowVersion = {
            notes: [],
            id: 'pj0KQ7Aypoa9OQGHzmKDl',
            updatedBy: '',
            created: '2023-05-24T00:16:41.353Z',
            updated: '2023-05-24T00:16:41.353Z',
            workflowId: 'lod6JEdKyPlvrnErdnrGa',
            displayName: 'Standup Reminder',
            agentIds: [],
            trigger: {
                name: 'trigger',
                type: WorkflowTriggerType.CONNECTOR,
                valid: true,
                settings: {
                    input: {
                        cronExpression: '25 10 * * 0,1,2,3,4',
                    },
                    connectorName: 'schedule',
                    connectorVersion: '0.0.2',
                    propertySettings: {
                        'cronExpression': {
                            type: PropertyExecutionType.MANUAL,
                        },
                    },
                    triggerName: 'cron_expression',
                },
                displayName: 'Cron Expression',
                nextAction: {
                    name: 'step_4',
                    type: WorkflowActionType.CONNECTOR,
                    valid: true,
                    settings: {
                        input: {
                            key: '1',
                        },
                        connectorName: 'store',
                        connectorVersion: '0.2.6',
                        actionName: 'get',
                        propertySettings: {
                            'key': {
                                type: PropertyExecutionType.MANUAL,
                            },
                        },
                    },
                    displayName: 'Get',
                },
            },
            valid: true,
            state: WorkflowVersionState.DRAFT,
            connectionIds: [],
        }
        expect(result).toEqual(expectedWorkflowVersion)
    })


    it('should add loop step with actions', () => {
        const addBranchRequest: WorkflowOperationRequest = {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                parentStep: 'trigger',
                action: {
                    name: 'step_1',
                    type: WorkflowActionType.LOOP_ON_ITEMS,
                    displayName: 'Loop',
                    valid: true,
                    settings: {
                        items: 'items',
                    },
                },
            },
        }
        const addCodeActionInside: WorkflowOperationRequest = {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                parentStep: 'step_1',
                stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_LOOP,
                action: createCodeAction('step_3'),
            },
        }
        const addCodeActionOnAfter: WorkflowOperationRequest = {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                parentStep: 'step_1',
                stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
                action: createCodeAction('step_4'),
            },
        }
        let resultWorkflow = emptyScheduleWorkflowVersion
        resultWorkflow = workflowOperations.apply(resultWorkflow, addBranchRequest)
        resultWorkflow = workflowOperations.apply(resultWorkflow, addCodeActionInside)
        resultWorkflow = workflowOperations.apply(resultWorkflow, addCodeActionOnAfter)

        const expectedTrigger: WorkflowTrigger = {
            name: 'trigger',
            type: WorkflowTriggerType.CONNECTOR,
            valid: true,
            settings: {
                input: {
                    cronExpression: '25 10 * * 0,1,2,3,4',
                },
                connectorName: 'schedule',
                connectorVersion: '0.0.2',
                propertySettings: {
                    'cronExpression': {
                        type: PropertyExecutionType.MANUAL,
                    },
                },
                triggerName: 'cron_expression',
            },
            displayName: 'Cron Expression',
            nextAction: {
                displayName: 'Loop',
                name: 'step_1',
                valid: true,
                type: WorkflowActionType.LOOP_ON_ITEMS,
                settings: {
                    items: 'items',
                },
                lastUpdatedDate: expect.any(String),
                firstLoopAction: {
                    displayName: 'Code',
                    name: 'step_3',
                    valid: true,
                    type: WorkflowActionType.CODE,
                    lastUpdatedDate: expect.any(String),
                    settings: {
                        input: {},
                        sourceCode: {
                            code: 'test',
                            packageJson: '{}',
                        },
                    },
                },
                nextAction: {
                    displayName: 'Code',
                    name: 'step_4',
                    valid: true,
                    type: WorkflowActionType.CODE,
                    lastUpdatedDate: expect.any(String),
                    settings: {
                        input: {},
                        sourceCode: {
                            code: 'test',
                            packageJson: '{}',
                        },
                    },
                },
            },
        }
        expect(resultWorkflow.trigger).toEqual(expectedTrigger)
    })

    describe('isChildOf', () => {
        it('recognises a step inside a LOOP_ON_ITEMS as a child', () => {
            const loop: WorkflowAction = {
                name: 'loop',
                type: WorkflowActionType.LOOP_ON_ITEMS,
                valid: true,
                displayName: 'Loop',
                lastUpdatedDate: '2026-05-02T00:00:00.000Z',
                settings: { items: '' },
                firstLoopAction: createCodeAction('inner_step'),
            }
            expect(workflowStructureUtil.isChildOf(loop, 'inner_step')).toBe(true)
        })

        it('recognises a deeply nested step inside a LOOP_ON_ITEMS as a child', () => {
            const loop: WorkflowAction = {
                name: 'loop',
                type: WorkflowActionType.LOOP_ON_ITEMS,
                valid: true,
                displayName: 'Loop',
                lastUpdatedDate: '2026-05-02T00:00:00.000Z',
                settings: { items: '' },
                firstLoopAction: {
                    ...createCodeAction('inner_step'),
                    nextAction: createCodeAction('deep_step'),
                },
            }
            expect(workflowStructureUtil.isChildOf(loop, 'deep_step')).toBe(true)
        })

        it('recognises a step inside a ROUTER branch as a child', () => {
            const router: WorkflowAction = {
                name: 'router',
                type: WorkflowActionType.ROUTER,
                valid: true,
                displayName: 'Router',
                lastUpdatedDate: '2026-05-02T00:00:00.000Z',
                settings: {
                    branches: [
                        {
                            branchName: 'branch_a',
                            branchType: BranchExecutionType.CONDITION,
                            conditions: [[]],
                        },
                    ],
                    executionType: RouterExecutionType.EXECUTE_ALL_MATCH,
                },
                children: [createCodeAction('branch_a_step')],
            }
            expect(workflowStructureUtil.isChildOf(router, 'branch_a_step')).toBe(true)
        })

        it('recognises a step inside a CoF onSuccess branch as a child', () => {
            const cofParent = buildCofCodeAction({
                name: 'cof',
                onSuccess: createCodeAction('success_head'),
                onFailure: createCodeAction('failure_head'),
            })
            expect(workflowStructureUtil.isChildOf(cofParent, 'success_head')).toBe(true)
        })

        it('recognises a step inside a CoF onFailure branch as a child', () => {
            const cofParent = buildCofCodeAction({
                name: 'cof',
                onSuccess: createCodeAction('success_head'),
                onFailure: createCodeAction('failure_head'),
            })
            expect(workflowStructureUtil.isChildOf(cofParent, 'failure_head')).toBe(true)
        })

        it('recognises a deeply nested step inside a CoF branch as a child', () => {
            const cofParent = buildCofCodeAction({
                name: 'cof',
                onSuccess: {
                    ...createCodeAction('success_head'),
                    nextAction: createCodeAction('success_tail'),
                },
                onFailure: createCodeAction('failure_head'),
            })
            expect(workflowStructureUtil.isChildOf(cofParent, 'success_tail')).toBe(true)
        })

        it('returns false for a step that is not part of any descendant', () => {
            const cofParent = buildCofCodeAction({
                name: 'cof',
                onSuccess: createCodeAction('success_head'),
                onFailure: createCodeAction('failure_head'),
            })
            expect(workflowStructureUtil.isChildOf(cofParent, 'unrelated')).toBe(false)
        })

        it('returns false when called with the parent step name itself', () => {
            const cofParent = buildCofCodeAction({
                name: 'cof',
                onSuccess: createCodeAction('success_head'),
            })
            expect(workflowStructureUtil.isChildOf(cofParent, 'cof')).toBe(false)
        })

        it('returns false for a CODE step without CoF branches', () => {
            const plain = createCodeAction('plain')
            expect(workflowStructureUtil.isChildOf(plain, 'anything')).toBe(false)
        })

        it('does not include the next action of the parent as a child', () => {
            const cofParent = buildCofCodeAction({
                name: 'cof',
                onSuccess: createCodeAction('success_head'),
                nextAction: createCodeAction('next_step'),
            })
            expect(workflowStructureUtil.isChildOf(cofParent, 'next_step')).toBe(false)
        })
    })
})

function buildCofCodeAction({
    name,
    onSuccess,
    onFailure,
    nextAction,
}: {
    name: string
    onSuccess?: WorkflowAction
    onFailure?: WorkflowAction
    nextAction?: WorkflowAction
}): CodeAction {
    return {
        name,
        type: WorkflowActionType.CODE,
        valid: true,
        displayName: name,
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: {
            sourceCode: { code: '', packageJson: '{}' },
            input: {},
            errorHandlingOptions: {
                continueOnFailure: { value: true },
                retryOnFailure: { value: false },
            },
        },
        continueOnFailureBranches: { onSuccess, onFailure },
        nextAction,
    }
}

test('Duplicate Workflow With Loops using Import', () => {
    const workflowVersion: WorkflowVersion = {
        notes: [],
        id: '2XuLcKZWSgKkiHh6RqWXg',
        created: '2023-05-23T00:14:47.809Z',
        updated: '2023-05-23T00:14:47.809Z',
        workflowId: 'YGPIPQDfLcPdJ0aJ9AKGb',
        updatedBy: '',
        displayName: 'Workflow 1',
        agentIds: [],
        trigger: {
            name: 'trigger',
            type: WorkflowTriggerType.CONNECTOR,
            valid: true,
            settings: {
                input: {
                    repository: {
                        repo: 'fema',
                        owner: 'fema',
                    },
                    authentication: '{{connections.github}}',
                },
                connectorName: 'github',
                connectorVersion: '0.1.3',
                propertySettings: {
                    'repository': {
                        type: PropertyExecutionType.MANUAL,
                    },
                    'authentication': {
                        type: PropertyExecutionType.MANUAL,
                    },
                },
                triggerName: 'trigger_star',
            },
            nextAction: {
                name: 'step_1',
                type: WorkflowActionType.LOOP_ON_ITEMS,
                valid: false,
                settings: {
                    items: '',
                },
                nextAction: {
                    name: 'step_3',
                    type: WorkflowActionType.CODE,
                    valid: true,
                    settings: {
                        input: {},
                        sourceCode: {
                            code: 'test',
                            packageJson: '{}',
                        },
                    },
                    displayName: 'Code',
                },
                displayName: 'Loop on Items',
                firstLoopAction: {
                    name: 'step_2',
                    type: WorkflowActionType.CODE,
                    valid: true,
                    settings: {
                        input: {},
                        sourceCode: {
                            code: 'test',
                            packageJson: '{}',
                        },
                    },
                    displayName: 'Code',
                },
            },
            displayName: 'Trigger',
        },
        valid: false,
        state: WorkflowVersionState.DRAFT,
        connectionIds: [],
    }
    const expectedResult: WorkflowOperationRequest[] = [
        {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                parentStep: 'trigger',
                stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
                action: {
                    name: 'step_1',
                    type: WorkflowActionType.LOOP_ON_ITEMS,
                    valid: false,
                    settings: {
                        items: '',
                    },
                    displayName: 'Loop on Items',
                },
            },
        },
        {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                parentStep: 'step_1',
                stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
                action: {
                    name: 'step_3',
                    type: WorkflowActionType.CODE,
                    valid: true,
                    settings: {
                        input: {},
                        sourceCode: {
                            code: 'test',
                            packageJson: '{}',
                        },
                    },
                    displayName: 'Code',
                },
            },
        },
        {
            type: WorkflowOperationType.ADD_ACTION,
            request: {
                parentStep: 'step_1',
                stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_LOOP,
                action: {
                    name: 'step_2',
                    type: WorkflowActionType.CODE,
                    valid: true,
                    settings: {
                        input: {},
                        sourceCode: {
                            code: 'test',
                            packageJson: '{}',
                        },
                    },
                    displayName: 'Code',
                },
            },
        },
    ]

    const importOperations = _getImportOperations(workflowVersion.trigger)
    expect(importOperations).toEqual(expectedResult)
})

describe('Paste remaps references to copied steps (GIT-1075)', () => {
    const originalNames = ['trigger', 'step_1', 'step_2']

    function workflowWith({ secondStep, codeStepName = 'step_1', codeSourceCode = { code: 'test', packageJson: '{}' } }: {
        secondStep: WorkflowAction
        codeStepName?: string
        codeSourceCode?: SourceCode
    }): WorkflowVersion {
        return {
            id: 'git1075workflowversionid',
            created: '2023-05-24T00:16:41.353Z',
            updated: '2023-05-24T00:16:41.353Z',
            workflowId: 'git1075workflowid',
            updatedBy: '',
            displayName: 'GIT-1075',
            agentIds: [],
            notes: [],
            valid: true,
            state: WorkflowVersionState.DRAFT,
            connectionIds: [],
            trigger: {
                name: 'trigger',
                type: WorkflowTriggerType.CONNECTOR,
                valid: true,
                settings: {
                    input: { cronExpression: '25 10 * * *' },
                    connectorName: 'schedule',
                    connectorVersion: '0.0.2',
                    propertySettings: {
                        cronExpression: { type: PropertyExecutionType.MANUAL },
                    },
                    triggerName: 'cron_expression',
                },
                displayName: 'Cron',
                nextAction: {
                    name: codeStepName,
                    type: WorkflowActionType.CODE,
                    valid: true,
                    settings: {
                        input: {},
                        sourceCode: codeSourceCode,
                    },
                    displayName: 'Code',
                    nextAction: secondStep,
                },
            },
        }
    }

    function paste(workflowVersion: WorkflowVersion): WorkflowVersion {
        const actions = workflowOperations.getActionsForCopy(['step_1', 'step_2'], workflowVersion)
        const operations = workflowOperations.getOperationsForPaste(actions, workflowVersion, {
            parentStepName: 'step_2',
            stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
        })
        return operations.reduce((workflow, operation) => workflowOperations.apply(workflow, operation), workflowVersion)
    }

    function routerReferencing(codeStepName: string, routerName = 'step_2'): WorkflowAction {
        return {
            name: routerName,
            type: WorkflowActionType.ROUTER,
            valid: true,
            settings: {
                branches: [
                    {
                        conditions: [[{
                            operator: BranchOperator.TEXT_CONTAINS,
                            firstValue: `{{ ${codeStepName}['output'].value }}`,
                            secondValue: 'x',
                            caseSensitive: true,
                        }]],
                        branchType: BranchExecutionType.CONDITION,
                        branchName: 'Branch 1',
                    },
                    { branchType: BranchExecutionType.FALLBACK, branchName: 'Otherwise' },
                ],
                executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
            },
            displayName: 'Router',
            children: [null, null],
        }
    }

    function connectorReferencingStepOne(): WorkflowAction {
        return {
            name: 'step_2',
            type: WorkflowActionType.CONNECTOR,
            valid: true,
            settings: {
                input: {
                    key: "{{ step_1['output'].id }}",
                    label: 'step_1',
                },
                connectorName: 'store',
                connectorVersion: '0.2.6',
                actionName: 'get',
                propertySettings: {
                    key: { type: PropertyExecutionType.MANUAL },
                    label: { type: PropertyExecutionType.MANUAL },
                },
            },
            displayName: 'Get',
        }
    }

    function firstConditionOf(router: RouterAction): BranchTextCondition {
        const branch = router.settings.branches[0]
        if (branch.branchType !== BranchExecutionType.CONDITION) {
            throw new Error('expected a condition branch')
        }
        return branch.conditions[0][0]
    }

    it('remaps a copied router branch condition to the copied step', () => {
        const workflowVersion = workflowWith({ secondStep: routerReferencing('step_1') })

        const steps = workflowStructureUtil.getAllSteps(paste(workflowVersion).trigger)
        const pastedCode = steps.find((step): step is CodeAction => step.type === WorkflowActionType.CODE && !originalNames.includes(step.name))
        const pastedRouter = steps.find((step): step is RouterAction => step.type === WorkflowActionType.ROUTER && !originalNames.includes(step.name))
        if (!pastedCode || !pastedRouter) {
            throw new Error('paste did not create the copied steps')
        }
        expect(firstConditionOf(pastedRouter).firstValue).toBe(`{{ ${pastedCode.name}['output'].value }}`)
        expect(firstConditionOf(pastedRouter).firstValue).not.toContain('step_1')
    })

    it('remaps copied loop items to the copied step', () => {
        const workflowVersion = workflowWith({
            secondStep: {
                name: 'step_2',
                type: WorkflowActionType.LOOP_ON_ITEMS,
                valid: true,
                settings: {
                    items: "{{ step_1['output'].rows }}",
                },
                displayName: 'Loop on Items',
            },
        })

        const steps = workflowStructureUtil.getAllSteps(paste(workflowVersion).trigger)
        const pastedCode = steps.find((step): step is CodeAction => step.type === WorkflowActionType.CODE && !originalNames.includes(step.name))
        const pastedLoop = steps.find((step): step is LoopOnItemsAction => step.type === WorkflowActionType.LOOP_ON_ITEMS && !originalNames.includes(step.name))
        if (!pastedCode || !pastedLoop) {
            throw new Error('paste did not create the copied steps')
        }
        expect(pastedLoop.settings.items).toBe(`{{ ${pastedCode.name}['output'].rows }}`)
        expect(pastedLoop.settings.items).not.toContain('step_1')
    })

    it('remaps a copied connector input reference and leaves bare step-name strings alone', () => {
        const workflowVersion = workflowWith({ secondStep: connectorReferencingStepOne() })

        const steps = workflowStructureUtil.getAllSteps(paste(workflowVersion).trigger)
        const pastedCode = steps.find((step): step is CodeAction => step.type === WorkflowActionType.CODE && !originalNames.includes(step.name))
        const pastedConnector = steps.find((step): step is ConnectorAction => step.type === WorkflowActionType.CONNECTOR && !originalNames.includes(step.name))
        if (!pastedCode || !pastedConnector) {
            throw new Error('paste did not create the copied steps')
        }
        expect(pastedConnector.settings.input.key).toBe(`{{ ${pastedCode.name}['output'].id }}`)
        expect(pastedConnector.settings.input.label).toBe('step_1')
    })

    it('leaves a copied code step source untouched while still remapping its neighbours', () => {
        const sourceCode = { code: 'export const code = async (inputs) => `hi {{ step_1 }}` + inputs.step_1', packageJson: '{}' }
        const workflowVersion = workflowWith({ secondStep: connectorReferencingStepOne(), codeSourceCode: sourceCode })

        const steps = workflowStructureUtil.getAllSteps(paste(workflowVersion).trigger)
        const pastedCode = steps.find((step): step is CodeAction => step.type === WorkflowActionType.CODE && !originalNames.includes(step.name))
        const pastedConnector = steps.find((step): step is ConnectorAction => step.type === WorkflowActionType.CONNECTOR && !originalNames.includes(step.name))
        if (!pastedCode || !pastedConnector) {
            throw new Error('paste did not create the copied steps')
        }
        expect(pastedCode.settings.sourceCode).toEqual(sourceCode)
        expect(pastedConnector.settings.input.key).toBe(`{{ ${pastedCode.name}['output'].id }}`)
    })

    it('remaps correctly when a pasted step takes over another copied step name', () => {
        const sourceWorkflow = workflowWith({ codeStepName: 'step_2', secondStep: routerReferencing('step_2', 'step_1') })
        const emptyWorkflow: WorkflowVersion = { ...sourceWorkflow, trigger: { ...sourceWorkflow.trigger, nextAction: undefined } }

        const actions = workflowOperations.getActionsForCopy(['step_2', 'step_1'], sourceWorkflow)
        const operations = workflowOperations.getOperationsForPaste(actions, emptyWorkflow, {
            parentStepName: 'trigger',
            stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
        })
        const pasted = operations.reduce((workflow, operation) => workflowOperations.apply(workflow, operation), emptyWorkflow)

        const steps = workflowStructureUtil.getAllSteps(pasted.trigger)
        const pastedCode = steps.find((step): step is CodeAction => step.type === WorkflowActionType.CODE)
        const pastedRouter = steps.find((step): step is RouterAction => step.type === WorkflowActionType.ROUTER)
        if (!pastedCode || !pastedRouter) {
            throw new Error('paste did not create the copied steps')
        }
        expect(pastedCode.name).toBe('step_1')
        expect(pastedRouter.name).toBe('step_2')
        expect(firstConditionOf(pastedRouter).firstValue).toBe("{{ step_1['output'].value }}")
    })
})
