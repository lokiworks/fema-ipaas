# NOTICE

本产品包含由第三方开发并按其原始许可证授权的软件。

## 1. FEMA Integration Platform（上游基线）

本项目派生自 FEMA Integration Platform Community Edition。

- 项目：FEMA Integration Platform
- 来源：https://github.com/lokiworks/fema-ipaas
- 基线提交：`eef1a1d4d22e4181859792813bf855c4038a3d0b`（v0.88.3，2026-08-22）
- 许可证：MIT
- 版权声明：

```
Copyright (c) 2020-2024 FEMA Integration Platform Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 明确排除的部分

上游 `packages/ee/` 与 `packages/server/api/src/app/ee/` 目录适用 FEMA Integration Platform
Enterprise License（**非** MIT）。本项目已完整删除这两个目录，未继承其中任何代码。
详见 `UPSTREAM.md`。

## 2. 连接器（Connectors）

`connectors/` 下的连接器可能各自携带独立许可证与商标。逐个核对结论记录于本节。

| 连接器 | 上游来源 | 许可证 | 备注 |
| --- | --- | --- | --- |
| _（Step 3 连接器裁剪完成后填写）_ | | | |

## 3. 商标声明

- FEMA Integration Platform 是 FEMA Integration Platform Inc. 的商标。本项目与 FEMA Integration Platform Inc. 无隶属关系，
  亦未获其背书。
- 飞书 / Feishu / Lark、企业微信、钉钉等为其各自权利人的商标。本项目仅在
  **交互与信息架构层面**参考公开产品文档，未复制其前端源码、图标资产、商标或
  任何受保护的视觉资源。

## 4. 其他依赖

npm 依赖的许可证信息见各自 `node_modules/<pkg>/LICENSE`。
