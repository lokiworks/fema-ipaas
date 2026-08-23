import { apId, FlowId, FlowVersionId, isNil, stringifyNullOrUndefined, WorkspaceId } from '@fema/core-utils'
import { DATA_TYPE_KEY_IN_FILE_METADATA, FileCompression, FileType, FlowAction, flowStructureUtil, FlowTrigger, FlowVersion, SampleDataDataType, SampleDataFileType, SampleDataSettings, SaveSampleDataResponse, Step } from '@fema/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { fileRepo, fileService } from '../../file/file.service'
import { flowVersionService } from '../flow-version/flow-version.service'
export const sampleDataService = (log: FastifyBaseLogger) => ({
    async saveSampleDataFileIdsInStep(params: SaveSampleDataParams): Promise<SampleDataSettings> {
        const flowVersion = await flowVersionService(log).getOneOrThrow(params.flowVersionId)
        const step = flowStructureUtil.getStepOrThrow(params.stepName, flowVersion.trigger)
        const sampleDataFile = await saveSampleData(params, log)
        const clonedStep: Step = JSON.parse(JSON.stringify(step))
        return {
            sampleDataFileId: params.type === SampleDataFileType.OUTPUT ? sampleDataFile.id : clonedStep.settings.sampleData?.sampleDataFileId,
            sampleDataInputFileId: params.type === SampleDataFileType.INPUT ? sampleDataFile.id : clonedStep.settings.sampleData?.sampleDataInputFileId,
            lastTestDate: dayjs().toISOString(),
        }
    },
    async getOrReturnEmpty(params: GetSampleDataParams): Promise<unknown> {
        const step = flowStructureUtil.getStepOrThrow(params.stepName, params.flowVersion.trigger)
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
        }).andWhere('metadata->>\'flowVersionId\' = :flowVersionId', { flowVersionId: params.flowVersionId }).execute()
    },
    async deleteForFlow(params: DeleteSampleDataParams): Promise<void> {
        await fileRepo().createQueryBuilder().delete().where({
            workspaceId: params.workspaceId,
            type: params.fileType,
        }).andWhere('metadata->>\'flowId\' = :flowId', { flowId: params.flowId }).execute()
    },
    async getSampleDataForFlow(workspaceId: WorkspaceId, flowVersion: FlowVersion, type: SampleDataFileType): Promise<Record<string, unknown>> {
        const steps = flowStructureUtil.getAllSteps(flowVersion.trigger)
        const sampleDataPromises = steps.map(async (step) => {
            const data = await this.getOrReturnEmpty({
                workspaceId,
                flowVersion,
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
    flowVersionId,
    stepName,
    payload,
    type,
}: SaveSampleDataParams, log: FastifyBaseLogger): Promise<SaveSampleDataResponse> {
    const flowVersion = await flowVersionService(log).getOneOrThrow(flowVersionId)
    const step = flowStructureUtil.getStepOrThrow(stepName, flowVersion.trigger)
    const fileType = type === SampleDataFileType.INPUT ? FileType.SAMPLE_DATA_INPUT : FileType.SAMPLE_DATA
    const fileId = await useExistingOrCreateNewSampleId(workspaceId, flowVersion, step, fileType, log)
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
            flowId: flowVersion.flowId,
            flowVersionId,
            stepName,
            [DATA_TYPE_KEY_IN_FILE_METADATA]: typeof payloadWithStringifiedNullOrUndefined === 'string' ? SampleDataDataType.STRING : SampleDataDataType.JSON,
        },
    })
}

async function useExistingOrCreateNewSampleId(workspaceId: WorkspaceId, flowVersion: FlowVersion, step: FlowAction | FlowTrigger, fileType: FileType, log: FastifyBaseLogger): Promise<string> {
    const sampleDataId = fileType === FileType.SAMPLE_DATA ? step.settings.sampleData?.sampleDataFileId : step.settings.sampleData?.sampleDataInputFileId
    if (isNil(sampleDataId)) {
        return apId()
    }
    const file = await fileService(log).getFile({
        workspaceId,
        fileId: sampleDataId,
        type: fileType,
    })
    const isNewVersion = file?.metadata?.flowVersionId !== flowVersion.id
    if (isNewVersion || isNil(file)) {
        return apId()
    }
    return file.id
}


type DeleteSampleDataForStepParams = {
    workspaceId: WorkspaceId
    fileId: string
    fileType: FileType
    flowVersionId: FlowVersionId
    flowId: FlowId
}

type DeleteSampleDataParams = {
    workspaceId: WorkspaceId
    flowId: FlowId
    fileType: FileType
}

type GetSampleDataParams = {
    workspaceId: WorkspaceId
    type: SampleDataFileType
    stepName: string
    flowVersion: FlowVersion
}

type SaveSampleDataParams = {
    workspaceId: WorkspaceId
    flowVersionId: FlowVersionId
    stepName: string
    payload: unknown
    type: SampleDataFileType
}
