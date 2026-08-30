import net from 'net'

const PROBE_TIMEOUT_MS = 1000

function probe({ host, port }: { host: string, port: number }): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host, port })
        const settle = (reachable: boolean) => {
            socket.destroy()
            resolve(reachable)
        }
        socket.setTimeout(PROBE_TIMEOUT_MS)
        socket.once('connect', () => settle(true))
        socket.once('timeout', () => settle(false))
        socket.once('error', () => settle(false))
    })
}

export const redisAvailability = {
    host: process.env.FEMA_REDIS_HOST ?? 'localhost',
    port: Number(process.env.FEMA_REDIS_PORT ?? '6379'),
    isReachable(): Promise<boolean> {
        return probe({ host: redisAvailability.host, port: redisAvailability.port })
    },
}
