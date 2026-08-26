---
title: 界面默认简体中文，不跟随浏览器语言
icon: 🀄
status: accepted
---

## Decision

`packages/web/src/i18n.ts` 的 `fallbackLng` 是 `LocalesEnum.CHINESE_SIMPLIFIED`，
并且把 `LanguageDetector` 的 `order` 限定为 `['querystring', 'localStorage']`——
不再探测 `navigator.language`。

结果是：没选过语言的人一律看到简体中文；选过的人按 `localStorage.i18nextLng` 走；
`?lng=en` 可以临时切英文。

`packages/web/public/locales/zh/translation.json` 是要维护的一等文件，不是生成物。

## Context

产品对标飞书集成平台，主要使用者是中文团队。上游的默认是 `fallbackLng: 'en'` 加浏览器语言探测，
在英文系统的机器上打开就是英文界面。

接手时 zh 文件里约 600 条是繁体（台湾用语），术语还带着 Activepieces 的直译痕迹：
`Workflow` 是「流」、`Connector` 是「块」（Pieces 的字面翻译）、`Publish` 是「重新上架」。

## Why

默认中文才是这个产品的正常形态，把它交给浏览器语言等于让多数人第一眼看到错的那个。
关掉浏览器探测而不是只改 `fallbackLng`，是因为 detector 命中 `en` 时 fallback 根本不会生效。

代价：英文使用者要手动切一次语言。保留 `querystring` 就是给这种情况留的口子。

被否掉的做法是写死 `lng: 'zh'`——那样连用户自己的选择都被覆盖掉。

## Consequences

- 新增用户可见文案时，`en` 和 `zh` 两个文件都要填，`zh` 缺失会回落到英文 key 而不是英文句子。
- 术语以导航为准：工作流 / 连接器 / 连接 / 触发器 / 动作 / 步骤 / 发布 / 运行中心。
- 只写简体。仓库里已用 `opencc` 的 `tw2sp` 清过一轮，再混入繁体会很显眼。
- `en/translation.json` 里目前约 390 条是孤儿 key（对应 UI 已删，多为计费/套餐文案），
  翻译时不必管它们；真要清理，先确认没有动态 `t(variable)` 引用。
