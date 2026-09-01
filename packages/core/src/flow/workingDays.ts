// workingDays.ts — Every duration in Jira+ is working time.
//
// Mixing units would make two charts disagree by every weekend, and a
// discrepancy like that ends a conversation about whether the tool can be
// trusted. So there is one calendar, it is configurable, and every span is
// clipped through it.
//
// The calendar is injected rather than read from a clock or a locale, which is
// what makes all of this testable without freezing time.

import type { WorkingCalendar } from "../workspace/workspaceConfig.js";

/** Milliseconds in one day, used to step a calendar. */
const MILLISECONDS_PER_DAY = 86_400_000;

/** Milliseconds in one hour. */
const MILLISECONDS_PER_HOUR = 3_600_000;

/** Hours in a day, for converting a span into working days. */
const HOURS_PER_DAY = 24;

/** Is this moment inside a working day? */
export function isWorkingDay(atMs: number, calendar: WorkingCalendar): boolean {
  const date = new Date(atMs);
  if (calendar.weekendDays.includes(date.getUTCDay())) return false;
  return !calendar.holidayIsoDates.includes(toIsoDate(atMs));
}

/** The calendar date of a moment, in UTC, as `YYYY-MM-DD`. */
export function toIsoDate(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

/** Midnight UTC at the start of the day containing this moment. */
function startOfUtcDay(atMs: number): number {
  return Date.UTC(
    new Date(atMs).getUTCFullYear(),
    new Date(atMs).getUTCMonth(),
    new Date(atMs).getUTCDate(),
  );
}

/**
 * Working milliseconds between two moments.
 *
 * Clips at millisecond precision rather than counting whole days, so an item
 * opened on Friday afternoon and closed on Monday morning is a few hours old
 * rather than three days old. Counting calendar days there would make a fast
 * team look slow every single weekend.
 */
export function businessMillisBetween(
  fromMs: number,
  toMs: number,
  calendar: WorkingCalendar,
): number {
  if (toMs <= fromMs) return 0;

  let total = 0;
  let dayStart = startOfUtcDay(fromMs);

  while (dayStart < toMs) {
    const dayEnd = dayStart + MILLISECONDS_PER_DAY;
    if (isWorkingDay(dayStart, calendar)) {
      const overlapStart = Math.max(fromMs, dayStart);
      const overlapEnd = Math.min(toMs, dayEnd);
      if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
    }
    dayStart = dayEnd;
  }

  return total;
}

/** Working days between two moments, as a fraction rather than a whole number. */
export function businessDaysBetween(
  fromMs: number,
  toMs: number,
  calendar: WorkingCalendar,
): number {
  return businessMillisBetween(fromMs, toMs, calendar) / (MILLISECONDS_PER_HOUR * HOURS_PER_DAY);
}

/** The next working day at or after this moment. */
export function nextWorkingDay(atMs: number, calendar: WorkingCalendar): number {
  let candidate = startOfUtcDay(atMs);
  while (!isWorkingDay(candidate, calendar)) candidate += MILLISECONDS_PER_DAY;
  return candidate;
}

/** Parses an ISO timestamp, returning null rather than an invalid date. */
export function parseIsoOrNull(isoTimestamp: string | null | undefined): number | null {
  if (isoTimestamp === null || isoTimestamp === undefined) return null;
  const parsed = Date.parse(isoTimestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The ISO week a moment falls in, as `YYYY-Www`.
 *
 * Used to bucket throughput. ISO weeks are chosen over calendar months because
 * a week is a consistent width, and a monthly bar chart makes February look like
 * a bad month every year.
 */
export function toIsoWeek(atMs: number): string {
  const date = new Date(atMs);
  const dayNumber = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(date.getTime());
  thursday.setUTCDate(date.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const weekNumber =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (MILLISECONDS_PER_DAY * 7));
  return `${thursday.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

export { MILLISECONDS_PER_DAY };
