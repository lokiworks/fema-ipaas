import {
    CodeAction,
    WorkflowAction,
    WorkflowActionType,
    WorkflowOperationRequest,
    workflowOperations,
    WorkflowOperationType,
    workflowStructureUtil,
    WorkflowTriggerType,
    WorkflowVersion,
    WorkflowVersionState,
    ConnectorAction,
    StepLocationRelativeToParent,
} from '../../src'
import { WorkflowAction as WorkflowActionSchema } from '../../src/lib/workflows/actions/action'
import { _getImportOperations } from '../../src/lib/workflows/operations/import-workflow'

function buildCodeAction({
    name,
    cof = false,
    onSuccess,
    onFailure,
    nextAction,
}: {
    name: string
    cof?: boolean
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
                continueOnFailure: { value: cof },
                retryOnFailure: { value: false },
            },
        },
        ...(cof && (onSuccess || onFailure)
            ? { continueOnFailureBranches: { onSuccess, onFailure } }
            : {}),
        nextAction,
    }
}

function buildConnectorAction({
    name,
    cof = false,
    onSuccess,
    onFailure,
    nextAction,
}: {
    name: string
    cof?: boolean
    onSuccess?: WorkflowAction
    onFailure?: WorkflowAction
    nextAction?: WorkflowAction
}): ConnectorAction {
    return {
        name,
        type: WorkflowActionType.CONNECTOR,
        valid: true,
        displayName: name,
        lastUpdatedDate: '2026-05-02T00:00:00.000Z',
        settings: {
            connectorName: '@fema-ipaas/connector-store',
            connectorVersion: '0.0.1',
            actionName: 'get',
            input: {},
            propertySettings: {},
            errorHandlingOptions: {
                continueOnFailure: { value: cof },
                retryOnFailure: { value: false },
            },
        },
        ...(cof && (onSuccess || onFailure)
            ? { continueOnFailureBranches: { onSuccess, onFailure } }
            : {}),
        nextAction,
    }
}

function buildWorkflow(headAction: WorkflowAction): WorkflowVersion {
    return {
        id: 'workflow-id',
        created: '2026-05-02T00:00:00.000Z',
        updated: '2026-05-02T00:00:00.000Z',
        workflowId: 'workflow-id',
        displayName: 'CoF test workflow',
        updatedBy: '',
        agentIds: [],
        notes: [],
        valid: true,
        state: WorkflowVersionState.DRAFT,
        connectionIds: [],
        trigger: {
            name: 'trigger',
            type: WorkflowTriggerType.EMPTY,
            valid: true,
            displayName: 'Trigger',
            lastUpdatedDate: '2026-05-02T00:00:00.000Z',
            settings: {} as never,
            nextAction: headAction,
        },
    }
}

