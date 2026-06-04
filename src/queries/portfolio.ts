import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { funds, fund_nav, holdings } from '../db/schema';

export type PortfolioOperation =
  | 'portfolio_value'
  | 'realised_return'
  | 'period_return'
  | 'fund_lookup'
  | 'fund_comparison'
  | 'best_performer'
  | 'holding_breakdown';

export interface QueryPortfolioInput {
  operation: PortfolioOperation;
  fundId?: string;
  fundName?: string;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  sourceFile?: string;
  limit?: number;
}

function latestNavJoin(asOf?: string) {
  const asOfDate = asOf ? new Date(asOf) : null;
  return asOfDate
    ? sql`(
        SELECT DISTINCT ON (fund_id) fund_id, nav, date
        FROM fund_nav
        WHERE date <= ${asOfDate}
        ORDER BY fund_id, date DESC
      ) ln`
    : sql`(
        SELECT DISTINCT ON (fund_id) fund_id, nav, date
        FROM fund_nav
        ORDER BY fund_id, date DESC
      ) ln`;
}

function navOnDate(fundId: string, onDate: string) {
  return db
    .select({
      nav: fund_nav.nav,
      date: fund_nav.date,
    })
    .from(fund_nav)
    .where(
      and(
        eq(fund_nav.fund_id, fundId),
        lte(fund_nav.date, new Date(onDate))
      )
    )
    .orderBy(desc(fund_nav.date))
    .limit(1);
}

