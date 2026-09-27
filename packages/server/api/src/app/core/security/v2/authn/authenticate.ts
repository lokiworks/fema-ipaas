import { isNil } from '@fema-ipaas/core-utils'
import { PERSONAL_ACCESS_TOKEN_PREFIX, Principal, PrincipalType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { nanoid } from 'nanoid'
import { personalAccessTokenService } from '../../../../account/personal-access-token.service'
import { accessTokenManager } from '../../../../authentication/lib/access-token-manager'

export const authenticateOrThrow = async (log: FastifyBaseLogger, rawToken: string | null): Promise<Principal> => {
    if (!isNil(rawToken) && rawToken.startsWith('Bearer ')) {
        const trimBearerPrefix = rawToken.replace('Bearer ', '')
        if (trimBearerPrefix.startsWith(PERSONAL_ACCESS_TOKEN_PREFIX)) {
            return personalAccessTokenService(log).authenticate(trimBearerPrefix)
        }
        return accessTokenManager(log).verifyPrincipal(trimBearerPrefix)
    }
    return {
        id: nanoid(),
        type: PrincipalType.UNKNOWN,
    }
}



