export const defaultConfigJson = (model = "YOUR_MODEL_NAME") =>
  JSON.stringify(
    {
      paths: { rawDir: "raw", wikiDir: "wiki", outputsDir: "outputs", stateDir: ".llm-wiki" },
      provider: { type: "volcengine", model, temperature: 0.2, maxTokens: 2000 },
      compile: { concurrency: 2, language: "中文" },
      query: { topK: 8 },
      export: { outDir: "export", includeAssets: false, assetsDir: "assets" },
      lint: { maxDescriptionLength: 200, linkCheck: false }
    },
    null,
    2
  );
