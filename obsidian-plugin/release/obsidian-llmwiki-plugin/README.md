# LLM Wiki for Obsidian (v1.0.1)

LLM Wiki 是一款为 Obsidian 打造的智能插件。它的核心思想是将你的零散笔记（Raw 剪藏内容）通过大语言模型“编译”为结构化的 Wiki，并允许你直接在 Obsidian 中向大模型进行查询，所有生成的回答和产物都会以 Markdown 的形式持久化保存在你的知识库中。

## 功能特性

1. **自动编译 Wiki (`LLM Wiki: Compile Wiki`)**：
   - 读取配置好的剪藏文件夹（`raw/`），将变更的笔记利用大模型自动整理、提取重点、生成对应的 Wiki 页面。
   - 自动抽取 Concepts，并在 `wiki/concepts/` 下维护概念卡片与 `Evolution Log`。
2. **知识库问答 (`LLM Wiki: Query Wiki`)**：
   - 唤出提问框，大模型会根据已生成的 Wiki 知识库寻找相关上下文来解答你的问题。
   - 生成的答案将自动作为一篇新的 Markdown 笔记保存至 `outputs/` 目录，并立刻为你打开。
   - 输出包含溯源引用（`[[wiki/sources/...]]`）与 `Confidence Notes`。
3. **追问（Follow-up）**：
   - 在任意 `outputs/`（或 `wiki/authoritative/`）答案页中继续追问，新问答会追加到同一文件末尾。
4. **权威标记 + 自动更新（Authoritative）**：
   - 将某个输出答案提升为权威文档，自动记录来源并放入 `wiki/authoritative/`。
   - 后续执行 `Compile Wiki` 时，如果来源更新，权威文档会自动触发更新并写入演进记录。
5. **安全与本地化**：
   - 不改变原剪藏文件（Raw）的内容，保证数据安全。
   - 完美嵌入 Obsidian 本地操作体验。
   - 默认支持 **火山引擎 (Volcengine)**，也可切换为其他兼容 OpenAI 格式的大模型 API。

---

## 安装说明

因为该插件暂未上架 Obsidian 社区插件商店，你需要进行**手动安装**：

### 1. 准备插件文件夹
1. 下载并解压本压缩包 `obsidian-llmwiki-plugin-v1.0.1.zip`。
2. 解压后你会得到一个名为 `obsidian-llmwiki-plugin` 的文件夹，里面包含 `main.js` 和 `manifest.json` 两个文件。

### 2. 放入 Obsidian 的插件目录
1. 打开你的 Obsidian 库（Vault）所在的文件夹。
2. 确保你的系统允许显示隐藏文件（Mac 快捷键 `Cmd + Shift + .`，Windows 在资源管理器顶部的“查看”选项卡中勾选“隐藏的项目”）。
3. 找到并打开 `.obsidian` 文件夹。
4. 找到并打开 `plugins` 文件夹（如果没有这个文件夹，请新建一个命名为 `plugins`）。
5. 将第一步解压得到的 **整个 `obsidian-llmwiki-plugin` 文件夹** 移动或复制到 `.obsidian/plugins/` 目录内。

*最终的路径应该看起来像这样：*
`你的笔记库目录/.obsidian/plugins/obsidian-llmwiki-plugin/main.js`

### 3. 启用插件并配置
1. 打开 Obsidian 软件，进入库。
2. 点击左下角齿轮进入 **设置 (Settings)** -> **第三方插件 (Community Plugins)**。
3. 如果页面上方显示“安全模式开启”，请点击 **关闭安全模式 (Turn off Safe Mode)**。
4. 点击“已安装插件”列表右侧的 **刷新** 按钮。
5. 在列表中找到 **LLM Wiki**，打开它右侧的开关以启用插件。
6. 点击 **LLM Wiki** 右侧的齿轮图标，或者在设置面板左侧最下方点击 **LLM Wiki**，进入插件设置页面。
7. **关键配置：**
   - **Raw Directory Path**: 原始素材目录（例如 `raw` 或 `Inbox/Articles`）。
   - **Text Generation Model**: 生成/问答模型（Provider、Base URL、API Key、Model Name）。
   - **Embedding Model**: 语义检索模型（可单独配置 Provider、Base URL、API Key、Model Name）。
     - 如果不想用语义检索，可关闭 `Enable Semantic Search`，Query 会退化为关键词匹配。
     - 使用 `nvidia/nv-embed-v1` 时该模型 token 窗口较小，建议保持默认设置并确保模型服务稳定。

---

## 使用指南

1. **第一步：初始化 (Initialize)**
   - 使用快捷键 `Cmd/Ctrl + P` 呼出命令面板。
   - 搜索并运行 `LLM Wiki: Initialize Wiki`。
   - 插件会在库根目录自动为你创建 `wiki/`、`outputs/` 文件夹以及必要的配置文件。

2. **第二步：存放素材**
   - 将你想要让大模型学习的 Markdown 笔记或文本文件放入你配置的 Raw 文件夹内。

3. **第三步：编译 Wiki (Compile)**
   - 使用 `Cmd/Ctrl + P` 呼出命令面板，运行 `LLM Wiki: Compile Wiki`。
   - 稍等片刻，大模型会自动阅读这些文件并在 `wiki/sources/` 中生成提炼后的笔记。

4. **第四步：提问查询 (Query)**
   - 运行 `LLM Wiki: Query Wiki`。
   - 在弹出的输入框内提出你的问题。
   - 稍等片刻，回答会以新笔记的形式保存在 `outputs/` 下，并自动在你的工作区打开。
5. **第五步：追问（Follow-up）**
   - 打开一篇 `outputs/` 或 `wiki/authoritative/` 下的答案文件。
   - 运行 `LLM Wiki: Follow-up on Current File (追问)`，输入追问问题。
   - 新的问答会追加到同一文件末尾。
6. **第六步：权威标记与自动更新**
   - 打开一篇满意的 `outputs/` 答案文件。
   - 运行 `LLM Wiki: Mark as Authoritative (权威标记)`，文件会移动到 `wiki/authoritative/`，并记录引用来源与时间戳。
   - 后续执行 `LLM Wiki: Compile Wiki` 时，如来源更新，会自动更新权威文档。

---

## 状态与日志

- `wiki/log.md`: 详细运行日志（成功/失败与错误堆栈）。
- `.llm-wiki/index.json`: raw 文件索引（hash / lastCompiledAt / status）。
- `.llm-wiki/embeddings.json`: 语义检索向量索引（启用 Embedding 时生成）。

---
*Powered by Trae LLM Wiki Plugin.*
