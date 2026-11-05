import { isNil } from '@fema-ipaas/core-utils'
import { InstanceSettings, UpdateInstanceSettingsRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { captchaSettings } from '../authentication/captcha/captcha-settings'
import { turnstile } from '../authentication/lib/turnstile'
import { smsSettingsService } from '../authentication/sms/sms-settings.service'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { platformLoginAppsService } from '../sso/platform-login-apps.service'
import { instanceSettingsStore } from './instance-settings.store'

export const instanceSettingsService = (_log: FastifyBaseLogger) => ({
    async get(): Promise<InstanceSettings> {
        const [stored, captchaProvider, sms, platformLoginApps] = await Promise.all([
            instanceSettingsStore.get(),
            captchaSettings.getProvider(),
            smsSettingsService.getPublic(),
            platformLoginAppsService.listPublic(),
        ])
        return {
            tenantSelfSignup: stored.tenantSelfSignup,
            tenantBaseDomain: baseDomain(),
            captchaProvider,
            turnstileConfigured: turnstile.isConfigured(),
            sms,
            platformLoginApps,
        }
    },

    async update({ patch }: { patch: UpdateInstanceSettingsRequestBody }): Promise<InstanceSettings> {
        if (patch.tenantSelfSignup !== undefined) {
            await instanceSettingsStore.update({ patch: { tenantSelfSignup: patch.tenantSelfSignup } })
        }
        if (patch.captchaProvider !== undefined) {
            await captchaSettings.setProvider({ provider: patch.captchaProvider })
        }
        return this.get()
    },
})

function baseDomain(): string | null {
    const configured = system.get(AppSystemProp.TENANT_BASE_DOMAIN)?.trim()
    return isNil(configured) || configured.length === 0 ? null : configured
}