export async function queryPortfolio(input: QueryPortfolioInput) {
  const limit = Math.min(input.limit ?? 20, 50);

  switch (input.operation) {
    case 'portfolio_value': {
      const asOf = input.asOfDate ?? input.endDate;
      const ln = latestNavJoin(asOf);
      const sourceFilter = input.sourceFile
        ? sql`AND h.source_file = ${input.sourceFile}`
        : sql``;

      const rows = await db.execute(sql`
        SELECT
          h.fund_id,
          f.name AS fund_name,
          h.units::numeric AS units,
          ln.nav::numeric AS current_nav,
          (h.units::numeric * ln.nav::numeric) AS current_value
        FROM holdings h
        JOIN funds f ON f.fund_id = h.fund_id
        JOIN ${ln} ON ln.fund_id = h.fund_id
        WHERE TRUE ${sourceFilter}
      `);

      const holdingsRows = rows.rows as Record<string, unknown>[];
      const total = holdingsRows.reduce(
        (sum, r) => sum + Number(r.current_value ?? 0),
        0
      );

      return {
        operation: input.operation,
        as_of: asOf ?? 'latest',
        total_portfolio_value: total.toFixed(2),
        holdings: holdingsRows,
      };
    }

    case 'realised_return': {
      const asOf = input.asOfDate ?? input.endDate;
      const ln = latestNavJoin(asOf);
      const sourceFilter = input.sourceFile
        ? sql`AND h.source_file = ${input.sourceFile}`
        : sql``;
      const fundFilter = input.fundId
        ? sql`AND h.fund_id = ${input.fundId}`
        : sql``;

      const result = await db.execute(sql`
        SELECT
          h.fund_id,
          f.name AS fund_name,
          h.units::numeric AS units,
          h.purchase_nav::numeric AS purchase_nav,
          ln.nav::numeric AS current_nav,
          (h.units::numeric * ln.nav::numeric) AS current_value,
          (h.units::numeric * h.purchase_nav::numeric) AS purchase_cost,
          CASE
            WHEN (h.units::numeric * h.purchase_nav::numeric) = 0 THEN NULL
            ELSE ROUND(
              (
                (h.units::numeric * ln.nav::numeric)
                - (h.units::numeric * h.purchase_nav::numeric)
              )
              / (h.units::numeric * h.purchase_nav::numeric)
              * 100,
              4
            )
          END AS realised_return_pct
        FROM holdings h
        JOIN funds f ON f.fund_id = h.fund_id
        JOIN ${ln} ON ln.fund_id = h.fund_id
        WHERE TRUE ${sourceFilter} ${fundFilter}
      `);

      const rows = result.rows as Record<string, unknown>[];
      const valid = rows.filter((r) => r.realised_return_pct != null);
      const avg =
        valid.length > 0
          ? valid.reduce((s, r) => s + Number(r.realised_return_pct), 0) /
            valid.length
          : null;

      return {
        operation: input.operation,
        as_of: asOf ?? 'latest',
        holdings: rows,
        average_realised_return_pct:
          avg != null ? avg.toFixed(4) : null,
        definition:
          'Realised return = (current value - purchase cost) / purchase cost * 100',
      };
    }

    case 'period_return': {
      if (!input.startDate || !input.endDate) {
        return {
          operation: input.operation,
          error: 'startDate and endDate are required for period_return',
        };
      }
      const fundId = input.fundId;
      if (!fundId && input.fundName) {
        const [f] = await db
          .select()
          .from(funds)
          .where(sql`${funds.name} ILIKE ${`%${input.fundName}%`}`)
          .limit(1);
        if (!f) {
          return {
            operation: input.operation,
            error: `Fund not found: ${input.fundName}`,
          };
        }
        return periodReturnForFund(f.fund_id, f.name, input.startDate, input.endDate);
      }
      if (!fundId) {
        return {
          operation: input.operation,
          error: 'fundId or fundName required for period_return',
        };
      }
      const [f] = await db
        .select()
        .from(funds)
        .where(eq(funds.fund_id, fundId))
        .limit(1);
      return periodReturnForFund(
        fundId,
        f?.name ?? fundId,
        input.startDate,
        input.endDate
      );
    }

    case 'fund_lookup': {
      const name = input.fundName ?? input.fundId;
      if (!name) {
        return { operation: input.operation, error: 'fundName or fundId required' };
      }
      const rows = await db
        .select()
        .from(funds)
        .where(
          input.fundId
            ? eq(funds.fund_id, input.fundId)
            : sql`${funds.name} ILIKE ${`%${name}%`} OR ${funds.fund_id} ILIKE ${`%${name}%`}`
        )
        .limit(limit);
      return { operation: input.operation, funds: rows };
    }

    case 'fund_comparison':
    case 'best_performer': {
      if (!input.startDate || !input.endDate) {
        return {
          operation: input.operation,
          error: 'startDate and endDate required',
        };
      }
      const allFunds = await db.select({ fund_id: funds.fund_id, name: funds.name }).from(funds);
      const results: Record<string, unknown>[] = [];

      for (const fund of allFunds) {
        const pr = await periodReturnForFund(
          fund.fund_id,
          fund.name,
          input.startDate,
          input.endDate
        );
        if (pr.period_return_pct != null) {
          results.push(pr);
        }
      }

      results.sort(
        (a, b) =>
          Number(b.period_return_pct ?? 0) - Number(a.period_return_pct ?? 0)
      );

      if (input.operation === 'best_performer') {
        return {
          operation: input.operation,
          best: results[0] ?? null,
          definition:
            'Period return = (end NAV - start NAV) / start NAV * 100',
        };
      }

      return {
        operation: input.operation,
        funds: results.slice(0, limit),
        definition:
          'Period return = (end NAV - start NAV) / start NAV * 100',
      };
    }

    case 'holding_breakdown': {
      const sourceFilter = input.sourceFile
        ? eq(holdings.source_file, input.sourceFile)
        : undefined;
      const rows = await db
        .select({
          fund_id: holdings.fund_id,
          units: holdings.units,
          purchase_nav: holdings.purchase_nav,
          purchase_date: holdings.purchase_date,
          source_file: holdings.source_file,
        })
        .from(holdings)
        .where(sourceFilter);
      return { operation: input.operation, holdings: rows };
    }

    default:
      return { error: `Unknown operation: ${input.operation}` };
  }
}

async function periodReturnForFund(
  fundId: string,
  fundName: string,
  startDate: string,
  endDate: string
) {
  const [startRow] = await navOnDate(fundId, startDate);
  const [endRow] = await navOnDate(fundId, endDate);

  if (!startRow || !endRow) {
    return {
      fund_id: fundId,
      fund_name: fundName,
      start_date: startDate,
      end_date: endDate,
      start_nav: startRow?.nav ?? null,
      end_nav: endRow?.nav ?? null,
      period_return_pct: null,
      message: 'Insufficient NAV data for the requested period',
    };
  }

  const startNav = Number(startRow.nav);
  const endNav = Number(endRow.nav);
  const pct =
    startNav === 0
      ? null
      : Number((((endNav - startNav) / startNav) * 100).toFixed(4));

  return {
    fund_id: fundId,
    fund_name: fundName,
    start_date: startRow.date,
    end_date: endRow.date,
    start_nav: startRow.nav,
    end_nav: endRow.nav,
    period_return_pct: pct,
    definition: 'Period return = (end NAV - start NAV) / start NAV * 100',
  };
}
