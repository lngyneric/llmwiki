# LLM Wiki CLI

本项目是一个本地 CLI：将 `raw/` 的原始剪藏“编译”到 `wiki/`，并把每次问答产物写入 `outputs/`，所有操作追加记录到 `wiki/log.md`。

## 快速开始

```bash
npm i
npm run dev -- init --model YOUR_MODEL_NAME
echo "# test\nhello" > raw/a.md
npm run dev -- compile
npm run dev -- query "hello 是什么"
npm run dev -- status
```

## 环境变量（火山/字节）

> 目前默认以 OpenAI-compatible 方式请求（如不兼容，后续在 `src/provider/volcengine.ts` 调整请求格式）。

- `VOLC_BASE_URL`
- `VOLC_API_KEY`

