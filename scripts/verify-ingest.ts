import 'dotenv/config';
import { sql, eq } from 'drizzle-orm';
import { db, pool } from '../src/db/connection';
import { transactions, funds, fund_nav, holdings } from '../src/db/schema';
import { queryTransactions } from '../src/queries/transactions';
import { queryPortfolio } from '../src/queries/portfolio';
import { detectRecurring } from '../src/queries/recurring';

async function countTable(tableName: 'transactions' | 'funds' | 'fund_nav' | 'holdings') {
  const result = await db.execute(
    sql.raw(`SELECT COUNT(*)::int AS n FROM ${tableName}`)
  );
  const row = result.rows[0] as { n: number };
  return row?.n ?? 0;
}

async function main() {
  console.log('── DB counts ──');
  console.log('transactions:', await countTable('transactions'));
  console.log('funds:', await countTable('funds'));
  console.log('fund_nav:', await countTable('fund_nav'));
  console.log('holdings:', await countTable('holdings'));

  const swiggy = await queryTransactions({
    operation: 'merchant_spending',
    filter: { merchantCanonical: 'SWIGGY' },
  });
  console.log('\n── Swiggy net spend (expect 870 = 450+520-100) ──');
  console.log(swiggy);

  const food = await queryTransactions({
    operation: 'category_spending',
    filter: { category: 'food' },
  });
  console.log('\n── Food category ──');
  console.log(food);

  const portfolio = await queryPortfolio({ operation: 'portfolio_value' });
  console.log('\n── Portfolio value ──');
  console.log(portfolio);

  const period = await queryPortfolio({
    operation: 'period_return',
    fundId: 'FUND001',
    startDate: '2024-01-01',
    endDate: '2024-03-01',
  });
  console.log('\n── FUND001 period return (expect 10%) ──');
  console.log(period);

  const recurring = await detectRecurring({ minOccurrences: 3 });
  console.log('\n── Recurring merchants ──');
  console.log(recurring);

  const canonical = await db
    .select({ merchant: transactions.merchant, canonical: transactions.merchant_canonical })
    .from(transactions)
    .where(eq(transactions.merchant_canonical, 'SWIGGY'))
    .limit(5);
  console.log('\n── SWIGGY canonicalization sample ──');
  console.log(canonical);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
