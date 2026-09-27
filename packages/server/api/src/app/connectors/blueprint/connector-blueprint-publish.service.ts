import { generateId, isNil } from '@fema-ipaas/core-utils'
import {
    blueprintChanges,
    blueprintProblems,
    BlueprintPublishMode,
    BlueprintRollout,
    BlueprintVersionAction,
    BlueprintVersionError,
    blueprintVersions,
    BlueprintVersionStatus,
    ConnectorBlueprintDefinition,
    ConnectorBlueprintDetail,
    ConnectorBlueprintVersion,
    PublishConnectorBlueprintRequest,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull } from 'typeorm'
import { distributedLock } from '../../database/redis-connections'
import { projectRepo } from '../../project/project-service'
import { connectorInstallService } from '../connector-install-service'
import { blueprintAccess, BlueprintActor, blueprintAuthState, blueprintCommon, blueprintRepo, blueprintVersionRepo } from './connector-blueprint-common'
import { connectorBlueprintPackage } from './connector-blueprint-package'
import { ConnectorBlueprintSchema } from './connector-blueprint.entity'
import { connectorBlueprintService } from './connector-blueprint.service'

export const connectorBlueprintPublishService = (log: FastifyBaseLogger) => ({
    async publish({ id, actor, request }: PublishParams): Promise<ConnectorBlueprintDetail> {
        await blueprintAccess.getOrThrow({ id, actor })
        await distributedLock(log).runExclusive({
            key: `connector-blueprint-publish-${id}`,
            timeoutInSeconds: PUBLISH_LOCK_SECONDS,
            fn: async () => {
                const blueprint = await blueprintAccess.getOrThrow({ id, actor })
                const versions = await blueprintVersionRepo().find({ where: { tenantId: actor.tenantId, blueprintId: blueprint.id } })
                const plan = await planPublish({ blueprint, versions, request, actor })
                const manifest = connectorBlueprintPackage.manifest({ identifier: blueprint.identifier, connectorName: blueprint.connectorName, packageVersion: plan.packageVersion, definition: plan.definition, draft: false })
                await connectorInstallService(log).installBuiltArchive({
                    tenantId: actor.tenantId,
                    connectorName: blueprint.connectorName,
                    connectorVersion: plan.packageVersion,
                    archive: connectorBlueprintPackage.archive(manifest),
                })
                await blueprintVersionRepo().save(plan.version)
                await blueprintRepo().save({ ...blueprint, publishedDefinition: plan.definition, updated: dayjs().toISOString() })
            },
        })
        return connectorBlueprintService(log).detail({ id, actor })
    },

    async changeStatus({ id, versionId, actor, action }: ChangeStatusParams): Promise<ConnectorBlueprintDetail> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor })
        const version = await versionOrThrow({ blueprint, versionId, actor })
        const next = blueprintVersions.nextStatus({ status: version.status, action })
        if (isNil(next)) {
            throw blueprintCommon.validation(`The version ${version.version} cannot ${action.toLowerCase().replace('_', ' ')} from its current state`)
        }
        await blueprintVersionRepo().save({ ...version, status: next, canaryProjectIds: next === BlueprintVersionStatus.CANARY ? version.canaryProjectIds : [] })
        return connectorBlueprintService(log).detail({ id, actor })
    },

    async updateCanary({ id, versionId, actor, projectIds }: UpdateCanaryParams): Promise<ConnectorBlueprintDetail> {
        const blueprint = await blueprintAccess.getOrThrow({ id, actor })
        const version = await versionOrThrow({ blueprint, versionId, actor })
        if (version.status !== BlueprintVersionStatus.CANARY) {
            throw blueprintCommon.validation('Only a version in canary can change its canary projects')
        }
        const canaryProjectIds = await tenantProjectIds({ tenantId: actor.tenantId, projectIds })
        await blueprintVersionRepo().save({ ...version, canaryProjectIds })
        return connectorBlueprintService(log).detail({ id, actor })
    },
})

