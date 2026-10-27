import { isIP } from 'node:net'
import { tryCatch } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'

async function get(): Promise<{ address: string | null }> {
    if (cached && cached.expires > Date.now()) return { address: cached.address }
    if (pending) return pending
    pending = request()
    try {
        return await pending
    }
    finally {
        pending = null
    }
}

async function request(): Promise<{ address: string | null }> {
    const { data, error } = await tryCatch(() => safeHttp.axios.get<unknown>('https://api.ipify.org', { params: { format: 'json' }, timeout: 4000, maxRedirects: 0 }))
    const address = !error && typeof data.data === 'object' && data.data !== null && 'ip' in data.data && typeof data.data.ip === 'string' && isIP(data.data.ip) ? data.data.ip : null
    cached = { address, expires: Date.now() + (address ? 15 * 60000 : 60000) }
    return { address }
}

let cached: { address: string | null, expires: number } | null = null
let pending: Promise<{ address: string | null }> | null = null
export const outboundIp = { get }
