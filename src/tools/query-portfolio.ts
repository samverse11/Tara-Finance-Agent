import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { queryPortfolio } from '../queries/portfolio';

export const queryPortfolioTool = createTool({
  id: 'query_portfolio',
  description: `Query mutual fund portfolio and NAV data.
Use for: portfolio value, realised return (user gain vs purchase cost), period return (NAV change between dates), fund lookup, fund comparison, best performer.
Period return = (end NAV - start NAV) / start NAV * 100 — fund performance, NOT user gain.
Realised return = (current value - purchase cost) / purchase cost * 100 — user-specific. Never confuse these.`,
  inputSchema: z.object({
    operation: z.enum([
      'portfolio_value',
      'realised_return',
      'period_return',
      'fund_lookup',
      'fund_comparison',
      'best_performer',
      'holding_breakdown',
    ]),
    fundId: z.string().optional(),
    fundName: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    asOfDate: z.string().optional().describe('Valuation date (defaults to latest NAV)'),
    limit: z.number().int().optional(),
  }),
  execute: async (input) => queryPortfolio(input),
});
