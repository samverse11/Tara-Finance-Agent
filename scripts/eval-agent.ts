/**
 * End-to-end eval suite for Tara — hits the live POST /ask endpoint.
 * Run: npm run eval   (or: npx tsx scripts/eval-agent.ts)
 *
 * Environment:
 *   ASK_URL   – base URL (default http://localhost:3000)
 *   DELAY_MS  – ms to wait between questions (default 4000, avoids TPM limits)
 */
import 'dotenv/config';

const BASE_URL = process.env.ASK_URL ?? 'http://localhost:3000';
const DELAY_MS = Number(process.env.DELAY_MS ?? 4000);

// ─── Types ────────────────────────────────────────────────────────────────────

interface AskResponse {
  answer: string;
  tools_called: string[];
  latency_ms: number;
}

interface Check {
  type: 'contains_amount' | 'contains_text' | 'not_contains' | 'tool_used' | 'tool_not_used';
  value: string | number;
  tolerance?: number; // for contains_amount: ± fraction (default 0.01 = 1%)
  description: string;
}

interface TestCase {
  id: number;
  category: string;
  question: string;
  checks: Check[];
  notes?: string;
}

interface TestResult {
  id: number;
  category: string;
  question: string;
  passed: boolean;
  failures: string[];
  answer: string;
  tools: string[];
  latency_ms: number;
  error?: string;
}

// ─── Test cases ───────────────────────────────────────────────────────────────

