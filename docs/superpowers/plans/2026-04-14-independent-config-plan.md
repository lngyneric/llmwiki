# LLM Wiki Independent Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple the configuration for Text Generation and Embedding models so users can set independent providers, Base URLs, API keys, and model names for each.

**Architecture:** 
1. Update `obsidian-plugin/src/settings.ts` to include separate UI sections for Text Generation and Embeddings.
2. Update `src/core/config.ts` to reflect the nested `provider` and `embedding` configurations.
3. Update `src/provider/volcengine.ts` to rely on explicit config passed in the constructor rather than global environment variables.
4. Update `src/pipelines/compilePipeline.ts` and `queryPipeline.ts` to instantiate two separate providers: one for text, one for embeddings (if enabled).

**Tech Stack:** TypeScript, Node.js, Obsidian API

---

### Task 1: Update Plugin Settings UI

**Files:**
- Modify: `obsidian-plugin/src/settings.ts`

- [ ] **Step 1: Expand `LLMWikiSettings` interface and defaults**
Modify `obsidian-plugin/src/settings.ts` to add separate embedding properties.

```typescript
export interface LLMWikiSettings {
  rawPath: string;
  // Generation Model
  providerType: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  // Embedding Model
  enableEmbedding: boolean;
  embedProviderType: string;
  embedApiKey: string;
  embedBaseUrl: string;
  embedModelName: string;
}

export const DEFAULT_SETTINGS: LLMWikiSettings = {
  rawPath: "raw",
  providerType: "volcengine",
  apiKey: "",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  modelName: "ep-20240414-xxx",
  temperature: 0.2,
  maxTokens: 2000,
  enableEmbedding: true,
  embedProviderType: "volcengine",
  embedApiKey: "",
  embedBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  embedModelName: "ep-20240521-embed-xxx",
};
```

- [ ] **Step 2: Update `display()` method to separate UI sections**
Modify the `display()` method in `obsidian-plugin/src/settings.ts` to create headers for "Text Generation Model" and "Embedding Model", and bind the new properties.

```typescript
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "LLM Wiki Settings" });

    new Setting(containerEl)
      .setName("Raw Directory Path")
      .setDesc("Relative path to your raw notes folder (e.g., 'Inbox' or 'raw').")
      .addText((text) =>
        text
          .setPlaceholder("raw")
          .setValue(this.plugin.settings.rawPath)
          .onChange(async (value) => {
            this.plugin.settings.rawPath = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Text Generation Model" });

    new Setting(containerEl)
      .setName("Provider Type")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("volcengine", "Volcengine (火山/字节)")
          .addOption("openai", "OpenAI / Custom")
          .setValue(this.plugin.settings.providerType)
          .onChange(async (value) => {
            this.plugin.settings.providerType = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Key")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("Enter API Key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Base URL")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model Name")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.modelName)
          .onChange(async (value) => {
            this.plugin.settings.modelName = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Embedding Model (Semantic Search)" });

    new Setting(containerEl)
      .setName("Enable Semantic Search")
      .setDesc("If disabled, queries will fallback to simple keyword matching.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableEmbedding)
          .onChange(async (value) => {
            this.plugin.settings.enableEmbedding = value;
            await this.plugin.saveSettings();
            this.display(); // Refresh UI to hide/show embedding settings
          })
      );

    if (this.plugin.settings.enableEmbedding) {
      new Setting(containerEl)
        .setName("Embedding Provider Type")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("volcengine", "Volcengine (火山/字节)")
            .addOption("openai", "OpenAI / Custom")
            .setValue(this.plugin.settings.embedProviderType)
            .onChange(async (value) => {
              this.plugin.settings.embedProviderType = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Embedding API Key")
        .addText((text) => {
          text.inputEl.type = "password";
          text
            .setPlaceholder("Leave blank to use Text Gen API Key")
            .setValue(this.plugin.settings.embedApiKey)
            .onChange(async (value) => {
              this.plugin.settings.embedApiKey = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName("Embedding Base URL")
        .addText((text) =>
          text
            .setPlaceholder("Leave blank to use Text Gen Base URL")
            .setValue(this.plugin.settings.embedBaseUrl)
            .onChange(async (value) => {
              this.plugin.settings.embedBaseUrl = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Embedding Model Name")
        .addText((text) =>
          text
            .setValue(this.plugin.settings.embedModelName)
            .onChange(async (value) => {
              this.plugin.settings.embedModelName = value;
              await this.plugin.saveSettings();
            })
        );
    }
  }
```

