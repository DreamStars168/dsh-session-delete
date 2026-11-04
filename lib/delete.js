/**
 * 删除一个会话（含它的子智能体会话）。
 *
 * 这一层只做决策与文件系统动作，不碰 HTTP，也不依赖 Cordis 的具体实现：
 * 所有宿主能力都经 `softService(ctx, name)` 软取，取不到就走纯文件系统兜底，
 * 因此同一份代码既能在宿主里跑，也能在单测里跑。
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import {
  dshHome,
  encodeSegment,
  projectKey,
  projectionRoot,
  sessionsRoot,
  softService,
} from './paths.js'

/**
 * 收集目标会话及其全部子孙会话。
 *
 * 父子关系只认持久化头与活跃会话头上的 `parentSession` 字段 —— 界面状态可以
 * 被折叠、过滤、分页，不能作为拓扑依据。
 *
 * @param {object} ctx 插件上下文。
 * @param {string} rootId 根会话 id。
 * @returns {Promise<{ids: string[], headers: Map<string, object>}>} 广度优先的 id 列表与头部索引。
 */
export async function collectTree(ctx, rootId) {
  const headers = new Map()

  const persistence = softService(ctx, 'sessionPersistence')
  if (persistence && typeof persistence.list === 'function') {
    try {
      for (const snapshot of await persistence.list()) {
        const header = snapshot && snapshot.header
        if (header && header.id) headers.set(header.id, header)
      }
    } catch { /* 持久化不可读时退化成只看活跃会话 */ }
  }

  const sessions = softService(ctx, 'sessions')
  if (sessions && typeof sessions.list === 'function') {
    try {
      for (const session of sessions.list()) {
        const header = session && session.header
        if (header && header.id && !headers.has(header.id)) headers.set(header.id, header)
      }
    } catch { /* 忽略：活跃清单是加成，不是必需 */ }
  }

  const childrenOf = new Map()
  for (const header of headers.values()) {
    const parent = header.parentSession
    if (!parent) continue
    const list = childrenOf.get(parent) ?? []
    list.push(header.id)
    childrenOf.set(parent, list)
  }

  const ids = [rootId]
  const seen = new Set(ids)
  for (let i = 0; i < ids.length; i += 1) {
    for (const child of childrenOf.get(ids[i]) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      ids.push(child)
    }
  }
  return { ids, headers }
}

/**
 * 算出一个会话的日志目录。
 *
 * 优先问持久化后端的 `locate()`（后端换了目录布局也跟得上），
 * 拿不到再按官方命名规则自己拼。
 *
 * @param {object} ctx 插件上下文。
 * @param {string} id 会话 id。
 * @param {object} [header] 会话头，需要其中的 `cwd` 才能兜底。
 * @param {NodeJS.ProcessEnv} [env] 环境变量表。
 * @returns {string|null} 目录绝对路径，无法确定时 `null`。
 */
export function sessionDirOf(ctx, id, header, env = process.env) {
  const persistence = softService(ctx, 'sessionPersistence')
  if (persistence && typeof persistence.locate === 'function') {
    try {
      const located = persistence.locate({ id, cwd: header?.cwd })
      if (located && typeof located.path === 'string') return dirname(located.path)
    } catch { /* 后端拒绝时走兜底 */ }
  }
  if (!header || header.cwd === undefined) return null
  return join(sessionsRoot(ctx, env), projectKey(header.cwd), encodeSegment(id))
}

/**
 * 投影缓存的候选文件。
 * 历史版本有带 `session-` 前缀和不带前缀两种拼写，两种都试，避免漏删。
 *
 * @param {string} id 会话 id。
 * @param {NodeJS.ProcessEnv} [env] 环境变量表。
 * @returns {string[]} 候选绝对路径。
 */
export function projectionCacheCandidates(id, env = process.env) {
  const dir = join(projectionRoot(env), 'session_projcache', 'sessions')
  const bare = id.replace(/^session-/, '')
  const names = new Set([`${id}.json`, `${bare}.json`, `${id}.json.tmp`, `${bare}.json.tmp`])
  return [...names].map((name) => join(dir, name))
}

/**
 * 递归删掉一个目录。
 * 只接受真实存在的目录：传进来 `null`、文件、符号链接都返回 `false` 而不动手。
 *
 * @param {string|null} target 目录路径。
 * @returns {boolean} 是否真的删了。
 */
export function removeTree(target) {
  if (!target || !existsSync(target)) return false
  let info
  try { info = statSync(target) } catch { return false }
  if (!info.isDirectory()) return false
  rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 60 })
  return true
}

