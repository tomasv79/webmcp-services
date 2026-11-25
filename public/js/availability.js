// Availability is computed from the current time on every answer, so the demo data never goes stale.
// Lithuania, Latvia and Estonia share one clock, so everything is read in Europe/Vilnius,
// independent of the time zone of the machine running the code.

export const TIME_ZONE = "Europe/Vilnius";

const WEEKDAYS_FROM_SUNDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  weekday: "short",
});

/**
 * The wall clock in Vilnius for a moment in time.
 * @param {Date} now
 * @returns {{ date: string, weekday: string, time: string }} e.g. { date: "2026-11-25", weekday: "wed", time: "10:00" }
 */
export function vilniusNow(now) {
  const parts = {};
  for (const part of clockFormat.formatToParts(now)) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday.toLowerCase(),
    time: `${parts.hour}:${parts.minute}`,
  };
}

const toUtcMidnight = (isoDate) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

/** Calendar-date arithmetic: no hours involved, so clock changes cannot shift the result. */
export function addDays(isoDate, days) {
  const date = new Date(toUtcMidnight(isoDate));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole calendar days from one ISO date to another. */
export function daysBetween(fromIsoDate, toIsoDate) {
  return Math.round((toUtcMidnight(toIsoDate) - toUtcMidnight(fromIsoDate)) / 86_400_000);
}

export function weekdayOf(isoDate) {
  return WEEKDAYS_FROM_SUNDAY[new Date(toUtcMidnight(isoDate)).getUTCDay()];
}

/**
 * @param {{ hours: Record<string, [string, string] | null>, leadTimeDays: number, emergency: boolean }} availability
 * @param {Date | { date: string, weekday: string, time: string }} now  A moment, or a clock already read with vilniusNow.
 * @returns {{ openNow: boolean, todayHours: [string, string] | null, nextFreeDate: string, daysUntilFree: number, leadTimeDays: number, emergency: boolean }}
 *
 * openNow       inside today's working hours (closing time itself is closed); emergency providers are always open.
 * nextFreeDate  first working day on or after today + leadTimeDays. With lead time 0, a day that is closed or
 *               already past closing time does not count. Emergency providers always answer today.
 */
export function computeAvailability(availability, now) {
  const clock = now instanceof Date ? vilniusNow(now) : now;
  const { hours, leadTimeDays, emergency } = availability;
  const todaySlot = hours[clock.weekday] ?? null;
  const insideHours = todaySlot !== null && todaySlot[0] <= clock.time && clock.time < todaySlot[1];

  let nextFreeDate = clock.date;
  if (!emergency) {
    let start = addDays(clock.date, leadTimeDays);
    const todayIsOver = todaySlot === null || clock.time >= todaySlot[1];
    if (leadTimeDays === 0 && todayIsOver) start = addDays(clock.date, 1);
    nextFreeDate = start;
    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = addDays(start, offset);
      if (hours[weekdayOf(candidate)]) {
        nextFreeDate = candidate;
        break;
      }
    }
  }

  return {
    openNow: emergency || insideHours,
    todayHours: todaySlot ? [...todaySlot] : null,
    nextFreeDate,
    daysUntilFree: daysBetween(clock.date, nextFreeDate),
    leadTimeDays,
    emergency,
  };
}
