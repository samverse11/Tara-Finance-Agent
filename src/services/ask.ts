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

export async function askQuestion(question: string): Promise<AskResult> {
  const started = Date.now();
  let tools_called: string[] = [];
  let answer = '';
  let status: 'ok' | 'error' = 'ok';
  let error: string | undefined;

  try {
    const result = await taraAgent.generate(question, {
      maxSteps: 8,
    });

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
