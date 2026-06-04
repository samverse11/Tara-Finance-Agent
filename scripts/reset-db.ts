import 'dotenv/config';
import { pool } from '../src/db/client';

await pool.query(`
  DROP TABLE IF EXISTS request_logs CASCADE;
  DROP TABLE IF EXISTS holdings CASCADE;
  DROP TABLE IF EXISTS fund_nav CASCADE;
  DROP TABLE IF EXISTS funds CASCADE;
  DROP TABLE IF EXISTS transactions CASCADE;
`);
console.log('Dropped legacy tables.');
await pool.end();
