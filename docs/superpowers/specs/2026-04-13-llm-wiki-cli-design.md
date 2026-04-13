# LLM Wiki（CLI + Node.js/TypeScript + 火山/字节）设计文档

日期：2026-04-13  
状态：Draft（待你审阅确认）

## 1. 背景与目标

该项目参考 Andrej Karpathy 的 llm-wiki 模式，用“编译”的方式将原始剪藏（Raw）沉淀为可浏览、可复用、可持续维护的 Wiki 层知识。

### 1.1 核心理念（必须满足）

1. **Raw 层不可变**：原始来源一旦进入 `raw/`，工具绝不修改其内容（只允许新增）。
2. **Wiki 层由 LLM 维护**：`wiki/` 内容由编译流程生成与更新；人类仅浏览，不手工编辑（避免漂移与不可追溯）。
3. **输出必须持久化**：所有“回答/产物”必须写入 `outputs/`，不只停留在对话或终端输出中。
4. **矛盾必须显式标注**：对不同来源的冲突结论，必须以结构化方式在 Wiki 中标记。
5. **每次操作记日志**：所有编译、查询、异常都追加写入 `wiki/log.md`。

### 1.2 MVP 目标

- 在本地目录初始化出标准结构（raw/wiki/outputs/log/config）。
- 提供一个可运行的 **CLI**：
  - `init`：初始化项目
  - `compile`：raw → wiki 的增量编译
  - `query`：基于 wiki（可选 raw）回答，并写入 outputs
  - `status`：展示编译状态
- 支持接入 **火山/字节模型** 作为默认 LLM Provider（通过配置/环境变量）。
- 全流程“可追溯、可重放”：每次编译有输入清单、产出清单、错误信息与时间戳。

### 1.3 非目标（MVP 不做）

- Web UI/知识库站点（后续可接 VitePress/Docusaurus）。
- PDF/图片 OCR、复杂爬虫（先聚焦 markdown/txt/html-to-md）。
- 实时对话式 Agent 体系（先把编译闭环跑通）。

## 2. 用户故事与成功标准

### 2.1 用户故事

1. 我把文章/笔记丢进 `raw/`（剪藏），运行一次 `compile`，就能在 `wiki/` 看到结构化沉淀。
2. 我问一个问题，`query` 会基于 wiki 给答案，并把答案写入 `outputs/` 以便长期引用。
3. 如果不同来源矛盾，wiki 页面里能清晰看到“冲突点 + 各自证据”。
4. 我可以查看 `wiki/log.md` 回溯任何一次编译/查询做了什么、改了哪些页面、是否失败。

### 2.2 成功标准

- Raw 不被修改（可通过 hash/mtime 策略保证）。
- `compile` 可重复运行且幂等：无新增 raw 时，不应产生无意义的 wiki 变化。
- `query` 每次都有落盘输出文件（带时间戳/slug）。
- `wiki/log.md` 可读且结构一致（支持后续机器解析）。

## 3. 项目结构（目录约定）

在用户选定文件夹下初始化：

```
.
├── raw/                     # 原始剪藏（只增不改）
├── wiki/                    # LLM 维护的 Wiki（可更新）
│   └── log.md               # 操作日志（追加写）
├── outputs/                 # 每次 query/产物落盘
├── prompts/                 # 提示词模板（可版本化）
├── config/
│   └── llm-wiki.config.json # 配置文件（provider/model/path 等）
└── .llm-wiki/
    ├── index.json           # raw 文件索引（hash/mtime/编译状态）
    └── runs/                # 每次 compile 的运行记录（可选）
```

### 3.1 不可变边界

- `raw/**`：不可变（工具禁止覆盖/重写）
- 其他目录：可由工具创建/更新

## 4. CLI 设计

命令名暂定：`llm-wiki`

### 4.1 `llm-wiki init`

初始化目录结构、默认配置与提示词模板。

输出：
- 创建上述目录
- 生成 `config/llm-wiki.config.json`
- 生成 `wiki/log.md`（写入 init 记录）

### 4.2 `llm-wiki compile`

增量编译 raw → wiki。

关键行为：
- 扫描 `raw/**`，只处理**新增/变更**的 raw 文件（变更的判断可用 hash 优先，mtime 兜底）。
- 对每个 raw 文档生成对应的 wiki 页面（或更新聚合页面）。
- 发生冲突时写入冲突块（见 5.3）。
- 记录运行日志到 `wiki/log.md`，并更新 `.llm-wiki/index.json`。

可选参数：
- `--full`：忽略索引，全量重编译（仍不修改 raw）。
- `--dry-run`：不写 wiki，只输出计划变更与将调用的 LLM 请求摘要。
- `--concurrency N`：并发数（注意 provider 限流）。

### 4.3 `llm-wiki query "<question>"`

基于 wiki 进行问答，并把结果写入 outputs。

关键行为：
- 组装上下文（MVP：从 `wiki/` 取相关页面；可先用简单关键词检索 + topK）。
- 调用 LLM 生成答案（可要求输出结构化：结论/要点/引用/不确定性）。
- 将结果写入 `outputs/YYYYMMDD-HHMMSS-<slug>.md`
- 追加日志到 `wiki/log.md`

可选参数：
- `--use-raw`：允许同时检索 raw（默认 false，优先贯彻“编译一次”理念；但可作为调试开关）。
- `--format md|json`：输出格式（MVP 默认 md）。

