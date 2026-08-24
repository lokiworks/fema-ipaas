import { Readable } from 'node:stream'
import { FilesService } from '@fema-ipaas/connector-sdk'
import { generateId } from '@fema-ipaas/core-utils'
import { FileSizeError, FileType } from '@fema-ipaas/shared'
import { engineFileApi } from '../api/engine-file-api'

export function createFileUploader({ engineToken, apiUrl }: CreateFileUploaderParams): FilesService {
    const maxFileSizeMb = Number(process.env.FEMA_MAX_FILE_SIZE_MB)
    return {
        write: async ({ fileName, data }: { fileName: string, data: Buffer | Readable }): Promise<string> => {
            if (!Buffer.isBuffer(data) && !(data instanceof Readable)) {
                throw new Error(
                    `Expected file data to be a Buffer or Readable stream, but received ${typeof data === 'object' ? Object.prototype.toString.call(data) : typeof data}`,
                )
            }
            // Stream size is unknown upfront; the API server enforces the cap while streaming.
            if (Buffer.isBuffer(data)) {
                validateFileSize(data, maxFileSizeMb)
            }
            const { readUrl } = await engineFileApi.upload({
                engineToken,
                apiUrl,
                fileId: generateId(),
                type: FileType.WORKFLOW_STEP_FILE,
                fileName,
                data,
            })
            return readUrl
        },
    }
}

function validateFileSize(data: Buffer, maxFileSizeMb: number): void {
    const maximumFileSizeInBytes = maxFileSizeMb * 1024 * 1024
    if (data.length > maximumFileSizeInBytes) {
        throw new FileSizeError(data.length / 1024 / 1024, maxFileSizeMb)
    }
}

type CreateFileUploaderParams = {
    apiUrl: string
    engineToken: string
}
