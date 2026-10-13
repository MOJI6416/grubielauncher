export type SeasonalEventId = "halloween";

export interface MonthDay {
  month: number;
  day: number;
}

export interface SeasonalEvent {
  id: SeasonalEventId;
  start: MonthDay;
  end: MonthDay;
  peak: MonthDay;
}

export interface ActiveSeasonalEvent {
  id: SeasonalEventId;
  isPeak: boolean;
  endsOn: Date;
}

export const SEASONAL_EVENTS: readonly SeasonalEvent[] = [
  {
    id: "halloween",
    start: { month: 10, day: 20 },
    end: { month: 11, day: 3 },
    peak: { month: 10, day: 31 },
  },
];

function ordinal({ month, day }: MonthDay): number {
  return month * 100 + day;
}

function monthDay(date: Date): MonthDay {
  return { month: date.getMonth() + 1, day: date.getDate() };
}

function wrapsYear(event: SeasonalEvent): boolean {
  return ordinal(event.start) > ordinal(event.end);
}

export function isEventActive(event: SeasonalEvent, date: Date): boolean {
  const today = ordinal(monthDay(date));
  const start = ordinal(event.start);
  const end = ordinal(event.end);

  return wrapsYear(event)
    ? today >= start || today <= end
    : today >= start && today <= end;
}

export function eventDate(
  { month, day }: MonthDay,
  year: number,
): Date {
  return new Date(year, month - 1, day);
}

export function formatMonthDay(date: Date, language: string): string {
  return date.toLocaleDateString(language, { day: "numeric", month: "long" });
}

export function eventRange(
  id: SeasonalEventId,
): { start: MonthDay; end: MonthDay } | null {
  const event = SEASONAL_EVENTS.find((item) => item.id === id);
  return event ? { start: event.start, end: event.end } : null;
}

export function activeSeasonalEvent(
  date: Date,
  events: readonly SeasonalEvent[] = SEASONAL_EVENTS,
): ActiveSeasonalEvent | null {
  const event = events.find((item) => isEventActive(item, date));
  if (!event) return null;

  const today = ordinal(monthDay(date));
  const endYear =
    wrapsYear(event) && today >= ordinal(event.start)
      ? date.getFullYear() + 1
      : date.getFullYear();

  return {
    id: event.id,
    isPeak: today === ordinal(event.peak),
    endsOn: eventDate(event.end, endYear),
  };
}

export function sameActiveEvent(
  a: ActiveSeasonalEvent | null,
  b: ActiveSeasonalEvent | null,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.id === b.id &&
    a.isPeak === b.isPeak &&
    a.endsOn.getTime() === b.endsOn.getTime()
  );
}
