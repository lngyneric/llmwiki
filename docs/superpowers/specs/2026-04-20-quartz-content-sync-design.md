# Quartz Content 同步（vault1→vault2）设计稿

## 背景与目标

目标是在保持 vault2（Quartz 站点工程）内容管理清晰的前提下，让 vault1（LLMWiki）在 CI 中完成：

1. 运行 compile 产出/更新 LLMWiki 页面
2. 导出到一个干净目录 `export/`（仅包含可发布内容）
3. 对 `export/` 做 lint 预检（阻断会导致 Quartz 构建失败的内容）
4. 将 `export/` 镜像同步提交到 vault2 的 `content/`

约束与已确认偏好：

- 同步方式：GitHub Actions，在 vault1 直接 push 到 vault2（同账号/组织）
- vault2 的 URL 由路径决定，不生成 permalink
- Quartz 已支持 Obsidian `[[wikilink]]`，导出阶段不做强制转换
- Frontmatter 采用“丰富集”，在导出副本中补齐字段，不修改源文件
- 导出映射为 `content/*` 平铺（不套 `content/wiki/*`）

## 术语

- vault1：LLMWiki 仓库（知识编译/产出侧）
- vault2：Quartz v4 仓库（站点发布侧）
- export：vault1 侧生成的可发布内容目录
- content：vault2 侧 Quartz 的内容根目录

## 范围

### In Scope

- vault1 增加导出与 lint 预检能力（命令或脚本实现由实现阶段确定）
- 定义 export 目录结构、内容映射、frontmatter 规范与 lint 规则
- GitHub Actions 工作流：compile → export → lint → 同步 push vault2/content
- lint 报告产物：JSON + Markdown

### Out of Scope

- Quartz 主题、导航、布局、插件链调整
- 自动生成/维护 permalink
- 对 `[[wikilink]]` 的强制转换或跨仓库链接重写
- vault2 的发布流程与域名配置

## 内容契约（SCHEMA：Quartz Content 发布规范｜A：无 permalink）

### 目录映射（硬性约束）

- 导出根目录：`export/`
- 同步目标：`vault2/content/`（平铺映射）
- 映射规则：
  - `export/summaries/**.md` → `content/summaries/**.md`
  - `export/concepts/**.md` → `content/concepts/**.md`
  - `export/authoritative/**.md` → `content/authoritative/**.md`
  - `export/outputs/**.md` → `content/outputs/**.md`
  - `export/assets/**` → `content/assets/**`（可选）

### 信息架构（IA）

content/
├── index.md
├── summaries/
│   ├── index.md
│   └── <slug>.md
├── concepts/
│   ├── index.md
│   └── <slug>.md
├── authoritative/
│   ├── index.md
│   └── <slug>.md
├── outputs/
│   ├── index.md
│   └── <yyyy>/<mm>/<slug>.md
└── assets/（可选）

### URL 规则

- URL 由 `content/` 下的文件路径决定
- 稳定性来源于“路径与文件名稳定”，不依赖 permalink

### 文件命名（硬性约束）

- 文件名 slug：仅允许 `a-z0-9-`，必须小写，不允许空格
- 禁止字符：`:` `?` `#` `\` `"` `'` `*` `<` `>` `|`
- 禁止大小写冲突（同路径不同大小写在不同 OS 上行为不一致）
- 禁止同目录同名文件（避免路径/URL 冲突）

## Frontmatter 规范（丰富集）

### 全局要求（所有页面）

- 必须有且仅有一个 YAML frontmatter 块（`---` 开始，`---` 结束）
- 必填字段：
  - `title: string`（非空）
  - `type: summary | concept | authoritative | output | index`
  - `tags: string[]`（至少 1 个）
  - `created: YYYY-MM-DD | ISO8601`
  - `updated: ISO8601`
  - `draft: boolean`（默认 `false`）
- 推荐字段：
  - `description: string`（<= 200 字符）
  - `aliases: string[]`（可为空数组）
