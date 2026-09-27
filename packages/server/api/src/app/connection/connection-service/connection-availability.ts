import { isNil } from '@fema-ipaas/core-utils'
import { ConnectionScope } from '@fema-ipaas/shared'
import { ArrayContains, FindOptionsWhere } from 'typeorm'
import { ConnectionSchema } from '../connection.entity'

function whereAvailableIn({ projectId, where }: { projectId: string | null | undefined, where: FindOptionsWhere<ConnectionSchema> }): FindOptionsWhere<ConnectionSchema>[] {
    if (isNil(projectId)) {
        return [where]
    }
    const listed: FindOptionsWhere<ConnectionSchema> = { ...where, projectIds: ArrayContains([projectId]) }
    if (!isNil(where.scope) && where.scope !== ConnectionScope.TENANT) {
        return [listed]
    }
    return [listed, { ...where, scope: ConnectionScope.TENANT, preSelectForNewProjects: true }]
}

function sqlAvailableIn({ alias, param }: { alias: string, param: string }): string {
    return `(${alias}."projectIds" @> ARRAY[:${param}]::varchar[] OR (${alias}."scope" = '${ConnectionScope.TENANT}' AND ${alias}."preSelectForNewProjects" = true))`
}

function sqlVisibleTo({ alias, userParam }: { alias: string, userParam: string }): string {
    return `(${alias}."ownerId" = :${userParam} OR ${alias}."projectMembersPermission" IS NOT NULL OR EXISTS (SELECT 1 FROM "connection_share" "visible_share" WHERE "visible_share"."connectionId" = ${alias}."id" AND "visible_share"."userId" = :${userParam}))`
}

export const connectionAvailability = {
    whereAvailableIn,
    sqlAvailableIn,
    sqlVisibleTo,
}
