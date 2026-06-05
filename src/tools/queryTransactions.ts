import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { queryTransactions } from '../queries/transactions';
import { resolveDate, resolveDateTo } from '../lib/dates';

export const queryTransactionsTool = createTool({
  id: 'query_transactions',
  description: `Query the user's spending transactions. Use for:
- How much was spent (total, by category, by merchant, by date range)
- Top merchants or categories
- Month-by-month spending breakdown
- Refund-adjusted (net) spending — SUM includes negative refunds
- Biggest expense: use aggregate=list with limit=1 (positive amounts sort first by amount)
- Comparing categories: call once per category
Default: excludes transfers (is_transfer). For transfer totals, set exclude_transfers=false. Never calculate totals yourself.`,

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
      .array(z.string())
      .optional()
      .describe('e.g. ["food","groceries"]. Omit for all.'),
    merchant_search: z
      .string()
      .optional()
      .describe('Fuzzy match on canonical merchant e.g. "SWIGGY"'),
    exclude_transfers: z
      .boolean()
      .optional()
      .describe(
        'Default true for spending. Set false when the user asks how much they transferred.'
      ),
    source_dataset: z
      .string()
      .optional()
      .describe('sample_a | sample_b | sample_c. Defaults to ACTIVE_DATASET env.'),
    aggregate: z
      .enum(['sum', 'average', 'count', 'top_merchants', 'monthly_breakdown', 'list'])
      .describe(
        'sum=total, top_merchants=ranked, monthly_breakdown=per month, list=individual rows'
      ),
    limit: z.number().optional().describe('For top_merchants and list. Default 10.'),
  }),

  strict: false,

  execute: async (input) => {
    const dateFrom = resolveDate(input.date_from ?? null);
    const dateTo = resolveDateTo(input.date_to ?? null, dateFrom);

    return queryTransactions({
      dateFrom,
      dateTo,
      categories: input.categories ?? null,
      merchantSearch: input.merchant_search ?? null,
      excludeTransfers: input.exclude_transfers ?? true,
      sourceDataset: input.source_dataset ?? null,
      aggregate: input.aggregate,
      limit: input.limit ?? 10,
    });
  },
});
