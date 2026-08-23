import { ApplicationError, ErrorCode, isNil, isObject } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { preSerializationHookHandler } from 'fastify'

export function extractResourceName(url: string): string | undefined {
    const urlPath = url.split('?')[0]
    const resourceRegex = /\/v1\/(.+?)(\/|$)/
    const resourceMatch = urlPath.match(resourceRegex)
    const resource = resourceMatch ? resourceMatch[1] : undefined
    return resource
}

/**
 * Throws an authz error if response entities contain a `workspaceId` property and
 * the `workspaceId` property value does not match the principal's `workspaceId`.
 * Otherwise, does nothing.
 */
export const entitiesMustBeOwnedByCurrentWorkspace: preSerializationHookHandler<Payload | null> = (request, _response, payload, done) => {
    request.log.trace(
        { payload, principal: request.principal, route: request.routeOptions.config },
        'entitiesMustBeOwnedByCurrentWorkspace',
    )
    const principalWorkspaceId = request.principal.type === PrincipalType.ENGINE ? request.principal.workspaceId : (request.workspaceId ?? undefined)

    if (isObject(payload) && !isNil(principalWorkspaceId)) {
        let verdict: AuthzVerdict = 'ALLOW'

        if ('workspaceId' in payload) {
            if (payload.workspaceId !== principalWorkspaceId) {
                verdict = 'DENY'
            }
        }
        else if ('data' in payload && Array.isArray(payload.data)) {
            const someEntityNotOwnedByCurrentWorkspace = payload.data.some((entity) => {
                return 'workspaceId' in entity && entity.workspaceId !== principalWorkspaceId
            })

            if (someEntityNotOwnedByCurrentWorkspace) {
                verdict = 'DENY'
            }
        }

        if (verdict === 'DENY') {
            request.log.warn({
                principalWorkspaceId,
                route: request.routeOptions.config,
            }, 'Authorization denied: entity not owned by current workspace')
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'not owned by current workspace',
                },
            })
        }
    }

    done()
}

type SingleEntity = {
    workspaceId?: string
}

type MultipleEntities = {
    data: SingleEntity[]
}

type Payload = SingleEntity | MultipleEntities

type AuthzVerdict = 'ALLOW' | 'DENY'
