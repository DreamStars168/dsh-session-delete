#!/usr/bin/env node
/**
 * dsh-session-delete CLI —— 宿主没启动时也能从文件层清掉一个会话。
 *
 * 默认预演（只列路径与记账命中，不改任何文件），加 `--apply` 才真动手；
 * 动手前把 `workspace.json` 备份到 `$DSH_HOME/_trash/session-delete-<时间戳>/`。
 *
 * 用法：
 *   dsh-session-delete <sessionId> [--dsh-home <dir>] [--apply] [--json]
 *   dsh-session-delete --list [--dsh-home <dir>]
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { encodeSegment } from '../lib/paths.js'

const USAGE = `用法:
  dsh-session-delete <sessionId> [选项]   删除一个会话（默认只预演）
  dsh-session-delete --list [选项]        列出磁盘上所有会话 id

选项:
  --dsh-home <dir>   指定 DSH 主目录（默认 $DSH_HOME 或 ~/.dsh）
  --apply            真正执行删除（不带时只预演）
  --keep-workspace   保留 workspace.json 里的会话记账，只删磁盘
  --json             以 JSON 输出结果，便于脚本消费
  -h, --help         显示本帮助`

/**
 * 极简参数解析：只认已知开关，其余位置参数当会话 id。
 *
 * @param {string[]} argv `process.argv.slice(2)`。
 * @returns {Record<string, unknown>} 解析结果。
 */
export function parseArgs(argv) {
  const out = { positional: [], dshHome: undefined, apply: false, keepWorkspace: false, json: false, list: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dsh-home') { out.dshHome = argv[i += 1]; continue }
    if (arg === '--apply') { out.apply = true; continue }
    if (arg === '--keep-workspace') { out.keepWorkspace = true; continue }
    if (arg === '--json') { out.json = true; continue }
    if (arg === '--list') { out.list = true; continue }
    if (arg === '-h' || arg === '--help') { out.help = true; continue }
    if (arg.startsWith('--')) continue
    out.positional.push(arg)
  }
  return out
}

/**
 * 在会话根下按会话段名找出所有会话目录。
 *
 * @param {string} sessionsDir 会话根。
 * @returns {{project: string, dir: string}[]} 命中的目录。
 */
export function listProjects(sessionsDir) {
  if (!existsSync(sessionsDir)) return []
  return readdirSync(sessionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ project: entry.name, dir: join(sessionsDir, entry.name) }))
}

/**
 * 执行一次预演或删除。
 *
 * @param {{sessionId: string, dshHome: string, apply?: boolean, keepWorkspace?: boolean}} options
 * @returns {object} 清单与执行结果。
 */