/**
 * 彻底删除一个会话（含子会话）。
 *
 * 顺序是刻意安排的：先停活再删盘，最后才摘记账。
 * 反过来的话，正在跑的回合会在删除过程中把状态写回去，等于白删。
 *
 * @param {object} ctx 插件上下文。
 * @param {string} sessionId 目标会话 id（带 `session-` 前缀的完整 id）。
 * @param {{stripWorkspace?: boolean, env?: NodeJS.ProcessEnv}} [options]
 *   `stripWorkspace` 为 `false` 时保留工作区记账（默认清理）。
 * @returns {Promise<object>} 结果明细，供界面提示与排障。
 */
export async function deleteSessionDeep(ctx, sessionId, options = {}) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { ok: false, error: 'sessionId required' }
  }
  const env = options.env ?? process.env
  const { ids, headers } = await collectTree(ctx, sessionId)

  const agents = softService(ctx, 'agents')
  const sessions = softService(ctx, 'sessions')
  const registry = softService(ctx, 'workspaceRegistry')
  const report = {
    ok: true,
    root: sessionId,
    deleted: [],
    stopped: [],
    detached: [],
    removedDirs: [],
    removedCaches: [],
    errors: [],
  }

  /* 1) 先停活：运行中的回合取消，已进入的会话句柄摘下，避免边删边写。 */
  for (const id of ids) {
    try {
      const agent = agents && typeof agents.get === 'function' ? agents.get(id) : undefined
      if (agent && agent.status === 'running' && typeof agent.cancel === 'function') {
        agent.cancel({ kind: 'user' })
        report.stopped.push(id)
      }
    } catch (error) {
      report.errors.push(`cancel ${id}: ${errorText(error)}`)
    }
    try {
      const live = sessions && typeof sessions.get === 'function' ? sessions.get(id) : undefined
      const canDetach = typeof sessions?.liveEntryFor === 'function'
        && typeof sessions?.detachEntered === 'function'
      if (live !== undefined && canDetach) {
        const entry = sessions.liveEntryFor(live)
        if (entry !== undefined) {
          sessions.detachEntered(entry)
          report.detached.push(id)
        }
      }
    } catch (error) {
      report.errors.push(`detach ${id}: ${errorText(error)}`)
    }
  }

  /* 2) 摘工作区记账：归属列表、归档集合、置顶集合。 */
  if (options.stripWorkspace !== false && registry) {
    for (const id of ids) {
      try {
        if (typeof registry.list === 'function') {
          for (const workspace of registry.list()) {
            const holds = Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(id)
            if (holds && typeof workspace.detachSession === 'function') await workspace.detachSession(id)
          }
        }
      } catch (error) {
        report.errors.push(`workspace detach ${id}: ${errorText(error)}`)
      }
      try {
        if (Array.isArray(registry.archivedSessionIds) && registry.archivedSessionIds.includes(id)) {
          await registry.unarchiveSession(id)
        }
      } catch (error) {
        report.errors.push(`unarchive ${id}: ${errorText(error)}`)
      }
      try {
        if (Array.isArray(registry.pinnedSessionIds) && registry.pinnedSessionIds.includes(id)) {
          await registry.unpinSession(id)
        }
      } catch (error) {
        report.errors.push(`unpin ${id}: ${errorText(error)}`)
      }
    }
  }

  /* 3) 删日志目录：每个会话一层，子会话各占一层。 */
  for (const id of ids) {
    const header = headers.get(id)
    let dir = null
    try {
      dir = sessionDirOf(ctx, id, header, env)
    } catch (error) {
      report.errors.push(`locate ${id}: ${errorText(error)}`)
    }
    try {
      if (removeTree(dir)) report.removedDirs.push(dir)
    } catch (error) {
      report.errors.push(`rm ${dir}: ${errorText(error)}`)
    }
    report.deleted.push(id)
  }

  /* 4) 删投影缓存：候选名逐个试，存在才删。 */
  for (const id of ids) {
    for (const candidate of projectionCacheCandidates(id, env)) {
      try {
        if (existsSync(candidate)) {
          rmSync(candidate, { force: true })
          report.removedCaches.push(candidate)
        }
      } catch (error) {
        report.errors.push(`rm cache ${candidate}: ${errorText(error)}`)
      }
    }
  }

  /* 5) 收拾空的项目目录：只删空的，还有内容的目录一律不动。 */
  try {
    const root = sessionsRoot(ctx, env)
    if (existsSync(root)) {
      for (const project of readdirSync(root, { withFileTypes: true })) {
        if (!project.isDirectory()) continue
        const projectPath = resolve(root, project.name)
        try {
          if (readdirSync(projectPath).length === 0) rmSync(projectPath, { recursive: true, force: true })
        } catch { /* 权限不足就跳过，不影响主流程 */ }
      }
    }
  } catch { /* 会话根不可读时跳过收尾 */ }

  return report
}

/** 把任意抛出物压成一行可读文本。 */
function errorText(error) {
  return String((error && error.message) || error)
}

export { dshHome }
