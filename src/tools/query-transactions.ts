import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { queryTransactions } from '../queries/transactions';

export const queryTransactionsTool = createTool({
  id: 'query_transactions',
  description: `Query bank transactions for spending analysis.
Use for: total spending, merchant/category spending, monthly breakdowns, top merchants, biggest expense, comparisons.
Transfers (category=transfer) are excluded by default — set includeTransfers true only when the user asks about transfers.
Refunds are negative amounts and reduce totals automatically. Never calculate totals yourself.`,
  inputSchema: z.object({
    operation: z.enum([
      'total_spending',
      'merchant_spending',
      'category_spending',
      'monthly_breakdown',
      'top_merchants',
      'biggest_expense',
      'compare_merchants',
      'list_transactions',
    ]),
    startDate: z.string().optional().describe('ISO date start (inclusive)'),
    endDate: z.string().optional().describe('ISO date end (inclusive)'),
    merchant: z.string().optional().describe('Merchant search (partial match)'),
    merchantCanonical: z
      .string()
      .optional()
      .describe('Exact canonical merchant e.g. SWIGGY'),
    category: z.string().optional(),
    includeTransfers: z.boolean().optional().default(false),
    limit: z.number().int().optional(),
    merchants: z.array(z.string()).optional(),
  }),
  execute: async (input) =>
    queryTransactions({
      operation: input.operation,
      limit: input.limit,
      merchants: input.merchants,
      filter: {
        startDate: input.startDate,
        endDate: input.endDate,
        merchant: input.merchant,
        merchantCanonical: input.merchantCanonical,
        category: input.category,
        includeTransfers: input.includeTransfers,
      },
    }),
});
