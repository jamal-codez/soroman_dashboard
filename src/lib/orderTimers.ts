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
  const status = (opts.status || "").toLowerCase();
  if (!status) return false;
  if (status === "paid" || status === "canceled" || status === "cancelled" || status === "released" || status === "completed") {
    return false;
  }
  return isOlderThan12Hours(opts.created_at);
}
