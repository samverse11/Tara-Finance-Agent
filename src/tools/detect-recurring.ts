import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { detectRecurring } from '../queries/recurring';

export const detectRecurringTool = createTool({
  id: 'detect_recurring',
  description: `Detect recurring merchants (subscriptions, regular bills) from transaction patterns.
Use when the user asks about subscriptions, recurring payments, or regular bills.`,
  inputSchema: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    minOccurrences: z.number().int().optional().default(3),
    limit: z.number().int().optional(),
  }),
  execute: async (input) =>
    detectRecurring({
      minOccurrences: input.minOccurrences,
      limit: input.limit,
      filter: {
        startDate: input.startDate,
        endDate: input.endDate,
      },
    }),
});
