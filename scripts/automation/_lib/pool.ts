/**
 * Bounded worker pool. Runs `total` tasks with at most `concurrency` in flight
 * at any moment — memory stays O(concurrency), not O(total).
 *
 * This is the correct shape for high-volume load: instead of pushing every task
 * into an array and racing it (which never shrinks and OOMs at scale), we spawn
 * a fixed set of workers that each pull the next index from a shared cursor and
 * loop until the work is exhausted. Nothing is retained after a task settles.
 */
export async function runPool(
  total: number,
  concurrency: number,
  task: (index: number) => Promise<void>,
): Promise<void> {
  if (total <= 0) return;
  let cursor = 0;
  const workers = Math.max(1, Math.min(concurrency, total));

  async function worker(): Promise<void> {
    // Pull the next index atomically (single-threaded event loop → no lock
    // needed) and run it. When the cursor passes `total`, the worker retires.
    for (let i = cursor++; i < total; i = cursor++) {
      await task(i);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
}