const TESTS: TestCase[] = [
  // ── TRANSACTION TESTS ──────────────────────────────────────────────────────

  {
    id: 1,
    category: 'TRANSACTION',
    question: 'How much did I spend on food?',
    notes: 'Must use full dataset (no date filter). Must not invent a year.',
    checks: [
      { type: 'contains_amount', value: 118770.47, tolerance: 0.005, description: 'Food total ₹118,770.47' },
      { type: 'tool_used', value: 'query_transactions', description: 'Uses query_transactions' },
      { type: 'not_contains', value: '2022', description: 'Does not hallucinate year 2022' },
      { type: 'not_contains', value: '2023', description: 'Does not hallucinate year 2023' },
    ],
  },

  {
    id: 2,
    category: 'TRANSACTION',
    question: 'How much did I spend at Swiggy?',
    notes: 'Merchant normalization: Swiggy aliases must consolidate.',
    checks: [
      { type: 'contains_amount', value: 47239.23, tolerance: 0.005, description: 'Swiggy total ₹47,239.23' },
      { type: 'tool_used', value: 'query_transactions', description: 'Uses query_transactions' },
    ],
  },

  {
    id: 3,
    category: 'TRANSACTION',
    question: 'What was my biggest expense?',
    notes: 'Largest single transaction. Must not sort by recency.',
    checks: [
      { type: 'contains_amount', value: 34774.89, tolerance: 0.005, description: 'Biggest expense ₹34,774.89' },
      { type: 'contains_text', value: 'rent', description: 'Describes transaction as rent (correct category/memo)' },
      { type: 'tool_used', value: 'query_transactions', description: 'Uses query_transactions' },
    ],
  },

  {
    id: 4,
    category: 'TRANSACTION',
    question: 'Who are my top 5 merchants?',
    notes: 'Ranking must be: AIR INDIA, INDIGO, AMAZON, NEFT, HDFC BANK.',
    checks: [
      { type: 'contains_text', value: 'AIR INDIA', description: '#1 merchant is AIR INDIA' },
      { type: 'contains_text', value: 'INDIGO', description: '#2 merchant is INDIGO' },
      { type: 'contains_text', value: 'AMAZON', description: '#3 merchant is AMAZON' },
      { type: 'contains_text', value: 'NEFT', description: '#4 merchant is NEFT' },
      { type: 'contains_text', value: 'HDFC BANK', description: '#5 merchant is HDFC BANK' },
      { type: 'tool_used', value: 'query_transactions', description: 'Uses query_transactions' },
    ],
  },

  {
    id: 5,
    category: 'TRANSACTION',
    question: 'How much did I spend overall excluding transfers?',
    notes: 'Must exclude transfers. Must not call portfolio or recurring.',
    checks: [
      { type: 'contains_amount', value: 3547816.19, tolerance: 0.005, description: 'Total excl transfers ₹3,547,816.19' },
      { type: 'tool_used', value: 'query_transactions', description: 'Uses query_transactions' },
      { type: 'tool_not_used', value: 'query_portfolio', description: 'Does not use portfolio tool' },
    ],
  },

  {
    id: 6,
    category: 'TRANSACTION',
    question: 'How much did I transfer?',
    notes: 'Must use exclude_transfers=false. Transfer total must be non-zero.',
    checks: [
      { type: 'not_contains', value: '₹0', description: 'Does not return ₹0' },
      { type: 'not_contains', value: 'no transfer', description: 'Does not say no transfers' },
      { type: 'not_contains', value: 'You had no transfers', description: 'Does not say had no transfers' },
      { type: 'tool_used', value: 'query_transactions', description: 'Uses query_transactions' },
    ],
  },

  {
    id: 7,
    category: 'TRANSACTION',
    question: 'How much have I received in refunds?',
    notes: 'Must use refunds_only=true. Must return refund-only total.',
    checks: [
      { type: 'contains_amount', value: 111938.65, tolerance: 0.01, description: 'Refund total ₹111,938.65' },
      { type: 'tool_used', value: 'query_transactions', description: 'Uses query_transactions' },
    ],
  },

  // ── PORTFOLIO TESTS ────────────────────────────────────────────────────────

  {
    id: 8,
    category: 'PORTFOLIO',
    question: 'What is my portfolio worth?',
    notes: 'Must return portfolio value.',
    checks: [
      { type: 'contains_amount', value: 119983.80, tolerance: 0.005, description: 'Portfolio value ₹119,983.80' },
      { type: 'tool_used', value: 'query_portfolio', description: 'Uses query_portfolio' },
    ],
  },

  {
    id: 9,
    category: 'PORTFOLIO',
    question: 'What is my overall investment return?',
    notes: 'Must return percentage gain and absolute gain.',
    checks: [
      { type: 'contains_amount', value: 23.24, tolerance: 0.05, description: 'Return % ~23.24%' },
      { type: 'contains_amount', value: 22627.09, tolerance: 0.01, description: 'Gain ₹22,627.09' },
      { type: 'tool_used', value: 'query_portfolio', description: 'Uses query_portfolio' },
    ],
  },

  {
    id: 10,
    category: 'PORTFOLIO',
    question: 'What is my realised return on Saffron Bluechip Equity Fund?',
    notes: 'Holdings-based return. Must mention purchase NAV.',
    checks: [
      { type: 'contains_amount', value: 30.94, tolerance: 0.1, description: 'Realised return ~30.94%' },
      { type: 'tool_used', value: 'query_portfolio', description: 'Uses query_portfolio' },
    ],
  },

  {
    id: 11,
    category: 'PORTFOLIO',
    question: 'What was the period return of Saffron Bluechip Equity Fund between Jan 2024 and Jan 2025?',
    notes: 'NAV-based return. Must find NAV data (not claim it is missing).',
    checks: [
      { type: 'contains_amount', value: 31.17, tolerance: 0.1, description: 'Period return ~31.17%' },
      { type: 'not_contains', value: 'no NAV data', description: 'Does not claim missing NAV data' },
      { type: 'not_contains', value: 'not available', description: 'Does not say data not available' },
      { type: 'tool_used', value: 'query_portfolio', description: 'Uses query_portfolio' },
    ],
  },

  {
    id: 12,
    category: 'PORTFOLIO',
    question: 'What is the return of XYZ Growth Fund?',
    notes: 'Fund does not exist. Must say not found, not hallucinate.',
    checks: [
      { type: 'not_contains', value: '0%', description: 'Does not fabricate 0% return' },
      { type: 'not_contains', value: 'return is', description: 'Does not pretend to know the return' },
      {
        type: 'contains_text',
        value: 'not found',
        description: 'Says fund not found (or similar)',
      },
    ],
  },

  // ── RECURRING TESTS ────────────────────────────────────────────────────────

  {
    id: 13,
    category: 'RECURRING',
    question: 'Which merchants look like subscriptions?',
    notes: 'Must call detect_recurring. Must not fabricate merchants.',
    checks: [
      { type: 'tool_used', value: 'detect_recurring', description: 'Uses detect_recurring' },
      { type: 'not_contains', value: 'Netflix', description: 'Does not hallucinate Netflix' },
    ],
  },

  // ── NO-DATA TESTS ──────────────────────────────────────────────────────────

  {
    id: 14,
    category: 'NO-DATA',
    question: 'How much did I spend at Anupam?',
    notes: 'Merchant does not exist. Must not return ₹0 as a real answer.',
    checks: [
      { type: 'not_contains', value: 'spent ₹0', description: 'Does not return ₹0 spend' },
      { type: 'not_contains', value: 'spent 0', description: 'Does not return 0 spend' },
      { type: 'tool_used', value: 'query_transactions', description: 'Uses query_transactions' },
    ],
  },

  // ── MULTI-TOOL TESTS ───────────────────────────────────────────────────────

  {
    id: 15,
    category: 'MULTI-TOOL',
    question:
      'What was my biggest expense, what is my portfolio worth, and which merchants look like subscriptions?',
    notes: 'Needs all three tools. Must answer all three parts.',
    checks: [
      { type: 'tool_used', value: 'query_transactions', description: 'Uses query_transactions' },
      { type: 'tool_used', value: 'query_portfolio', description: 'Uses query_portfolio' },
      { type: 'tool_used', value: 'detect_recurring', description: 'Uses detect_recurring' },
      { type: 'contains_amount', value: 34774.89, tolerance: 0.01, description: 'Returns biggest expense ₹34,774.89' },
      { type: 'contains_amount', value: 119983.80, tolerance: 0.01, description: 'Returns portfolio value' },
    ],
  },

  // ── OFF-TOPIC TESTS ────────────────────────────────────────────────────────

  {
    id: 16,
    category: 'OFF-TOPIC',
    question: 'What is the capital of France?',
    notes: 'Out of domain. Must not answer Paris.',
    checks: [
      { type: 'not_contains', value: 'Paris', description: 'Does not answer Paris' },
      { type: 'not_contains', value: 'capital of France is', description: 'Does not answer the geography question' },
      { type: 'tool_not_used', value: 'query_transactions', description: 'Does not call finance tools' },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function ask(question: string): Promise<AskResponse> {
  const res = await fetch(`${BASE_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<AskResponse>;
}

/**
 * Extract all numbers that look like INR amounts or percentages from the answer.
 * Handles ₹1,18,770.47 / ₹118770.47 / 23.24% / Rs. 34,774.89 etc.
 */
function extractNumbers(text: string): number[] {
  const cleaned = text.replace(/[₹,]/g, '');
  const matches = cleaned.match(/\d+(?:\.\d+)?/g) ?? [];
  return matches.map(Number).filter((n) => !isNaN(n));
}

function numberInAnswer(answer: string, target: number, tolerance: number): boolean {
  const nums = extractNumbers(answer);
  return nums.some((n) => Math.abs(n - target) / Math.max(target, 1) <= tolerance);
}

function runChecks(tc: TestCase, resp: AskResponse): string[] {
  const failures: string[] = [];
  const answer = resp.answer.toLowerCase();
  const tools = resp.tools_called ?? [];

  for (const check of tc.checks) {
    switch (check.type) {
      case 'contains_amount': {
        const tol = check.tolerance ?? 0.01;
        if (!numberInAnswer(resp.answer, check.value as number, tol)) {
          failures.push(
            `[${check.description}] Expected ~${check.value} in answer but not found. Answer: "${resp.answer.slice(0, 120)}"`
          );
        }
        break;
      }
      case 'contains_text': {
        if (!answer.includes((check.value as string).toLowerCase())) {
          failures.push(`[${check.description}] Expected text "${check.value}" not found in answer.`);
        }
        break;
      }
      case 'not_contains': {
        if (answer.includes((check.value as string).toLowerCase())) {
          failures.push(`[${check.description}] Forbidden text "${check.value}" found in answer.`);
        }
        break;
      }
      case 'tool_used': {
        if (!tools.includes(check.value as string)) {
          failures.push(`[${check.description}] Expected tool "${check.value}" was NOT called. Tools: [${tools.join(', ')}]`);
        }
        break;
      }
      case 'tool_not_used': {
        if (tools.includes(check.value as string)) {
          failures.push(`[${check.description}] Tool "${check.value}" should NOT have been called.`);
        }
        break;
      }
    }
  }
  return failures;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  Tara Agent — End-to-End Eval Suite');
  console.log(`  Endpoint: ${BASE_URL}/ask`);
  console.log(`  Tests: ${TESTS.length}   Delay between: ${DELAY_MS}ms`);
  console.log('═'.repeat(70) + '\n');

  const results: TestResult[] = [];

  // Warmup: fire a simple request first so the model is warm and any rate-limit
  // retry happens before scored tests begin
  try {
    process.stdout.write('  [warmup] Pinging /ask endpoint...                                      ');
    await ask('Is anyone there?');
    console.log('✅');
  } catch {
    console.log('⚠️  (warmup failed — continuing anyway)');
  }
  await sleep(DELAY_MS);

  for (const tc of TESTS) {
    if (results.length > 0) await sleep(DELAY_MS);

    process.stdout.write(`[${String(tc.id).padStart(2, '0')}] ${tc.category.padEnd(11)} ${tc.question.slice(0, 55).padEnd(56)} `);

    let result: TestResult;
    try {
      const resp = await ask(tc.question);
      const failures = runChecks(tc, resp);
      const passed = failures.length === 0;
      result = {
        id: tc.id,
        category: tc.category,
        question: tc.question,
        passed,
        failures,
        answer: resp.answer,
        tools: resp.tools_called ?? [],
        latency_ms: resp.latency_ms ?? 0,
      };
      console.log(passed ? `✅ PASS  (${result.latency_ms}ms)` : `❌ FAIL  (${result.latency_ms}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result = {
        id: tc.id,
        category: tc.category,
        question: tc.question,
        passed: false,
        failures: [`HTTP error: ${msg}`],
        answer: '',
        tools: [],
        latency_ms: 0,
        error: msg,
      };
      console.log(`❌ ERROR`);
    }

    results.push(result);

    // Print failure details inline
    if (!result.passed) {
      for (const f of result.failures) {
        console.log(`          ↳ ${f}`);
      }
      if (tc.notes) console.log(`          NOTE: ${tc.notes}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n' + '═'.repeat(70));
  console.log(`  Results: ${passed}/${results.length} passed   (${failed} failed)`);
  console.log('═'.repeat(70));

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`\n  [${r.id}] ${r.category} — ${r.question}`);
      console.log(`  Tools called: [${r.tools.join(', ')}]`);
      console.log(`  Answer: "${r.answer.slice(0, 150)}"`);
      for (const f of r.failures) {
        console.log(`  • ${f}`);
      }
    }
    console.log('');
    process.exit(1);
  } else {
    console.log('\n  All tests passed! ✅\n');
  }
}

main().catch((e) => {
  console.error('Eval crashed:', e);
  process.exit(1);
});
