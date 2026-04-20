export async function testTextModel(cfg: { baseUrl: string; apiKey: string; model: string; fetcher?: typeof fetch }) {
  const baseUrl = cfg.baseUrl || "";
  const apiKey = cfg.apiKey || "";
  if (!baseUrl || !apiKey) {
    throw new Error("Missing baseUrl or apiKey");
  }

  const normalizedBase = baseUrl.replace(/\/$/, "");
  const endpoint = /\/v3$/.test(normalizedBase) ? `${normalizedBase}/chat/completions` : `${normalizedBase}/v1/chat/completions`;

  const fetchFn = cfg.fetcher || globalThis.fetch;
  const resp = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: "ping" }],
      temperature: 0,
      max_tokens: 8
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`LLM request failed: ${resp.status} ${resp.statusText} ${text}`);
  }

  const json: any = await resp.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Unexpected LLM response shape");
  return { ok: true, sample: content };
}

export async function testEmbeddingModel(cfg: { baseUrl: string; apiKey: string; model: string; fetcher?: typeof fetch }) {
  const baseUrl = cfg.baseUrl || "";
  const apiKey = cfg.apiKey || "";
  if (!baseUrl || !apiKey) {
    throw new Error("Missing baseUrl or apiKey");
  }

  const normalizedBase = baseUrl.replace(/\/$/, "");
  const endpoint = /\/v3$/.test(normalizedBase) ? `${normalizedBase}/embeddings` : `${normalizedBase}/v1/embeddings`;

  const fetchFn = cfg.fetcher || globalThis.fetch;
  const resp = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: cfg.model,
      input: ["ping"],
      encoding_format: "float"
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Embeddings request failed: ${resp.status} ${resp.statusText} ${text}`);
  }

  const json: any = await resp.json().catch(() => null);
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Unexpected Embeddings response shape");
  return { ok: true, dim: vec.length };
}

