/**
 * `/session-delete/api` 这个具名路由的全部 HTTP 细节。
 *
 * 为什么不用 `@Remote`：本包刻意保持零外部依赖（profile 的 node_modules 里
 * 解析不到官方包），具名路由是最小且稳定的接缝，全链路只碰 Cordis 服务对象。
 *
 * 这个路由会真的删盘，所以入口处做两道闸：只收 POST，且只认同源/回环请求。
 */
import { deleteSessionDeep } from './delete.js'

/** 路由路径，客户端 `client.js` 里保持同一个常量。 */
export const ROUTE = '/session-delete/api'

/** 请求体上限：这里只需要一个会话 id，64 KiB 绰绰有余。 */
const MAX_BODY_BYTES = 64 * 1024

/**
 * 判断一个请求是否来自本机界面。
 *
 * 允许的情况：
 * - 对端地址是回环（桌面端 / 本机浏览器）；
 * - Host 头指向 localhost 且 Origin 缺省、为 `null`、为 `app:`（Electron），或与 Host 同源。
 *
 * 其余一律拒，避免任意网页用 CSRF 触发删盘。
 *
 * @param {import('node:http').IncomingMessage} req 请求。
 * @returns {boolean} 是否放行。
 */
export function isTrustedRequest(req) {
  const remote = req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : ''
  const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
  const host = typeof req.headers.host === 'string' ? req.headers.host : ''
  const hostLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)
  const origin = req.headers.origin

  if (loopback) return true
  if (hostLocal) {
    if (origin === undefined || origin === '' || origin === 'null') return true
    if (typeof origin === 'string' && /^app:/i.test(origin)) return true
    try { if (new URL(origin).host === host) return true } catch { /* 继续往下判 */ }
  }
  if (typeof origin !== 'string' || origin === '') return false
  try { return new URL(origin).host === host } catch { return false }
}

/**
 * 读完请求体，超限立刻断开。
 *
 * @param {import('node:http').IncomingMessage} req 请求。
 * @returns {Promise<string>} UTF-8 文本。
 */
function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const done = (fn, arg) => { if (!settled) { settled = true; fn(arg) } }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        const error = new Error('request body too large')
        done(reject, error)
        try { req.destroy(error) } catch { /* 连接可能已断 */ }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => done(resolvePromise, Buffer.concat(chunks).toString('utf8')))
    req.on('error', (error) => done(reject, error))
  })
}

/**
 * 回一个 JSON 响应，顺手禁掉缓存。
 *
 * @param {import('node:http').ServerResponse} res 响应。
 * @param {number} status HTTP 状态码。
 * @param {unknown} value 响应体。
 */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * 构造路由 handler。
 *
 * @param {object} ctx 插件上下文。
 * @returns {(req: any, res: any) => Promise<void>} HTTP handler。
 */
export function createHandler(ctx) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'POST only' })
      return
    }
    if (!isTrustedRequest(req)) {
      sendJson(res, 403, { ok: false, error: 'cross-origin request rejected' })
      return
    }
    try {
      const raw = await readBody(req)
      const request = raw.trim() ? JSON.parse(raw) : {}
      if (request.op !== undefined && request.op !== 'delete') {
        sendJson(res, 400, { ok: false, error: 'unknown op: ' + String(request.op) })
        return
      }
      const report = await deleteSessionDeep(ctx, request.sessionId, {
        stripWorkspace: request.stripWorkspace !== false,
      })
      sendJson(res, 200, report)
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: (error && error.message) ? error.message : String(error),
      })
    }
  }
}
