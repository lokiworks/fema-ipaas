import { ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil, isObject } from '@fema/core-utils'
import { FastifyRequest } from 'fastify'
import { databaseConnection } from '../../../../database/database-connection'
import { EntitySourceType, WorkspaceBodyResource, WorkspaceParamResource, WorkspaceQueryResource, WorkspaceTableResource } from '../../authorization/common'

export const workspaceIdExtractor = {
    async fromTable(
        request: FastifyRequest,
        workspaceTableResource: WorkspaceTableResource,
    ): Promise<string | undefined> {
        const entitySourceType = workspaceTableResource.entitySourceType ?? EntitySourceType.PARAM
        let entityValue: string | undefined
        const { paramKey, entityField } = workspaceTableResource.lookup ?? {
            paramKey: 'id',
            entityField: 'id',
        }

        switch (entitySourceType) {
            case EntitySourceType.PARAM:
                entityValue = entityValueExtractor.fromParam(request, paramKey)
                break
            case EntitySourceType.QUERY:
                entityValue = entityValueExtractor.fromQuery(request, paramKey)
                break
            case EntitySourceType.BODY:
                entityValue = entityValueExtractor.fromBody(request, paramKey)
        }
        if (isNil(entityValue)) {
            return undefined
        }
        const entity = await databaseConnection().getRepository(workspaceTableResource.tableName).findOneBy({
            [entityField]: entityValue,
        })
        if (isNil(entity)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: entityValue,
                    entityType: workspaceTableResource.tableName.options.name,
                },
            })
        }
        return entity.workspaceId ?? entity.workspaceIds?.[0] ?? undefined
    },

    fromBody(request: FastifyRequest, workspaceBodyResource: WorkspaceBodyResource): string | undefined {
        const key = workspaceBodyResource.bodyKey ?? 'workspaceId'
        if (isObject(request.body) && key in request.body) {
            return request.body[key] as string
        }

        return undefined
    },

    fromQuery(request: FastifyRequest, workspaceQueryResource: WorkspaceQueryResource): string | undefined {
        const key = workspaceQueryResource.queryKey ?? 'workspaceId'
        if (isObject(request.query) && key in request.query) {
            return request.query[key] as string
        }

        return undefined
    },

    async fromParam(request: FastifyRequest, workspaceParamResource: WorkspaceParamResource): Promise<string | undefined> {
        const key = workspaceParamResource.paramKey ?? 'workspaceId'
        const { [key]: paramValue } = request.params as Record<string, string>
        return paramValue ?? undefined
    },
}

const entityValueExtractor = {
    fromParam(request: FastifyRequest, paramKey: string): string | undefined {
        const routerPath = request.routeOptions.url
        assertNotNullOrUndefined(routerPath, 'routerPath is undefined')
        const hasIdParam = routerPath.includes(`:${paramKey}`) &&
          isObject(request.params) &&
          paramKey in request.params &&
          typeof request.params[paramKey] === 'string'

        if (!hasIdParam) {
            return undefined
        }

        const { [paramKey]: paramValue } = request.params as Record<string, string>
        return paramValue
    },

    fromQuery(request: FastifyRequest, key: string): string | undefined {
        if (isObject(request.query) && key in request.query) {
            return request.query[key] as string
        }
        return undefined
    },

    fromBody(request: FastifyRequest, key: string): string | undefined {
        if (isObject(request.body) && key in request.body) {
            return request.body[key] as string
        }
        return undefined
    },
}