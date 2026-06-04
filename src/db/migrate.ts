import 'dotenv/config';
import { execSync } from 'child_process';

/** Push Drizzle schema to the database (dev convenience). */
execSync('npx drizzle-kit push --force', { stdio: 'inherit' });
