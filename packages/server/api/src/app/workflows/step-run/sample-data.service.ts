import { generateId, isNil, stringifyNullOrUndefined, WorkflowId, WorkflowVersionId, WorkspaceId } from '@fema-ipaas/core-utils'
import { DATA_TYPE_KEY_IN_FILE_METADATA, FileCompression, FileType, SampleDataDataType, SampleDataFileType, SampleDataSettings, SaveSampleDataResponse, Step, WorkflowAction, workflowStructureUtil, WorkflowTrigger, WorkflowVersion } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { fileRepo, fileService } from '../../file/file.service'
import { workflowVersionService } from '../workflow-version/workflow-version.service'
export const sampleDataService = (log: FastifyBaseLogger) => ({
    async saveSampleDataFileIdsInStep(params: SaveSampleDataParams): Promise<SampleDataSettings> {
        const workflowVersion = await workflowVersionService(log).getOneOrThrow(params.workflowVersionId)
        const step = workflowStructureUtil.getStepOrThrow(params.stepName, workflowVersion.trigger)
        const sampleDataFile = await saveSampleData(params, log)
        const clonedStep: Step = JSON.parse(JSON.stringify(step))
        return {
            sampleDataFileId: params.type === SampleDataFileType.OUTPUT ? sampleDataFile.id : clonedStep.settings.sampleData?.sampleDataFileId,
            sampleDataInputFileId: params.type === SampleDataFileType.INPUT ? sampleDataFile.id : clonedStep.settings.sampleData?.sampleDataInputFileId,
            lastTestDate: dayjs().toISOString(),
        }
    },
    async getOrReturnEmpty(params: GetSampleDataParams): Promise<unknown> {
        const step = workflowStructureUtil.getStepOrThrow(params.stepName, params.workflowVersion.trigger)
        const fileType = params.type === SampleDataFileType.INPUT ? FileType.SAMPLE_DATA_INPUT : FileType.SAMPLE_DATA
        const fileId = params.type === SampleDataFileType.OUTPUT ? step.settings.sampleData?.sampleDataFileId : step.settings.sampleData?.sampleDataInputFileId
        if (isNil(fileId)) {
            return {}
        }
        if (!isNil(fileId)) {
            const response = await fileService(log).getDataOrUndefined({
                workspaceId: params.workspaceId,
                fileId,
                type: fileType,
            })

            if (isNil(response)) {
                return undefined
            }
            if (response.metadata?.[DATA_TYPE_KEY_IN_FILE_METADATA] === SampleDataDataType.STRING) {
                return response.data.toString('utf-8')
            }
            const decodedData = new TextDecoder('utf-8').decode(response.data)
            return JSON.parse(decodedData)
        }
        return undefined

    },
    async deleteForStep(params: DeleteSampleDataForStepParams): Promise<void> {
        await fileRepo().createQueryBuilder().delete().where({
            id: params.fileId,
            workspaceId: params.workspaceId,
            type: params.fileType,
        }).andWhere('metadata->>\'workflowVersionId\' = :workflowVersionId', { workflowVersionId: params.workflowVersionId }).execute()
    },
    async deleteForWorkflow(params: DeleteSampleDataParams): Promise<void> {
        await fileRepo().createQueryBuilder().delete().where({
            workspaceId: params.workspaceId,
            type: params.fileType,
        }).andWhere('metadata->>\'workflowId\' = :workflowId', { workflowId: params.workflowId }).execute()
    },
    async getSampleDataForWorkflow(workspaceId: WorkspaceId, workflowVersion: WorkflowVersion, type: SampleDataFileType): Promise<Record<string, unknown>> {
        const steps = workflowStructureUtil.getAllSteps(workflowVersion.trigger)
        const sampleDataPromises = steps.map(async (step) => {
            const data = await this.getOrReturnEmpty({
                workspaceId,
                workflowVersion,
                stepName: step.name,
                type,
            })
            return { [step.name]: data }
        })
        const sampleDataArray = await Promise.all(sampleDataPromises)
        return Object.assign({}, ...sampleDataArray)
    },
})

export async function saveSampleData({
    workspaceId,
    workflowVersionId,
    stepName,
    payload,
    type,
}: SaveSampleDataParams, log: FastifyBaseLogger): Promise<SaveSampleDataResponse> {
    const workflowVersion = await workflowVersionService(log).getOneOrThrow(workflowVersionId)
    const step = workflowStructureUtil.getStepOrThrow(stepName, workflowVersion.trigger)
    const fileType = type === SampleDataFileType.INPUT ? FileType.SAMPLE_DATA_INPUT : FileType.SAMPLE_DATA
    const fileId = await useExistingOrCreateNewSampleId(workspaceId, workflowVersion, step, fileType, log)
    const payloadWithStringifiedNullOrUndefined = isNil(payload) ? stringifyNullOrUndefined(payload) : payload
    const data = typeof payloadWithStringifiedNullOrUndefined === 'string' ? Buffer.from(payloadWithStringifiedNullOrUndefined) : Buffer.from(JSON.stringify(payloadWithStringifiedNullOrUndefined))
    return fileService(log).save({
        workspaceId,
        fileId,
        data,
        size: data.length,
        type: fileType,
        compression: FileCompression.NONE,
        metadata: {
            workflowId: workflowVersion.workflowId,
            workflowVersionId,
            stepName,
            [DATA_TYPE_KEY_IN_FILE_METADATA]: typeof payloadWithStringifiedNullOrUndefined === 'string' ? SampleDataDataType.STRING : SampleDataDataType.JSON,
        },
    })
}

async function useExistingOrCreateNewSampleId(workspaceId: WorkspaceId, workflowVersion: WorkflowVersion, step: WorkflowAction | WorkflowTrigger, fileType: FileType, log: FastifyBaseLogger): Promise<string> {
    const sampleDataId = fileType === FileType.SAMPLE_DATA ? step.settings.sampleData?.sampleDataFileId : step.settings.sampleData?.sampleDataInputFileId
    if (isNil(sampleDataId)) {
        return generateId()
    }
    const file = await fileService(log).getFile({
        workspaceId,
        fileId: sampleDataId,
        type: fileType,
    })
    const isNewVersion = file?.metadata?.workflowVersionId !== workflowVersion.id
    if (isNewVersion || isNil(file)) {
        return generateId()
    }
    return file.id
}


type DeleteSampleDataForStepParams = {
    workspaceId: WorkspaceId
    fileId: string
    fileType: FileType
    workflowVersionId: WorkflowVersionId
    workflowId: WorkflowId
}

type DeleteSampleDataParams = {
    workspaceId: WorkspaceId
    workflowId: WorkflowId
    fileType: FileType
}

type GetSampleDataParams = {
    workspaceId: WorkspaceId
    type: SampleDataFileType
    stepName: string
    workflowVersion: WorkflowVersion
}

type SaveSampleDataParams = {
    workspaceId: WorkspaceId
    workflowVersionId: WorkflowVersionId
    stepName: string
    payload: unknown
    type: SampleDataFileType
}
