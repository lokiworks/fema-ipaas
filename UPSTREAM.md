# 上游基线（Upstream Baseline）

本仓库是 FEMA Integration Platform Community Edition 的二次开发分支。本文件按设计文档 §46 Step 0
冻结基线，作为 License 合规与后续差异比对的唯一权威记录。

从本次冻结开始，**不再长期跟随上游 main**。上游变更以「显式挑选并记录」的方式引入。

## 冻结记录

| 项 | 值 |
| --- | --- |
| `UPSTREAM_REPO` | https://github.com/lokiworks/fema-ipaas |
| `UPSTREAM_COMMIT` | `eef1a1d4d22e4181859792813bf855c4038a3d0b` |
| `UPSTREAM_COMMIT_DATE` | 2026-08-22T15:42:39+03:00 |
| `UPSTREAM_VERSION` | 0.88.3 |
| `LICENSE_BASELINE` | MIT（根 LICENSE）+ FEMA Integration Platform Enterprise License（`packages/ee/`、`packages/server/api/src/app/ee/`） |
| `FORK_DATE` | 2026-08-23 |
| `FORK_BRANCH` | `feat/fema-oip-transformation` |

## License 基线的关键含义

冻结时刻的上游同时包含两种许可证：

- `packages/ee/` 与 `packages/server/api/src/app/ee/` 下的全部内容，适用
  `packages/ee/LICENSE` 定义的 **FEMA Integration Platform Enterprise License**（商业许可，不可自由使用）。
- 其余内容适用 **MIT**。

因此本项目在 Step 1 中**完整删除**上述两个目录，且不得从其中复制任何代码片段到
MIT 区域。删除完成后，本仓库的全部继承代码来源于上游 MIT 部分。

第三方连接器（原 `packages/connectors/community/*`）各自可能携带独立许可证，按 §45.4
在裁剪与迁移时逐个核对，结论记入 `NOTICE.md`。

## 与上游同步的规则

1. 不执行 `git merge upstream/main`。
2. 需要上游某个修复时，`git cherry-pick` 单个提交，并在提交信息中写明上游 commit。
3. 任何从上游新引入的文件，必须确认其不属于 EE 目录，并在 `NOTICE.md` 增加来源条目。
