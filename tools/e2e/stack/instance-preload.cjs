const dns = require('node:dns')
const fs = require('node:fs')
const path = require('node:path')

const IP_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i

function reachableOffline(hostname) {
  return hostname === 'localhost' || IP_LITERAL.test(hostname)
}

if (process.env.E2E_OFFLINE === '1') {
  const originalLookup = dns.lookup
  dns.lookup = function lookup(hostname, options, callback) {
    const done = typeof options === 'function' ? options : callback
    const settings = typeof options === 'function' ? {} : options
    if (!reachableOffline(hostname)) {
      const error = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
        code: 'ENOTFOUND',
        errno: -3008,
        syscall: 'getaddrinfo',
        hostname,
      })
      process.nextTick(done, error)
      return {}
    }
    return originalLookup.call(dns, hostname, settings, done)
  }
}

if (process.env.E2E_FAKE_VERSION) {
  const manifest = path.resolve(process.cwd(), 'package.json')
  const originalRead = fs.readFileSync
  fs.readFileSync = function readFileSync(target, ...rest) {
    const content = originalRead.call(fs, target, ...rest)
    if (typeof target === 'string' && path.resolve(target) === manifest && typeof content === 'string') {
      return JSON.stringify({ ...JSON.parse(content), version: process.env.E2E_FAKE_VERSION })
    }
    return content
  }
}
