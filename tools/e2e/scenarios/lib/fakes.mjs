import http from 'node:http'
import net from 'node:net'

export function createFakeSmtp({ port }) {
  let server = null
  let mode = 'accept'
  const received = []
  const handle = (socket) => {
    let buffer = ''
    let inData = false
    let current = { to: [], data: '' }
    socket.write('220 fake.smtp ESMTP\r\n')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index = buffer.indexOf('\r\n')
      while (index >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (inData) {
          if (line === '.') {
            inData = false
            received.push(current)
            current = { to: [], data: '' }
            socket.write('250 2.0.0 queued\r\n')
          } else {
            current.data += `${line}\n`
          }
        } else if (/^EHLO/i.test(line)) {
          socket.write('250-fake.smtp\r\n250 AUTH PLAIN LOGIN\r\n')
        } else if (/^AUTH/i.test(line)) {
          socket.write(mode === 'accept' ? '235 2.7.0 Authentication successful\r\n' : '535 5.7.8 Authentication failed\r\n')
        } else if (/^MAIL FROM/i.test(line)) {
          socket.write('250 ok\r\n')
        } else if (/^RCPT TO/i.test(line)) {
          current.to.push(line.slice(8))
          socket.write('250 ok\r\n')
        } else if (/^DATA/i.test(line)) {
          inData = true
          socket.write('354 go ahead\r\n')
        } else if (/^QUIT/i.test(line)) {
          socket.write('221 bye\r\n')
          socket.end()
        } else {
          socket.write('250 ok\r\n')
        }
        index = buffer.indexOf('\r\n')
      }
    })
    socket.on('error', () => undefined)
  }
  return {
    start: () => new Promise((resolve) => {
      server = net.createServer(handle)
      server.listen(port, '127.0.0.1', resolve)
    }),
    close: () => new Promise((resolve) => {
      if (!server) {
        resolve()
        return
      }
      server.close(() => resolve())
      server.closeAllConnections?.()
      server = null
    }),
    setMode: (next) => {
      mode = next
    },
    messages: () => received,
  }
}

export function createFakeRegistry({ port }) {
  let server = null
  let mode = 'ok'
  return {
    start: () => new Promise((resolve) => {
      server = http.createServer((request, response) => {
        if (mode === 'notfound') {
          response.writeHead(404).end('not found')
          return
        }
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(mode === 'notarray' ? '{"hello":"world"}' : '[]')
      })
      server.listen(port, '127.0.0.1', resolve)
    }),
    close: () => new Promise((resolve) => {
      if (!server) {
        resolve()
        return
      }
      server.close(() => resolve())
      server.closeAllConnections?.()
      server = null
    }),
    setMode: (next) => {
      mode = next
    },
  }
}

export function createFakeS3({ port, bucket, accessKeyId }) {
  const objects = new Map()
  let server = null
  const requests = []
  return {
    start: () => new Promise((resolve) => {
      server = http.createServer((request, response) => {
        const chunks = []
        request.on('data', (chunk) => chunks.push(chunk))
        request.on('end', () => {
          const body = Buffer.concat(chunks)
          const url = new URL(request.url ?? '/', 'http://localhost')
          requests.push(`${request.method} ${url.pathname}${url.search}`)
          const credential = /Credential=([^/]+)\//.exec(String(request.headers.authorization ?? ''))?.[1]
          if (credential !== accessKeyId) {
            response.writeHead(403, { 'content-type': 'application/xml' })
            response.end('<?xml version="1.0"?><Error><Code>InvalidAccessKeyId</Code><Message>The access key does not exist</Message></Error>')
            return
          }
          const [, requestBucket, ...rest] = url.pathname.split('/')
          if (requestBucket !== bucket) {
            response.writeHead(404, { 'content-type': 'application/xml' })
            response.end('<?xml version="1.0"?><Error><Code>NoSuchBucket</Code><Message>The bucket does not exist</Message></Error>')
            return
          }
          const key = decodeURIComponent(rest.join('/'))
          if (request.method === 'POST' && url.searchParams.has('delete')) {
            const keys = [...body.toString('utf8').matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1])
            keys.forEach((entry) => objects.delete(entry))
            response.writeHead(200, { 'content-type': 'application/xml' })
            response.end(`<?xml version="1.0"?><DeleteResult>${keys.map((entry) => `<Deleted><Key>${entry}</Key></Deleted>`).join('')}</DeleteResult>`)
            return
          }
          if (request.method === 'PUT') {
            objects.set(key, body)
            response.writeHead(200, { ETag: '"fake"' })
            response.end()
            return
          }
          if (request.method === 'DELETE') {
            objects.delete(key)
            response.writeHead(204)
            response.end()
            return
          }
          const found = objects.get(key)
          if (found === undefined) {
            response.writeHead(404, { 'content-type': 'application/xml' })
            response.end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>')
            return
          }
          response.writeHead(200, { 'content-length': found.length, ETag: '"fake"' })
          response.end(request.method === 'HEAD' ? undefined : found)
        })
      })
      server.listen(port, '127.0.0.1', resolve)
    }),
    close: () => new Promise((resolve) => {
      if (!server) {
        resolve()
        return
      }
      server.close(() => resolve())
      server.closeAllConnections?.()
      server = null
    }),
    keys: () => [...objects.keys()],
    sizeOf: (key) => objects.get(key)?.length ?? null,
    requests: () => requests,
  }
}
