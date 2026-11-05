import { FlagId } from '@fema-ipaas/shared'
import { captchaSettings } from '../authentication/captcha/captcha-settings'
import { smsSettingsService } from '../authentication/sms/sms-settings.service'
import { repoFactory } from '../core/db/repo-factory'
import { platformLoginAppsService } from '../sso/platform-login-apps.service'
import { TenantEntity } from '../tenant/tenant.entity'
import { instanceSettingsStore } from './instance-settings.store'

const tenantRepo = repoFactory(TenantEntity)

async function compute(): Promise<Array<{ id: FlagId, value: string | boolean | string[] }>> {
    const [tenantCount, settings, smsAvailable, captchaProvider, platformApps] = await Promise.all([
        tenantRepo().count(),
        instanceSettingsStore.get(),
        smsSettingsService.isAvailable(),
        captchaSettings.getProvider(),
        platformLoginAppsService.listEnabledKinds(),
    ])
    return [
        { id: FlagId.MULTI_TENANT, value: tenantCount > 1 },
        { id: FlagId.TENANT_SELF_SIGNUP_ENABLED, value: settings.tenantSelfSignup },
        { id: FlagId.SMS_AUTH_AVAILABLE, value: smsAvailable },
        { id: FlagId.CAPTCHA_PROVIDER, value: captchaProvider },
        { id: FlagId.PLATFORM_LOGIN_APPS, value: platformApps },
    ]
}

export const instanceFlags = {
    compute,
}
