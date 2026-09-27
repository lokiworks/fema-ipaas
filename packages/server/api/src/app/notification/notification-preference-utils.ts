import { isNil } from '@fema-ipaas/core-utils'
import {
    DEFAULT_NOTIFICATION_PREFERENCES,
    NOTIFICATION_PREFERENCE_EVENTS,
    NotificationChannelPreference,
    NotificationDeliveryChannel,
    NotificationPreferenceEvent,
    NotificationPreferences,
} from '@fema-ipaas/shared'

function resolve(stored: unknown): NotificationPreferences {
    const record = isRecord(stored) ? stored : {}
    return NOTIFICATION_PREFERENCE_EVENTS.reduce<NotificationPreferences>((acc, event) => ({
        ...acc,
        [event]: mergeChannels({ stored: record[event], fallback: DEFAULT_NOTIFICATION_PREFERENCES[event] }),
    }), DEFAULT_NOTIFICATION_PREFERENCES)
}

function allows({ preferences, event, channel }: AllowsParams): boolean {
    return resolve(preferences)[event][channel]
}

function mergeChannels({ stored, fallback }: { stored: unknown, fallback: NotificationChannelPreference }): NotificationChannelPreference {
    if (!isRecord(stored)) {
        return fallback
    }
    return {
        im: typeof stored['im'] === 'boolean' ? stored['im'] : fallback.im,
        email: typeof stored['email'] === 'boolean' ? stored['email'] : fallback.email,
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !isNil(value) && typeof value === 'object' && !Array.isArray(value)
}

export const notificationPreferenceUtils = {
    resolve,
    allows,
}

type AllowsParams = {
    preferences: unknown
    event: NotificationPreferenceEvent
    channel: NotificationDeliveryChannel
}
