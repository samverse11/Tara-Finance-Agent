import fs from 'fs/promises';
import path from 'path';
import type { RawFund, RawHolding, RawNavPoint, RawTransaction } from './types';

function unwrapArray<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of keys) {
      const val = obj[key];
      if (Array.isArray(val)) return val as T[];
    }
  }
  return [];
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as unknown;
}

export async function loadTransactions(filePath: string): Promise<RawTransaction[]> {
  const data = await readJsonFile(filePath);
  return unwrapArray<RawTransaction>(data, [
    'transactions',
    'data',
    'items',
  ]);
}

export async function loadFunds(filePath: string): Promise<RawFund[]> {
  const data = await readJsonFile(filePath);
  return unwrapArray<RawFund>(data, ['funds', 'data', 'items']);
}

export async function loadHoldings(filePath: string): Promise<RawHolding[]> {
  const data = await readJsonFile(filePath);
  return unwrapArray<RawHolding>(data, ['holdings', 'data', 'items']);
}

export function fundIdOf(fund: RawFund): string {
  const id = fund.fund_id ?? fund.id;
  if (!id) throw new Error(`Fund missing fund_id: ${fund.name}`);
  return String(id);
}

/** NAV lives under `nav`, not `nav_history` (ignore nav_history if nav is absent). */
export function navPointsOf(fund: RawFund): RawNavPoint[] {
  if (Array.isArray(fund.nav) && fund.nav.length > 0) return fund.nav;
  if (Array.isArray(fund.nav_history)) return fund.nav_history;
  return [];
}

export function parseDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return d;
}

export function parseAmount(value: number | string): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${value}`);
  return n.toFixed(2);
}

export function sampleDirs(root: string): string[] {
  return ['sample_a', 'sample_b', 'sample_c']
    .map((name) => path.join(root, name))
    .filter(Boolean);
}

export async function resolveSamplePath(
  root: string,
  arg?: string
): Promise<string[]> {
  if (arg === '--all') {
    const dirs: string[] = [];
    for (const name of ['sample_a', 'sample_b', 'sample_c']) {
      const p = path.join(root, name);
      try {
        await fs.access(p);
        dirs.push(p);
      } catch {
        /* skip missing */
      }
    }
    return dirs;
  }

  if (arg) {
    const p = path.isAbsolute(arg) ? arg : path.join(root, arg);
    await fs.access(p);
    return [p];
  }

  const defaultDir = path.join(root, 'sample_a');
  await fs.access(defaultDir);
  return [defaultDir];
}
