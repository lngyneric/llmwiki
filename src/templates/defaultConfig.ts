export const defaultConfigJson = (model = "YOUR_MODEL_NAME") =>
  JSON.stringify(
    {
      paths: { rawDir: "raw", wikiDir: "wiki", outputsDir: "outputs", stateDir: ".llm-wiki" },
      provider: { type: "volcengine", model, temperature: 0.2, maxTokens: 2000 },
      compile: { concurrency: 2 },
      query: { topK: 8 }
    },
    null,
    2
  );

