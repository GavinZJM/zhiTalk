/**
 * Force Node fetch through an HTTP proxy (no extra deps).
 * Usage: ZJMTALK_HTTPS_PROXY=http://127.0.0.1:7890 node -r ./scripts/proxy-preload.js dist/agent/cli.js
 */
const http = require('http')
const https = require('https')
const { URL } = require('url')

const PROXY =
  process.env.ZJMTALK_HTTPS_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  'http://127.0.0.1:7890'
const proxyUrl = new URL(PROXY)

function connectViaProxy(targetUrl) {
  const target = new URL(targetUrl)
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxyUrl.hostname,
      port: Number(proxyUrl.port) || 80,
      method: 'CONNECT',
      path: `${target.hostname}:443`,
      headers: { Host: `${target.hostname}:443` },
    })
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        reject(new Error(`PROXY CONNECT ${res.statusCode}`))
        socket.destroy()
        return
      }
      resolve(socket)
    })
    req.on('error', reject)
    req.end()
  })
}

function flattenHeaders(headers) {
  const flat = {}
  if (!headers) return flat

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => {
      flat[key] = value
    })
    return flat
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry) && entry.length >= 2) {
        flat[String(entry[0])] = String(entry[1])
      }
    }
    return flat
  }

  if (typeof headers.forEach === 'function') {
    headers.forEach((value, key) => {
      flat[key] = value
    })
    return flat
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue
    flat[key] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return flat
}

async function normalizeBody(body) {
  if (body == null) return undefined
  if (typeof body === 'string' || Buffer.isBuffer(body)) return body
  if (typeof body.getReader === 'function') {
    const reader = body.getReader()
    const chunks = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks)
  }
  if (typeof body === 'object' && typeof body.arrayBuffer === 'function') {
    return Buffer.from(await body.arrayBuffer())
  }
  return Buffer.from(await new Response(body).arrayBuffer())
}

const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url
  if (!url.startsWith('https://')) {
    return originalFetch(input, init)
  }

  const target = new URL(url)
  const socket = await connectViaProxy(url)
  const flat = flattenHeaders(init.headers)
  const body = await normalizeBody(init.body)

  if (body && !flat['content-length'] && !flat['Content-Length']) {
    flat['Content-Length'] = String(Buffer.byteLength(body))
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: target.hostname,
        path: target.pathname + target.search,
        method: init.method || 'GET',
        headers: flat,
        socket,
        servername: target.hostname,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          resolve(
            new Response(buf, {
              status: res.statusCode || 500,
              statusText: res.statusMessage || '',
              headers: res.headers,
            }),
          )
        })
      },
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

console.error('[proxy-preload] fetch ->', PROXY)
