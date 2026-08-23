import { ErrorCode, isNil, PlatformError, WorkflowId } from '@fema/core-utils'
import { ChatUIResponse, FormInputType, FormResponse, PopulatedWorkflow } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectorMetadataService } from '../../../connectors/metadata/connector-metadata-service'
import { platformService } from '../../../platform/platform.service'
import { workspaceService } from '../../../workspace/workspace-service'
import { workflowVersionService } from '../../workflow-version/workflow-version.service'
import { workflowRepo } from '../workflow.repo'

const FORMS_CONNECTOR_NAME = '@fema/connector-forms'
const FORM_TRIIGGER = 'form_submission'
const FILE_TRIGGER = 'file_submission'
const SIMPLE_FILE_PROPS = {
    inputs: [
        {
            displayName: 'File',
            description: '',
            type: FormInputType.FILE,
            required: true,
        },
    ],
    waitForResponse: true,
}
const FORMS_TRIGGER_NAMES = [
    FORM_TRIIGGER,
    FILE_TRIGGER,
]

function isFormTrigger(workflow: PopulatedWorkflow | null): workflow is PopulatedWorkflow {
    if (isNil(workflow)) {
        return false
    }
    const triggerSettings = workflow.version.trigger.settings
    return triggerSettings.connectorName === FORMS_CONNECTOR_NAME && FORMS_TRIGGER_NAMES.includes(triggerSettings.triggerName)
}

export const humanInputService = (log: FastifyBaseLogger) => ({
    getFormByWorkflowIdOrThrow: async (workflowId: string, useDraft: boolean): Promise<FormResponse> => {
        const workflow = await getPopulatedWorkflowById(log, workflowId, useDraft)
        if (!isFormTrigger(workflow)) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'workflow_form',
                    entityId: workflowId,
                    message: 'Workflow form not found in draft version of workflow.',
                },
            })
        }
        const connectorVersion = await connectorMetadataService(log).resolveExactVersion({
            name: FORMS_CONNECTOR_NAME,
            version: workflow.version.trigger.settings.connectorVersion,
            platformId: await workspaceService(log).getPlatformId(workflow.workspaceId),
        })
        const triggerSettings = workflow.version.trigger.settings
        return {
            id: workflow.id,
            title: workflow.version.displayName,
            props: triggerSettings.triggerName === FILE_TRIGGER ? SIMPLE_FILE_PROPS : triggerSettings.input,
            workspaceId: workflow.workspaceId,
            version: connectorVersion,
        }
    },
    getChatUIByWorkflowIdOrThrow: async (workflowId: string, useDraft: boolean): Promise<ChatUIResponse> => {
        const workflow = await getPopulatedWorkflowById(log, workflowId, useDraft)
        if (!workflow
            || workflow.version.trigger.settings.triggerName !== 'chat_submission'
            || workflow.version.trigger.settings.connectorName !== FORMS_CONNECTOR_NAME) {
            throw new PlatformError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'workflow_form',
                    entityId: workflowId,
                    message: 'Workflow chat ui not found in draft version of workflow.',
                },
            })
        }
        const platformId = await workspaceService(log).getPlatformId(workflow.workspaceId)
        const platform = await platformService(log).getOneOrThrow(platformId)
        return {
            id: workflow.id,
            title: workflow.version.displayName,
            props: workflow.version.trigger.settings.input,
            workspaceId: workflow.workspaceId,
            platformLogoUrl: platform.logoIconUrl,
            platformName: platform.name,
        }
    },
})

async function getPopulatedWorkflowById(log: FastifyBaseLogger, id: WorkflowId, useDraft: boolean): Promise<PopulatedWorkflow | null> {
    const workflow = await workflowRepo().findOneBy({ id })
    if (isNil(workflow) || (isNil(workflow.publishedVersionId) && !useDraft)) {
        return null
    }
    const workflowVersion = await workflowVersionService(log).getWorkflowVersionOrThrow({
        workflowId: id,
        versionId: useDraft ? undefined : workflow.publishedVersionId!,
    })
    return {
        ...workflow,
        version: workflowVersion,
    }
}