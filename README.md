# LLM Wiki CLI

本项目是一个本地 CLI：将 `raw/` 的原始剪藏“编译”到 `wiki/`，并把每次问答产物写入 `outputs/`，所有操作追加记录到 `wiki/log.md`。

## 快速开始

```bash
npm i
npm run dev -- init --model YOUR_MODEL_NAME
cp .env.example .env
# 编辑 .env 填入 ARK_BASE_URL / ARK_API_KEY（不要提交到 git）
echo "# test\nhello" > raw/a.md
npm run dev -- compile
npm run dev -- query "hello 是什么"
npm run dev -- status
```

## 环境变量（火山/字节）

> 目前默认以 OpenAI-compatible 方式请求（如不兼容，后续在 `src/provider/volcengine.ts` 调整请求格式）。

- 推荐用 `.env`（已提供 `.env.example` 作为模板，不要把真实 key 提交到 git）。
- 变量名支持两套：`ARK_*`（推荐）或 `VOLC_*`。

### ARK（推荐）

- `ARK_BASE_URL`（示例：`https://ark.cn-beijing.volces.com/api/coding/v3`）
- `ARK_API_KEY`

### 兼容命名

- `VOLC_BASE_URL`
- `VOLC_API_KEY`
