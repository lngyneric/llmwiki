# LLM Wiki Plugin Enhancement Spec: Independent Configuration for Embedding and Generation Models

Date: 2026-04-14
Status: Draft (Pending User Review)

## 1. Goal
To provide complete flexibility for users to configure their Text Generation (LLM) and Embedding models independently. Currently, both models share the same `Base URL` and `API Key`, which is restrictive if a user wants to use a Volcengine endpoint for embeddings but a different provider (or a different Volcengine billing account/project) for text generation.

## 2. Changes to Settings UI

The Obsidian settings page will be restructured into three distinct sections:
1. **General Settings**
   - Raw Directory Path
2. **Text Generation Model (for Compile & Query)**
   - Provider Type (Volcengine, OpenAI)
   - Base URL
   - API Key
   - Model Name (e.g. `ep-xxx`)
   - Temperature
   - Max Tokens
3. **Embedding Model (for Semantic Search)**
   - Enable Semantic Search (Toggle) - If disabled, fall back to keyword search and don't require credentials.
   - Provider Type (Volcengine, OpenAI)
   - Base URL
   - API Key
   - Model Name (e.g. `ep-xxx-embed-xxx` or `text-embedding-3-small`)

## 3. Code Modifications

### 3.1 Settings Interface (`obsidian-plugin/src/settings.ts`)
The `LLMWikiSettings` interface will be expanded to decouple the credentials:
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
```

### 3.2 Configuration Object (`src/core/config.ts`)
Update the `config.json` schema to support nested structures for `provider` and `embedding`:
```typescript
const ProviderConfigSchema = z.object({
  type: z.literal("volcengine").or(z.literal("openai")),
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(), // Allow passing API key explicitly via config
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
```

### 3.3 Provider Implementation (`src/provider/volcengine.ts`)
The `VolcengineProvider` constructor currently takes a single configuration. We need to refactor it to accept separate configurations for the `generateText` logic and the `generateEmbeddings` logic. We will instantiate two separate `VolcengineProvider` (or OpenAI) objects—one for text and one for embeddings—or pass explicit credentials to the `generateEmbeddings` method.

Proposed approach:
- Update `compilePipeline` and `queryPipeline` to instantiate two separate providers:
  - `const textProvider = new VolcengineProvider({ ...textConfig })`
  - `const embedProvider = new VolcengineProvider({ ...embedConfig })` (only if enabled)

## 4. Required Changes
1. `src/core/config.ts`: Update schemas.
2. `obsidian-plugin/src/settings.ts`: Redesign the UI and interface.
3. `obsidian-plugin/src/main.ts`: Update `ensureConfig` and `injectEnv` (or pass API keys directly via the config object instead of `process.env` to avoid conflicts).
4. `src/pipelines/compilePipeline.ts` & `queryPipeline.ts`: Separate the provider initialization for text and embeddings.
5. `src/provider/volcengine.ts`: Allow API Key to be passed via the constructor options rather than relying exclusively on `process.env`.