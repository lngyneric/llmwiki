# Schema 对齐（CLI + Obsidian 插件）设计

## 背景与目标

根目录的 SCHEMA.md 表示“外部项目导入的 Wiki 规范”。本项目需要：

1. 基于 SCHEMA.md 做能力差异分析（Missing / Extra / Notes）。
2. 按“最小可用”范围把关键规范能力补齐到 CLI 与 Obsidian 插件。
3. Obsidian 插件提供侧边栏面板与可配置的常用 5 个功能按钮。
4. Obsidian 设置页增加配置测试能力：分别测试文本模型与 Embedding。

本次按用户确认采用“自动迁移”策略：从旧路径 wiki/sources 自动迁移到 wiki/summaries。

## 非目标

1. 不实现 entities/comparisons/synthesis 等页面类型的自动生成内容（本次仅确保目录存在与规范可扩展）。
2. 不引入新的外部依赖库。
3. 不改变现有核心问答/编译链路的 LLM prompt 结构（除必要的输出路径与 index/log 维护）。

## 现状摘要（对比 SCHEMA）

### 已有能力

- CLI 命令：init / compile / query / status
- 编译输出：wiki/sources（单文件 per raw）、wiki/concepts（概念演进日志）
- 日志：wiki/log.md
- 状态：.llm-wiki/index.json、.llm-wiki/embeddings.json
- Obsidian 插件：命令入口（init/compile/query/follow-up/authoritative/status）与 settings

### 与 SCHEMA 的主要差异

- SCHEMA 期望 wiki/summaries，而当前实现为 wiki/sources
- SCHEMA 提及 wiki/index.md，但当前 CLI 未维护该索引文件
- SCHEMA 提及 entities/comparisons/synthesis/output 等目录结构，本项目未创建或未生成内容

## 方案概览

采用“能力注册表 + Schema 解析器”方案：

- Schema 解析器：读取 SCHEMA.md，抽取“期望目录/页面类型/流程关键词”。
- 能力注册表：描述“当前项目实际已实现与会产出的目录/文件/命令能力”。
- Diff 计算：输出 Missing / Extra / Notes，供 CLI 输出与插件侧边栏展示。

## 需求拆解与设计

### 1) Schema 差异分析

#### 输入

- 项目根目录下的 SCHEMA.md（若不存在，返回可理解的错误信息）

#### 输出

- `missing`: 规范期望但当前未覆盖的项
- `extra`: 当前存在但规范未提及的项
- `notes`: 映射/兼容说明（例如 sources→summaries 迁移策略）

#### 抽取规则（最小可用）

- 目录树：从 SCHEMA.md 中的目录树代码块提取目录名
- 页面类型：从标题中包含 `(xxx/)` 的段落提取页面类型目录（entities/ concepts/ summaries/ comparisons/ synthesis/）
- 关键文件：识别 `wiki/index.md`、`wiki/log.md` 这类显式文件名

#### 能力注册表（最小可用）

- 目录：raw、wiki、wiki/summaries、wiki/concepts、wiki/authoritative、outputs、prompts、config、.llm-wiki
- 文件：wiki/log.md、wiki/index.md（本次新增维护）
- 命令：init/compile/query/status + schema（本次新增）

### 2) CLI：对齐最小可用规范

#### 2.1 新增 schema 命令

- `llm-wiki schema`：输出 diff 报告（默认 Markdown，可选 JSON）
- 用途：让 CLI 与 Obsidian 插件复用同一份 Schema diff 计算逻辑

#### 2.2 init：创建规范目录结构

- 若存在 SCHEMA.md：根据抽取的目录结构创建缺失目录
- 无论是否存在 SCHEMA.md：仍保持创建 raw/wiki/outputs/prompts/config/.llm-wiki 等当前必需目录

#### 2.3 compile：summaries 输出与自动迁移

- 目标输出目录从 `wiki/sources` 改为 `wiki/summaries`
- 自动迁移策略：
  - 若 `wiki/summaries` 不存在且 `wiki/sources` 存在：将 sources 目录整体迁移到 summaries（保持相对结构）
  - 迁移后继续按 summaries 进行增量更新
- 增量键（index.raw）保持不变：仍按 raw 文件相对路径作为 key

#### 2.4 compile：自动维护 wiki/index.md

- compile 结束后维护 `wiki/index.md`
- 写入策略：
  - 以分类块组织（Summaries / Concepts / Authoritative / Outputs 可选）
  - 追加/更新时避免重复项（以文件路径作为唯一键）
- 保持可重复运行幂等

### 3) Obsidian 插件：侧边栏面板 + 常用 5 个按钮配置

#### 3.1 Ribbon → 侧边栏 View

- 添加 Ribbon 图标
- 点击后打开一个自定义 View（面板）

#### 3.2 面板内容

- 常用功能区：渲染 5 个按钮
  - 默认：Init / Compile / Query / Follow-up / Status
  - 按钮行为复用现有 plugin 内部方法（initWiki/compileWiki/queryWiki/followUpWiki/showStatus）
- Schema 区：展示 Schema diff 概览，并提供“重新分析”按钮

#### 3.3 Settings：常用按钮配置

- 新增 5 个 dropdown（Button 1~5）
- 可选项集合：
  - Init / Compile / Query / Follow-up / Authoritative / Status / Schema Diff
- 插件启动时与设置变更时刷新面板展示顺序

### 4) Obsidian Settings：配置测试按钮（文本与 embedding 分别测试）

#### 行为

- 文本模型测试：发起最小 chat/completions 请求，验证 baseUrl/apiKey/model
- Embedding 测试：发起最小 embeddings 请求，验证 embedBaseUrl/embedApiKey/embedModelName

#### 成功/失败反馈

- 成功：Notice 提示 “Success”
- 失败：Notice 提示 “Failed: <短错误>”
- 不记录或打印任何密钥信息

## 兼容性与迁移

- sources→summaries：采用自动迁移策略（compile 时执行一次迁移）
- 旧输出与引用：
  - 旧文件在迁移后路径改变，后续引用将以 summaries 为准
  - Obsidian 插件的 authoritative 源引用与 follow-up 逻辑保持现状（但需要确认 sources→summaries 后，相关路径匹配逻辑是否需要同步）

## 测试策略

- CLI：
  - init 后目录结构存在性断言
  - compile 在存在 wiki/sources 的场景下自动迁移并继续产出 summaries
  - index.md 幂等更新（重复 compile 不重复追加）
  - schema 命令输出结构正确
- 插件（基础）：
  - settings 写入与读取
  - 常用按钮配置对面板展示生效
  - 测试按钮在无 key 时提示错误、在 mock fetch 下返回成功

