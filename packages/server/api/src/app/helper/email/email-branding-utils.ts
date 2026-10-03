import { isNil } from '@fema-ipaas/core-utils'
import { DefaultProjectRole } from '@fema-ipaas/shared'
import tinycolor from 'tinycolor2'

function lightTint({ primaryColor }: { primaryColor: string }): string {
    return tinycolor.mix('#ffffff', primaryColor, LIGHT_TINT_PERCENT).toHexString()
}

function usableColor({ color }: { color: string | null | undefined }): string {
    const parsed = tinycolor(color ?? '')
    return parsed.isValid() ? parsed.toHexString() : FALLBACK_PRIMARY_COLOR
}

function readableTextColor({ backgroundColor }: { backgroundColor: string }): string {
    return tinycolor.mostReadable(backgroundColor, [LIGHT_TEXT_COLOR, DARK_TEXT_COLOR]).toHexString()
}

function absoluteLogoUrl({ logoUrl, publicBaseUrl }: AbsoluteLogoUrlParams): string {
    if (isNil(logoUrl) || logoUrl.trim().length === 0) {
        return ''
    }
    const trimmed = logoUrl.trim()
    const pathOnly = trimmed.split(/[?#]/)[0].toLowerCase()
    if (pathOnly.endsWith('.svg')) {
        return ''
    }
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed
    }
    return `${publicBaseUrl.replace(/\/+$/, '')}/${trimmed.replace(/^\/+/, '')}`
}

function formatTime({ iso }: { iso: string }): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) {
        return iso
    }
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: DISPLAY_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date)
    const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? ''
    return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}（北京时间）`
}

function roleLabel({ role }: { role: string | null | undefined }): string {
    switch (role) {
        case DefaultProjectRole.ADMIN:
            return '所有者'
        case DefaultProjectRole.DEVELOPER:
            return '可编辑'
        case DefaultProjectRole.OPERATOR:
            return '值班'
        case DefaultProjectRole.VIEWER:
            return '可查看'
        default:
            return role ?? '成员'
    }
}

function truncate({ text, max }: { text: string, max: number }): string {
    const chars = Array.from(text.replace(/\s+/g, ' ').trim())
    return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`
}

const LIGHT_TINT_PERCENT = 12
const LIGHT_TEXT_COLOR = '#ffffff'
const DARK_TEXT_COLOR = '#0a0a0a'
const FALLBACK_PRIMARY_COLOR = '#2d6cdf'
const DISPLAY_TIMEZONE = 'Asia/Shanghai'

export const emailBrandingUtils = {
    lightTint,
    usableColor,
    readableTextColor,
    absoluteLogoUrl,
    formatTime,
    roleLabel,
    truncate,
}

type AbsoluteLogoUrlParams = {
    logoUrl: string | null | undefined
    publicBaseUrl: string
}
