export function utcDayStart(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export function defaultStatisticsRange(now: Date): { from: Date; to: Date } {
  const to = new Date(now);
  const from = utcDayStart(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from, to };
}
