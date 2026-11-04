/**
 * 路径规则 —— 与官方持久化后端同名同义的编码函数。
 *
 * 会话日志落在 `$DSH_HOME/sessions/<项目键>/<会话段>/`，两个路径段的编码规则
 * 由 `@deepseek-ai/dsh-session-persistence-jsonl` 定义。这里保持同源实现，
 * 使本插件在拿不到持久化后端 `locate()` 时仍能算回同一个目录。
 *
 * 规则刻意写成纯函数：不读环境、不碰文件系统，方便单测。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 编码单个路径段。
 * 只放行 `[A-Za-z0-9._-]`，其余码位一律写成 `~XXXX`（大写十六进制、四位补零）；
 * `.` 与 `..` 单独特判，避免拼出相对路径。
 *
 * @param {string} raw 原始段文本。
 * @returns {string} 可安全拼进路径的段。
 */
export function encodeSegment(raw) {
  if (!raw) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

/**
 * 把工作目录折成会话根下的项目目录名。
 * 连续分隔符压成一个 `-`，开头分隔符不再产生前导连字符；整体包在 `--` 之间。
 *
 * @param {string} cwd 工作区绝对路径。
 * @returns {string} 形如 `--home-user-project--` 的目录名。
 */
export function projectKey(cwd) {
  if (!cwd) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i += 1) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

/**
 * 解析 DSH 主目录。
 * 显式 `$DSH_HOME` 优先（测试与便携部署都靠它），否则退回用户主目录下的 `.dsh`；
 * Windows 上 `$HOME` 常常为空，所以不走 `$HOME`。
 *
 * @param {NodeJS.ProcessEnv} [env] 环境变量表，默认取当前进程。
 * @returns {string} 绝对路径。
 */
export function dshHome(env = process.env) {
  const explicit = env.DSH_HOME
  if (typeof explicit === 'string' && explicit.length > 0) return explicit
  return join(homedir(), '.dsh')
}

/** 会话日志根目录。 */
export function sessionsRoot(ctx, env = process.env) {
  const root = softService(ctx, 'sessionPersistence')?.root
  return typeof root === 'string' && root.length > 0 ? root : join(dshHome(env), 'sessions')
}

/** 投影缓存根目录：允许用 `$DSH_HOME_PROJECTION_DIR` 单独重定向。 */
export function projectionRoot(env = process.env) {
  const override = env.DSH_HOME_PROJECTION_DIR
  if (typeof override === 'string' && override.length > 0) return override
  return join(dshHome(env), 'storages')
}

/**
 * 安全取 Cordis 服务。
 * 未 `inject` 的服务在 `ctx.xxx` 访问器上会抛，不能让它冒泡成 500。
 *
 * @param {object} ctx 插件上下文。
 * @param {string} name 服务名。
 * @returns {any} 服务实例，取不到时 `undefined`。
 */
export function softService(ctx, name) {
  if (!ctx) return undefined
  try {
    if (typeof ctx.get === 'function') {
      const got = ctx.get(name)
      if (got !== undefined) return got
    }
  } catch { /* 服务未注入 */ }
  try { return ctx[name] } catch { /* 访问器抛错 */ }
  return undefined
}
