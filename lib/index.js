/**
 * dsh-session-delete —— Host 半侧入口。
 *
 * 给会话行菜单补一条「删除会话」：确认后彻底删除该会话（含子智能体会话）的
 * 日志目录、投影缓存，以及工作区里的会话记账。
 *
 * 删掉的范围只有三处，且都在 `$DSH_HOME` 内：
 *   1. `sessions/<项目键>/<会话段>/` —— 该会话（含子会话）的日志目录；
 *   2. `storages/session_projcache/sessions/<id>.json` —— 投影缓存；
 *   3. `storages/workspace.json` 记账里的 id（经官方 workspaceRegistry 服务摘除）。
 *
 * 刻意"不"碰的地方：
 *   - 工作区目录本身及其中的任何文件；
 *   - `attachments/` 内容寻址仓库（同一份附件可能被别的会话引用）；
 *   - 别的会话的任何数据。
 */
import { createHandler, ROUTE } from './server.js'

export const name = 'dsh-session-delete'

/** webServer 是硬依赖；其余服务全部软取，缺了也不该让整条路由挂掉。 */
export const inject = ['webServer']

/**
 * 插件装配。
 *
 * @param {object} ctx Cordis 插件上下文。
 * @param {{enabled?: boolean}} [pluginConfig] `cordis.patch.yml` 里的 config。
 */
export function apply(ctx, pluginConfig) {
  const config = pluginConfig ?? ctx.config ?? {}
  if (config.enabled === false) return
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ROUTE, handler: createHandler(ctx) }),
    'dsh-session-delete.route',
  )
}
