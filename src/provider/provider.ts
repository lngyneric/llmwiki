export type GenerateTextInput = {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
};

export type GenerateTextOutput = {
  text: string;
  raw?: unknown;
};

export interface LlmProvider {
  name: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
  generateEmbeddings?(texts: string[]): Promise<number[][]>;
}

