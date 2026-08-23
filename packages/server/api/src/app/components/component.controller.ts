import { FlowComponentMetadata } from '@fema-ipaas/component-sdk'
import { componentRegistry } from '@fema-ipaas/components'
import { ALL_PRINCIPAL_TYPES } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../core/security/authorization/fastify-security'

export const componentController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListComponentsRequest, async (): Promise<FlowComponentMetadata[]> => {
        return componentRegistry.listMetadata()
    })
}

const ListComponentsRequest = {
    config: {
        security: securityAccess.unscoped(ALL_PRINCIPAL_TYPES),
    },
}