export function purgeSession(options) {
  const { sessionId, dshHome, apply = false, keepWorkspace = false } = options
  const sessionsDir = join(dshHome, 'sessions')
  const projcacheDir = join(dshHome, 'storages', 'session_projcache', 'sessions')
  const workspacePath = join(dshHome, 'storages', 'workspace.json')

  /* 1) 该会话的所有日志目录：同 id 可能出现在多个项目目录下。 */
  const encoded = encodeSegment(sessionId)
  const dirs = []
  for (const project of listProjects(sessionsDir)) {
    const candidate = join(project.dir, encoded)
    try {
      if (existsSync(candidate) && statSync(candidate).isDirectory()) dirs.push(candidate)
    } catch { /* 读不到就跳过 */ }
  }

  /* 2) 投影缓存候选：带前缀与不带前缀两种历史拼写。 */
  const bare = sessionId.replace(/^session-/, '')
  const caches = [...new Set([`${sessionId}.json`, `${bare}.json`])]
    .map((fileName) => join(projcacheDir, fileName))
    .filter((path) => existsSync(path))

  /* 3) 记账命中：只读，用来告诉用户会改动哪里。 */
  let workspace = null
  if (existsSync(workspacePath)) {
    try { workspace = JSON.parse(readFileSync(workspacePath, 'utf8')) } catch { workspace = null }
  }
  const accounting = []
  if (workspace) {
    for (const [id, record] of Object.entries(workspace.tables?.workspaces ?? {})) {
      if (Array.isArray(record.sessionIds) && record.sessionIds.includes(sessionId)) {
        accounting.push({ table: `workspaces[${id}].sessionIds`, path: record.path })
      }
    }
    if (Array.isArray(workspace.global?.archivedSessionIds) && workspace.global.archivedSessionIds.includes(sessionId)) {
      accounting.push({ table: 'global.archivedSessionIds' })
    }
    if (Array.isArray(workspace.global?.pinnedSessionIds) && workspace.global.pinnedSessionIds.includes(sessionId)) {
      accounting.push({ table: 'global.pinnedSessionIds' })
    }
  }

  const plan = { sessionId, dshHome, dirs, caches, accounting, applied: false, trash: null }
  if (!apply) return plan

  /* 4) 备份再动手：workspace.json 是唯一会就地改写的文件。 */
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const trash = join(dshHome, '_trash', `session-delete-${stamp}`)
  mkdirSync(trash, { recursive: true })
  if (workspace) copyFileSync(workspacePath, join(trash, 'workspace.json.bak'))

  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  for (const cache of caches) rmSync(cache, { force: true })

  /* 5) 清掉空了项目目录，还有内容的一律不动。 */
  for (const project of listProjects(sessionsDir)) {
    try {
      if (readdirSync(project.dir).length === 0) rmSync(project.dir, { recursive: true, force: true })
    } catch { /* 跳过读不到的目录 */ }
  }

  /* 6) 摘记账并写回。 */
  if (workspace && !keepWorkspace) {
    for (const record of Object.values(workspace.tables?.workspaces ?? {})) {
      if (Array.isArray(record.sessionIds)) {
        record.sessionIds = record.sessionIds.filter((id) => id !== sessionId)
      }
    }
    const drop = (list) => (Array.isArray(list) ? list.filter((id) => id !== sessionId) : list)
    if (workspace.global) {
      workspace.global.archivedSessionIds = drop(workspace.global.archivedSessionIds)
      workspace.global.pinnedSessionIds = drop(workspace.global.pinnedSessionIds)
    }
    writeFileSync(workspacePath, JSON.stringify(workspace, null, 2), 'utf8')
  }

  writeFileSync(join(trash, 'manifest.json'), JSON.stringify({ ...plan, applied: true, at: new Date().toISOString() }, null, 2), 'utf8')
  return { ...plan, applied: true, trash }
}

/**
 * 人类可读的报告。
 *
 * @param {object} plan `purgeSession` 的返回值。
 * @returns {string} 多行文本。
 */
function format(plan) {
  const lines = [
    `sessionId : ${plan.sessionId}`,
    `dsh home  : ${plan.dshHome}`,
    `日志目录  : ${plan.dirs.length ? plan.dirs.join('\n            ') : '（无）'}`,
    `投影缓存  : ${plan.caches.length ? plan.caches.join('\n            ') : '（无）'}`,
    `记账命中  : ${plan.accounting.length ? plan.accounting.map((item) => item.table).join('\n            ') : '（无）'}`,
  ]
  if (!plan.applied) {
    lines.push('', '[预演] 未改动任何文件。加 --apply 执行。')
  } else if (plan.trash) {
    lines.push('', `已执行。备份目录: ${plan.trash}`)
  }
  return lines.join('\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || (!args.list && args.positional.length === 0)) {
    console.log(USAGE)
    process.exit(args.help ? 0 : 2)
  }
  const home = args.dshHome
    ? resolve(String(args.dshHome))
    : (process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh'))

  if (args.list) {
    const rows = []
    for (const project of listProjects(join(home, 'sessions'))) {
      for (const entry of readdirSync(project.dir, { withFileTypes: true })) {
        if (entry.isDirectory()) rows.push({ project: project.project, sessionDir: entry.name })
      }
    }
    if (args.json) console.log(JSON.stringify(rows, null, 2))
    else if (rows.length === 0) console.log('（没有找到任何会话目录）')
    else for (const row of rows) console.log(`${row.project}\t${row.sessionDir}`)
    return
  }

  const plan = purgeSession({
    sessionId: String(args.positional[0]),
    dshHome: home,
    apply: args.apply,
    keepWorkspace: args.keepWorkspace,
  })
  if (args.json) console.log(JSON.stringify(plan, null, 2))
  else console.log(format(plan))
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('dsh-session-delete.js')) {
  main()
}
