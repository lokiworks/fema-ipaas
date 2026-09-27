---
title: 连接器开发产出的是清单，由引擎里的运行时解释执行
icon: 📦
status: accepted
---

## Decision

「连接器开发」发布的连接器包里只有 `package.json`、三行的 `index.js` 和数据清单 `blueprint.json`。
`index.js` 调用 `globalThis.__femaConnectorBlueprintRuntime.build(manifest)`，这个运行时是引擎代码，
由 `connector-child.ts` 在加载任何连接器之前挂上。包没有依赖，走现有的 ARCHIVE 安装路径（`installBuiltArchive`）。

## Context

旧的无代码构建器只生成 TypeScript 源码，需要开发者拷进仓库再用 CLI 打包；设计文档 §4.15 要求在界面上直接发布、带版本和灰度。
正常的自定义连接器是 esbuild 打好的自包含包，而 API 进程里既没有 esbuild 也没有仓库源码。

## Why

解释执行让发布只是「序列化一份 JSON 再打 tar」，确定性、可测、离线可装，也不在 API 进程里执行任何开发者代码。
否决的方案是在 API 里生成源码并打包：要把打包工具链和整个 SDK 带进 API 镜像，每次 SDK 变化都得重新验证生成物。
加签插件是唯一的用户代码，它跟连接器一样只在 worker 沙箱里的子进程运行。

## Consequences

- 已发布的包依赖引擎提供这个全局钩子，改运行时要保持对旧清单（`schemaVersion: 1`）兼容，不能只改新版。
- 清单行为由引擎版本决定：同一个包在新引擎上可能表现不同（比如修了模板渲染的 bug），这与 ADR 0006 锁定连接器版本的意图有出入，改运行时语义时要写进 breaking-changes。
- 这些包不能拿出平台单独运行。
