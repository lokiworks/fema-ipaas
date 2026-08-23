import {
    ConnectorAuthProperty,
    connectorPropertiesUtils,
    ConnectorPropertyMap,
} from '@fema/connector-sdk'
import { ApplicationError, ErrorCode, isNil, STEP_NAME_REGEX, TenantId, UserId } from '@fema/core-utils'
import { CodeActionSettings, ConnectorActionSettings, ConnectorTriggerSettings, LoopOnItemsActionSettings, RouterActionSettingsWithValidation, SourceCode, WorkflowActionType, workflowConnectorUtil, WorkflowOperationRequest, WorkflowOperationType, workflowStructureUtil, WorkflowTrigger, WorkflowTriggerType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { connectorMetadataService } from '../../connectors/metadata/connector-metadata-service'

const loopSettingsValidator = LoopOnItemsActionSettings.and(z.object({
    items: z.string().min(1),
}))
const routerSettingsValidator = RouterActionSettingsWithValidation
const codeSettingsValidator = CodeActionSettings.and(z.object({
    sourceCode: SourceCode.and(z.object({
        code: z.string().min(1),
        packageJson: z.string().min(1),
    })),
}))

type ValidationResult = {
    valid: boolean
    cleanInput?: Record<string, unknown>
}

export const workflowVersionValidationUtil = (log: FastifyBaseLogger) => ({
    async prepareRequest({ tenantId, request, userId }: PrepareRequestParams): Promise<WorkflowOperationRequest> {
        const clonedRequest: WorkflowOperationRequest = JSON.parse(JSON.stringify(request))

        switch (clonedRequest.type) {
            case WorkflowOperationType.ADD_ACTION:
                switch (clonedRequest.request.action.type) {
                    case WorkflowActionType.LOOP_ON_ITEMS:
                        clonedRequest.request.action.valid = loopSettingsValidator.safeParse(
                            clonedRequest.request.action.settings,
                        ).success
                        break
                    case WorkflowActionType.CONNECTOR: {
                        clonedRequest.request.action.settings.connectorVersion = workflowConnectorUtil.getExactVersion(clonedRequest.request.action.settings.connectorVersion)
                        const result = await validateAction(
                            { settings: clonedRequest.request.action.settings, tenantId, log },
                        )
                        clonedRequest.request.action.valid = result.valid
                        if (!isNil(result.cleanInput)) {
                            clonedRequest.request.action.settings.input = result.cleanInput
                        }
                        break
                    }
                    case WorkflowActionType.ROUTER:
                        clonedRequest.request.action.valid = routerSettingsValidator.safeParse(
                            clonedRequest.request.action.settings,
                        ).success
                        break
                    case WorkflowActionType.CODE:
                        clonedRequest.request.action.valid = codeSettingsValidator.safeParse(
                            clonedRequest.request.action.settings,
                        ).success
                        break
                }
                break
            case WorkflowOperationType.UPDATE_ACTION:
                switch (clonedRequest.request.type) {
                    case WorkflowActionType.LOOP_ON_ITEMS:
                        clonedRequest.request.valid = loopSettingsValidator.safeParse(
                            clonedRequest.request.settings,
                        ).success
                        break
                    case WorkflowActionType.CONNECTOR: {
                        clonedRequest.request.settings.connectorVersion = workflowConnectorUtil.getExactVersion(clonedRequest.request.settings.connectorVersion)
                        const result = await validateAction(
                            { settings: clonedRequest.request.settings, tenantId, log },
                        )
                        clonedRequest.request.valid = result.valid
                        if (!isNil(result.cleanInput)) {
                            clonedRequest.request.settings.input = result.cleanInput
                        }
                        break
                    }
                    case WorkflowActionType.ROUTER:
                        clonedRequest.request.valid = routerSettingsValidator.safeParse(
                            clonedRequest.request.settings,
                        ).success
                        break
                    case WorkflowActionType.CODE:
                        clonedRequest.request.valid = codeSettingsValidator.safeParse(
                            clonedRequest.request.settings,
                        ).success
                        break
                }
                break
            case WorkflowOperationType.UPDATE_TRIGGER:
                switch (clonedRequest.request.type) {
                    case WorkflowTriggerType.EMPTY:
                        clonedRequest.request.valid = false
                        break
                    case WorkflowTriggerType.CONNECTOR: {
                        clonedRequest.request.settings.connectorVersion = workflowConnectorUtil.getExactVersion(clonedRequest.request.settings.connectorVersion)
                        const result = await validateTrigger(
                            { settings: clonedRequest.request.settings, tenantId, log },
                        )
                        clonedRequest.request.valid = result.valid
                        if (result.valid && result.cleanInput) {
                            clonedRequest.request.settings.input = result.cleanInput
                        }
                        break
                    }
                }
                break
            case WorkflowOperationType.IMPORT_WORKFLOW:{
                assertImportedStepNamesAreSafe(clonedRequest.request.trigger)
                const notes = clonedRequest.request.notes
                if (!isNil(notes)) {
                    clonedRequest.request.notes = notes.map(note => ({
                        ...note,
                        ownerId: userId,
                    }))
                }
                break
            }
            default:
                break
        }
        return clonedRequest
    },
})

function assertImportedStepNamesAreSafe(trigger: WorkflowTrigger): void {
    const invalidStep = workflowStructureUtil.getAllSteps(trigger).find((step) => !STEP_NAME_REGEX.test(step.name))
    if (!isNil(invalidStep)) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: `Invalid step name: "${invalidStep.name}"` },
        })
    }
}

