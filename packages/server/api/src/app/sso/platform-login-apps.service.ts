import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import {
    PlatformLoginAppKind,
    PlatformLoginAppPublic,
    SsoEncryptedSecret,
    SsoRegion,
    UpdatePlatformLoginAppRequestBody,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { z } from 'zod'
import { repoFactory } from '../core/db/repo-factory'
import { FlagEntity } from '../flags/flag.entity'
import { encryptUtils } from '../helper/encryption'

const flagRepo = repoFactory(FlagEntity)

export const platformLoginAppsService = {
    async listPublic(): Promise<PlatformLoginAppPublic[]> {
        const stored = await load()
        return stored.apps.map(toPublic)
    },

    async listEnabledKinds(): Promise<PlatformLoginAppKind[]> {
        const stored = await load()
        return stored.apps.filter((app) => app.enabled).map((app) => app.kind)
    },

    async getRuntime({ kind }: { kind: PlatformLoginAppKind }): Promise<PlatformLoginAppRuntime | null> {
        const stored = await load()
        const app = stored.apps.find((candidate) => candidate.kind === kind && candidate.enabled)
        if (isNil(app)) {
            return null
        }
        return {
            kind: app.kind,
            appId: app.appId,
            appSecret: await encryptUtils.decryptString(app.appSecret),
            region: toRegion({ region: app.region }),
            allowSelfSignup: app.allowSelfSignup,
        }
    },

    async save({ kind, request }: SaveParams): Promise<PlatformLoginAppPublic[]> {
        const stored = await load()
        const previous = stored.apps.find((app) => app.kind === kind) ?? null
        if (isNil(previous) && isNil(request.appSecret)) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'A client secret is required' } })
        }
        const appSecret = isNil(request.appSecret) ? previous?.appSecret : await encryptUtils.encryptString(request.appSecret)
        if (isNil(appSecret)) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'A client secret is required' } })
        }
        const next: StoredPlatformLoginApp = {
            kind,
            enabled: request.enabled,
            appId: request.appId,
            appSecret,
            region: kind === 'FEISHU' ? toRegion({ region: request.region }) : null,
            allowSelfSignup: request.allowSelfSignup,
        }
        const apps = [...stored.apps.filter((app) => app.kind !== kind), next]
        await persist({ apps })
        return apps.map(toPublic)
    },

    async remove({ kind }: { kind: PlatformLoginAppKind }): Promise<PlatformLoginAppPublic[]> {
        const stored = await load()
        const apps = stored.apps.filter((app) => app.kind !== kind)
        await persist({ apps })
        return apps.map(toPublic)
    },

    async rotateSecrets(): Promise<number> {
        const stored = await load()
        const rotated = await Promise.all(stored.apps.map(async (app) => {
            if (await encryptUtils.isEncryptedWithCurrentKey(app.appSecret)) {
                return { app, changed: false }
            }
            const appSecret = await encryptUtils.encryptString(await encryptUtils.decryptString(app.appSecret))
            return { app: { ...app, appSecret }, changed: true }
        }))
        const changed = rotated.filter((entry) => entry.changed).length
        if (changed > 0) {
            await persist({ apps: rotated.map((entry) => entry.app) })
        }
        return changed
    },
}

async function load(): Promise<StoredPlatformLoginApps> {
    const row = await flagRepo().findOneBy({ id: PLATFORM_LOGIN_CONFIG_FLAG_ID })
    const parsed = StoredPlatformLoginApps.safeParse(isNil(row) ? {} : row.value)
    return parsed.success ? parsed.data : { apps: [] }
}

async function persist({ apps }: { apps: StoredPlatformLoginApp[] }): Promise<void> {
    const now = dayjs().toISOString()
    await flagRepo().save({ id: PLATFORM_LOGIN_CONFIG_FLAG_ID, value: { apps }, created: now, updated: now })
}

function toPublic(app: StoredPlatformLoginApp): PlatformLoginAppPublic {
    return {
        kind: app.kind,
        enabled: app.enabled,
        appId: app.appId,
        hasAppSecret: true,
        region: app.region,
        allowSelfSignup: app.allowSelfSignup,
    }
}

function toRegion({ region }: { region: string | null | undefined }): SsoRegion {
    return region === SsoRegion.LARK ? SsoRegion.LARK : SsoRegion.FEISHU
}

const PLATFORM_LOGIN_CONFIG_FLAG_ID = 'PLATFORM_LOGIN_CONFIG'

const StoredPlatformLoginApp = z.object({
    kind: PlatformLoginAppKind,
    enabled: z.boolean(),
    appId: z.string(),
    appSecret: SsoEncryptedSecret,
    region: z.string().nullable(),
    allowSelfSignup: z.boolean(),
})
type StoredPlatformLoginApp = z.infer<typeof StoredPlatformLoginApp>

const StoredPlatformLoginApps = z.object({
    apps: z.array(StoredPlatformLoginApp).default([]),
})
type StoredPlatformLoginApps = z.infer<typeof StoredPlatformLoginApps>

export type PlatformLoginAppRuntime = {
    kind: PlatformLoginAppKind
    appId: string
    appSecret: string
    region: SsoRegion
    allowSelfSignup: boolean
}

type SaveParams = {
    kind: PlatformLoginAppKind
    request: UpdatePlatformLoginAppRequestBody
}
