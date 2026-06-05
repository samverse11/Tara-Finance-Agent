import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { queryTransactions } from '../queries/transactions';
import { resolveDate, resolveDateTo } from '../lib/dates';

/** Normalise LLM output: accept a bare string OR a proper array */
function toStringArray(v: string | string[] | undefined | null): string[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v;
  return [v]; // small model passed a plain string — wrap it
}

/** Normalise aggregate: small LLMs sometimes pass wrong case e.g. top_mERCHANTS */
type Aggregate = 'sum' | 'average' | 'count' | 'top_merchants' | 'monthly_breakdown' | 'list';
function normaliseAggregate(v: string): Aggregate {
  const lower = v.toLowerCase() as Aggregate;
  const valid: Aggregate[] = ['sum', 'average', 'count', 'top_merchants', 'monthly_breakdown', 'list'];
  return valid.includes(lower) ? lower : 'sum';
}

export const queryTransactionsTool = createTool({
  id: 'query_transactions',
  description: `Query the user's spending transactions. Use for:
- How much was spent (total, by category, by merchant, by date range)
- Top merchants: aggregate=top_merchants (must be lowercase exactly)
- Month-by-month spending breakdown: aggregate=monthly_breakdown
- Refund amounts: set refunds_only=true, aggregate=sum (REQUIRED for refund questions)
- Biggest expense: aggregate=list with limit=1
- Comparing categories: call once per category
Default: excludes transfers. Never calculate totals yourself.`,

  inputSchema: z.object({
    date_from: z
      .string()
      .optional()
      .describe('Start date ISO, "march 2025", "last month", "Q1 2025". Inclusive.'),
    date_to: z
      .string()
      .optional()
      .describe('End date ISO (exclusive). Use first day of next month for full months.'),
    categories: z
      .union([z.array(z.string()), z.string()])
      .optional()
      .describe('ALWAYS an array e.g. ["food","groceries"]. Never a bare string. Omit for all.'),
    merchant_search: z
      .string()
      .optional()
      .describe('Fuzzy match on canonical merchant e.g. "SWIGGY"'),
    exclude_transfers: z
      .boolean()
      .optional()
      .describe('Default true. False only if user asks about transfers.'),
      refunds_only: z
      .boolean()
      .optional()
      .describe('Set true ONLY for refund questions ("how much in refunds?", "what were my refunds?"). Refunds are negative amounts. aggregate=sum will give the total refund amount.'),
    source_dataset: z
      .string()
      .optional()
      .describe('sample_a | sample_b | sample_c. Defaults to ACTIVE_DATASET env.'),
    aggregate: z
      .string()
      .describe(
        'MUST be exactly one of (lowercase): sum | average | count | top_merchants | monthly_breakdown | list'
      ),
    limit: z.number().optional().describe('For top_merchants and list. Default 10.'),
  }),

  strict: false,

  execute: async (input) => {
    const dateFrom = resolveDate(input.date_from ?? null);
    const dateTo = resolveDateTo(input.date_to ?? null, dateFrom);

    // Normalise categories: small LLMs sometimes pass a bare string instead of array
    const categories = toStringArray(
      input.categories as string | string[] | undefined | null
    );

    return queryTransactions({
      dateFrom,
      dateTo,
      categories,
      merchantSearch: input.merchant_search ?? null,
      excludeTransfers: input.exclude_transfers ?? true,
      refundsOnly: input.refunds_only ?? false,
      sourceDataset: input.source_dataset ?? null,
      aggregate: normaliseAggregate(input.aggregate as string),
      limit: input.limit ?? 10,
    });
  },
});
