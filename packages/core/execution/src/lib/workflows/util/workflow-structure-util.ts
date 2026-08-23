import { isNil } from '@fema/core-utils'
import { ApplicationError, ErrorCode } from '@fema/core-utils'
import { BranchCondition, BranchExecutionType, emptyCondition, WorkflowAction, WorkflowActionType } from '../actions/action'
import { WorkflowVersion } from '../workflow-version'
import { WorkflowTrigger, WorkflowTriggerType } from '../triggers/trigger'


export const AI_CONNECTOR_NAME = '@fema/connector-ai'

export type Step = WorkflowAction | WorkflowTrigger
type StepWithIndex = Step & {
    dfsIndex: number
}

function isAction(type: WorkflowActionType | WorkflowTriggerType | undefined): type is WorkflowActionType {
    return Object.entries(WorkflowActionType).some(([, value]) => value === type)
}

function isStepAction(step: Step): step is WorkflowAction {
    return step.type === WorkflowActionType.CODE
        || step.type === WorkflowActionType.CONNECTOR
        || step.type === WorkflowActionType.LOOP_ON_ITEMS
        || step.type === WorkflowActionType.ROUTER
}

function isTrigger(type: WorkflowActionType | WorkflowTriggerType | undefined): type is WorkflowTriggerType {
    return Object.entries(WorkflowTriggerType).some(([, value]) => value === type)
}

function getActionOrThrow(name: string, workflowRoot: Step): WorkflowAction {
    const step = getStepOrThrow(name, workflowRoot)
    if (!isAction(step.type)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'step',
                entityId: name,
                message: 'Step is not an action',
            },
        })
    }
    return step as WorkflowAction
}

function getTriggerOrThrow(name: string, workflowRoot: Step): WorkflowTrigger {
    const step = getStepOrThrow(name, workflowRoot)
    if (!isTrigger(step.type)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'step',
                entityId: name,
                message: 'Step is not a trigger',
            },
        })
    }
    return step as WorkflowTrigger
}

function getStep(name: string, workflowRoot: Step): Step | undefined {
    return getAllSteps(workflowRoot).find((step) => step.name === name)
}

function getStepOrThrow(name: string, workflowRoot: Step): Step {
    const step = getStep(name, workflowRoot)
    if (isNil(step)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'step',
                entityId: name,
                message: 'Step not found',
            },
        })
    }
    return step
}

function transferStep<T extends Step>(
    step: Step,
    transferFunction: (step: T) => T,
): Step {
    const updatedStep = transferFunction(step as T)
    switch (updatedStep.type) {
        case WorkflowActionType.LOOP_ON_ITEMS: {
            const { firstLoopAction } = updatedStep
            if (firstLoopAction) {
                updatedStep.firstLoopAction = transferStep(
                    firstLoopAction,
                    transferFunction,
                ) as WorkflowAction
            }
            break
        }
        case WorkflowActionType.ROUTER: {
            const { children } = updatedStep
            if (children) {
                updatedStep.children = children.map((child) =>
                    child ? (transferStep(child, transferFunction) as WorkflowAction) : null,
                )
            }
            break
        }
        default:
            break
    }

    if (updatedStep.type === WorkflowActionType.CODE || updatedStep.type === WorkflowActionType.CONNECTOR) {
        const branches = updatedStep.continueOnFailureBranches
        if (branches?.onSuccess) {
            const transferred = transferStep(branches.onSuccess, transferFunction)
            if (isStepAction(transferred)) {
                branches.onSuccess = transferred
            }
        }
        if (branches?.onFailure) {
            const transferred = transferStep(branches.onFailure, transferFunction)
            if (isStepAction(transferred)) {
                branches.onFailure = transferred
            }
        }
    }

    if (updatedStep.nextAction) {
        updatedStep.nextAction = transferStep(
            updatedStep.nextAction,
            transferFunction,
        ) as WorkflowAction
    }

    return updatedStep
}


function transferWorkflow<T extends Step>(
    workflowVersion: WorkflowVersion,
    transferFunction: (step: T) => T,
): WorkflowVersion {
    const clonedWorkflow = JSON.parse(JSON.stringify(workflowVersion))
    clonedWorkflow.trigger = transferStep(
        clonedWorkflow.trigger,
        transferFunction,
    ) as WorkflowTrigger
    return clonedWorkflow
}

