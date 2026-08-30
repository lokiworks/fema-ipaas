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

## Gotchas

- **改默认语言救不了老浏览器。** detector 的 `caches: ['localStorage']` 每次加载都会把解析结果回写，
  所以在这条决策生效之前打开过应用的浏览器里，躺着一个从没人主动选过的 `i18nextLng=en`，
  它的优先级高于 `fallbackLng`，界面会永远停在英文。语言切换器在账户设置里、也就是登录之后，
  卡在英文的人在登录页上没有任何入口切回来。
  修法是换存储 key（`lookupLocalStorage: 'fema.language'`），让旧值自动失效；
  显式选过语言的人仍按新 key 走。临时自救用 `?lng=zh`。
  下次再动语言解析逻辑，记得旧 key 的值不会自己消失。
- **连接器的名字不归 `translation.json` 管。** 连接器的 `displayName`、`description`、动作名、
  属性标签走的是各自的 `src/i18n/zh.json`，由 API 按 `?locale=` 翻译；
  `connectorTranslation.pathsToValuesToTranslate`（`packages/connectors/sdk`）决定哪些字段会被翻，
  漏了字段就是整列英文，跟 web 的翻译文件填得多满都没关系。
- **改了连接器的 `zh.json` 要重建再重启 API。** 连接器从 `dist/src/i18n/` 读翻译，
  而 `tsx watch` 明确 `--exclude packages/connectors/**`，改源码不会触发任何重载。
  顺序是 `turbo run build --filter='@fema-ipaas/connector-*'`，再 touch 一个 api 源文件让 tsx 重启。
