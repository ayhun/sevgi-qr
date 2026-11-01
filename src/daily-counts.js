// The API returns only dates that have scans; the chart needs every UTC date.
export function last90Days(days, current = new Date()) {
  const counts = new Map(days.map(day => [day.date, day.scans]));
  const year = current.getUTCFullYear(), month = current.getUTCMonth(), day = current.getUTCDate();
  return Array.from({ length: 90 }, (_, index) => {
    const date = new Date(Date.UTC(year, month, day - 89 + index)).toISOString().slice(0, 10);
    return { date, scans: counts.get(date) ?? 0 };
  });
}
