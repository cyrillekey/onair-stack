export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseDelayMs?: number; onRetry?: (attempt: number, err: unknown) => void },
): Promise<T> {
  const { retries, baseDelayMs = 500, onRetry } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      onRetry?.(attempt + 1, err);
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
