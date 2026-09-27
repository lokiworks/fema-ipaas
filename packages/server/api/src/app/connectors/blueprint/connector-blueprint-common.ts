import { createHash } from 'node:crypto'
import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { BlueprintAuth, BlueprintAuthState, BlueprintTestResult, BlueprintTestStatus, ConnectorBlueprintDefinition, TenantModule, TenantRole } from '@fema-ipaas/shared'
import { In } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { EncryptedObject, encryptUtils } from '../../helper/encryption'
import { tenantAccessUtils } from '../../tenant-access/tenant-access.utils'
import { userRepo } from '../../user/user-service'
import { ConnectorBlueprintVersionEntity } from './connector-blueprint-version.entity'
import { ConnectorBlueprintEntity, ConnectorBlueprintSchema } from './connector-blueprint.entity'

export const blueprintRepo = repoFactory(ConnectorBlueprintEntity)
export const blueprintVersionRepo = repoFactory(ConnectorBlueprintVersionEntity)

export const blueprintAccess = {
    async actor({ tenantId, userId }: ActorParams): Promise<BlueprintActor> {
        const user = await userRepo().findOneBy({ id: userId, tenantId })
        if (isNil(user)) {
            throw denied('User is not part of this tenant')
        }
        return { tenantId, userId, isAdmin: user.tenantRole === TenantRole.ADMIN }
    },
    canView({ blueprint, actor }: AccessParams): boolean {
        return actor.isAdmin || blueprint.ownerId === actor.userId || blueprint.collaboratorIds.includes(actor.userId)
    },
    canManage({ blueprint, actor }: AccessParams): boolean {
        return actor.isAdmin || blueprint.ownerId === actor.userId
    },
    async getOrThrow({ id, actor, manage }: GetParams): Promise<ConnectorBlueprintSchema> {
        const blueprint = await blueprintRepo().findOneBy({ id, tenantId: actor.tenantId })
        if (isNil(blueprint)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'connector_blueprint', entityId: id } })
        }
        if (!blueprintAccess.canView({ blueprint, actor })) {
            throw denied('You are not a developer of this connector. Ask its owner to add you.')
        }
        if (manage === true && !blueprintAccess.canManage({ blueprint, actor })) {
            throw denied('Only the owner of the connector or a tenant administrator can do this')
        }
        return blueprint
    },
    async assertDevelopers({ tenantId, userIds }: { tenantId: string, userIds: string[] }): Promise<void> {
        if (userIds.length === 0) {
            return
        }
        const users = await userRepo().find({ where: { id: In(userIds), tenantId } })
        const eligible = users.filter((user) => tenantAccessUtils.hasModule({ tenantRole: user.tenantRole, storedModules: user.modules ?? [], module: TenantModule.CONNECTOR_DEVELOPMENT }))
        if (eligible.length !== new Set(userIds).size) {
            throw validation('Every developer must be a member of this tenant with the connector development permission')
        }
    },
}

export const blueprintAuthState = {
    empty(): BlueprintAuthState {
        return { publishedHash: null, publishedAt: null, publishedType: null, testRevision: 0, flowTest: null, apiTest: null }
    },
    configHash(auth: BlueprintAuth): string {
        const { name: _name, description: _description, enabled: _enabled, ...config } = auth
        return hashOf(config)
    },
    testHash({ auth, revision }: { auth: BlueprintAuth, revision: number }): string {
        return hashOf({ config: blueprintAuthState.configHash(auth), revision })
    },
    activeAuth(definition: ConnectorBlueprintDefinition): BlueprintAuth | null {
        return isNil(definition.auth) || !definition.auth.enabled ? null : definition.auth
    },
    isPublished({ definition, state }: { definition: ConnectorBlueprintDefinition, state: BlueprintAuthState }): boolean {
        const auth = blueprintAuthState.activeAuth(definition)
        return isNil(auth) || state.publishedHash === blueprintAuthState.configHash(auth)
    },
    validTest({ result, auth, revision }: { result: BlueprintTestResult | null, auth: BlueprintAuth | null, revision: number }): BlueprintTestResult | null {
        if (isNil(result) || isNil(auth)) {
            return null
        }
        return result.hash === blueprintAuthState.testHash({ auth, revision }) ? result : null
    },
    passed(result: BlueprintTestResult | null): boolean {
        return !isNil(result) && result.status === BlueprintTestStatus.PASSED
    },
}

export const blueprintTestData = {
    async read(blueprint: ConnectorBlueprintSchema): Promise<BlueprintTestData> {
        if (isNil(blueprint.authTestData)) {
            return { values: {}, oauth: null }
        }
        const decrypted = await encryptUtils.decryptObject<Partial<BlueprintTestData>>(blueprint.authTestData)
        return { values: decrypted.values ?? {}, oauth: decrypted.oauth ?? null }
    },
    async write(data: BlueprintTestData): Promise<EncryptedObject> {
        return encryptUtils.encryptObject(data)
    },
}

export const blueprintCommon = {
    hashOf,
    denied,
    validation,
    fullName,
}

function hashOf(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function denied(message: string): ApplicationError {
    return new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message } })
}

function validation(message: string): ApplicationError {
    return new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
}

function fullName(identity: { firstName: string, lastName: string, email: string } | undefined | null): string {
    if (isNil(identity)) {
        return ''
    }
    const name = `${identity.firstName} ${identity.lastName}`.trim()
    return name.length > 0 ? name : identity.email
}

type ActorParams = {
    tenantId: string
    userId: string
}

type AccessParams = {
    blueprint: ConnectorBlueprintSchema
    actor: BlueprintActor
}

type GetParams = {
    id: string
    actor: BlueprintActor
    manage?: boolean
}

export const BLUEPRINT_SECRET_MASK = '••••••'

export type BlueprintTestData = {
    values: Record<string, string>
    oauth: { access_token: string, refresh_token: string | null, data: Record<string, unknown> } | null
}

export type BlueprintActor = {
    tenantId: string
    userId: string
    isAdmin: boolean
}
