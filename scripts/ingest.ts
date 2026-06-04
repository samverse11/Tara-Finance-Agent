import 'dotenv/config';
import { pool } from '../src/db/client';
import {
  discoverSampleDirs,
  projectDataRoot,
  resolveDataDir,
} from '../src/ingest/discover';
import { seedDataset } from '../src/ingest/seed';

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.endsWith('.ts'));
  const ingestAll = args.includes('--all');
  const target = args.find((a) => a !== '--all');

  let dirs: string[] = [];

  if (ingestAll) {
    dirs = await discoverSampleDirs();
    if (dirs.length === 0) {
      console.error(
        `No sample_* directories found under ${projectDataRoot()} (need transactions.json, funds.json, holdings.json)`
      );
      process.exit(1);
    }
    console.log(`Discovered ${dirs.length} dataset(s): ${dirs.map((d) => d.split(/[/\\]/).pop()).join(', ')}`);
  } else if (target) {
    dirs = [await resolveDataDir(target)];
  } else if (process.env.DATA_DIR) {
    dirs = [await resolveDataDir(process.env.DATA_DIR)];
  } else {
    const discovered = await discoverSampleDirs();
    if (discovered.length === 0) {
      console.error('ERROR: set DATA_DIR, pass a sample name, or use --all');
      console.error('  DATA_DIR=./data/sample_a npm run ingest');
      console.error('  npm run ingest sample_a');
      console.error('  npm run ingest:all');
      process.exit(1);
    }
    dirs = [discovered[0]!];
    console.log(`No target specified — defaulting to ${discovered[0]}`);
  }

  const totals = { transactions: 0, funds: 0, navPoints: 0, holdings: 0 };

  for (const dir of dirs) {
    const counts = await seedDataset(dir);
    totals.transactions += counts.transactions;
    totals.funds += counts.funds;
    totals.navPoints += counts.navPoints;
    totals.holdings += counts.holdings;
  }

  if (dirs.length > 1) {
    console.log('\n── Totals across run ──');
    console.log(
      `  ${totals.transactions} transactions, ${totals.navPoints} NAV points, ${totals.holdings} holdings (${dirs.length} datasets)`
    );
  }

  console.log('\nIngestion complete.');
}

main()
  .catch((err) => {
    console.error('Ingest failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
