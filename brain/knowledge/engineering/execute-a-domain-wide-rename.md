---
title: 执行一次全域重命名
icon: 🔤
---

把一个领域词换掉（Piece→Connector、Project→Workspace、Flow→Workflow…）是几万处替换 +
几百个文件改名。做过一轮之后，下面这套顺序和陷阱清单是有效的；凭直觉写正则一定会翻车。

## 顺序

1. **一次只换一个词，每换完一个就 build + lint + test，然后单独提交。**
   把两个词合在一轮里，编译错误会互相掩盖，回滚也没有着力点。
2. **先处理会被误伤的复合词**，再做主替换。例：`ActivepiecesError` 必须先变成
   `ApplicationError`，否则 `piece→connector` 会把它变成 `ActiveconnectorsError`。
3. **有专属映射的子词先做。** `FlowRun → Execution` 必须早于 `Flow → Workflow`，
   否则会得到 `WorkflowRun`。
4. **先改文件内容，再改文件/目录名**（`os.walk(topdown=False)`，深的先改），
   最后 `bun install` 重新链接工作区。
5. 改完包名或工作区 glob，`bun install` 是必须的，不然 turbo 仍在解析旧名字。

## 陷阱

- **大小写要保序，且长的先替换。** 替换表按 `PIECES, Pieces, pieces, PIECE, Piece, piece`
  排列，用一个 alternation 正则一次匹配，别做多轮 `str.replace`——多轮会把上一轮的结果
  再替换一次。
- **边界规则往往是不对称的。** `Flow` 大写形式在本仓库无歧义（不存在 `WorkFlow` /
  `SubFlow` / `OverFlow`），所以 `mockFlow`、`LockFlowRequest` 都能直接换；但小写
  `flow` 必须要求**前一个字符不是字母**，否则 `workflow`、`overflow`、`subflow`
  会被改成 `workworkflow`、`overworkflow`。下手前先跑这两条确认：

  ```bash
  grep -rhoE "[A-Za-z]flow[A-Za-z]*" packages --include='*.ts' | sort | uniq -c | sort -rn
  grep -rhoE "[A-Za-z]Flow[A-Za-z]*" packages --include='*.ts' | sort | uniq -c | sort -rn
  ```

- **负向断言别写太宽。** 为了保护 `--project` 这个 CLI flag 写 `(?<!-)project`，
  结果把 `ap-project-display.tsx` 这类连字符文件名也跳过了——文件被改名、import 没被改，
  build 才报出来。要挡的是两个连字符就写 `(?<!--)`。
- **第三方 API 名不是领域词汇，改完必须还原。** 本轮踩到的：
  `useReactFlow` / `ReactFlowProvider` / `ReactFlowInstance` / `.react-flow` CSS 类
  （@xyflow/react）、esbuild 的 `platform: 'node'`、`os.platform()`。
  替换脚本里用占位符保护，或事后专门 grep 一轮。
- **`.mts` / `.cts` 很容易漏。** vite/vitest 配置常是 `.mts`，漏了它 alias 会指向旧包名，
  症状是 tsc 通过但 vite build 说 "is not exported by ..."（它退回 node_modules 里的
  CJS 产物去解析）。
- **目录改名可能撞名。** `lib/flow-run/flow-run.ts` 和 `lib/flow-run/execution/` 一起改，
  会变成 `lib/execution/execution.ts` 和 `lib/execution/execution/`，
  index 里两条 `export * from './lib/execution/execution'` 互相遮蔽。改完扫一眼重复导出。
- **`.md` / `.yml` 也在替换范围内的话，会连带改掉产品名。** 本轮 `activepieces`
  被改成 `activeconnectors`，波及 370 个文件里的 PG 数据库名、Helm chart 名、CI 服务名。
  要么把产品名先排除，要么事后统一修一遍。

## 收尾

- DB 表名和列名全变了 ⇒ 基线迁移要**重新生成**，见 *regenerate-the-baseline-migration*。
- 指令文件（`CLAUDE.md`、`.claude/rules/`）会被机械改名，但**内容会变成用新词汇描述旧架构**，
  比过期更危险。逐条读一遍，不要只看 diff。
- 判定用 grep 而不是感觉：

  ```bash
  for t in piece Piece pieces AppConnection project Project FlowRun activepieces; do
    printf "%-16s %s\n" "$t" "$(grep -rn "\b$t\b" packages --include='*.ts' --include='*.tsx' \
      | grep -v node_modules | grep -v '/dist/' | wc -l)"
  done
  ```
