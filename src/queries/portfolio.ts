import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { activeDataset } from '../lib/dataset';

export type PortfolioQueryType =
  | 'period_return'
  | 'realised_return'
  | 'portfolio_summary'
  | 'fund_list';

export interface PortfolioQueryParams {
  queryType: PortfolioQueryType;
  fundId?: string | null;
  fundNameSearch?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  sourceDataset?: string | null;
}

async function getNavOnOrBefore(
  fundId: string,
  date: string,
  sourceDataset: string
): Promise<number | null> {
  const { rows } = await db.execute(sql`
    SELECT nav_value::float AS nav
    FROM fund_nav
    WHERE fund_id = ${fundId}
      AND source_dataset = ${sourceDataset}
      AND nav_date <= ${date}::date
    ORDER BY nav_date DESC
    LIMIT 1
  `);
  return rows.length > 0 ? (rows[0].nav as number) : null;
}

async function getLatestNav(
  fundId: string,
  sourceDataset: string
): Promise<{ nav: number; date: string } | null> {
  const { rows } = await db.execute(sql`
    SELECT nav_value::float AS nav, nav_date::text AS date
    FROM fund_nav
    WHERE fund_id = ${fundId} AND source_dataset = ${sourceDataset}
    ORDER BY nav_date DESC
    LIMIT 1
  `);
  return rows.length > 0
    ? { nav: rows[0].nav as number, date: rows[0].date as string }
    : null;
}