async function planPublish({ blueprint, versions, request, actor }: PlanParams): Promise<PublishPlan> {
    const changes = blueprintChanges.compute({ baseline: blueprint.publishedDefinition, draft: blueprint.definition })
    const known = new Set(changes.map((change) => change.id))
    const changeIds = [...new Set(request.changeIds)]
    if (changeIds.length === 0 || changeIds.some((changeId) => !known.has(changeId))) {
        throw blueprintCommon.validation('Pick at least one pending change; the list of changes is out of date, reload the page')
    }
    const authPublished = blueprintAuthState.isPublished({ definition: blueprint.definition, state: blueprint.authState })
    if (blueprintProblems.publish({ definition: blueprint.definition, authPublished }).length > 0) {
        throw blueprintCommon.validation('Resolve the pre-publish checks before publishing')
    }
    const definition = blueprintChanges.apply({ baseline: blueprint.publishedDefinition, draft: blueprint.definition, changeIds })
    if (blueprintProblems.publish({ definition, authPublished }).length > 0) {
        throw blueprintCommon.validation('The selected changes leave the connector incomplete, for example an operation that another input depends on is not included')
    }
    const now = dayjs().toISOString()
    const description = request.description.trim()
    if (request.mode === BlueprintPublishMode.UPDATE_CURRENT) {
        return planUpdate({ versions, changes, changeIds, definition, description, actor, now })
    }
    const version = (request.version ?? '').trim()
    const error = blueprintVersions.newVersionError({ version, existing: versions.map((existing) => existing.packageVersion) })
    if (!isNil(error)) {
        throw blueprintCommon.validation(error === BlueprintVersionError.FORMAT ? 'The version must look like 1.3' : 'The version must be greater than every published version')
    }
    const canary = request.rollout === BlueprintRollout.CANARY
    const canaryProjectIds = canary ? await tenantProjectIds({ tenantId: actor.tenantId, projectIds: request.canaryProjectIds }) : []
    const packageVersion = blueprintVersions.packageVersionOf({ version, patch: 0 })
    return {
        definition,
        packageVersion,
        version: {
            id: generateId(),
            created: now,
            updated: now,
            tenantId: actor.tenantId,
            blueprintId: blueprint.id,
            connectorName: blueprint.connectorName,
            version,
            packageVersion,
            status: canary ? BlueprintVersionStatus.CANARY : BlueprintVersionStatus.FULL,
            canaryProjectIds,
            description,
            publishedBy: actor.userId,
            publishedAt: now,
            updates: [],
            definition,
        },
    }
}

function planUpdate({ versions, changes, changeIds, definition, description, actor, now }: PlanUpdateParams): PublishPlan {
    const latest = versions.reduce<ConnectorBlueprintVersion | null>((best, candidate) => (isNil(best) || blueprintVersions.compare({ left: candidate.version, right: best.version }) > 0 ? candidate : best), null)
    if (isNil(latest)) {
        throw blueprintCommon.validation('Nothing has been published yet, publish a new version first')
    }
    if (latest.status === BlueprintVersionStatus.STOPPED) {
        throw blueprintCommon.validation(`Version ${latest.version} is no longer supported, publish a new version instead`)
    }
    if (blueprintChanges.includesRemoval({ changes, changeIds })) {
        throw blueprintCommon.validation('Changes that delete an operation or trigger can only be published as a new version')
    }
    const packageVersion = blueprintVersions.packageVersionOf({ version: latest.version, patch: blueprintVersions.patchOf(latest.packageVersion) + 1 })
    return {
        definition,
        packageVersion,
        version: {
            ...latest,
            updated: now,
            packageVersion,
            definition,
            updates: [{ packageVersion, description, publishedBy: actor.userId, publishedAt: now }, ...latest.updates],
        },
    }
}

async function versionOrThrow({ blueprint, versionId, actor }: { blueprint: ConnectorBlueprintSchema, versionId: string, actor: BlueprintActor }): Promise<ConnectorBlueprintVersion> {
    const version = await blueprintVersionRepo().findOneBy({ id: versionId, blueprintId: blueprint.id, tenantId: actor.tenantId })
    if (isNil(version)) {
        throw blueprintCommon.validation('The version does not exist')
    }
    return version
}

async function tenantProjectIds({ tenantId, projectIds }: { tenantId: string, projectIds: string[] }): Promise<string[]> {
    const unique = [...new Set(projectIds)]
    if (unique.length === 0) {
        throw blueprintCommon.validation('Pick at least one project for the canary release')
    }
    const projects = await projectRepo().find({ where: { id: In(unique), tenantId, deleted: IsNull() }, select: { id: true } })
    if (projects.length !== unique.length) {
        throw blueprintCommon.validation('Every canary project must belong to this tenant')
    }
    return unique
}

const PUBLISH_LOCK_SECONDS = 300

type PublishParams = {
    id: string
    actor: BlueprintActor
    request: PublishConnectorBlueprintRequest
}

type ChangeStatusParams = {
    id: string
    versionId: string
    actor: BlueprintActor
    action: BlueprintVersionAction
}

type UpdateCanaryParams = {
    id: string
    versionId: string
    actor: BlueprintActor
    projectIds: string[]
}

type PlanParams = {
    blueprint: ConnectorBlueprintSchema
    versions: ConnectorBlueprintVersion[]
    request: PublishConnectorBlueprintRequest
    actor: BlueprintActor
}

type PlanUpdateParams = {
    versions: ConnectorBlueprintVersion[]
    changes: ReturnType<typeof blueprintChanges.compute>
    changeIds: string[]
    definition: ConnectorBlueprintDefinition
    description: string
    actor: BlueprintActor
    now: string
}

type PublishPlan = {
    definition: ConnectorBlueprintDefinition
    packageVersion: string
    version: ConnectorBlueprintVersion
}
