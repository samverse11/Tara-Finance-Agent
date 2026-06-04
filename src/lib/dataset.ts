/** Active dataset for queries (one user snapshot at a time). */
export function activeDataset(override?: string | null): string {
  return (
    override ??
    process.env.ACTIVE_DATASET ??
    process.env.DEFAULT_SOURCE_DATASET ??
    'sample_a'
  );
}