export async function queryPortfolio(p: PortfolioQueryParams) {
  const sourceDataset = activeDataset(p.sourceDataset);

  switch (p.queryType) {
    case 'fund_list': {
      const { rows } = await db.execute(sql`
        SELECT f.id, f.name, f.category,
          (SELECT nav_value::float FROM fund_nav
           WHERE fund_id = f.id AND source_dataset = ${sourceDataset}
           ORDER BY nav_date DESC LIMIT 1) AS latest_nav,
          (SELECT nav_date::text FROM fund_nav
           WHERE fund_id = f.id AND source_dataset = ${sourceDataset}
           ORDER BY nav_date DESC LIMIT 1) AS latest_date
        FROM funds f
        WHERE EXISTS (
          SELECT 1 FROM fund_nav fn
          WHERE fn.fund_id = f.id AND fn.source_dataset = ${sourceDataset}
        )
        ORDER BY f.name
      `);
      return {
        found: rows.length > 0,
        sourceDataset,
        funds: rows,
      };
    }

    case 'period_return': {
      let fundRows: Array<{ id: string; name: string }>;
      if (p.fundId) {
        const { rows } = await db.execute(
          sql`SELECT id, name FROM funds WHERE id = ${p.fundId}`
        );
        fundRows = rows as Array<{ id: string; name: string }>;
      } else if (p.fundNameSearch) {
        const { rows } = await db.execute(sql`
          SELECT id, name FROM funds WHERE name ILIKE ${'%' + p.fundNameSearch + '%'}
        `);
        fundRows = rows as Array<{ id: string; name: string }>;
      } else {
        const { rows } = await db.execute(sql`
          SELECT DISTINCT f.id, f.name
          FROM funds f
          INNER JOIN fund_nav fn ON fn.fund_id = f.id AND fn.source_dataset = ${sourceDataset}
          ORDER BY f.name
        `);
        fundRows = rows as Array<{ id: string; name: string }>;
      }

      if (fundRows.length === 0) {
        return { found: false, message: 'No matching funds found.', sourceDataset };
      }

      const dateTo = p.dateTo ?? new Date().toISOString().split('T')[0]!;
      const dateFrom = p.dateFrom ?? dateTo;

      const results = await Promise.all(
        fundRows.map(async (f) => {
          const navStart = await getNavOnOrBefore(f.id, dateFrom, sourceDataset);
          const navEnd = await getNavOnOrBefore(f.id, dateTo, sourceDataset);
          if (navStart == null || navEnd == null) return null;
          const pctReturn = ((navEnd - navStart) / navStart) * 100;
          return {
            fundId: f.id,
            fundName: f.name,
            navStart: Math.round(navStart * 100) / 100,
            navEnd: Math.round(navEnd * 100) / 100,
            pctReturn: Math.round(pctReturn * 100) / 100,
            dateFrom,
            dateTo,
          };
        })
      );

      const valid = results.filter(Boolean);
      if (valid.length === 0) {
        return {
          found: false,
          message: 'No NAV data for the requested date range.',
          sourceDataset,
        };
      }
      return {
        found: true,
        sourceDataset,
        definition:
          'Period return = (end NAV - start NAV) / start NAV × 100 (fund-level, not user gain)',
        periodReturns: valid,
      };
    }

    case 'realised_return': {
      let holdingQuery = sql`
        SELECT h.id, h.fund_id, h.fund_name, h.units::float, h.purchase_date::text,
               h.purchase_nav::float
        FROM holdings h
        WHERE h.source_dataset = ${sourceDataset}
      `;

      if (p.fundId) {
        holdingQuery = sql`
          SELECT h.id, h.fund_id, h.fund_name, h.units::float, h.purchase_date::text,
                 h.purchase_nav::float
          FROM holdings h
          WHERE h.source_dataset = ${sourceDataset} AND h.fund_id = ${p.fundId}
        `;
      } else if (p.fundNameSearch) {
        holdingQuery = sql`
          SELECT h.id, h.fund_id, h.fund_name, h.units::float, h.purchase_date::text,
                 h.purchase_nav::float
          FROM holdings h
          WHERE h.source_dataset = ${sourceDataset}
            AND h.fund_name ILIKE ${'%' + p.fundNameSearch + '%'}
        `;
      }

      const { rows } = await db.execute(holdingQuery);
      if (rows.length === 0) {
        return {
          found: false,
          message: 'No holdings found matching that fund.',
          sourceDataset,
        };
      }

      const results = await Promise.all(
        (
          rows as Array<{
            fund_id: string;
            fund_name: string;
            units: number;
            purchase_date: string;
            purchase_nav: number;
          }>
        ).map(async (h) => {
          const latest = await getLatestNav(h.fund_id, sourceDataset);
          if (!latest) return null;
          const currentValue = h.units * latest.nav;
          const purchaseCost = h.units * h.purchase_nav;
          const absoluteGain = currentValue - purchaseCost;
          const pctReturn = (absoluteGain / purchaseCost) * 100;
          return {
            fundId: h.fund_id,
            fundName: h.fund_name,
            units: h.units,
            purchaseDate: h.purchase_date,
            purchaseNav: Math.round(h.purchase_nav * 100) / 100,
            currentNav: Math.round(latest.nav * 100) / 100,
            currentNavDate: latest.date,
            currentValue: Math.round(currentValue * 100) / 100,
            purchaseCost: Math.round(purchaseCost * 100) / 100,
            absoluteGain: Math.round(absoluteGain * 100) / 100,
            pctReturn: Math.round(pctReturn * 100) / 100,
          };
        })
      );

      const valid = results.filter(Boolean);
      return {
        found: valid.length > 0,
        sourceDataset,
        definition:
          'Realised return = (current value - purchase cost) / purchase cost × 100 (user-specific)',
        realisedReturns: valid,
      };
    }

    case 'portfolio_summary': {
      const { rows: holdingRows } = await db.execute(sql`
        SELECT h.fund_id, h.fund_name, h.units::float, h.purchase_nav::float
        FROM holdings h
        WHERE h.source_dataset = ${sourceDataset}
      `);

      if (holdingRows.length === 0) {
        return { found: false, message: 'No holdings found.', sourceDataset };
      }

      let portfolioValue = 0;
      let totalCost = 0;

      const details = await Promise.all(
        (
          holdingRows as Array<{
            fund_id: string;
            fund_name: string;
            units: number;
            purchase_nav: number;
          }>
        ).map(async (h) => {
          const latest = await getLatestNav(h.fund_id, sourceDataset);
          if (!latest) return null;
          const cv = h.units * latest.nav;
          const pc = h.units * h.purchase_nav;
          portfolioValue += cv;
          totalCost += pc;
          return {
            fundName: h.fund_name,
            currentValue: Math.round(cv * 100) / 100,
          };
        })
      );

      const filtered = details.filter(Boolean);
      if (filtered.length === 0) {
        return { found: false, message: 'No NAV data for holdings.', sourceDataset };
      }

      return {
        found: true,
        sourceDataset,
        portfolioValue: Math.round(portfolioValue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalGain: Math.round((portfolioValue - totalCost) * 100) / 100,
        totalGainPct:
          totalCost > 0
            ? Math.round(((portfolioValue - totalCost) / totalCost) * 10000) / 100
            : null,
        currency: 'INR',
        holdings: filtered,
      };
    }

    default:
      return { found: false, message: `Unknown query type`, sourceDataset };
  }
}
