window.__ModuleLoader__.load({ id: "dsh-session-delete", factory: (require) => {

  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const react = require("react");
  const h = react.createElement;

  const name = "dsh-session-delete";
  /* 只把真正必需的槽位与本地化写进 inject。
     `sessions` / `workspaces` / `uiWorkspace` 走 ctx.inject 可选注入：
     写进这里会让插件等 session-controller 就位，加载顺序一变整条挂掉。 */
  const inject = ["slots", "locale"];
  const NS = "sessionDelete";

  const API_PATH = "/session-delete/api";

  let translate = (key, params) => (params ? key + JSON.stringify(params) : key);
  function useT() {
    return translate;
  }

  /* ---------------------------------------------------------------- 文案 */

  const zh = {
    "menu.deleteSession": "删除会话",
    "confirm.title": "要删除聊天吗？",
    "confirm.desc": "此操作将永久删除该聊天及其子智能体聊天，且无法撤销。",
    "confirm.cancel": "取消",
    "confirm.action": "删除",
    "confirm.pending": "正在删除…",
    "toast.deleted": "会话已删除",
    "toast.failed": "删除失败：{message}",
    "toast.partial": "会话记录已移除，但有 {n} 项未能清理",
  };

  const en = {
    "menu.deleteSession": "Delete session",
    "confirm.title": "Delete this chat?",
    "confirm.desc": "This permanently deletes this chat and its subagent chats. It cannot be undone.",
    "confirm.cancel": "Cancel",
    "confirm.action": "Delete",
    "confirm.pending": "Deleting…",
    "toast.deleted": "Session deleted",
    "toast.failed": "Delete failed: {message}",
    "toast.partial": "Session removed, but {n} item(s) could not be cleaned up",
  };

  /* ---------------------------------------------------------------- 样式 */

  const STYLE_ID = "dsh-session-delete/style";
  function installStyle() {
    if (typeof document === "undefined") return;
    if (document.querySelector('style[data-plugin="' + STYLE_ID + '"]') !== null) return;
    const tag = document.createElement("style");
    tag.dataset.plugin = STYLE_ID;
    tag.textContent = [
      ".dsd-menuItem{display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#1f1f1f);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer;white-space:nowrap}",
      ".dsd-menuItem:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}",
      ".dsd-menuItem[disabled]{opacity:.5;cursor:default}",
      ".dsd-menuItem .dsd-icon{width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#6b6b6b)}",
      ".dsd-sep{height:1px;margin:4px 2px;background:var(--dsw-alias-line-regular,rgba(0,0,0,.08))}",
      ".dsd-mask{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.28)}",
      ".dsd-dialog{width:min(440px,calc(100vw - 48px));border-radius:16px;background:var(--dsw-alias-bg-page,#fff);color:var(--dsw-alias-label-primary,#1f1f1f);box-shadow:0 18px 48px rgba(0,0,0,.22);padding:20px 22px 16px;box-sizing:border-box}",
      ".dsd-title{margin:0 0 8px;font-size:17px;font-weight:600;line-height:26px}",
      ".dsd-desc{margin:0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary,#6b6b6b)}",
      ".dsd-close{position:absolute;top:10px;right:12px;width:28px;height:28px;border:0;background:transparent;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-secondary,#6b6b6b);font-size:16px;line-height:1}",
      ".dsd-status{margin-top:12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b6b6b)}",
      ".dsd-error{margin-top:12px;font-size:12px;line-height:18px;color:#d92d20}",
      ".dsd-footer{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}",
      ".dsd-btn{min-width:72px;height:34px;padding:0 16px;border-radius:10px;font:inherit;font-size:13px;cursor:pointer;border:1px solid transparent}",
      ".dsd-btn.ghost{background:transparent;border-color:var(--dsw-alias-line-regular,rgba(0,0,0,.16));color:var(--dsw-alias-label-primary,#1f1f1f)}",
      ".dsd-btn.danger{background:#fdeceb;color:#d92d20;border-color:transparent}",
      ".dsd-btn.danger:hover{background:#fbd9d7}",
      ".dsd-btn[disabled]{opacity:.6;cursor:default}",
    ].join("\n");
    document.head.appendChild(tag);
  }

  const DeleteIcon = () => h(
    "svg",
    { className: "dsd-icon", viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", "aria-hidden": "true" },
    h("path", { d: "M3 4.5h10M6.5 4.5V3.2h3v1.3M4.4 4.5l.6 8.1h6l.6-8.1", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" }),
  );

  /* ---------------------------------------------------------------- 接口 */

  function apiUrl() {
    try { return new URL(API_PATH, window.location.origin).toString() } catch { return API_PATH }
  }

  async function callDelete(sessionId) {
    const response = await fetch(apiUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", sessionId }),
    });
    let payload = null;
    try { payload = await response.json() } catch { payload = null }
    if (!response.ok || payload === null) {
      throw new Error((payload && payload.error) || ("HTTP " + String(response.status)));
    }
    if (payload.ok === false) throw new Error(payload.error || "delete failed");
    return payload;
  }

  /**
   * 取一个客户端服务：先用 apply 里缓存的那份，再问 ctx.get，
   * 最后退回顶层属性（cordis 的 ctx.xxx 访问器）。都拿不到就返回 null。
   */
  function serviceOf(ctx, name, cached) {
    if (cached) return cached;
    try {
      const got = ctx && typeof ctx.get === "function" ? ctx.get(name) : undefined;
      if (got !== undefined && got !== null) return got;
    } catch { /* 未就位 */ }
    try {
      const direct = ctx ? ctx[name] : undefined;
      if (direct !== undefined && direct !== null) return direct;
    } catch { /* 访问器抛错 */ }
    return null;
  }

  /** apply 时缓存的服务实例，供删除后的跳转与列表刷新使用。 */
  const services = { sessions: null, workspaces: null, uiWorkspace: null };

  function sessionsOf(ctx) {
    services.sessions = serviceOf(ctx, "sessions", services.sessions);
    return services.sessions;
  }

  function workspacesOf(ctx) {
    services.workspaces = serviceOf(ctx, "workspaces", services.workspaces);
    return services.workspaces;
  }

  function uiWorkspaceOf(ctx) {
    services.uiWorkspace = serviceOf(ctx, "uiWorkspace", services.uiWorkspace);
    return services.uiWorkspace;
  }

  /**
   * 当前主视图持有的会话 id。两条路取，谁先有算谁：
   * 1) 会话快照里 `retainedBy.mainView > 0` 的那条（侧栏选中就是按它算的）；
   * 2) `uiWorkspace.mainReference`（删活跃会话时它是权威来源）。
   */
  function currentSessionId(ctx) {
    try {
      const service = sessionsOf(ctx);
      const snapshot = service && service.list && typeof service.list.getSnapshot === "function"
        ? service.list.getSnapshot()
        : null;
      const byId = snapshot && snapshot.byId ? snapshot.byId : null;
      if (byId !== null && typeof byId === "object") {
        for (const summary of Object.values(byId)) {
          if (summary && summary.retainedBy && (summary.retainedBy.mainView ?? 0) > 0) return summary.id;
        }
      }
    } catch { /* 取不到就看下一路 */ }
    try {
      const navigation = uiWorkspaceOf(ctx);
      const held = navigation && navigation.mainReference;
      if (held && typeof held.sessionId === "string") return held.sessionId;
    } catch { /* ignore */ }
    return undefined;
  }

  /** 会话所属工作区 id（删之前取，删后还要校验它是否仍在）。 */
  function workspaceOfSession(ctx, sessionId) {
    try {
      for (const item of workspaceItems(ctx)) {
        if (item && Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId)) return item.workspaceId;
      }
    } catch { /* ignore */ }
    return undefined;
  }

  function workspaceItems(ctx) {
    try {
      const service = workspacesOf(ctx);
      const snapshot = service && service.list && typeof service.list.getSnapshot === "function"
        ? service.list.getSnapshot()
        : null;
      return snapshot && Array.isArray(snapshot.items) ? snapshot.items : [];
    } catch { return [] }
  }

  /** 通知宿主侧会话列表重拉，让行立刻消失。 */
  let clientSessions = null;
  function refreshSessionList(ctx) {
    const candidates = [clientSessions];
    try {
      if (ctx && typeof ctx.get === "function") candidates.push(ctx.get("sessions"));
    } catch { /* ignore */ }
    try { if (ctx && ctx.sessions) candidates.push(ctx.sessions) } catch { /* ignore */ }
    for (const service of candidates) {
      try {
        if (service && typeof service.refresh === "function") {
          const pending = service.refresh();
          if (pending && typeof pending.catch === "function") pending.catch(() => {});
          return pending;
        }
      } catch { /* 换下一个候选 */ }
    }
    return undefined;
  }

  /* ---------------------------------------------------------------- 弹窗 */

  function ConfirmDialog({ request, onCancel, onConfirm }) {
    const t = useT();
    const [busy, setBusy] = react.useState(false);
    const [error, setError] = react.useState(null);

    react.useEffect(() => {
      const onKey = (event) => {
        if (event.key === "Escape" && !busy) onCancel();
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [busy, onCancel]);

    const confirm = () => {
      if (busy) return;
      setBusy(true);
      setError(null);
      onConfirm(request.sessionId).then(() => {
        setBusy(false);
      }).catch((reason) => {
        setBusy(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    };

    const dialog = h(
      "div",
      { className: "dsd-mask", role: "presentation", onMouseDown: (event) => { if (event.target === event.currentTarget && !busy) onCancel() } },
      h(
        "div",
        { className: "dsd-dialog", role: "dialog", "aria-modal": "true", "aria-label": t("confirm.title"), style: { position: "relative" } },
        h("button", { className: "dsd-close", type: "button", onClick: () => { if (!busy) onCancel() }, "aria-label": t("confirm.cancel") }, "\u00d7"),
        h("h2", { className: "dsd-title" }, t("confirm.title")),
        h("p", { className: "dsd-desc" }, t("confirm.desc")),
        busy && h("div", { className: "dsd-status", role: "status" }, t("confirm.pending")),
        error !== null && h("div", { className: "dsd-error", role: "alert" }, t("toast.failed", { message: error })),
        h(
          "div",
          { className: "dsd-footer" },
          h("button", { className: "dsd-btn ghost", type: "button", disabled: busy, onClick: onCancel }, t("confirm.cancel")),
          h("button", { className: "dsd-btn danger", type: "button", disabled: busy, onClick: confirm }, t("confirm.action")),
        ),
      ),
    );

    try {
      const rd = require("react-dom");
      if (rd && typeof rd.createPortal === "function" && typeof document !== "undefined" && document.body) {
        return rd.createPortal(dialog, document.body);
      }
    } catch { /* 宿主没暴露 react-dom 时就地渲染 */ }
    return dialog;
  }

  /* ---------------------------------------------------------------- 应用 */

  function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-session-delete: dictionaries");
    const t = ctx.locale.bind(NS);
    translate = t;
    installStyle();
    ctx.effect(() => installContextMenu(), "dsh-session-delete: row context menu");

    /* 客户端 sessions 服务如果已经能取到，就留着做删除后的列表刷新。 */
    try {
      const got = typeof ctx.get === "function" ? ctx.get("sessions") : null;
      if (got && typeof got.refresh === "function") clientSessions = got;
    } catch { /* ignore */ }
    try {
      if (typeof ctx.inject === "function") {
        ctx.inject(["sessions"], (host) => {
          try {
            if (host && host.sessions && typeof host.sessions.refresh === "function") clientSessions = host.sessions;
            if (host && host.sessions) services.sessions = host.sessions;
          } catch { /* ignore */ }
        });
        /* 工作区与导航服务也提前抓住：删除后跳新会话要用。 */
        ctx.inject(["workspaces"], (host) => {
          try { if (host && host.workspaces) services.workspaces = host.workspaces } catch { /* ignore */ }
        });
        ctx.inject(["uiWorkspace"], (host) => {
          try { if (host && host.uiWorkspace) services.uiWorkspace = host.uiWorkspace } catch { /* ignore */ }
        });
      }
    } catch { /* ignore */ }

    /* 弹窗请求：一个最小可订阅源。宿主把 `hooks` 里的源包成
       `useXxx(selector)` 交给组件，所以这里只提供 getSnapshot/subscribe。 */
    let pending = null;
    const listeners = new Set();
    const deleteRequest = {
      getSnapshot: () => pending,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener) };
      },
    };
    const setPending = (value) => {
      pending = value;
      for (const listener of [...listeners]) {
        try { listener() } catch { /* ignore */ }
      }
    };

    /**
     * 删掉当前会话后，主视图必须主动换一个目标，否则聊天框还挂着已删会话。
     * 优先在同一工作区开一个新会话（= 该工作目录下的新对话），
     * 工作区已不存在时退回宿主默认选择逻辑。
     */
    const navigateAwayFromDeleted = async (ctx, workspaceId) => {
      const navigation = uiWorkspaceOf(ctx);
      if (!navigation || typeof navigation.startSession !== "function") return false;

      const stillThere = workspaceId !== undefined
        && workspaceItems(ctx).some((item) => item && item.workspaceId === workspaceId);
      try {
        /* startSession 生成/复用空会话并把主视图切过去；带 workspaceId 就锁在同一目录。 */
        await navigation.startSession(stillThere ? workspaceId : undefined);
        return true;
      } catch (error) {
        try { console.warn("[dsh-session-delete] navigate to workspace failed:", error) } catch { /* ignore */ }
      }
      try {
        /* 兜底：交给宿主自己挑「最近一次」的工作区，仍然是一个新对话。 */
        await navigation.startSession();
        return true;
      } catch (error) {
        try { console.warn("[dsh-session-delete] navigate after delete failed:", error) } catch { /* ignore */ }
        return false;
      }
    };

    const deleteSession = async (sessionId) => {
      /* 删之前先记两件事：它是不是当前正在看的会话、它原本属于哪个工作区。 */
      const wasCurrent = currentSessionId(ctx) === sessionId;
      const workspaceId = workspaceOfSession(ctx, sessionId);

      const report = await callDelete(sessionId);
      refreshSessionList(ctx);

      /* 删的是当前会话 → 主视图立刻切到同一工作区的新会话，不再停在已删的对话上。 */
      if (wasCurrent) navigateAwayFromDeleted(ctx, workspaceId);

      if (Array.isArray(report.errors) && report.errors.length > 0) {
        try { console.warn("[dsh-session-delete] cleanup issues:", report.errors) } catch { /* ignore */ }
        showToast(t("toast.partial", { n: report.errors.length }));
      } else {
        showToast(t("toast.deleted"));
      }
    };

    /* 轻量 toast：直接插入 DOM，不依赖宿主的 toast 契约。 */
    let toastTimer = null;
    function showToast(text) {
      if (typeof document === "undefined" || !document.body) return;
      let node = document.querySelector("[data-dsh-session-delete-toast]");
      if (!node) {
        node = document.createElement("div");
        node.dataset.dshSessionDeleteToast = "1";
        node.style.cssText = "position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2100;padding:9px 16px;border-radius:10px;font-size:13px;line-height:20px;color:#fff;background:rgba(24,24,24,.9);box-shadow:0 8px 24px rgba(0,0,0,.2);pointer-events:none";
        document.body.appendChild(node);
      }
      node.textContent = text;
      node.style.display = "block";
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        try { node.remove() } catch { /* ignore */ }
      }, 2600);
    }

    /* ---------------------------------------------------------------- 行右键菜单 */

    /**
     * 会话行右键 = 弹出与「…」按钮完全相同的菜单。
     *
     * 做法：不另建一份菜单副本（副本会跟宿主菜单慢慢漂移），而是找到该行内的
     * 省略号按钮，合成一次 click()，宿主自己的 Menu 组件就在光标处展开，
     * 条目、快捷键、分隔线、权限判断全部是原生那份。
     */
    const ROW_MENU_SELECTOR = "[data-row-key]";
    const ELLIPSIS_BUTTON_SELECTOR = "button[aria-label]";

    /** 从事件目标往上找会话行（data-row-key="session:<id>"）。 */
    function rowOfPointer(target) {
      if (!(target instanceof Element)) return null;
      const row = target.closest(ROW_MENU_SELECTOR);
      if (row === null) return null;
      const key = row.getAttribute("data-row-key");
      if (typeof key !== "string" || !key.startsWith("session:")) return null;
      const id = key.slice("session:".length);
      return id === "" ? null : { row, sessionId: id };
    }

    /**
     * 行内那个「…」按钮。
     *
     * 不能取「最后一个按钮」：宿主的行尾区域是
     * `[Menu(锚点=省略号按钮), 归档悬停钮, 置顶悬停钮]`，末位是置顶，点错会把
     * 会话置顶。正确位置：行尾那个 span 是行的最后一个子元素，它的第一个按钮
     * 才是菜单锚点。
     */
    function ellipsisButtonOf(row) {
      const actions = row.lastElementChild ?? (row.children ? row.children[row.children.length - 1] : null);
      if (actions !== null && actions !== undefined) {
        const first = actions.querySelector ? actions.querySelector("button") : null;
        if (first !== null) return first;
      }
      const all = [...row.querySelectorAll(ELLIPSIS_BUTTON_SELECTOR)];
      return all.length === 0 ? null : all[0];
    }

    /** 右键翻译成一次点击，位置与条目全部交给宿主 Menu 决定。 */
    function installContextMenu() {
      if (typeof document === "undefined") return () => {};

      const onContextMenu = (event) => {
        const hit = rowOfPointer(event.target);
        if (hit === null) return;
        /* 重命名输入框里、或菜单自身内部，放行浏览器默认行为。 */
        if (event.target instanceof Element
          && event.target.closest("input, textarea, [contenteditable=true], [role=menu]") !== null) return;

        const button = ellipsisButtonOf(hit.row);
        if (button === null) return;

        event.preventDefault();
        event.stopPropagation();
        /* 右键不改变当前会话，只开菜单；随后宿主菜单自己接管键盘与点击外部关闭。 */
        button.click();
      };

      /* 捕获阶段挂：抢在宿主行的 onClick / 拖拽处理之前把右键变成菜单。 */
      document.addEventListener("contextmenu", onContextMenu, true);
      return () => document.removeEventListener("contextmenu", onContextMenu, true);
    }

    /* 会话行菜单最后一项：删除会话。order 500 排在「复制 Session ID」(450) 之后。 */
    ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register({
      name: "sidebar.workspaces.session.menu.item",
      id: "dsh-session-delete.delete",
      order: 500,
      locale: NS,
      inject: () => ({
        requestDelete: (sessionId) => setPending({ sessionId }),
      }),
    }, function DeleteSessionMenuItem({ sessionId, useMenuOpenState, requestDelete, t: tProp }) {
      const [, setMenuOpen] = useMenuOpenState();
      const label = (typeof tProp === "function" ? tProp : t)("menu.deleteSession");
      const onSelect = () => {
        setMenuOpen(false);
        requestDelete(sessionId);
      };
      /* 优先用宿主的 MenuItemButton（拿到统一行样式与分隔线）；拿不到就退化成普通按钮。 */
      let primitives = null;
      try { primitives = require("@deepseek-ai/dsh-client-ui-primitives") } catch { primitives = null }
      if (primitives && typeof primitives.MenuItemButton === "function") {
        return h(
          primitives.MenuItemButton,
          { separatorBefore: true, icon: h(DeleteIcon, null), onSelect },
          label,
        );
      }
      return h(
        "button",
        { type: "button", role: "menuitem", className: "dsd-menuItem", onClick: onSelect },
        h(DeleteIcon, null),
        h("span", null, label),
      );
    }));

    /* 确认弹窗：请求状态按宿主约定走 `hooks` 注入面（hooks.deleteRequest → useDeleteRequest）。 */
    ctx.slots.inject("shell.overlay", () => ctx.slots.register({
      name: "shell.overlay",
      id: "dsh-session-delete.confirm",
      locale: NS,
      inject: () => ({ hooks: { deleteRequest } }),
    }, function DeleteSessionDialog({ useDeleteRequest }) {
      const current = useDeleteRequest((value) => value);
      if (current === null) return null;
      return h(ConfirmDialog, {
        key: current.sessionId,
        request: current,
        onCancel: () => setPending(null),
        onConfirm: async (sessionId) => {
          await deleteSession(sessionId);
          setPending(null);
        },
      });
    }));
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});
