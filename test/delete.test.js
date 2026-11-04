/**
 * 删除主流程的单测 —— 全部在临时目录里跑，不碰真实 $DSH_HOME。
 *
 * 跑：node test/delete.test.js
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  collectTree,
  deleteSessionDeep,
  projectionCacheCandidates,
  removeTree,
  sessionDirOf,
} from '../lib/delete.js'
import { encodeSegment, projectKey } from '../lib/paths.js'

/** 造一个隔离的 DSH 主目录，并在测试结束时删掉。 */
function makeHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsd-test-'))
  t.after(() => { try { rmSync(home, { recursive: true, force: true }) } catch { /* 清理失败不影响结论 */ } })
  return home
}

/** 用最小实现模拟 Cordis 的服务容器。 */
function makeCtx(services = {}) {
  return {
    get(name) { return services[name] },
    config: {},
    effect(fn) { return fn() },
  }
}

test('collectTree 顺着 parentSession 收集子孙', async () => {
  const ctx = makeCtx({
    sessionPersistence: {
      list: async () => [
        { header: { id: 'session-root', cwd: '/w' } },
        { header: { id: 'session-a', cwd: '/w', parentSession: 'session-root' } },
        { header: { id: 'session-b', cwd: '/w', parentSession: 'session-a' } },
        { header: { id: 'session-other', cwd: '/w' } },
      ],
    },
  })
  const { ids } = await collectTree(ctx, 'session-root')
  assert.deepEqual(ids, ['session-root', 'session-a', 'session-b'])
})

test('collectTree 防环', async () => {
  const ctx = makeCtx({
    sessionPersistence: {
      list: async () => [
        { header: { id: 'session-a', parentSession: 'session-b' } },
        { header: { id: 'session-b', parentSession: 'session-a' } },
      ],
    },
  })
  const { ids } = await collectTree(ctx, 'session-a')
  assert.deepEqual(ids, ['session-a', 'session-b'])
})

test('collectTree 合并活跃会话头', async () => {
  const ctx = makeCtx({
    sessionPersistence: { list: async () => [{ header: { id: 'session-root' } }] },
    sessions: { list: () => [{ header: { id: 'session-child', parentSession: 'session-root' } }] },
  })
  const { ids } = await collectTree(ctx, 'session-root')
  assert.deepEqual(ids, ['session-root', 'session-child'])
})

test('collectTree 持久化不可读时降级', async () => {
  const ctx = makeCtx({ sessionPersistence: { list: async () => { throw new Error('boom') } } })
  const { ids } = await collectTree(ctx, 'session-root')
  assert.deepEqual(ids, ['session-root'])
})

test('sessionDirOf 优先用后端 locate()', () => {
  const ctx = makeCtx({
    sessionPersistence: {
      /* 用本平台的 join 拼，避免 Windows 与 POSIX 分隔符差异影响断言。 */
      locate: () => ({ path: join('/data/sessions/--w--/session-x', 'session.v4.jsonl.zstd') }),
    },
  })
  assert.equal(sessionDirOf(ctx, 'session-x', { cwd: '/w' }), join('/data/sessions/--w--/session-x'))
})

test('sessionDirOf 后端抛错时按命名规则兜底', () => {
  const ctx = makeCtx({
    sessionPersistence: {
      root: '/root/sessions',
      locate: () => { throw new Error('nope') },
    },
  })
  const dir = sessionDirOf(ctx, 'session-x', { cwd: '/w' })
  assert.equal(dir, join('/root/sessions', projectKey('/w'), encodeSegment('session-x')))
})

test('sessionDirOf 无 cwd 时返回 null', () => {
  assert.equal(sessionDirOf(makeCtx(), 'session-x', {}), null)
})

test('projectionCacheCandidates 覆盖两种前缀拼写', () => {
  const list = projectionCacheCandidates('session-abc', { DSH_HOME: '/h' })
  assert.ok(list.some((path) => path.endsWith('session-abc.json')))
  assert.ok(list.some((path) => path.endsWith('abc.json')))
  assert.ok(list.some((path) => path.endsWith('.json.tmp')))
})

test('removeTree 只删真实目录', (t) => {
  const home = makeHome(t)
  const dir = join(home, 'd')
  mkdirSync(dir)
  assert.equal(removeTree(dir), true)
  assert.equal(existsSync(dir), false)

  const file = join(home, 'f.txt')
  writeFileSync(file, 'x')
  assert.equal(removeTree(file), false)
  assert.equal(existsSync(file), true)
  assert.equal(removeTree(null), false)
  assert.equal(removeTree(join(home, 'missing')), false)
})

