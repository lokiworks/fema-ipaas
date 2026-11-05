import { isNil } from '@fema-ipaas/core-utils'
import { PublicTenantInfo, Tenant, TenantDiscoveryResponse, TenantStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { smsSettingsService } from '../authentication/sms/sms-settings.service'
import { ssoConfigService } from '../sso/sso-config.service'
import { tenantDomainService } from '../tenant-domain/tenant-domain.service'
import { tenantDomainUtils } from '../tenant-domain/tenant-domain.utils'
import { tenantRepo, tenantService } from './tenant.service'

export const tenantPublicInfoService = (log: FastifyBaseLogger) => ({
    async getBySlugOrId({ slugOrId }: { slugOrId: string }): Promise<PublicTenantInfo | null> {
        const tenant = await tenantService(log).getBySlugOrId(slugOrId)
        if (isNil(tenant)) {
            return null
        }
        const smsAvailable = await isSmsAvailable()
        return this.build({ tenant, smsAvailable })
    },

    async discoverByEmail({ email }: { email: string }): Promise<TenantDiscoveryResponse> {
        const domain = tenantDomainUtils.emailDomain({ email })
        if (isNil(domain)) {
            return { tenants: [] }
        }
        const tenantIds = await tenantDomainService(log).findTenantIdsForEmailDomain({ domain })
        if (tenantIds.length === 0) {
            return { tenants: [] }
        }
        const found = await tenantRepo().find({ where: { id: In(tenantIds), status: TenantStatus.ACTIVE } })
        const smsAvailable = await isSmsAvailable()
        const tenants = await Promise.all(found.map((tenant) => this.build({ tenant, smsAvailable })))
        return { tenants }
    },

    async build({ tenant, smsAvailable }: { tenant: Omit<Tenant, 'federatedAuthProviders'>, smsAvailable: boolean }): Promise<PublicTenantInfo> {
        const providers = await ssoConfigService(log).listPublicProviders({ tenantId: tenant.id })
        return {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            logoIconUrl: tenant.logoIconUrl,
            fullLogoUrl: tenant.fullLogoUrl,
            primaryColor: tenant.primaryColor,
            welcomeText: tenant.welcomeText ?? null,
            emailAuthEnabled: tenant.emailAuthEnabled,
            phoneAuthEnabled: tenant.phoneAuthEnabled && smsAvailable,
            ssoProviders: providers.map((provider) => ({ provider: provider.provider, label: provider.label })),
        }
    },
})

async function isSmsAvailable(): Promise<boolean> {
    return smsSettingsService.isAvailable()
}
