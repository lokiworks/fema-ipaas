import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import {
    DeleteStoreEntryRequest,
    GetStoreEntryRequest,
    PutStoreEntryRequest,
    STORE_VALUE_MAX_SIZE,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import sizeof from 'object-sizeof'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { dataStoreRecordService } from '../data-store/data-store-record.service'
import { dataStoreUtils } from '../data-store/data-store-utils'
import { storeEntryService } from './store-entry.service'

export const storeEntryController: FastifyPluginAsyncZod = async (fastify) => {
    fastify.post( '/', CreateRequest, async (request, reply) => {
        const sizeOfValue = sizeof(request.body.value)
        if (sizeOfValue > STORE_VALUE_MAX_SIZE) {
            await reply.status(StatusCodes.REQUEST_TOO_LONG).send({})
            return
        }
        const target = dataStoreUtils.parseEngineKey(request.body.key)
        if (target.type === 'invalid') {
            throw invalidDataStoreKeyError(request.body.key)
        }
        const response = target.type === 'named'
            ? await dataStoreRecordService(request.log).putForEngine({
                projectId: request.principal.projectId,
                target,
                fullKey: request.body.key,
                value: request.body.value,
            })
            : await storeEntryService.upsert({
                projectId: request.principal.projectId,
                request: request.body,
            })
        await reply.status(StatusCodes.OK).send(response)
    },
    )

    fastify.get('/', GetRequest, async (request, reply) => {
        const target = dataStoreUtils.parseEngineKey(request.query.key)
        const value = target.type === 'implicit'
            ? await storeEntryService.getOne({
                projectId: request.principal.projectId,
                key: request.query.key,
            })
            : target.type === 'named'
                ? await dataStoreRecordService(request.log).getForEngine({
                    projectId: request.principal.projectId,
                    target,
                    fullKey: request.query.key,
                })
                : null

        if (!value) {
            return reply.code(StatusCodes.NOT_FOUND).send('Value not found!')
        }

        return value
    },
    )

    fastify.delete('/', DeleteStoreRequest, async (request) => {
        const target = dataStoreUtils.parseEngineKey(request.query.key)
        if (target.type === 'invalid') {
            throw invalidDataStoreKeyError(request.query.key)
        }
        if (target.type === 'named') {
            return dataStoreRecordService(request.log).deleteForEngine({
                projectId: request.principal.projectId,
                target,
            })
        }
        return storeEntryService.delete({
            projectId: request.principal.projectId,
            key: request.query.key,
        })
    },
    )
}

function invalidDataStoreKeyError(key: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message: `Key "${key}" must look like datastore:<store name>/<key>` },
    })
}

const CreateRequest =  {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        body: PutStoreEntryRequest,
    },
}

const GetRequest = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        querystring: GetStoreEntryRequest,
    },
}


const DeleteStoreRequest = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        querystring: DeleteStoreEntryRequest,
    },
}
