/**
 * HTTP 桥的单测：鉴权闸门、方法限制、请求体上限、错误映射。
 *
 * 跑：node test/server.test.js
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createHandler, isTrustedRequest } from '../lib/server.js'
import { encodeSegment, projectKey } from '../lib/paths.js'

function makeHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsd-srv-'))
  t.after(() => { try { rmSync(home, { recursive: true, force: true }) } catch { /* ignore */ } })
  return home
}

/** 模拟一次请求/响应往返，返回状态码与解析后的响应体。 */
function invoke(handler, { method = 'POST', body = '', headers = {}, remoteAddress = '127.0.0.1' } = {}) {
  return new Promise((resolvePromise, reject) => {
    const listeners = new Map()
    const req = {
      method,
      headers,
      socket: { remoteAddress },
      on(event, fn) { listeners.set(event, fn); return req },
      destroy() {},
    }
    const res = {
      statusCode: 0,
      headers: null,
      payload: '',
      writeHead(status, head) { res.statusCode = status; res.headers = head },
      end(chunk) {
        res.payload = String(chunk ?? '')
        resolvePromise({ status: res.statusCode, headers: res.headers, body: res.payload ? JSON.parse(res.payload) : null })
      },
    }
    handler(req, res).catch(reject)
    queueMicrotask(() => {
      if (body) listeners.get('data')?.(Buffer.from(body))
      listeners.get('end')?.()
    })
  })
}

const local = { host: '127.0.0.1:8080' }

test('isTrustedRequest 放行回环对端', () => {
  assert.equal(isTrustedRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), true)
  assert.equal(isTrustedRequest({ socket: { remoteAddress: '::1' }, headers: {} }), true)
  assert.equal(isTrustedRequest({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: {} }), true)
})

test('isTrustedRequest 放行 localhost 同源', () => {
  assert.equal(isTrustedRequest({ socket: { remoteAddress: '10.0.0.5' }, headers: { host: 'localhost:8080', origin: 'http://localhost:8080' } }), true)
})

test('isTrustedRequest 放行 Electron app: 来源', () => {
  assert.equal(isTrustedRequest({ socket: { remoteAddress: '10.0.0.5' }, headers: { host: 'localhost:8080', origin: 'app://dsh' } }), true)
})

test('isTrustedRequest 拒绝跨源', () => {
  assert.equal(isTrustedRequest({ socket: { remoteAddress: '10.0.0.5' }, headers: { host: 'localhost:8080', origin: 'https://evil.example' } }), false)
  assert.equal(isTrustedRequest({ socket: { remoteAddress: '10.0.0.5' }, headers: { host: 'dsh.local' } }), false)
})

test('handler 拒绝非 POST', async () => {
  const result = await invoke(createHandler({}), { method: 'GET', headers: local })
  assert.equal(result.status, 405)
})

test('handler 拒绝跨源请求', async () => {
  const result = await invoke(createHandler({}), {
    headers: { host: 'localhost:8080', origin: 'https://evil.example' },
    remoteAddress: '10.0.0.5',
  })
  assert.equal(result.status, 403)
})

test('handler 拒绝未知 op', async () => {
  const result = await invoke(createHandler({}), { body: JSON.stringify({ op: 'nuke' }), headers: local })
  assert.equal(result.status, 400)
  assert.match(result.body.error, /unknown op/)
})

test('handler 拒绝超大请求体', async () => {
  const handler = createHandler({})
  const huge = JSON.stringify({ sessionId: 'x'.repeat(70 * 1024) })
  /* handler 内部把读取失败收成 400，不会让异常冒泡到 HTTP 层。 */
  const result = await invoke(handler, { body: huge, headers: local })
  assert.equal(result.status, 400)
  assert.match(result.body.error, /too large/)
})

test('handler 删除成功返回明细', async (t) => {
  const home = makeHome(t)
  const cwd = '/w'
  mkdirSync(join(home, 'sessions', projectKey(cwd), encodeSegment('session-x')), { recursive: true })
  const ctx = {
    get: (name) => (name === 'sessionPersistence'
      ? { root: join(home, 'sessions'), list: async () => [{ header: { id: 'session-x', cwd } }] }
      : undefined),
  }
  process.env.DSH_HOME = home
  t.after(() => { delete process.env.DSH_HOME })

  const result = await invoke(createHandler(ctx), {
    body: JSON.stringify({ op: 'delete', sessionId: 'session-x' }),
    headers: local,
  })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.deepEqual(result.body.deleted, ['session-x'])
})

test('handler 缺少 sessionId 时返回失败明细', async () => {
  const result = await invoke(createHandler({}), { body: '{}', headers: local })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, false)
})

test('handler 把非法 JSON 映射成 400', async () => {
  const result = await invoke(createHandler({}), { body: '{oops', headers: local })
  assert.equal(result.status, 400)
  assert.match(result.body.error, /JSON/)
})
