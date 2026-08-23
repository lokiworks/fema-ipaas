import dayjs from 'dayjs'
import { isNil } from '@fema/core-utils'
import { ApplicationError, ErrorCode } from '@fema/core-utils'
import { WorkflowAction, WorkflowActionType, LoopOnItemsAction, RouterAction, SingleActionSchema } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { workflowStructureUtil, Step } from '../util/workflow-structure-util'
import { AddActionRequest, StepLocationRelativeToParent, UpdateActionRequest } from './index'

type ActionCreationProps = {
    nextAction?: WorkflowAction
}

function createAction(request: UpdateActionRequest, {
    nextAction,
}: ActionCreationProps): WorkflowAction {
    const baseProperties = {
        displayName: request.displayName,
        name: request.name,
        valid: false,
        skip: request.skip,
        lastUpdatedDate: dayjs().toISOString(),
        settings: {
            ...request.settings,
            customLogoUrl: request.settings.customLogoUrl,
        },
        nextAction,
    }
    let action: WorkflowAction
    switch (request.type) {
        case WorkflowActionType.ROUTER:
            action = {
                ...baseProperties,
                type: WorkflowActionType.ROUTER,
                settings: request.settings,
                children: request.settings.branches.map(() => null),
            }

            break
        case WorkflowActionType.LOOP_ON_ITEMS:
            action = {
                ...baseProperties,
                type: WorkflowActionType.LOOP_ON_ITEMS,
                settings: request.settings,
            }
            break
        case WorkflowActionType.CONNECTOR:
            action = {
                ...baseProperties,
                type: WorkflowActionType.CONNECTOR,
                settings: request.settings,
            }
            break
        case WorkflowActionType.CODE:
            action = {
                ...baseProperties,
                type: WorkflowActionType.CODE,
                settings: request.settings,
            }
            break
    }
    const parseResult = SingleActionSchema.safeParse(action)
    const valid = (isNil(request.valid) ? true : request.valid) && parseResult.success
    return {
        ...action,
        valid,
    }
}

function handleLoopOnItems(parentStep: LoopOnItemsAction, request: AddActionRequest): Step {
    if (request.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_LOOP) {
        parentStep.firstLoopAction = createAction(request.action, {
            nextAction: parentStep.firstLoopAction,
        })
    }
    else if (request.stepLocationRelativeToParent === StepLocationRelativeToParent.AFTER) {
        parentStep.nextAction = createAction(request.action, {
            nextAction: parentStep.nextAction,
        })
    }
    else {
        throw new ApplicationError(
            {
                code: ErrorCode.WORKFLOW_OPERATION_INVALID,
                params: {
                    message: `Loop step parent ${request.stepLocationRelativeToParent} not found`,
                },
            })
    }
    return parentStep
}

function handleRouter(parentStep: RouterAction, request: AddActionRequest): Step {
    if (request.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_BRANCH && !isNil(request.branchIndex)) {
        parentStep.children[request.branchIndex] = createAction(request.action, {
            nextAction: parentStep.children[request.branchIndex] ?? undefined,
        })
    }
    else if (request.stepLocationRelativeToParent === StepLocationRelativeToParent.AFTER) {
        parentStep.nextAction = createAction(request.action, {
            nextAction: parentStep.nextAction,
        })
    }
    else {
        throw new ApplicationError({
            code: ErrorCode.WORKFLOW_OPERATION_INVALID,
            params: {
                message: `Router step parent ${request.stepLocationRelativeToParent} not found`,
            },
        })
    }
    return parentStep
}

function handleContinueOnFailureBranches(parentStep: Step, request: AddActionRequest): Step {
    if (parentStep.type !== WorkflowActionType.CODE && parentStep.type !== WorkflowActionType.CONNECTOR) {
        throw new ApplicationError({
            code: ErrorCode.WORKFLOW_OPERATION_INVALID,
            params: {
                message: `Continue-on-failure branches are only available on Code and Connector actions, got ${parentStep.type}`,
            },
        })
    }
    const branches = parentStep.continueOnFailureBranches ?? {}
    if (request.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH) {
        branches.onSuccess = createAction(request.action, {
            nextAction: branches.onSuccess,
        })
    }
    else if (request.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH) {
        branches.onFailure = createAction(request.action, {
            nextAction: branches.onFailure,
        })
    }
    parentStep.continueOnFailureBranches = branches
    return parentStep
}

function _addAction(workflowVersion: WorkflowVersion, request: AddActionRequest): WorkflowVersion {
    return workflowStructureUtil.transferWorkflow(workflowVersion, (parentStep: Step) => {
        if (parentStep.name !== request.parentStep) {
            return parentStep
        }
        if (
            request.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH ||
            request.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH
        ) {
            return handleContinueOnFailureBranches(parentStep, request)
        }
        switch (parentStep.type) {
            case WorkflowActionType.LOOP_ON_ITEMS:
                return handleLoopOnItems(parentStep, request)
            case WorkflowActionType.ROUTER:
                return handleRouter(parentStep, request)
            default: {
                parentStep.nextAction = createAction(request.action, {
                    nextAction: parentStep.nextAction,
                })
                return parentStep
            }
        }
    })
}

export { _addAction }
