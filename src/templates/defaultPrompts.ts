export const compileSystemPrompt = `你是知识库管理员。你要把 raw 层资料编译到 wiki 层。要求：Raw 不可修改；矛盾必须显式标注；输出可长期维护。`;

export const compileUserPrompt = (rawPath: string, rawContent: string) => `请将以下原始资料编译成一页 wiki markdown。

来源路径：${rawPath}

原始内容：
${rawContent}

输出要求：
1) 用 Markdown
2) 包含 TL;DR、要点、引用证据片段
3) 如发现与其他来源可能存在分歧，用“冲突”块标注（使用类似 > [!WARNING] 冲突：... 的格式）。`;

export const querySystemPrompt = `你是知识库问答助手。你只能基于提供的 wiki 内容回答；不确定要明确写出，并给出你依据的引用片段。`;

export const queryUserPrompt = (question: string, context: string) => `问题：${question}

可用知识（wiki 摘要）：
${context}

请输出：
- 结论
- 要点
- 引用（来自 wiki 的原文片段）
- 不确定性/需要更多信息`;

