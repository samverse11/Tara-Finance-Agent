import { access, readdir } from 'fs/promises';
import { join, basename, resolve, isAbsolute } from 'path';

const REQUIRED_FILES = ['transactions.json', 'funds.json', 'holdings.json'] as const;

export function projectDataRoot(): string {
  const root = process.env.DATA_ROOT ?? './data';
  return resolve(root);
}

export function sourceDatasetFromDir(dataDir: string): string {
  return basename(resolve(dataDir));
}

async function hasRequiredFiles(dir: string): Promise<boolean> {
  for (const file of REQUIRED_FILES) {
    try {
      await access(join(dir, file));
    } catch {
      return false;
    }
  }
  return true;
}

/** Find directories under `dataRoot` named sample_* with all required JSON files. */
export async function discoverSampleDirs(dataRoot?: string): Promise<string[]> {
  const root = resolve(dataRoot ?? projectDataRoot());
  let entries: Array<{ name: string; isDirectory: () => boolean }>;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('sample_')) continue;
    const dir = join(root, entry.name);
    if (await hasRequiredFiles(dir)) dirs.push(dir);
  }

  return dirs.sort();
}

/** Resolve CLI target to an absolute data directory path. */
export async function resolveDataDir(target: string): Promise<string> {
  const root = projectDataRoot();
  const dir = isAbsolute(target) ? target : join(root, target);
  await access(dir);
  if (!(await hasRequiredFiles(dir))) {
    throw new Error(
      `Missing required JSON in ${dir} (need transactions.json, funds.json, holdings.json)`
    );
  }
  return dir;
}