async function validateAction({ settings, tenantId, log }: ValidateActionParams): Promise<ValidationResult> {
    if (
        isNil(settings.connectorName) ||
        isNil(settings.connectorVersion) ||
        isNil(settings.actionName) ||
        isNil(settings.input)
    ) {
        return { valid: false }
    }

    const connector = await connectorMetadataService(log).getOrThrow({
        tenantId,
        name: settings.connectorName,
        version: settings.connectorVersion,
    })

    if (isNil(connector)) {
        return { valid: false }
    }

    const action = connector.actions[settings.actionName]
    if (isNil(action)) {
        return { valid: false }
    }

    const props = { ...action.props }

    return validateProps(props, settings.input, connector.auth, action.requireAuth)
}

async function validateTrigger({ settings, tenantId, log }: ValidateTriggerParams): Promise<ValidationResult> {
    if (
        isNil(settings.connectorName) ||
        isNil(settings.connectorVersion) ||
        isNil(settings.triggerName) ||
        isNil(settings.input)
    ) {
        return { valid: false }
    }

    const connector = await connectorMetadataService(log).getOrThrow({
        tenantId,
        name: settings.connectorName,
        version: settings.connectorVersion,
    })
    if (isNil(connector)) {
        return { valid: false }
    }
    const trigger = connector.triggers[settings.triggerName]
    if (isNil(trigger)) {
        return { valid: false }
    }
    const props = { ...trigger.props }

    return validateProps(props, settings.input, connector.auth, trigger.requireAuth)
}

function validateProps(
    props: ConnectorPropertyMap,
    input: Record<string, unknown> | undefined,
    auth: ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
    //if require auth is not defined, we default to true, because at first all auth was required
    requireAuth: boolean | undefined = true,
): ValidationResult {
    const propsSchema = connectorPropertiesUtils.buildSchema(props, auth, requireAuth)
    const schemaKeys = Object.keys((propsSchema as unknown as z.ZodObject<z.ZodRawShape>).shape)
    const cleanInput = !isNil(input) ? Object.fromEntries(
        schemaKeys.map(key => [key, input?.[key]]),
    ) : undefined
    return {
        valid: propsSchema.safeParse(cleanInput).success,
        cleanInput,
    }
}


type PrepareRequestParams = {
    tenantId?: TenantId
    request: WorkflowOperationRequest
    userId: UserId | null
}

type ValidateActionParams = {
    settings: ConnectorActionSettings
    tenantId?: TenantId
    log: FastifyBaseLogger
}

type ValidateTriggerParams = {
    settings: ConnectorTriggerSettings
    tenantId?: TenantId
    log: FastifyBaseLogger
}
