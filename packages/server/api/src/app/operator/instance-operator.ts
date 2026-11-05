import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { InstanceOperator, InstanceRole, PrincipalType } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { userIdentityRepository } from '../authentication/user-identity/user-identity-service'
import { identityContact } from '../helper/identity-contact'
import { userService } from '../user/user-service'

export const instanceOperator = {
    async assert({ request }: AssertParams): Promise<void> {
        const principal = request.principal
        if (isNil(principal) || principal.type !== PrincipalType.USER) {
            throw notOperator()
        }
        const user = await userService(request.log).get({ id: principal.id })
        if (isNil(user)) {
            throw notOperator()
        }
        const isOperator = await instanceOperator.isOperator({ identityId: user.identityId })
        if (!isOperator) {
            throw notOperator()
        }
    },

    async isOperator({ identityId }: IdentityParams): Promise<boolean> {
        const identity = await userIdentityRepository().findOne({ where: { id: identityId }, select: ['id', 'instanceRole'] })
        return identity?.instanceRole === InstanceRole.OPERATOR
    },

    async isOperatorRequest({ request }: AssertParams): Promise<boolean> {
        const principal = request.principal
        if (isNil(principal) || principal.type !== PrincipalType.USER) {
            return false
        }
        const user = await userService(request.log).get({ id: principal.id })
        return isNil(user) ? false : instanceOperator.isOperator({ identityId: user.identityId })
    },

    async list(): Promise<InstanceOperator[]> {
        const identities = await userIdentityRepository().find({
            where: { instanceRole: InstanceRole.OPERATOR },
            order: { created: 'ASC' },
        })
        return identities.map((identity) => ({
            identityId: identity.id,
            name: identityContact.fullName(identity),
            contact: identityContact.of(identity).length > 0 ? identityContact.of(identity) : null,
        }))
    },

    async grant({ email, log }: GrantParams): Promise<InstanceOperator[]> {
        const identity = await userIdentityRepository().findOneBy({ email: email.trim().toLowerCase() })
        if (isNil(identity) || !identity.verified) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'operatorIdentityNotFound' },
            })
        }
        await userIdentityRepository().update({ id: identity.id }, { instanceRole: InstanceRole.OPERATOR })
        log.info({ identity: { id: identity.id } }, '[instanceOperator] operator granted')
        return instanceOperator.list()
    },

    async revoke({ identityId, log }: RevokeParams): Promise<InstanceOperator[]> {
        const operators = await instanceOperator.list()
        const target = operators.find((operator) => operator.identityId === identityId)
        if (isNil(target)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'instance_operator', entityId: identityId },
            })
        }
        if (operators.length === 1) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'lastOperatorCannotBeRevoked' },
            })
        }
        await userIdentityRepository().update({ id: identityId }, { instanceRole: null })
        log.info({ identity: { id: identityId } }, '[instanceOperator] operator revoked')
        return instanceOperator.list()
    },
}

function notOperator(): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.AUTHORIZATION,
        params: { message: 'This action is only available to instance operators' },
    })
}

type AssertParams = {
    request: FastifyRequest
}

type IdentityParams = {
    identityId: string
}

type GrantParams = {
    email: string
    log: FastifyBaseLogger
}

type RevokeParams = IdentityParams & {
    log: FastifyBaseLogger
}
