import { LlmProvider, GenerateTextInput, GenerateTextOutput } from "./provider.js";

/**
 * 说明：
 * - 如果火山/字节提供 OpenAI-compatible 接口：设置 VOLC_BASE_URL + VOLC_API_KEY 即可。
 * - 如果不是兼容接口：请在这里替换请求 URL、headers 与 body。
 */
export class VolcengineProvider implements LlmProvider {
  name = "volcengine";
  constructor(
    private cfg: { model: string; baseUrl?: string; temperature: number; maxTokens: number }
  ) {}

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    // 兼容两套命名：VOLC_* / ARK_*
    const baseUrl =
      this.cfg.baseUrl ?? process.env.VOLC_BASE_URL ?? process.env.ARK_BASE_URL ?? "";
    const apiKey = process.env.VOLC_API_KEY ?? process.env.ARK_API_KEY ?? "";
    if (!baseUrl || !apiKey) {
      throw new Error("Missing VOLC_BASE_URL/ARK_BASE_URL or VOLC_API_KEY/ARK_API_KEY");
    }

    const normalizedBase = baseUrl.replace(/\/$/, "");
    // 如果 baseUrl 已经是 /api/.../v3 这类前缀，则按其下的 /chat/completions
    // 否则按 OpenAI 兼容的 /v1/chat/completions
    const endpoint = /\/v3$/.test(normalizedBase)
      ? `${normalizedBase}/chat/completions`
      : `${normalizedBase}/v1/chat/completions`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.cfg.model,
        temperature: input.temperature ?? this.cfg.temperature,
        max_tokens: input.maxTokens ?? this.cfg.maxTokens,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt }
        ]
      })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`LLM request failed: ${resp.status} ${resp.statusText} ${text}`);
    }

    const json: any = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Unexpected LLM response shape");
    return { text: content, raw: json };
  }
}
