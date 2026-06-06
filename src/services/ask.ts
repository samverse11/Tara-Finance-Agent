import { db } from '../db/connection';
import { requestLogs } from '../db/schema';
import { taraAgent } from '../agent/tara';

export interface AskResult {
  answer: string;
  tools_called: string[];
  latency_ms: number;
  status: 'ok' | 'error';
  error?: string;
}

function extractToolNames(
  steps: Array<{ toolCalls?: Array<{ toolName?: string; payload?: { toolName?: string } }> }>
): string[] {
  const names = new Set<string>();
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      const name = call.toolName ?? call.payload?.toolName;
      if (name) names.add(name);
    }
  }
  return [...names];
}

function parseRetryDelay(message: string): number {
  const secMatch = message.match(/Please retry in (\d+(?:\.\d+)?)s/);
  if (secMatch) return Math.ceil(parseFloat(secMatch[1])) * 1000 + 500;
  const minMatch = message.match(/Please retry in (\d+)m(\d+(?:\.\d+)?)s/);
  if (minMatch) return (parseInt(minMatch[1]) * 60 + parseFloat(minMatch[2])) * 1000 + 500;
  return 25_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPrompt(question: string): string {
  const today = new Date().toISOString().split('T')[0];
  return `[Today is ${today}]\n\n${question}`;
}

async function generateWithRetry(question: string, maxAttempts = 3) {
  const prompt = buildPrompt(question);
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await taraAgent.generate(prompt, { maxSteps: 12 });
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);

      const isRateLimit =
        message.includes('Rate limit reached') ||
        message.includes('rate_limit_exceeded') ||
        message.includes('Please retry in') ||
        (err as { statusCode?: number }).statusCode === 429;

      const isToolCallError = message.includes('Failed to call a function');

      if ((isRateLimit || isToolCallError) && attempt < maxAttempts - 1) {
        const delay = isRateLimit ? parseRetryDelay(message) : 1000;
        console.log(`[retry ${attempt + 1}] waiting ${delay}ms — ${message.slice(0, 80)}`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function askQuestion(question: string): Promise<AskResult> {
  const started = Date.now();
  let tools_called: string[] = [];
  let answer = '';
  let status: 'ok' | 'error' = 'ok';
  let error: string | undefined;

  try {
    const result = await generateWithRetry(question);

    answer = result.text ?? '';
    tools_called = extractToolNames(result.steps ?? []);

    if (tools_called.length === 0 && Array.isArray(result.toolCalls)) {
      for (const call of result.toolCalls) {
        const name =
          (call as { toolName?: string }).toolName ??
          (call as { payload?: { toolName?: string } }).payload?.toolName;
        if (name) tools_called.push(name);
      }
    }
  } catch (err) {
    status = 'error';
    error = err instanceof Error ? err.message : String(err);
    answer = 'Sorry, I could not process that question.';
  }

  const latency_ms = Date.now() - started;

  await db.insert(requestLogs).values({
    question,
    toolsCalled: tools_called,
    status,
    totalLatencyMs: latency_ms,
    answer,
    errorMessage: error ?? null,
  });

  return { answer, tools_called, latency_ms, status, error };
}