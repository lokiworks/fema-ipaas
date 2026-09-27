import { isNil } from '@fema-ipaas/core-utils'
import { FlagId } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { flagHooks } from '../flags/flags.hooks'
import { generateTheme } from '../flags/theme'
import { tenantRepo } from '../tenant/tenant.service'
import { tenantUtils } from '../tenant/tenant.utils'

export const tenantBrandingFlags = {
    install(): void {
        flagHooks.set({
            async modify({ flags, request }) {
                return applyTenantBranding({ flags, request })
            },
        })
    },
}

async function applyTenantBranding({ flags, request }: ApplyParams): Promise<Record<string, unknown>> {
    const tenantId = await tenantUtils.getTenantIdForRequest(request)
    if (isNil(tenantId)) {
        return flags
    }
    const tenant = await tenantRepo().findOneBy({ id: tenantId })
    if (isNil(tenant)) {
        return flags
    }
    const theme = generateTheme({
        primaryColor: tenant.primaryColor,
        fullLogoUrl: tenant.fullLogoUrl,
        favIconUrl: tenant.favIconUrl,
        logoIconUrl: tenant.logoIconUrl,
        websiteName: tenant.name,
        themeColors: tenant.themeColors ?? undefined,
    })
    return {
        ...flags,
        [FlagId.THEME]: { ...theme, welcomeText: tenant.welcomeText ?? null },
        [FlagId.EMAIL_AUTH_ENABLED]: tenant.emailAuthEnabled,
    }
}

type ApplyParams = {
    flags: Record<string, unknown>
    request: FastifyRequest
}