- [ ] **Step 3: Commit**
```bash
git add obsidian-plugin/src/settings.ts
git commit -m "feat: decouple text and embedding settings UI"
```

### Task 2: Update Core Config Schema

**Files:**
- Modify: `src/core/config.ts`

- [ ] **Step 1: Update Zod Schemas**
Modify `src/core/config.ts` to reflect the separated configuration.

```typescript
import { z } from "zod";

const ProviderConfigSchema = z.object({
  type: z.literal("volcengine").or(z.literal("openai")),
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  temperature: z.number().default(0.2),
  maxTokens: z.number().default(2000)
});

const EmbeddingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  type: z.literal("volcengine").or(z.literal("openai")),
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional()
});

const PathsConfigSchema = z.object({
  rawDir: z.string().default("raw"),
  wikiDir: z.string().default("wiki"),
  outputsDir: z.string().default("outputs")
});

const CompileConfigSchema = z.object({
  concurrency: z.number().default(2)
});

const QueryConfigSchema = z.object({
  topK: z.number().default(8)
});

const RootConfigSchema = z.object({
  paths: PathsConfigSchema.default({}),
  provider: ProviderConfigSchema,
  embedding: EmbeddingConfigSchema.optional(),
  compile: CompileConfigSchema.default({}),
  query: QueryConfigSchema.default({})
});
```

- [ ] **Step 2: Commit**
```bash
git add src/core/config.ts
git commit -m "feat: add explicit apiKey and separate embedding config schema"
```

### Task 3: Update Obsidian Plugin Config Generation

**Files:**
- Modify: `obsidian-plugin/src/main.ts`

- [ ] **Step 1: Update `ensureConfig` in `main.ts`**
Remove `injectEnv()` since we pass keys via config now. Update `ensureConfig` to write the new nested structure.

```typescript
  private ensureConfig() {
    const root = this.getVaultBasePath();
    const configPath = path.join(root, "config", "llm-wiki.config.json");
    
    const configData = {
      paths: {
        rawDir: this.settings.rawPath,
        wikiDir: "wiki",
        outputsDir: "outputs"
      },
      provider: {
        type: this.settings.providerType,
        model: this.settings.modelName,
        baseUrl: this.settings.baseUrl,
        apiKey: this.settings.apiKey,
        temperature: this.settings.temperature,
        maxTokens: this.settings.maxTokens
      },
      embedding: {
        enabled: this.settings.enableEmbedding,
        type: this.settings.embedProviderType,
        model: this.settings.embedModelName,
        baseUrl: this.settings.embedBaseUrl || this.settings.baseUrl,
        apiKey: this.settings.embedApiKey || this.settings.apiKey
      },
      compile: {
        concurrency: 2
      },
      query: {
        topK: 8
      }
    };

    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
    }
    
    // Always overwrite config with latest settings from Obsidian UI
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
  }
```

- [ ] **Step 2: Remove `injectEnv` calls from `compileWiki` and `queryWiki`**
Remove `this.injectEnv();` and the `injectEnv` method entirely.

- [ ] **Step 3: Commit**
```bash
git add obsidian-plugin/src/main.ts
git commit -m "feat: pass explicit credentials via config and remove env injection"
```

### Task 4: Refactor Volcengine Provider

**Files:**
- Modify: `src/provider/volcengine.ts`

- [ ] **Step 1: Read API Key from config first**
Update `VolcengineProvider` constructor and methods to prioritize explicit config.

