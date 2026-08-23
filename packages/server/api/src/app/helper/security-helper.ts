import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { tenantService } from '../tenant/tenant.service'

export const securityHelper = {
    async getUserIdFromRequest(request: FastifyRequest): Promise<string | null> {
        switch (request.principal.type) {
            case PrincipalType.SERVICE: {
                const tenant = await tenantService(request.log).getOneOrThrow(request.principal.tenant.id)
                return tenant.ownerId
            }
            case PrincipalType.USER:
                return request.principal.id
            default:
                throw new Error(`Unsupported principal type: ${request.principal.type}`)
        }
    },
}