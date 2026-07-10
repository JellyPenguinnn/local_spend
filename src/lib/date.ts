import { DEFAULT_TIME_ZONE } from "./defaults";

export interface CalendarDay {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export function formatLocalIsoDate(date = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function formatMonthKey(date = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  return formatLocalIsoDate(date, timeZone).slice(0, 7);
}

export function getMonthParts(monthKey: string): { year: number; monthIndex: number } {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

export function monthLabel(monthKey: string): string {
  const { year, monthIndex } = getMonthParts(monthKey);
  return new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric" }).format(new Date(year, monthIndex, 1));
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function buildCalendarMonth(monthKey: string, today = formatLocalIsoDate()): CalendarDay[] {
  const { year, monthIndex } = getMonthParts(monthKey);
  const firstDay = new Date(year, monthIndex, 1);
  const leading = firstDay.getDay();
  const totalDays = daysInMonth(year, monthIndex);
  const previousMonthDays = daysInMonth(year, monthIndex - 1);
  const cells: CalendarDay[] = [];

  for (let offset = leading; offset > 0; offset -= 1) {
    const day = previousMonthDays - offset + 1;
    const date = toIsoDate(year, monthIndex - 1, day);
    cells.push({ date, day, isCurrentMonth: false, isToday: date === today });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = toIsoDate(year, monthIndex, day);
    cells.push({ date, day, isCurrentMonth: true, isToday: date === today });
  }

  let nextDay = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const date = toIsoDate(year, monthIndex + 1, nextDay);
    cells.push({ date, day: nextDay, isCurrentMonth: false, isToday: date === today });
    nextDay += 1;
  }

  return cells;
}

export function toIsoDate(year: number, monthIndex: number, day: number): string {
  const date = new Date(year, monthIndex, day, 12, 0, 0, 0);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateValue: string, count: number): string {
  const date = parseLocalDate(dateValue);
  date.setDate(date.getDate() + count);
  return toIsoDate(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addMonthsClamped(dateValue: string, count: number, preferredDay?: number | null): string {
  const date = parseLocalDate(dateValue);
  const targetMonth = date.getMonth() + count;
  const target = new Date(date.getFullYear(), targetMonth, 1, 12, 0, 0, 0);
  const day = preferredDay ?? date.getDate();
  const clamped = Math.min(day, daysInMonth(target.getFullYear(), target.getMonth()));
  return toIsoDate(target.getFullYear(), target.getMonth(), clamped);
}

export function previousMonthKey(monthKey: string): string {
  const { year, monthIndex } = getMonthParts(monthKey);
  return toIsoDate(year, monthIndex - 1, 1).slice(0, 7);
}

export function compareIsoDates(a: string, b: string): number {
  return a.localeCompare(b);
}
