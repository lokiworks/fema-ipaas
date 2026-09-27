import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { userRepo } from '../user/user-service'

export const accountService = (log: FastifyBaseLogger) => ({
    async updateProfile({ userId, tenantId, name }: UpdateProfileParams): Promise<void> {
        const user = await userRepo().findOneByOrFail({ id: userId, tenantId })
        await userIdentityService(log).updateNames({ id: user.identityId, firstName: name.trim(), lastName: '' })
        log.info({ user: { id: userId } }, '[accountService#updateProfile] Profile name updated')
    },
})

type UpdateProfileParams = {
    userId: string
    tenantId: string
    name: string
}
