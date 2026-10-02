// UTC calendar arithmetic for the card validity limit [F1.validity]. Pure; no Date is mutated.

/** from plus whole calendar months in UTC, clamped to the last day of a shorter month (31 Dec + 2 months = 28 Feb). */
export function addMonthsUtc(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(from.getUTCDate(), lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}
