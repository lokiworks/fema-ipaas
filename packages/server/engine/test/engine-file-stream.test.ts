import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { tryCatch } from '@fema-ipaas/core-utils'
import { FileType } from '@fema-ipaas/connector-types'
import { engineFileApi } from '../src/lib/api/engine-file-api'

it('streams the first bytes before producing the rest and uploads only once', async () => {
    let continueStream: () => void = () => undefined
    const released = new Promise<void>((resolve) => { continueStream = resolve })
    let requests = 0
    let received = ''
    let length: string | undefined
    const server = createServer((request, response) => {
        requests++
        length = request.headers['content-length']
        request.setEncoding('utf8')
        request.on('data', (chunk: string) => { received += chunk; continueStream() })
        request.on('end', () => { response.setHeader('x-ap-file-read-url', 'https://example.com/read'); response.end('{}') })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
        const address = server.address()
        if (!address || typeof address === 'string') throw new Error('Missing HTTP address')
        const data = Readable.from((async function* () { yield Buffer.from('first'); await released; yield Buffer.from('second') })())
        const { data: uploaded, error } = await tryCatch(() => engineFileApi.upload({ apiUrl: `http://127.0.0.1:${address.port}/`, engineToken: 'token', fileId: 'stream', type: FileType.EXECUTION_LOG, data }))
        if (error) throw error
        expect(uploaded).toEqual({ fileId: 'stream', readUrl: 'https://example.com/read' })
        expect(received).toBe('firstsecond')
        expect(length).toBeUndefined()
        expect(requests).toBe(1)
    }
    finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
})