- 溯源字段（建议保留）：
  - `source: string`
  - `raw_sha256: string`
  - `compiled_at: ISO8601`

### 各类型页面模板（导出副本）

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
source: "<raw 相对路径或 URL>"
raw_sha256: "<sha256>"
compiled_at: 2026-04-20T12:34:56.000Z
aliases: []
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
sources:
  - "summaries/<slug>"
aliases: []
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

## 内容样式规范（展示一致性）

- 每页必须且仅一个 H1（`#`）
- 允许 `[[wikilink]]`，不强制转换
- 代码块必须闭合（``` 成对）
- 本地资源必须位于 `content/assets/`（导出为 `export/assets/`）并用相对路径引用，禁止绝对路径

## export 生成策略

### 输入范围（vault1）

- `wiki/summaries/**.md`
- `wiki/concepts/**.md`
- `wiki/authoritative/**.md`
- `outputs/**.md`
- 可选：`input/assets/**` 或其他可发布资源目录（实现阶段配置）

### 输出规则

- 每次导出生成“干净目录” `export/`
- 导出过程中允许对内容做“发布级规范化”，但仅作用于 `export/`：
  - 补齐 frontmatter 必填/推荐字段
  - 规范化文件名 slug（必要时进行安全转换并产出映射日志）
  - 生成入口页：`export/index.md` 与各目录 `index.md`
- 不修改 vault1 的源 Markdown

## lint 预检设计

### 目标

在内容进入 vault2 之前发现会导致 Quartz 构建失败或 URL/展示不稳定的问题，并给出可定位的报告。

### 输出

- `export/lint-report.json`：包含规则、严重级、文件、定位信息、消息
- `export/lint-report.md`：对人友好的汇总与清单

### 规则集合

#### ERROR（默认启用，阻断同步）

- YAML frontmatter 不可解析 / 未闭合 / 多个 frontmatter
- 缺少必填字段：`title/type/tags/created/updated/draft`
- `tags` 不是数组或为空数组
- `created/updated` 格式非法
- 文件名 slug 非法（非小写、含空格/非法字符）
- 大小写冲突（同一路径出现不同大小写的文件）
- 同目录同名文件冲突（路径/URL 冲突）
- Markdown 基本结构错误：
  - 缺失 H1 或出现多个 H1
  - 未闭合代码块（```）

#### WARN（推荐启用）

- `description` 缺失或超过 200 字符
- 空 wikilink：`[[]]`、`[[ ]]`
- 导出范围内的疑似坏链接（仅检查 `export/` 内可解析的目标）

## GitHub Actions（vault1）推送到 vault2 的策略

### Secrets

- `VAULT2_PAT`：对 vault2 仓库具有写权限的 PAT
- `VAULT2_REPO`：例如 `org/quartz-vault2`
- `VAULT2_BRANCH`：例如 `main`

### 流程

1. checkout vault1
2. 安装依赖
3. 运行 compile
4. export 生成 `export/`
5. lint 检查 `export/` 并生成报告
6. checkout vault2
7. 将 `export/` 镜像到 `vault2/content/`（覆盖式同步）
8. commit 并 push（提交信息包含 vault1 commit sha 与 lint 报告概要）
9. 可选：在 vault2 再跑一次 Quartz build 作为最终验证

## 风险与缓解

- 内容格式导致 Quartz 构建失败：用 lint 的 ERROR 规则阻断同步
- URL 变更：用 slug 规则 + 目录映射稳定化，避免随意改名
- 不同 OS 的路径/大小写差异：lint 检测大小写冲突与非法字符
- 溯源困难：保留 `source/raw_sha256/compiled_at` 等字段，commit message 记录 vault1 sha

## 验收标准

- CI 在 vault1 能完成 compile → export → lint → 推送 vault2/content
- lint 失败时 CI 阻断，并输出可定位的报告（JSON + Markdown）
- vault2 拉取更新后 Quartz 构建成功，且 URL 与目录结构一致
