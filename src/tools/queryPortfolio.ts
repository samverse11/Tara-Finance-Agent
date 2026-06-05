import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { queryPortfolio } from '../queries/portfolio';
import { resolveDate, resolveDateTo } from '../lib/dates';

export const queryPortfolioTool = createTool({
  id: 'query_portfolio',
  description: `Query fund and investment data. Use for:
- "what is my return / overall investment return / how much have I gained" → query_type=realised_return (user's actual gain vs purchase cost)
- "what is my portfolio worth / total value" → query_type=portfolio_summary (includes totalGain and totalGainPct)
- "how did fund X perform / period return" → query_type=period_return (fund NAV % change, NOT user-specific)
- "list all funds / latest NAV" → query_type=fund_list
IMPORTANT: For overall portfolio return (%), always use portfolio_summary — it returns totalGainPct directly.`,

  inputSchema: z.object({
    query_type: z.enum([
      'period_return',
      'realised_return',
      'portfolio_summary',
      'fund_list',
    ]),
    fund_id: z.string().optional().describe('Exact fund id e.g. fund_bluechip'),
    fund_name_search: z
      .string()
      .optional()
      .describe('Partial name e.g. "Saffron" or "Bluechip"'),
    date_from: z.string().optional().describe('For period_return: start date ISO'),
    date_to: z
      .string()
      .optional()
      .describe('For period_return: end date ISO. Defaults to latest NAV date.'),
    source_dataset: z
      .string()
      .optional()
      .describe('sample_a | sample_b | sample_c. Defaults to ACTIVE_DATASET env.'),
  }),

  strict: false,

  execute: async (input) => {
    const dateFrom = resolveDate(input.date_from ?? null);
    const dateTo = resolveDateTo(input.date_to ?? null, dateFrom);

    return queryPortfolio({
      queryType: input.query_type,
      fundId: input.fund_id ?? null,
      fundNameSearch: input.fund_name_search ?? null,
      dateFrom,
      dateTo,
      sourceDataset: input.source_dataset ?? null,
    });
  },
});
