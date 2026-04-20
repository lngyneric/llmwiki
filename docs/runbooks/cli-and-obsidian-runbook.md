# CLI + Obsidian 插件：打包与运行手册

本手册适用于同时使用：

- **LLMWiki CLI（vault1 侧）**：负责 `raw/ → wiki/` 编译、`outputs/` 产物、以及 `export/ + lint`（用于同步到 Quartz）
- **LLMWiki Obsidian 插件（vault 内）**：在 Obsidian 中触发 init/compile/query/follow-up/authoritative 等动作

---

## 1. 目录与 Vault 约定（建议）

建议将你的 Obsidian Vault 作为 vault1（LLMWiki 项目根目录）使用，使 CLI 与插件都对同一份目录结构读写：

```
<vault-root>/
├── raw/
├── wiki/
├── outputs/
├── export/
├── config/llm-wiki.config.json
└── .llm-wiki/
```

说明：

- 插件的 init/compile/query 会读写 vault 根目录下的 `raw/ wiki/ outputs/ .llm-wiki/`
- CLI 的 init/compile/query/export/lint 同样以项目根目录为工作目录

---

## 2. CLI：安装、打包、运行

### 2.1 前置条件

- Node.js 20+（推荐）
- npm

### 2.2 安装方式 A（推荐：全局可执行 llm-wiki）

在仓库根目录（或你 clone 的 LLMWiki 目录）执行：

```bash
npm install
npm run build
npm link
```

