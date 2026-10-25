/**
 * Dollars per million tokens, Anthropic first-party API rates (from the Claude API reference,
 * cached 2026-10-06). Cache writes are billed at 1.25x input (5-minute cache).
 */
export const PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number }
> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
};

export interface CallCost {
  role: string;
  model: string; // the model that actually served the call
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  usd: number | null; // null if the model isn't in the table
}

export function costOf(
  model: string,
  u: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number | null {
  const p = PRICES[model.replace(/-\d{8}$/, "")];
  if (!p) return null;
  return +(
    (u.input * p.input +
      u.output * p.output +
      u.cacheRead * p.cacheRead +
      u.cacheWrite * p.input * 1.25) /
    1_000_000
  ).toFixed(5);
}

export function totalUsd(calls: CallCost[]): number {
  return +calls.reduce((n, c) => n + (c.usd ?? 0), 0).toFixed(4);
}
