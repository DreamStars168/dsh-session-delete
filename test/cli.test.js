/**
 * CLI 的单测：参数解析、预演不改盘、--apply 真删并留备份。
 *
 * 跑：node test/cli.test.js
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { parseArgs, purgeSession } from '../bin/dsh-session-delete.js'
import { encodeSegment, projectKey } from '../lib/paths.js'

function makeHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsd-cli-'))
  t.after(() => { try { rmSync(home, { recursive: true, force: true }) } catch { /* ignore */ } })
  return home
}

/** 造一个含单会话 + 记账的真实目录布局。 */
function seed(home, sessionId) {
  const cwd = '/w'
  const dir = join(home, 'sessions', projectKey(cwd), encodeSegment(sessionId))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.v4.jsonl.zstd'), 'log')
  const cacheDir = join(home, 'storages', 'session_projcache', 'sessions')
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(join(cacheDir, `${sessionId}.json`), '{}')
  const workspacePath = join(home, 'storages', 'workspace.json')
  writeFileSync(workspacePath, JSON.stringify({
    tables: { workspaces: { 'ws-1': { path: '/w', sessionIds: [sessionId, 'session-keep'] } } },
    global: { archivedSessionIds: [sessionId], pinnedSessionIds: [sessionId] },
  }, null, 2))
  return { dir, cacheDir, workspacePath }
}

test('parseArgs 识别全部开关', () => {
  const args = parseArgs(['session-x', '--dsh-home', '/h', '--apply', '--json', '--keep-workspace'])
  assert.equal(args.positional[0], 'session-x')
  assert.equal(args.dshHome, '/h')
  assert.equal(args.apply, true)
  assert.equal(args.json, true)
  assert.equal(args.keepWorkspace, true)
})

test('parseArgs 识别 --list 与 --help', () => {
  assert.equal(parseArgs(['--list']).list, true)
  assert.equal(parseArgs(['-h']).help, true)
})

test('parseArgs 忽略未知长开关', () => {
  const args = parseArgs(['--verbose', 'session-y'])
  assert.deepEqual(args.positional, ['session-y'])
})

test('预演不改动任何文件', (t) => {
  const home = makeHome(t)
  const seeded = seed(home, 'session-x')
  const plan = purgeSession({ sessionId: 'session-x', dshHome: home })

  assert.equal(plan.applied, false)
  assert.equal(plan.dirs.length, 1)
  assert.equal(plan.caches.length, 1)
  assert.equal(plan.accounting.length, 3)
  assert.equal(existsSync(seeded.dir), true)
  assert.equal(existsSync(seeded.cacheDir + `\\session-x.json`) || existsSync(join(seeded.cacheDir, 'session-x.json')), true)
})

test('--apply 删除并留备份', (t) => {
  const home = makeHome(t)
  const seeded = seed(home, 'session-x')
  const plan = purgeSession({ sessionId: 'session-x', dshHome: home, apply: true })

  assert.equal(plan.applied, true)
  assert.equal(existsSync(seeded.dir), false)
  assert.equal(existsSync(join(seeded.cacheDir, 'session-x.json')), false)
  assert.ok(plan.trash && existsSync(plan.trash))
  assert.equal(existsSync(join(plan.trash, 'workspace.json.bak')), true)
  assert.equal(existsSync(join(plan.trash, 'manifest.json')), true)

  const workspace = JSON.parse(readFileSync(seeded.workspacePath, 'utf8'))
  assert.deepEqual(workspace.tables.workspaces['ws-1'].sessionIds, ['session-keep'])
  assert.deepEqual(workspace.global.archivedSessionIds, [])
  assert.deepEqual(workspace.global.pinnedSessionIds, [])
})

test('--keep-workspace 只删盘不改记账', (t) => {
  const home = makeHome(t)
  const seeded = seed(home, 'session-x')
  purgeSession({ sessionId: 'session-x', dshHome: home, apply: true, keepWorkspace: true })
  const workspace = JSON.parse(readFileSync(seeded.workspacePath, 'utf8'))
  assert.deepEqual(workspace.tables.workspaces['ws-1'].sessionIds, ['session-x', 'session-keep'])
})

test('不存在的会话返回空清单', (t) => {
  const home = makeHome(t)
  const plan = purgeSession({ sessionId: 'session-nope', dshHome: home })
  assert.deepEqual(plan.dirs, [])
  assert.deepEqual(plan.caches, [])
})
