import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { detectRecurring } from '../queries/recurring';

export const detectRecurringTool = createTool({
  id: 'detect_recurring',
  description: `Detect merchants that look like recurring subscriptions or regular bills.
Uses monthly frequency and amount consistency — not category labels.
Use when the user asks about subscriptions, recurring payments, or regular bills.`,

  inputSchema: z.object({
    min_months: z
      .number()
      .optional()
      .describe('Minimum distinct months required. Default 3.'),
    lookback_months: z
      .number()
      .optional()
      .describe('How far back to look in months. Default 6.'),
    source_dataset: z
      .string()
      .optional()
      .describe('sample_a | sample_b | sample_c. Defaults to ACTIVE_DATASET env.'),
  }),

  strict: false,

  execute: async (input) =>
    detectRecurring(
      input.min_months ?? 3,
      input.lookback_months ?? 6,
      input.source_dataset ?? null
    ),
});
