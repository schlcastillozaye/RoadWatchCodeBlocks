const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** Parses simple durations like "15m", "30d", "12h" into milliseconds. */
export function parseTtlToMs(ttl: string, fallbackMs = 0): number {
  const match = /^(\d+)\s*(ms|s|m|h|d|w)$/i.exec(ttl.trim());
  if (!match) return fallbackMs;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  return value * (UNIT_MS[unit] ?? 0);
}
