export { queryTransactionsTool } from './query-transactions';
export { queryPortfolioTool } from './query-portfolio';
export { detectRecurringTool } from './detect-recurring';

import { queryTransactionsTool } from './query-transactions';
import { queryPortfolioTool } from './query-portfolio';
import { detectRecurringTool } from './detect-recurring';

export const taraTools = {
  query_transactions: queryTransactionsTool,
  query_portfolio: queryPortfolioTool,
  detect_recurring: detectRecurringTool,
};
