---
name: Bug report
about: 报告一个可以复现的问题
title: '[bug] '
labels: bug
assignees: ''
---

## 现象

一句话说清发生了什么。

## 复现步骤

1. 
2. 
3. 

## 期望行为

你原本期望它做什么。

## 环境

| 项 | 值 |
| --- | --- |
| 插件版本 | 例如 1.1.0 |
| DSH 版本 | 例如 0.2.1-rc.2 |
| 运行端 | 桌面端 / Web 端 |
| 操作系统 | 例如 Windows 11 |

## 控制台输出

```
粘贴浏览器控制台或 /session-delete/api 响应体里的 errors 数组
```

## 是否已跑过预演

```
node bin/dsh-session-delete.js <sessionId>   # 输出粘这里
```

预演不带 `--apply`，不改任何文件，可以放心贴。
