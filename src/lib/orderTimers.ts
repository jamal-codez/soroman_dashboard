export const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function isOlderThan12Hours(isoDate?: string): boolean {
  if (!isoDate) return false;
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return false;
  return Date.now() - t >= TWELVE_HOURS_MS;
}

export function shouldAutoCancel(opts: {
  status?: string;
  created_at?: string;
}): boolean {
  // Unconditionally return false so that pending orders are never automatically canceled by the frontend.
  // This ensures they do not disappear from the Payment Verification page without manual confirmation or deletion.
  return false;
}
