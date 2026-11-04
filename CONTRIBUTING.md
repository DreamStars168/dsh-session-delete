# 贡献指南

## 开发环境

- Node.js ≥ 18
- 任意 DSH 安装（0.2.0 及以上）用于手工验证

```bash
git clone https://github.com/DreamStars168/dsh-session-delete.git
cd dsh-session-delete
npm run check
npm test
```

## 提交前

必须两件事都过：

```bash
npm run check   # 语法、清单、隐私扫描
npm test        # 单测
```

`npm run check` 里的隐私扫描会拦住本机绝对路径、API Key、私钥、GitHub token、AWS Access Key。被拦住时不要绕过规则，去改代码或文档里那处内容。

## 代码约定

- **ESM only**，`"type": "module"`。
- **`lib/` 里不 import 官方 `@deepseek-ai/*` 运行时包。** 宿主能力一律经 `softService(ctx, name)` 软取；这条约束是本插件能在最小 profile 里跑起来的原因。
- **接口用 JSDoc 标注类型**，不引入 TypeScript 构建步骤。
- **注释解释为什么，不解释是什么。** 尤其是那些看起来绕的地方（为什么先停活再删盘、为什么右键要合成 click），写清楚取舍，后来人才不会"顺手优化"掉。
- **`client.js` 是浏览器 bundle**，保持 `window.__ModuleLoader__.load({ id, factory })` 的外壳，不改成 ESM。

## 测试约定

- 所有文件系统用例必须在 `mkdtempSync` 造出的临时目录里跑，并在 `t.after` 里清理。**不允许碰真实的 `~/.dsh`。**
- Host 侧服务用最小桩对象模拟（见 `test/delete.test.js` 的 `makeCtx`），不要让测试依赖真实 DSH 进程。
- 新增删除行为时，同时补一条"不该删的东西还在"的断言。破坏性功能最需要的测试是反向断言。

## 改动删除范围的流程

本插件的全部风险都在"删了不该删的"。扩大或调整删除范围时：

1. 在 PR 描述里写清楚新增/变化的具体路径。
2. 补测反向断言：确认其它会话、`attachments/`、工作区文件仍然存在。
3. 更新 [README.zh-CN.md](README.zh-CN.md) 与 [README.md](README.md) 里的「它到底删什么」表格。
4. 在 [CHANGELOG.md](CHANGELOG.md) 的 `Unreleased` 下记一条。

## 提交信息

```
feat: 一句话说清加了什么
fix: 一句话说清修了什么
docs: 文档改动
test: 只动测试
chore: 构建、依赖、杂项
```

## 许可

提交即表示同意以 [MIT](LICENSE) 许可发布你的贡献。
