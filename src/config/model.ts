import 'dotenv/config';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';

export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'groq';

export const MODEL_PROVIDER: ModelProvider =
  (process.env.MODEL_PROVIDER as ModelProvider) ?? 'gemini';

const DEFAULT_MODELS: Record<ModelProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  groq: 'llama3-groq-70b-8192-tool-use-preview',
};

export const MODEL_NAME: string =
  process.env.MODEL_NAME ?? DEFAULT_MODELS[MODEL_PROVIDER];

export async function createModel() {
  console.log('MODEL_PROVIDER=', MODEL_PROVIDER);
  console.log('MODEL_NAME=', MODEL_NAME);
  console.log(
  'KEY PREFIX=',
  process.env.GEMINI_API_KEY?.substring(0, 8)
);
  switch (MODEL_PROVIDER) {
    case 'gemini': {
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
      });
      return google(MODEL_NAME);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      return anthropic(MODEL_NAME);
    }
    case 'openai': {
      // Install @ai-sdk/openai when using MODEL_PROVIDER=openai
      const { createOpenAI } = await import('@ai-sdk/openai' as string);
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openai(MODEL_NAME);
    }
    case 'groq': {
      // Install @ai-sdk/groq when using MODEL_PROVIDER=groq
      const { createGroq } = await import('@ai-sdk/groq' as string);
      const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
      return groq(MODEL_NAME);
    }
    default:
      throw new Error(
        `Unknown MODEL_PROVIDER: "${MODEL_PROVIDER}". Valid: gemini | openai | anthropic | groq`
      );
  }
}
