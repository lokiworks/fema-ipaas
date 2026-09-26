---
title: 交互参照 AnyCross
icon: 🧭
---

# 交互参照 AnyCross

控制台的信息架构和交互以飞书集成平台为参照。它的对外品牌叫 AnyCross，控制台地址是 `anycross.feishu.cn`，不是 `ipaas.feishu.cn`。

只参照集成与自动化部分，数据集成（ETL）不在范围内。视觉仍然用本仓库自己的设计系统。

**高保真原型**：放在 `design/`，双击 `design/index.html` 即可打开，不需要构建。覆盖除数据集成以外的全部页面。

**调研摘要**：`design/research/anycross-reference.md`，记录了 AnyCross 每个页面的字段、按钮原文和交互细节，改控制台交互前先对照。

**术语对照**：

| AnyCross | 本仓库 |
| --- | --- |
| 工作流 | 工作流 |
| 项目 | 项目 |
| 应用凭证 | 连接 |
| 项目配置 | 项目配置 |

「项目配置」在本仓库里就是 Variables。AnyCross 用「配置组」区分环境，本仓库把它升级成**环境**：需要管控的项目可以开启「测试 + 生产」，两个环境各有配置值和连接替换，发布先到测试，再申请推广到生产。

**产品备忘**：`design/research/product-brief.md` 写了原型第二轮要证明的七个场景和能力取舍，改原型前先读。

## Gotchas

- **没有独立的工作流列表页**。AnyCross 的工作流挂在项目二级侧栏里，按文件夹组织；原型也是这样做的。
- **告警分两层，AnyCross 只有第二层**。平台内置「问题中心 + 告警策略」（`#/issues`、`#/issues/alerts`），负责按原因聚合、降噪和复发识别；更复杂的告警仍然可以用「告警触发器」开头的工作流。
- **工作流的 `version`、`published`、`status` 始终指生产环境**。开启测试环境的项目里，测试部署单独放在 `wf.test`；版本记录的 `envs` 记录这个版本部署过哪些环境。改发布相关逻辑时两处都要看。
- **字段映射是入参的一种取值方式**，存成 `{ $map: { fields } }`，和 JSON 写法可以来回切换，另一种写法暂存在 `config.__alt`。逐项映射里的「当前项」写作 `{{item.字段}}`，这类引用不参与上游节点校验（`domain.js` 的 `refScope`）。
- **调试运行按调试数据走分支**（`branchDecider`），只有真正会执行到的节点才会因为连接失效而失败；正式运行的轨迹仍然按种子随机生成。
- **身份集成、服务商、集成方案没有收进原型**。这些是 AnyCross 在 iPaaS 之外的业务线，本仓库没有对应能力。
- **原型脚本共享一个全局作用域**。`design/scripts` 下都是普通 `<script>`，新增顶层函数或常量前先全局搜索重名；重复的顶层 `const` 会让整个原型白屏。
- **htm 模板只能有一个根节点**。多个根（包括元素旁边的一段文字）会返回数组并触发 React key 警告，用 `<${Fragment}>` 包起来。
- **改演示数据结构要升存储版本号**。演示数据存在 localStorage（`core.js` 的 `STORE_KEY`），不升版本号时旧数据会按旧结构渲染出错。
- **节点引用写的是节点 id，显示的是固定 ref**。配置里是 `{{s1.items}}`，界面显示节点名和 `feishu-1` 这类 ref；ref 创建后不随位置变化，复制粘贴经 `cloneNodes` 重写引用。
- **原型没有构建和类型检查**。改完要把 `index.html` 里的脚本按顺序拼起来跑 ESLint（至少 `no-undef`、`no-redeclare`），再用 React 开发版打开页面看控制台的 key 警告。

## Key files

- `design/` — 原型，入口 `design/index.html`，路由表在 `design/scripts/app.js` 的 `ROUTES`
