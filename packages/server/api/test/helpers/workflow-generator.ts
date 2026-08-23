import { apId } from '@fema/core-utils'
import { WorkflowAction, WorkflowActionType, WorkflowOperationStatus, WorkflowStatus, WorkflowTrigger, WorkflowTriggerType, WorkflowVersion, WorkflowVersionState, PopulatedWorkflow, PropertyExecutionType } from '@fema/shared'
import { faker } from '@faker-js/faker'
import dayjs from 'dayjs'


export const workflowGenerator = {
    simpleActionAndTrigger(externalId?: string): PopulatedWorkflow {
        return workflowGenerator.randomizeMetadata(externalId, workflowVersionGenerator.simpleActionAndTrigger())
    },
    randomizeMetadata(externalId: string | undefined, version: Omit<WorkflowVersion, 'workflowId'>): PopulatedWorkflow {
        const workflowId = apId()
        const result: PopulatedWorkflow = {
            externalId: externalId ?? workflowId,
            version: {
                ...version,
                trigger: randomizeTriggerMetadata(version.trigger),
                workflowId,
            },
            operationStatus: WorkflowOperationStatus.NONE,
            status: faker.helpers.enumValue(WorkflowStatus),
            id: workflowId,
            workspaceId: apId(),
            folderId: apId(),
            created: faker.date.recent().toISOString(),
            updated: faker.date.recent().toISOString(),
        }
        return result
    },
}

const workflowVersionGenerator = {
    simpleActionAndTrigger(): Omit<WorkflowVersion, 'workflowId'> {
        return {
            id: apId(),
            displayName: faker.animal.dog(),
            created: faker.date.recent().toISOString(),
            updated: faker.date.recent().toISOString(),
            updatedBy: apId(),
            valid: true,
            trigger: {
                ...randomizeTriggerMetadata(generateTrigger()),
                nextAction: generateAction(),
            },
            state: WorkflowVersionState.DRAFT,
            connectionIds: [],
            agentIds: [],
            notes: [],
        }
    },
}

function randomizeTriggerMetadata(trigger: WorkflowTrigger): WorkflowTrigger {
    return {
        ...trigger,
        settings: {
            ...trigger.settings,
            propertySettings: {
                server: { type: PropertyExecutionType.MANUAL },
                port: { type: PropertyExecutionType.MANUAL },
                username: { type: PropertyExecutionType.DYNAMIC },
                password: { type: PropertyExecutionType.MANUAL },
            },
        },
    }
}
function generateAction(): WorkflowAction {
    return {
        type: WorkflowActionType.CONNECTOR,
        displayName: faker.hacker.noun(),
        name: apId(),
        skip: false,
        lastUpdatedDate: dayjs().toISOString(),
        settings: {
            input: {},
            connectorName: faker.helpers.arrayElement(['@fema/connector-schedule', '@fema/connector-webhook']),
            connectorVersion: faker.system.semver(),
            actionName: faker.hacker.noun(),
            propertySettings: {},
        },
        valid: true,
    }
}

function generateTrigger(): WorkflowTrigger {
    return {
        type: WorkflowTriggerType.CONNECTOR,
        displayName: faker.hacker.noun(),
        name: apId(),
        lastUpdatedDate: dayjs().toISOString(),
        settings: {
            connectorName: faker.helpers.arrayElement(['@fema/connector-schedule', '@fema/connector-webhook']),
            connectorVersion: faker.system.semver(),
            triggerName: faker.hacker.noun(),
            input: {},
            propertySettings: {},
        },
        valid: true,
    }
}