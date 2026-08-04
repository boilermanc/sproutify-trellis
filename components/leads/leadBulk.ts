export interface BulkFailure<T> {
  item: T;
  reason: string;
}

export async function runSequentialBulk<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  onProgress?: (completed: number, total: number) => void
): Promise<{ successes: Array<{ item: T; result: R }>; failures: BulkFailure<T>[] }> {
  const successes: Array<{ item: T; result: R }> = [];
  const failures: BulkFailure<T>[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    try {
      successes.push({ item, result: await worker(item) });
    } catch (error) {
      failures.push({ item, reason: error instanceof Error ? error.message : 'Update failed' });
    }
    onProgress?.(index + 1, items.length);
  }
  return { successes, failures };
}
