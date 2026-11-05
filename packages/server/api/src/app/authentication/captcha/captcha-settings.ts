import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { CaptchaProvider } from '@fema-ipaas/shared'
import { z } from 'zod'
import { repoFactory } from '../../core/db/repo-factory'
import { FlagEntity } from '../../flags/flag.entity'
import { turnstile } from '../lib/turnstile'

const flagRepo = repoFactory(FlagEntity)

async function getProvider(): Promise<CaptchaProvider> {
    const stored = await readStoredProvider()
    if (!turnstile.isConfigured()) {
        return CaptchaProvider.BUILTIN
    }
    return stored === CaptchaProvider.BUILTIN ? CaptchaProvider.BUILTIN : CaptchaProvider.TURNSTILE
}

async function setProvider({ provider }: SetProviderParams): Promise<CaptchaProvider> {
    if (provider === CaptchaProvider.TURNSTILE && !turnstile.isConfigured()) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'turnstileNotConfigured' },
        })
    }
    await flagRepo().save({ id: CAPTCHA_SETTINGS_FLAG_ID, value: provider })
    return getProvider()
}

async function readStoredProvider(): Promise<CaptchaProvider | null> {
    const flag = await flagRepo().findOneBy({ id: CAPTCHA_SETTINGS_FLAG_ID })
    if (isNil(flag)) {
        return null
    }
    const parsed = z.enum(CaptchaProvider).safeParse(flag.value)
    return parsed.success ? parsed.data : null
}

const CAPTCHA_SETTINGS_FLAG_ID = 'CAPTCHA_SETTINGS'

export const captchaSettings = {
    getProvider,
    setProvider,
}

type SetProviderParams = {
    provider: CaptchaProvider
}