test('deleteSessionDeep 清掉日志目录、缓存、记账与子会话', async (t) => {
  const home = makeHome(t)
  const cwd = '/work/proj'
  const projectDir = join(home, 'sessions', projectKey(cwd))
  const rootDir = join(projectDir, encodeSegment('session-root'))
  const childDir = join(projectDir, encodeSegment('session-child'))
  const cacheDir = join(home, 'storages', 'session_projcache', 'sessions')
  mkdirSync(rootDir, { recursive: true })
  mkdirSync(childDir, { recursive: true })
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(join(rootDir, 'session.v4.jsonl.zstd'), 'log')
  writeFileSync(join(childDir, 'session.v4.jsonl.zstd'), 'log')
  writeFileSync(join(cacheDir, 'session-root.json'), '{}')
  writeFileSync(join(cacheDir, 'session-child.json'), '{}')
  /* 无关键：别的会话必须活下来。 */
  const keepDir = join(projectDir, encodeSegment('session-keep'))
  mkdirSync(keepDir, { recursive: true })
  writeFileSync(join(keepDir, 'session.v4.jsonl.zstd'), 'keep')
  writeFileSync(join(cacheDir, 'session-keep.json'), '{}')

  const detached = []
  const ctx = makeCtx({
    sessionPersistence: {
      root: join(home, 'sessions'),
      list: async () => [
        { header: { id: 'session-root', cwd } },
        { header: { id: 'session-child', cwd, parentSession: 'session-root' } },
        { header: { id: 'session-keep', cwd } },
      ],
    },
    workspaceRegistry: {
      list: () => [{ sessionIds: ['session-root', 'session-keep'], detachSession: async (id) => { detached.push(id) } }],
      archivedSessionIds: ['session-root'],
      pinnedSessionIds: ['session-child'],
      unarchiveSession: async () => {},
      unpinSession: async () => {},
    },
  })

  const report = await deleteSessionDeep(ctx, 'session-root', { env: { DSH_HOME: home } })

  assert.equal(report.ok, true)
  assert.deepEqual(report.deleted, ['session-root', 'session-child'])
  assert.equal(existsSync(rootDir), false)
  assert.equal(existsSync(childDir), false)
  assert.equal(existsSync(keepDir), true)
  assert.equal(existsSync(join(cacheDir, 'session-root.json')), false)
  assert.equal(existsSync(join(cacheDir, 'session-child.json')), false)
  assert.equal(existsSync(join(cacheDir, 'session-keep.json')), true)
  assert.deepEqual(detached, ['session-root'])
  assert.deepEqual(report.errors, [])
})

test('deleteSessionDeep 拒绝空 id', async () => {
  const report = await deleteSessionDeep(makeCtx(), '')
  assert.equal(report.ok, false)
  assert.match(report.error, /sessionId required/)
})

test('deleteSessionDeep 记录单点失败但不中断', async (t) => {
  const home = makeHome(t)
  const cwd = '/w'
  const dir = join(home, 'sessions', projectKey(cwd), encodeSegment('session-x'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.v4.jsonl.zstd'), 'log')

  const ctx = makeCtx({
    sessionPersistence: {
      root: join(home, 'sessions'),
      list: async () => [{ header: { id: 'session-x', cwd } }],
    },
    agents: { get: () => { throw new Error('agent down') } },
  })
  const report = await deleteSessionDeep(ctx, 'session-x', { env: { DSH_HOME: home } })
  assert.equal(report.ok, true)
  assert.equal(report.errors.length, 1)
  assert.match(report.errors[0], /cancel session-x/)
  assert.equal(existsSync(dir), false)
})

test('deleteSessionDeep 按 stripWorkspace=false 保留记账', async (t) => {
  const home = makeHome(t)
  const cwd = '/w'
  mkdirSync(join(home, 'sessions', projectKey(cwd), encodeSegment('session-x')), { recursive: true })
  const detached = []
  const ctx = makeCtx({
    sessionPersistence: {
      root: join(home, 'sessions'),
      list: async () => [{ header: { id: 'session-x', cwd } }],
    },
    workspaceRegistry: {
      list: () => [{ sessionIds: ['session-x'], detachSession: async (id) => { detached.push(id) } }],
      archivedSessionIds: [],
      pinnedSessionIds: [],
    },
  })
  await deleteSessionDeep(ctx, 'session-x', { stripWorkspace: false, env: { DSH_HOME: home } })
  assert.deepEqual(detached, [])
})

test('deleteSessionDeep 清掉变空的项目目录但保留有内容的', async (t) => {
  const home = makeHome(t)
  const soloCwd = '/solo'
  const mixedCwd = '/mixed'
  const soloDir = join(home, 'sessions', projectKey(soloCwd), encodeSegment('session-solo'))
  const mixedDir = join(home, 'sessions', projectKey(mixedCwd), encodeSegment('session-mixed'))
  mkdirSync(soloDir, { recursive: true })
  mkdirSync(mixedDir, { recursive: true })
  mkdirSync(join(home, 'sessions', projectKey(mixedCwd), encodeSegment('session-other')), { recursive: true })

  const ctx = makeCtx({
    sessionPersistence: {
      root: join(home, 'sessions'),
      list: async () => [
        { header: { id: 'session-solo', cwd: soloCwd } },
        { header: { id: 'session-mixed', cwd: mixedCwd } },
      ],
    },
  })
  await deleteSessionDeep(ctx, 'session-solo', { env: { DSH_HOME: home } })
  await deleteSessionDeep(ctx, 'session-mixed', { env: { DSH_HOME: home } })

  assert.equal(existsSync(join(home, 'sessions', projectKey(soloCwd))), false)
  assert.equal(existsSync(join(home, 'sessions', projectKey(mixedCwd))), true)
})

test('deleteSessionDeep 不动 attachments 仓库', async (t) => {
  const home = makeHome(t)
  const cwd = '/w'
  const attachment = join(home, 'attachments', 'ab', 'abcd.png')
  mkdirSync(join(home, 'attachments', 'ab'), { recursive: true })
  writeFileSync(attachment, 'img')
  mkdirSync(join(home, 'sessions', projectKey(cwd), encodeSegment('session-x')), { recursive: true })

  const ctx = makeCtx({
    sessionPersistence: {
      root: join(home, 'sessions'),
      list: async () => [{ header: { id: 'session-x', cwd } }],
    },
  })
  await deleteSessionDeep(ctx, 'session-x', { env: { DSH_HOME: home } })
  assert.equal(existsSync(attachment), true)
  assert.equal(readFileSync(attachment, 'utf8'), 'img')
})