### 4.4 `llm-wiki status`

展示：
- raw 文件总数、已编译数、失败数
- 最近一次 compile 的时间、耗时
- 最近一次 query 的时间

## 5. 编译器（raw → wiki）设计

### 5.1 输入类型（MVP）

- `raw/**/*.md`
- `raw/**/*.txt`

（后续扩展：html→md、pdf→text）

### 5.2 Wiki 页面组织（MVP 先保守）

建议以“每个 raw 文档一页”开始，避免过早做复杂聚合：

```
wiki/sources/<raw-relative-path>.md
```

页面模板包含：
- 元信息：来源路径、首次编译时间、最近编译时间、raw hash
- 摘要（TL;DR）
- 关键要点（bullet）
- 术语与定义（可选）
- 可链接的词条建议（可选）
- 引用与证据片段（从 raw 中摘录，注明段落/标题）
- 冲突标注（若存在）

后续迭代再增加：
- `wiki/index.md`（全局索引）
- `wiki/topics/<topic>.md`（跨来源聚合）

### 5.3 冲突（矛盾）标注规范

当同一主题在不同来源出现不一致结论，Wiki 中必须出现类似块（Markdown）：

```md
> [!WARNING] 冲突：<冲突点一句话>
> - 观点 A：...（来源：raw/...#...）
> - 观点 B：...（来源：raw/...#...）
> - 现状：暂不裁决 / 倾向 A（理由：...）/ 需要更多来源
```

MVP 冲突检测策略：
- 先不做复杂 NLP 对齐；以“由 LLM 在编译时总结时主动发现潜在矛盾”为主。
- 只要 LLM 输出里标记为 conflict，就以固定模板写入。

## 6. LLM Provider 抽象（火山/字节）

### 6.1 接口约定

```ts
interface LlmProvider {
  name: string;
  generateText(input: {
    system?: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    text: string;
    raw?: unknown; // 供应商原始响应（用于调试）
  }>;
}
```

### 6.2 火山/字节实现策略

MVP 优先两种落地方式（按实际 API 选择其一）：

1. **OpenAI-compatible**：若火山提供兼容 OpenAI Chat Completions 的接口，则使用通用 OpenAI SDK/HTTP 调用，并通过 baseURL/model 配置切换。
2. **Native API**：若不兼容，则实现独立的 HTTP client（封装鉴权、重试、限流、错误码映射）。

鉴权信息：
- 环境变量优先（避免写入仓库）：如 `VOLC_API_KEY` / `ARK_API_KEY` / `VOLC_BASE_URL`（以你实际命名为准）
- `config/llm-wiki.config.json` 可配置 model、region、endpoint 等

## 7. 配置设计

`config/llm-wiki.config.json`（示例字段，最终以实现为准）：

```json
{
  "paths": {
    "rawDir": "raw",
    "wikiDir": "wiki",
    "outputsDir": "outputs",
    "stateDir": ".llm-wiki"
  },
  "provider": {
    "type": "volcengine",
    "model": "YOUR_MODEL_NAME",
    "baseUrl": "",
    "temperature": 0.2,
    "maxTokens": 2000
  },
  "compile": {
    "concurrency": 2
  },
  "query": {
    "topK": 8
  }
}
```

## 8. 日志与可追溯性

`wiki/log.md` 采用追加写（append-only），每条记录包含：
- 时间戳
- 操作类型：init/compile/query
- 输入摘要：处理了哪些 raw、问题内容（query）
- 输出摘要：写入/更新了哪些 wiki 页面、输出文件路径（outputs）
- 错误（如有）：错误栈/供应商错误码/重试次数

建议用“可读 + 可机读”的折中格式，例如：

```md
## 2026-04-13 15:04:05 compile
- rawChanged: 3
- wikiUpdated:
  - wiki/sources/xxx.md
- durationMs: 12345
- status: ok
```

## 9. 错误处理与重试

- LLM 调用：指数退避重试（对 429/5xx），并记录到 log。
- 单文件失败不应中断全局 compile：在 index 里记录失败原因，下次可重试。
- 任何写文件前先确保目录存在；写入采用“先写临时文件再原子替换”（避免半写状态）。

## 10. 安全与隐私

- 默认不上传 raw 全量：编译 prompt 只发送必要片段（MVP 可先全量，后续优化）。
- 不在仓库/日志中写入密钥。
- 对 outputs/wiki 中包含敏感内容的风险给出提示（README 中说明）。

## 11. 测试策略（MVP）

- 单元测试：
  - 路径解析、索引增量判断、slug 生成、日志格式化
- 集成测试（可用 mock provider）：
  - init → compile → query 的端到端落盘验证
  - 断言 raw 未被修改

## 12. 里程碑

M1（MVP）：
- init/compile/query/status 命令可用
- volcengine provider 可用（或至少 provider 抽象 + mock 可用）
- 产出落盘、日志落盘、冲突块格式落盘

M2：
- wiki 聚合页面（topics/index）
- 更好的检索（BM25/向量可选，但仍坚持“编译一次”）

---

## 需要你确认的点（请在审阅时重点看）

1. Wiki 页面组织：MVP 先“每 raw 一页”是否接受？还是希望一开始就按 topic 聚合？
2. query 默认是否允许检索 raw（我在设计里默认 false，仅在 `--use-raw` 打开）。
3. 火山/字节的接入方式：你希望用 OpenAI-compatible 方式（如可用）还是直接用官方原生 API？

