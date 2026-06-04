export { queryTransactionsTool } from './queryTransactions';
export { queryPortfolioTool } from './queryPortfolio';
export { detectRecurringTool } from './detectRecurring';

import { queryTransactionsTool } from './queryTransactions';
import { queryPortfolioTool } from './queryPortfolio';
import { detectRecurringTool } from './detectRecurring';

export const taraTools = {
  query_transactions: queryTransactionsTool,
  query_portfolio: queryPortfolioTool,
  detect_recurring: detectRecurringTool,
};
