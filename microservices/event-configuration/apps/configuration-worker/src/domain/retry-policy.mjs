export function calculateRetry(row, maxBackoffSeconds, random = Math.random) {
  const attempts = row.retry_count + 1;
  const terminal = attempts >= row.max_retries;
  const exponential = Math.min(maxBackoffSeconds, 2 ** Math.min(attempts, 16));
  const jittered = Math.max(1, Math.round(exponential * (0.75 + random() * 0.5)));
  return { attempts, terminal, jittered };
}