function getAllSteps(step: Step): Step[] {
    const steps: Step[] = []
    transferStep(step, (currentStep) => {
        steps.push(currentStep)
        return currentStep
    })
    return steps
}

function getStepNumber(trigger: WorkflowTrigger, stepName: string): number {
    return getAllSteps(trigger).findIndex((s) => s.name === stepName) + 1
}


const createBranch = (branchName: string, conditions: BranchCondition[][] | undefined) => {
    return {
        conditions: conditions ?? [[emptyCondition]],
        branchType: BranchExecutionType.CONDITION,
        branchName,
    }
}

function findPathToStep(trigger: WorkflowTrigger, targetStepName: string): StepWithIndex[] {
    const steps = workflowStructureUtil.getAllSteps(trigger).map((step, dfsIndex) => ({
        ...step,
        dfsIndex,
    }))
    return steps
        .filter((step) => {
            const steps = workflowStructureUtil.getAllSteps(step)
            return steps.some((s) => s.name === targetStepName)
        })
        .filter((step) => step.name !== targetStepName)
}


function getAllChildSteps(action: Step): Step[] {
    return getAllSteps({
        ...action,
        nextAction: undefined,
    })
}

function isChildOf(parent: Step, childStepName: string): boolean {
    return getAllChildSteps(parent).some((c) => c.name === childStepName && c.name !== parent.name)
}

const findUnusedNames = (source: WorkflowTrigger | string[], count = 1) => {
    const names = Array.isArray(source) ? source : workflowStructureUtil.getAllSteps(source).map((f) => f.name)
    const unusedNames = []
    for (let i = 1; i <= count; i++) {
        const name = findUnusedName(names)
        unusedNames.push(name)
        names.push(name)
    }
    return unusedNames
}

const findUnusedName = (source: WorkflowTrigger | string[]) => {
    const names = Array.isArray(source) ? source : workflowStructureUtil.getAllSteps(source).map((f) => f.name)
    let index = 1
    let name = 'step_1'
    while (names.includes(name)) {
        index++
        name = 'step_' + index
    }
    return name
}


function getAllNextActionsWithoutChildren(start: Step): Step[] {
    const actions: Step[] = []
    let currentAction = start.nextAction

    while (!isNil(currentAction)) {
        actions.push(currentAction)
        currentAction = currentAction.nextAction
    }

    return actions
}


function extractConnectionIdsFromAuth(auth: string): string[] {
    const match = auth.match(/{{connections\['([^']*(?:'\s*,\s*'[^']*)*)'\]}}/)
    if (!match || !match[1]) {
        return []
    }
    return match[1].split(/'\s*,\s*'/).map(id => id.trim())
}

function extractAgentIds(workflowVersion: WorkflowVersion): string[] {
    const getExternalAgentId = (action: Step) => {
        if (isAgentConnector(action) && 'agentId' in action.settings.input) {
            return action.settings.input.agentId
        }
        return null
    }

    return workflowStructureUtil.getAllSteps(workflowVersion.trigger).map(step => getExternalAgentId(step)).filter(step => step !== null && step !== '')
}

function isAgentConnector(action: Step) {
    return (
        action.type === WorkflowActionType.CONNECTOR && action.settings.connectorName === AI_CONNECTOR_NAME
    )
}

function extractConnectionIds(workflowVersion: WorkflowVersion): string[] {
    const triggerAuthIds = workflowVersion.trigger.settings?.input?.auth
        ? extractConnectionIdsFromAuth(workflowVersion.trigger.settings.input.auth)
        : []

    const stepAuthIds = workflowStructureUtil
        .getAllSteps(workflowVersion.trigger)
        .flatMap(step =>
            step.settings?.input?.auth
                ? extractConnectionIdsFromAuth(step.settings.input.auth)
                : [],
        )

    return Array.from(new Set([...triggerAuthIds, ...stepAuthIds]))
}

export const workflowStructureUtil = {
    isTrigger,
    isAction,
    getAllSteps,
    getStepNumber,
    transferStep,
    transferWorkflow,
    getStepOrThrow,
    getActionOrThrow,
    getTriggerOrThrow,
    getStep,
    createBranch,
    findPathToStep,
    isChildOf,
    findUnusedName,
    findUnusedNames,
    getAllNextActionsWithoutChildren,
    getAllChildSteps,
    extractConnectionIds,
    isAgentConnector,
    extractAgentIds,
}