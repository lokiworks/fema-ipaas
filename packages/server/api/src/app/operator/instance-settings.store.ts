import { isNil } from '@fema-ipaas/core-utils'
import dayjs from 'dayjs'
import { z } from 'zod'
import { repoFactory } from '../core/db/repo-factory'
import { FlagEntity } from '../flags/flag.entity'

const flagRepo = repoFactory(FlagEntity)

const StoredInstanceSettings = z.object({
    tenantSelfSignup: z.boolean().default(false),
})
type StoredInstanceSettings = z.infer<typeof StoredInstanceSettings>

async function get(): Promise<StoredInstanceSettings> {
    const row = await flagRepo().findOneBy({ id: INSTANCE_SETTINGS_FLAG_ID })
    const parsed = StoredInstanceSettings.safeParse(isNil(row) ? {} : row.value)
    return parsed.success ? parsed.data : StoredInstanceSettings.parse({})
}

async function update({ patch }: { patch: Partial<StoredInstanceSettings> }): Promise<StoredInstanceSettings> {
    const current = await get()
    const next: StoredInstanceSettings = {
        tenantSelfSignup: patch.tenantSelfSignup ?? current.tenantSelfSignup,
    }
    const now = dayjs().toISOString()
    await flagRepo().save({ id: INSTANCE_SETTINGS_FLAG_ID, value: next, created: now, updated: now })
    return next
}

export const instanceSettingsStore = {
    get,
    update,
}

const INSTANCE_SETTINGS_FLAG_ID = 'INSTANCE_SETTINGS'
