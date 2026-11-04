# Changelog

本文件格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.1.0] - 2026-11-04

首个公开发布版本。

### 新增

- 会话行菜单「删除会话」：确认后彻底删除该会话（含全部子智能体会话）的日志目录、投影缓存与工作区记账。
- 会话行右键菜单：捕获阶段拦截 `contextmenu`，转发为一次对行尾省略号按钮的点击，复用宿主原生菜单。
- 删除当前会话后自动跳转：在主视图原工作区新开空会话，聊天框不再挂在已删记录上。
- 附带 CLI（`bin/dsh-session-delete.js`）：默认预演，`--apply` 才动手，动手前备份 `workspace.json`。
- HTTP 路由鉴权：仅接受 POST，且仅接受同源或回环请求。
- 46 项单测，覆盖路径编码、删除流水线、HTTP 闸门与 CLI。
- `npm run check`：语法检查 + 清单自检 + 隐私/密钥扫描。

### 设计取舍

- **零外部依赖。** 宿主侧只碰 Cordis 服务对象，不 import 官方 npm 包，因此 profile 解析不到官方 `node_modules` 时依然可用。
- **软取服务。** `sessionPersistence`、`sessions`、`agents`、`workspaceRegistry` 取不到就跳过对应步骤，不让整条路由挂掉。
- **不碰附件仓库。** `attachments/` 是内容寻址存储，同一份附件可能被别的会话引用。
- **只清空目录。** 删除后仅回收变空的项目目录，还有内容的目录一律不动。

[1.1.0]: https://github.com/DreamStars168/dsh-session-delete/releases/tag/v1.1.0