describe('Continue-on-Failure branches', () => {
    describe('schema', () => {
        it('parses an action with onSuccess and onFailure branches without infinite loop', () => {
            const action = buildCodeAction({
                name: 'step_1',
                cof: true,
                onSuccess: buildCodeAction({
                    name: 'step_2',
                    nextAction: buildCodeAction({ name: 'step_3' }),
                }),
                onFailure: buildCodeAction({ name: 'step_4' }),
            })
            const result = WorkflowActionSchema.safeParse(action)
            expect(result.success).toBe(true)
        })
    })

    describe('transferStep', () => {
        it('visits every step inside CoF branches', () => {
            const head = buildCodeAction({
                name: 'step_1',
                cof: true,
                onSuccess: buildCodeAction({
                    name: 'step_2',
                    nextAction: buildCodeAction({ name: 'step_3' }),
                }),
                onFailure: buildCodeAction({ name: 'step_4' }),
            })
            const workflow = buildWorkflow(head)
            const allNames = workflowStructureUtil.getAllSteps(workflow.trigger).map((s) => s.name)
            expect(allNames).toContain('step_1')
            expect(allNames).toContain('step_2')
            expect(allNames).toContain('step_3')
            expect(allNames).toContain('step_4')
        })
    })

    describe('ADD_ACTION', () => {
        it('places a step at the head of the onSuccess branch', () => {
            const head = buildCodeAction({ name: 'step_1', cof: true })
            const workflow = buildWorkflow(head)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'step_1',
                    stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH,
                    action: buildCodeAction({ name: 'success_head' }),
                },
            }
            const after = workflowOperations.apply(workflow, op)
            const updatedHead = after.trigger.nextAction as CodeAction
            const branches =
                updatedHead.continueOnFailureBranches
            expect(branches?.onSuccess?.name).toBe('success_head')
            expect(branches?.onFailure).toBeUndefined()
        })

        it('places a step at the head of the onFailure branch', () => {
            const head = buildCodeAction({ name: 'step_1', cof: true })
            const workflow = buildWorkflow(head)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'step_1',
                    stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH,
                    action: buildCodeAction({ name: 'failure_head' }),
                },
            }
            const after = workflowOperations.apply(workflow, op)
            const updatedHead = after.trigger.nextAction as CodeAction
            const branches =
                updatedHead.continueOnFailureBranches
            expect(branches?.onFailure?.name).toBe('failure_head')
        })

        it('inserts the new step at the head and chains the existing branch as its nextAction', () => {
            const existingBranchHead = buildCodeAction({ name: 'existing_head' })
            const head = buildCodeAction({
                name: 'step_1',
                cof: true,
                onSuccess: existingBranchHead,
            })
            const workflow = buildWorkflow(head)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'step_1',
                    stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH,
                    action: buildCodeAction({ name: 'new_head' }),
                },
            }
            const after = workflowOperations.apply(workflow, op)
            const updatedHead = after.trigger.nextAction as CodeAction
            const onSuccess =
                updatedHead.continueOnFailureBranches?.onSuccess
            expect(onSuccess?.name).toBe('new_head')
            expect(onSuccess?.nextAction?.name).toBe('existing_head')
        })

        it('strips inline branches from a head ADD when adding an action that already carries CoF subtrees', () => {
            const trigger = buildCodeAction({ name: 'placeholder' })
            const workflow = buildWorkflow(trigger)
            const richAction = buildCodeAction({
                name: 'rich',
                cof: true,
                onSuccess: buildCodeAction({ name: 'inline_success' }),
                onFailure: buildCodeAction({ name: 'inline_failure' }),
            })
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.ADD_ACTION,
                request: {
                    parentStep: 'placeholder',
                    stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
                    action: richAction,
                },
            }
            const after = workflowOperations.apply(workflow, op)
            const placed = (after.trigger.nextAction as CodeAction).nextAction as CodeAction
            expect(placed.name).toBe('rich')
            const branches =
                placed.continueOnFailureBranches
            expect(branches?.onSuccess).toBeUndefined()
            expect(branches?.onFailure).toBeUndefined()
            const allNames = workflowStructureUtil.getAllSteps(after.trigger).map((s) => s.name)
            expect(allNames.filter((n) => n === 'inline_success')).toHaveLength(0)
            expect(allNames.filter((n) => n === 'inline_failure')).toHaveLength(0)
        })
    })

    describe('DELETE_ACTION', () => {
        it('rebinds branches.onSuccess to the deleted step\'s nextAction when the deleted step is the branch head', () => {
            const head = buildCodeAction({
                name: 'step_1',
                cof: true,
                onSuccess: buildCodeAction({
                    name: 'success_head',
                    nextAction: buildCodeAction({ name: 'success_tail' }),
                }),
            })
            const workflow = buildWorkflow(head)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.DELETE_ACTION,
                request: { names: ['success_head'] },
            }
            const after = workflowOperations.apply(workflow, op)
            const updatedHead = after.trigger.nextAction as CodeAction
            const onSuccess =
                updatedHead.continueOnFailureBranches?.onSuccess
            expect(onSuccess?.name).toBe('success_tail')
        })

        it('deletes a step inside the branch chain via transferStep', () => {
            const head = buildCodeAction({
                name: 'step_1',
                cof: true,
                onSuccess: buildCodeAction({
                    name: 'success_head',
                    nextAction: buildCodeAction({
                        name: 'middle',
                        nextAction: buildCodeAction({ name: 'tail' }),
                    }),
                }),
            })
            const workflow = buildWorkflow(head)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.DELETE_ACTION,
                request: { names: ['middle'] },
            }
            const after = workflowOperations.apply(workflow, op)
            const allNames = workflowStructureUtil.getAllSteps(after.trigger).map((s) => s.name)
            expect(allNames).not.toContain('middle')
            expect(allNames).toContain('success_head')
            expect(allNames).toContain('tail')
        })

        it('clears onSuccess to undefined when the only branch step is deleted', () => {
            const head = buildCodeAction({
                name: 'step_1',
                cof: true,
                onSuccess: buildCodeAction({ name: 'lonely' }),
            })
            const workflow = buildWorkflow(head)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.DELETE_ACTION,
                request: { names: ['lonely'] },
            }
            const after = workflowOperations.apply(workflow, op)
            const updatedHead = after.trigger.nextAction as CodeAction
            const onSuccess =
                updatedHead.continueOnFailureBranches?.onSuccess
            expect(onSuccess).toBeUndefined()
        })
    })

    describe('_getImportOperations', () => {
        it('emits ADD_ACTION ops for both CoF branches and chained nextActions inside them', () => {
            const head = buildCodeAction({
                name: 'step_1',
                cof: true,
                onSuccess: buildCodeAction({
                    name: 'success_head',
                    nextAction: buildCodeAction({ name: 'success_tail' }),
                }),
                onFailure: buildCodeAction({ name: 'failure_head' }),
            })
            const ops = _getImportOperations(head)
            const locations = ops
                .filter((o) => o.type === WorkflowOperationType.ADD_ACTION)
                .map((o) => o.request.stepLocationRelativeToParent)
            expect(locations).toContain(StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH)
            expect(locations).toContain(StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH)
            expect(locations).toContain(StepLocationRelativeToParent.AFTER)
        })
    })

    describe('round-trip via MOVE_ACTION', () => {
        it('moves a step with CoF branches into a loop without losing branch contents', () => {
            const cofStep = buildCodeAction({
                name: 'cof_step',
                cof: true,
                onSuccess: buildCodeAction({
                    name: 'success_head',
                    nextAction: buildCodeAction({ name: 'success_tail' }),
                }),
                onFailure: buildCodeAction({ name: 'failure_head' }),
            })
            const loopAction: WorkflowAction = {
                name: 'loop',
                type: WorkflowActionType.LOOP_ON_ITEMS,
                valid: true,
                displayName: 'Loop',
                lastUpdatedDate: '2026-05-02T00:00:00.000Z',
                settings: { items: '' },
                nextAction: cofStep,
            }
            const workflow = buildWorkflow(loopAction)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.MOVE_ACTION,
                request: {
                    name: 'cof_step',
                    newParentStep: 'loop',
                    stepLocationRelativeToNewParent: StepLocationRelativeToParent.INSIDE_LOOP,
                },
            }
            const after = workflowOperations.apply(workflow, op)
            const allSteps = workflowStructureUtil.getAllSteps(after.trigger)
            const allNames = allSteps.map((s) => s.name)
            expect(allNames.filter((n) => n === 'cof_step')).toHaveLength(1)
            expect(allNames.filter((n) => n === 'success_head')).toHaveLength(1)
            expect(allNames.filter((n) => n === 'success_tail')).toHaveLength(1)
            expect(allNames.filter((n) => n === 'failure_head')).toHaveLength(1)
            const movedCof = allSteps.find((s) => s.name === 'cof_step') as CodeAction
            const branches =
                movedCof.continueOnFailureBranches
            expect(branches?.onSuccess?.name).toBe('success_head')
            expect(branches?.onSuccess?.nextAction?.name).toBe('success_tail')
            expect(branches?.onFailure?.name).toBe('failure_head')
        })
    })

    describe('UPDATE_ACTION', () => {
        it('preserves CoF branches when updating a Code action (settings cannot carry them)', () => {
            const head = buildCodeAction({
                name: 'step_1',
                cof: true,
                onSuccess: buildCodeAction({
                    name: 'success_head',
                    nextAction: buildCodeAction({ name: 'success_tail' }),
                }),
                onFailure: buildCodeAction({ name: 'failure_head' }),
            })
            const workflow = buildWorkflow(head)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.UPDATE_ACTION,
                request: {
                    type: WorkflowActionType.CODE,
                    name: 'step_1',
                    displayName: 'step_1 (renamed)',
                    valid: true,
                    settings: {
                        sourceCode: { code: 'export const code = () => 2', packageJson: '{}' },
                        input: { changed: true },
                        errorHandlingOptions: {
                            continueOnFailure: { value: true },
                            retryOnFailure: { value: false },
                        },
                    },
                },
            }
            const after = workflowOperations.apply(workflow, op)
            const updatedHead = after.trigger.nextAction as CodeAction
            expect(updatedHead.displayName).toBe('step_1 (renamed)')
            const branches = updatedHead.continueOnFailureBranches
            expect(branches?.onSuccess?.name).toBe('success_head')
            expect(branches?.onSuccess?.nextAction?.name).toBe('success_tail')
            expect(branches?.onFailure?.name).toBe('failure_head')
        })

        it('preserves CoF branches when updating a Connector action', () => {
            const head = buildConnectorAction({
                name: 'step_1',
                cof: true,
                onSuccess: buildConnectorAction({ name: 'success_head' }),
                onFailure: buildConnectorAction({ name: 'failure_head' }),
            })
            const workflow = buildWorkflow(head)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.UPDATE_ACTION,
                request: {
                    type: WorkflowActionType.CONNECTOR,
                    name: 'step_1',
                    displayName: 'step_1 (renamed)',
                    valid: true,
                    settings: {
                        connectorName: '@fema-ipaas/connector-store',
                        connectorVersion: '0.0.1',
                        actionName: 'put',
                        input: { changed: true },
                        propertySettings: {},
                        errorHandlingOptions: {
                            continueOnFailure: { value: true },
                            retryOnFailure: { value: false },
                        },
                    },
                },
            }
            const after = workflowOperations.apply(workflow, op)
            const updatedHead = after.trigger.nextAction as ConnectorAction
            const branches = updatedHead.continueOnFailureBranches
            expect(branches?.onSuccess?.name).toBe('success_head')
            expect(branches?.onFailure?.name).toBe('failure_head')
        })

        it('keeps branches undefined when updating a Code action that has none', () => {
            const head = buildCodeAction({ name: 'step_1' })
            const workflow = buildWorkflow(head)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.UPDATE_ACTION,
                request: {
                    type: WorkflowActionType.CODE,
                    name: 'step_1',
                    displayName: 'step_1',
                    valid: true,
                    settings: {
                        sourceCode: { code: '', packageJson: '{}' },
                        input: {},
                        errorHandlingOptions: {
                            continueOnFailure: { value: false },
                            retryOnFailure: { value: false },
                        },
                    },
                },
            }
            const after = workflowOperations.apply(workflow, op)
            const updatedHead = after.trigger.nextAction as CodeAction
            expect(updatedHead.continueOnFailureBranches).toBeUndefined()
        })

        it('preserves CoF branches when changing a step from Code to Connector', () => {
            const head = buildCodeAction({
                name: 'step_1',
                cof: true,
                onSuccess: buildCodeAction({ name: 'success_head' }),
                onFailure: buildCodeAction({ name: 'failure_head' }),
            })
            const workflow = buildWorkflow(head)
            const op: WorkflowOperationRequest = {
                type: WorkflowOperationType.UPDATE_ACTION,
                request: {
                    type: WorkflowActionType.CONNECTOR,
                    name: 'step_1',
                    displayName: 'step_1',
                    valid: true,
                    settings: {
                        connectorName: '@fema-ipaas/connector-store',
                        connectorVersion: '0.0.1',
                        actionName: 'get',
                        input: {},
                        propertySettings: {},
                        errorHandlingOptions: {
                            continueOnFailure: { value: true },
                            retryOnFailure: { value: false },
                        },
                    },
                },
            }
            const after = workflowOperations.apply(workflow, op)
            const updatedHead = after.trigger.nextAction as ConnectorAction
            expect(updatedHead.type).toBe(WorkflowActionType.CONNECTOR)
            const branches = updatedHead.continueOnFailureBranches
            expect(branches?.onSuccess?.name).toBe('success_head')
            expect(branches?.onFailure?.name).toBe('failure_head')
        })
    })
})
