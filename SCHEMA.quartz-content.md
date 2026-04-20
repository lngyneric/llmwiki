# SCHEMA（Quartz Content 发布规范｜A：无 permalink）

本规范用于：vault1（LLMWiki）在 CI 中 compile 后导出到 `export/`，并同步推送到 vault2（Quartz）的 `content/`，以保证 Quartz 构建稳定、URL 路径可预测、页面展示一致。

## 1. 目录映射（硬性约束）

- 导出根目录：`export/`
- 同步目标：`vault2/content/`（平铺映射）
- 映射规则：
  - `export/summaries/**.md` → `content/summaries/**.md`
  - `export/concepts/**.md` → `content/concepts/**.md`
  - `export/authoritative/**.md` → `content/authoritative/**.md`
  - `export/outputs/**.md` → `content/outputs/**.md`
  - `export/assets/**` → `content/assets/**`（可选）

## 2. URL 规则（无 permalink）

- URL 由 `content/` 下的文件路径决定
- 稳定性来源于“路径与文件名稳定”，不依赖 permalink

## 3. 文件命名（硬性约束）

- 文件名 slug：仅允许 `a-z0-9-`，必须小写，不允许空格
- 禁止字符：`:` `?` `#` `\` `"` `'` `*` `<` `>` `|`
- 禁止大小写冲突与同目录同名文件（避免跨平台差异与 URL 冲突）

## 4. Frontmatter 规范（丰富集）

### 4.1 全局要求（所有页面）

- 必须有且仅有一个 YAML frontmatter 块（`---` 开始，`---` 结束）
- 必填字段：
  - `title: string`（非空）
  - `type: summary | concept | authoritative | output | index`
  - `tags: string[]`（至少 1 个）
  - `created: YYYY-MM-DD | ISO8601`
  - `updated: ISO8601`
  - `draft: boolean`
- 推荐字段：
  - `description: string`（<= 200 字符）
  - `aliases: string[]`
- 溯源字段（建议保留）：
  - `source: string`
  - `raw_sha256: string`
  - `compiled_at: ISO8601`

### 4.2 页面模板（导出副本）

#### summaries

```yaml
---
title: "<源文件标题> 摘要"
type: summary
description: "<1-2 句摘要>"
tags: [summary, ingest]
created: 2026-04-20
updated: 2026-04-20T12:34:56.000Z
draft: false
aliases: []
source: "<raw 相对路径或 URL>"
raw_sha256: "<sha256>"
compiled_at: 2026-04-20T12:34:56.000Z
---
```

#### concepts

```yaml
---
title: "<概念名>"
type: concept
description: "<概念一句话定义>"
tags: [concept]
created: 2026-04-20
updated: 2026-04-20T12:34:56.000Z
draft: false
aliases: []
---
```

#### authoritative

```yaml
---
title: "<权威主题>"
type: authoritative
description: "<总结性描述>"
tags: [authoritative]
created: 2026-04-20
updated: 2026-04-20T12:34:56.000Z
draft: false
aliases: []
sources:
  - "summaries/<slug>"
---
```

#### outputs

```yaml
---
title: "<提问/任务标题>"
type: output
description: "<该次输出的目的/问题>"
tags: [output]
created: 2026-04-20
updated: 2026-04-20T12:34:56.000Z
draft: false
aliases: []
---
```

#### index

```yaml
---
title: "Index"
type: index
description: "Site entry"
tags: [index]
created: 2026-04-20
updated: 2026-04-20T12:34:56.000Z
draft: false
aliases: []
---
```

## 5. 内容样式规范

- 每页必须且仅一个 H1（`#`）
- 允许 `[[wikilink]]`
- 代码块必须闭合（``` 成对）
- 本地资源必须位于 `content/assets/`（导出为 `export/assets/`）并用相对路径引用，禁止绝对路径

## 6. Lint 预检规范（CI 阻断条件）

### ERROR（默认启用，阻断同步）

- YAML frontmatter 不可解析 / 未闭合 / 多个 frontmatter
- 缺少必填字段：`title/type/tags/created/updated/draft`
- `tags` 不是数组或为空数组
- `created/updated` 格式非法
- 文件名 slug 非法（非小写、含空格/非法字符）
- 大小写冲突、同目录同名文件冲突
- Markdown 基本结构错误：缺失 H1 或出现多个 H1、未闭合代码块

### WARN（推荐启用）

- `description` 缺失或超过 200 字符
- 空 wikilink：`[[]]`、`[[ ]]`
