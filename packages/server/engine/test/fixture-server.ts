import http from 'node:http'
import { AddressInfo } from 'node:net'

const SVG_BODY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>'

let server: http.Server | null = null
let baseUrl = ''

export async function startFixtureServer(): Promise<string> {
    if (server !== null) {
        return baseUrl
    }
    server = http.createServer((req, res) => {
        const path = (req.url ?? '/').split('?')[0]
        if (path === '/logo.svg') {
            res.writeHead(200, { 'content-type': 'image/svg+xml' })
            res.end(SVG_BODY)
            return
        }
        if (path === '/api/v1/ok') {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
            return
        }
        if (path === '/index.html') {
            res.writeHead(200, { 'content-type': 'text/html' })
            res.end('<html><body>fixture</body></html>')
            return
        }
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ statusCode: 404, error: 'Not Found', message: 'Route not found' }))
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
    return baseUrl
}

export async function stopFixtureServer(): Promise<void> {
    if (server === null) {
        return
    }
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
    baseUrl = ''
}

export function fixtureUrl(path: string): string {
    return `${baseUrl}${path}`
}