安装脚本（等价于以上三步）：运行 [install.sh](file:///Users/cherrych/Documents/trae_projects/LLMWiki/install.sh)

```bash
bash install.sh
```

验证：

```bash
llm-wiki -V
```

### 2.3 安装方式 B（不全局安装：开发模式运行）

```bash
npm install
npm run dev -- -V
```

### 2.3.1 CLI 打包产物说明

- `npm run build` 会产出 `dist/`（包含 `dist/cli.js` 与 `dist/index.js`）
- 生产/CI 环境推荐直接运行：

```bash
node dist/cli.js <command>
```

### 2.4 CLI 运行步骤（最短链路）

#### Step 1：初始化项目结构

在你的 Vault 根目录执行：

```bash
llm-wiki init --model YOUR_MODEL_NAME
```

#### Step 2：配置模型访问（环境变量）

复制 `.env.example` 为 `.env`，填写以下任一套（不要提交到 git）：

- ARK（推荐）：`ARK_BASE_URL`、`ARK_API_KEY`
- 或兼容命名：`VOLC_BASE_URL`、`VOLC_API_KEY`

#### Step 3：准备 raw 内容

把 markdown/text 放入 `raw/`，例如：

```bash
echo "# test\nhello" > raw/a.md
```

#### Step 4：编译

```bash
llm-wiki compile
```

#### Step 5：查询（会写入 outputs/）

```bash
llm-wiki query "hello 是什么"
```

#### Step 6：导出 + 预检（用于 Quartz 同步）

```bash
llm-wiki export
llm-wiki lint
```

输出：

- `export/`：可发布内容目录
- `export/lint-report.json`
- `export/lint-report.md`

---

## 3. Obsidian 插件：打包、安装、运行

### 3.1 打包插件（开发者/从源码构建）

插件工程位于 `obsidian-plugin/`，其构建脚本：

- `npm run dev`：watch 模式（开发）
- `npm run build`：生产构建（输出 `obsidian-plugin/main.js`）

依赖安装工具建议使用 pnpm（该目录包含 `pnpm-lock.yaml`，用 npm 可能遇到依赖冲突导致安装失败）。

插件依赖 `llm-wiki` 包（`file:../`），因此在构建插件前先确保根目录已 build 出 `dist/`：

```bash
cd <repo-root>
npm install
npm run build
```

在仓库根目录：

```bash
cd obsidian-plugin
pnpm install
pnpm run build
```

构建配置：见 [esbuild.config.mjs](file:///Users/cherrych/Documents/trae_projects/LLMWiki/obsidian-plugin/esbuild.config.mjs)

构建输出：

- `obsidian-plugin/main.js`（打包后的插件入口）
- `obsidian-plugin/manifest.json`

如需生成一个可分发的插件目录，按以下结构准备：

```
obsidian-llmwiki-plugin/
  ├── main.js
  └── manifest.json
```

将 `obsidian-plugin/main.js` 与 `obsidian-plugin/manifest.json` 复制进去即可。

### 3.2 安装插件（用户：使用 release 包）

推荐使用 release 目录的已构建文件：

- `obsidian-plugin/release/obsidian-llmwiki-plugin/`（包含 `main.js` 与 `manifest.json`）
- 或解压 `obsidian-plugin/release/obsidian-llmwiki-plugin-v1.0.4.zip`

把整个文件夹复制到你的 Vault：

```
<vault-root>/.obsidian/plugins/obsidian-llmwiki-plugin/
  ├── main.js
  └── manifest.json
```

manifest 版本参考：[manifest.json](file:///Users/cherrych/Documents/trae_projects/LLMWiki/obsidian-plugin/manifest.json)

### 3.3 在 Obsidian 中启用插件

1. Settings → Community plugins
2. Turn off Safe Mode
3. 刷新已安装插件列表
4. 启用 “LLM Wiki”

### 3.4 插件运行步骤（命令面板）

打开命令面板（Cmd/Ctrl + P）：

1. `LLM Wiki: Initialize Wiki`
2. `LLM Wiki: Compile Wiki`
3. `LLM Wiki: Query Wiki`
4. 可选：
   - `LLM Wiki: Follow-up on Current File`
   - `LLM Wiki: Mark as Authoritative`

插件实现通过 `llm-wiki` 包直接调用编译/查询流水线（见 [main.ts](file:///Users/cherrych/Documents/trae_projects/LLMWiki/obsidian-plugin/src/main.ts#L8-L18)），不依赖你安装全局 CLI。

---

## 4. 同时使用 CLI + 插件的推荐工作流

### 日常（内容生产）

- 在 Obsidian 里写/整理 `raw/`
- 用插件触发 `Compile Wiki` 与 `Query Wiki`
- 所有结果落盘到 `wiki/` 与 `outputs/`，便于双链与本地检索

### 发布（同步到 Quartz）

- 在 Vault 根目录运行：

```bash
llm-wiki export
llm-wiki lint
```

- CI（GitHub Actions）负责把 `export/` 镜像到 vault2 的 `content/`

---

## 5. Quartz 同步（vault1 → vault2/content）

本项目已提供 vault1 的 GitHub Actions workflow，用于在 CI 中：

1. 编译（compile）
2. 导出（export）
3. 预检（lint，ERROR 会阻断）
4. 将 `export/` 镜像同步到 vault2 的 `content/` 并 push

workflow 文件：

- [.github/workflows/quartz-content-sync.yml](file:///Users/cherrych/Documents/trae_projects/LLMWiki/.github/workflows/quartz-content-sync.yml)

### 5.1 在 vault1 配置 GitHub Actions Secrets

在 vault1 仓库：

Settings → Secrets and variables → Actions → New repository secret

必须配置：

- `VAULT2_REPO`：vault2 仓库全名，例如 `your-org/your-quartz-repo`
- `VAULT2_BRANCH`：vault2 要推送的分支，例如 `main`
- `VAULT2_PAT`：对 vault2 有写权限的 Personal Access Token（最小要求：能 push 到目标分支）

同时，compile 步骤需要模型访问凭据（示例为火山/ARK）：

- `ARK_BASE_URL`、`ARK_API_KEY`（推荐）
- 或 `VOLC_BASE_URL`、`VOLC_API_KEY`

### 5.2 vault2 侧的要求

- vault2 必须存在 `content/`（workflow 会自动创建）
- Quartz 构建脚本/发布流程由 vault2 自己维护；建议 vault2 再加一个 workflow：push content 后自动 build & deploy

### 5.3 本地手动模拟一次同步（不走 CI）

适合第一次联调或排查 CI 问题。

假设：

- vault1 路径：`/path/to/vault1-llmwiki`
- vault2 路径：`/path/to/vault2-quartz`

在 vault1 执行：

```bash
llm-wiki export
llm-wiki lint
```

同步到 vault2/content（覆盖式镜像）：

```bash
mkdir -p /path/to/vault2-quartz/content
rsync -a --delete /path/to/vault1-llmwiki/export/ /path/to/vault2-quartz/content/
```

然后在 vault2 执行 Quartz build（命令以 vault2 为准）：

```bash
# 示例：npm install && npm run build
```

### 5.4 常见排查点

- **CI compile 失败**：检查 secrets 是否包含 `ARK_*`/`VOLC_*`，以及模型是否可访问
- **CI push vault2 失败**：检查 `VAULT2_PAT` 权限与 `VAULT2_REPO/BRANCH` 是否正确
- **Quartz 构建失败**：
  - 优先看 vault1 的 `export/lint-report.md` 是否已提前暴露问题
  - 再看 vault2 的构建日志定位具体 markdown 文件

## 5. 常见问题排查

### 5.1 CLI compile 报错缺少 Base URL / API Key

检查 `.env` 是否包含：

- `ARK_BASE_URL` 与 `ARK_API_KEY`（或 `VOLC_*`）

### 5.2 插件运行 compile/query 失败

- 确认插件设置里 Provider/Base URL/API Key/Model Name 已填写
- 确认 Obsidian 运行在桌面端（插件 manifest 标记 desktop only）

### 5.3 export/lint 没有生成 outputs

- export 会从 `outputs/` 目录导出，如果你的 vault 没有 outputs 或为空，`export/outputs/` 可能不存在
- 这不会影响 summaries/concepts/authoritative 的导出