```typescript
  constructor(
    private cfg: { 
      model: string; 
      baseUrl?: string; 
      apiKey?: string;
      temperature?: number; 
      maxTokens?: number; 
      fetcher?: typeof fetch 
    }
  ) {}

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const baseUrl = this.cfg.baseUrl || process.env.VOLC_BASE_URL || process.env.ARK_BASE_URL || "";
    const apiKey = this.cfg.apiKey || process.env.VOLC_API_KEY || process.env.ARK_API_KEY || "";
    if (!baseUrl || !apiKey) throw new Error("Missing VOLC_BASE_URL or VOLC_API_KEY");

    const normalizedBase = baseUrl.replace(/\/$/, "");
    const endpoint = /\/v3$/.test(normalizedBase)
      ? `${normalizedBase}/chat/completions`
      : `${normalizedBase}/v1/chat/completions`;

    const fetchFn = this.cfg.fetcher || globalThis.fetch;
    const resp = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.cfg.model,
        temperature: input.temperature ?? this.cfg.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? this.cfg.maxTokens ?? 2000,
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

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const baseUrl = this.cfg.baseUrl || process.env.VOLC_BASE_URL || process.env.ARK_BASE_URL || "";
    const apiKey = this.cfg.apiKey || process.env.VOLC_API_KEY || process.env.ARK_API_KEY || "";
    if (!baseUrl || !apiKey) throw new Error("Missing VOLC_BASE_URL or VOLC_API_KEY");

    const normalizedBase = baseUrl.replace(/\/$/, "");
    const endpoint = /\/v3$/.test(normalizedBase)
      ? `${normalizedBase}/embeddings`
      : `${normalizedBase}/v1/embeddings`;

    const fetchFn = this.cfg.fetcher || globalThis.fetch;
    const resp = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.cfg.model,
        input: texts
      })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Embeddings request failed: ${resp.status} ${resp.statusText} ${text}`);
    }

    const json: any = await resp.json();
    if (!json?.data || !Array.isArray(json.data)) throw new Error("Unexpected Embeddings response shape");

    json.data.sort((a: any, b: any) => a.index - b.index);
    return json.data.map((item: any) => item.embedding);
  }
```

- [ ] **Step 2: Commit**
```bash
git add src/provider/volcengine.ts
git commit -m "feat: refactor provider to accept explicit apiKey and simplify embedding logic"
```

### Task 5: Refactor Pipelines for Dual Providers

**Files:**
- Modify: `src/pipelines/compilePipeline.ts`
- Modify: `src/pipelines/queryPipeline.ts`

- [ ] **Step 1: Update `compilePipeline.ts`**
Instantiate separate text and embedding providers.

```typescript
// Replace provider initialization
  const textProvider = new VolcengineProvider({
    model: cfg.provider.model,
    baseUrl: cfg.provider.baseUrl,
    apiKey: cfg.provider.apiKey,
    temperature: cfg.provider.temperature,
    maxTokens: cfg.provider.maxTokens,
    fetcher: opts.fetcher
  });

  let embedProvider: VolcengineProvider | null = null;
  if (cfg.embedding?.enabled) {
    embedProvider = new VolcengineProvider({
      model: cfg.embedding.model,
      baseUrl: cfg.embedding.baseUrl,
      apiKey: cfg.embedding.apiKey,
      fetcher: opts.fetcher
    });
  }
```
Update all `provider.generateText` calls to `textProvider.generateText`.
Update all `provider.generateEmbeddings` calls to `embedProvider.generateEmbeddings` and check `if (embedProvider)`.

- [ ] **Step 2: Update `queryPipeline.ts`**
Similar dual-provider initialization.

```typescript
// Replace provider initialization
  const textProvider = new VolcengineProvider({
    model: cfg.provider.model,
    baseUrl: cfg.provider.baseUrl,
    apiKey: cfg.provider.apiKey,
    temperature: cfg.provider.temperature,
    maxTokens: cfg.provider.maxTokens,
    fetcher: opts.fetcher
  });

  let embedProvider: VolcengineProvider | null = null;
  if (cfg.embedding?.enabled) {
    embedProvider = new VolcengineProvider({
      model: cfg.embedding.model,
      baseUrl: cfg.embedding.baseUrl,
      apiKey: cfg.embedding.apiKey,
      fetcher: opts.fetcher
    });
  }
```
Update `embedProvider.generateEmbeddings([opts.question])` and check `if (embedProvider)`.
Update `textProvider.generateText(...)`.

- [ ] **Step 3: Rebuild everything**
Run `npm run build` in root and `cd obsidian-plugin && npm run build`.

- [ ] **Step 4: Commit**
```bash
git add src/pipelines/compilePipeline.ts src/pipelines/queryPipeline.ts
git commit -m "feat: support dual providers for text generation and embeddings"
```
