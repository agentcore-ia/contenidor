const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function todayDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.CONTENT_TIME_ZONE || DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

// Adds `days` calendar days to a YYYY-MM-DD string and returns YYYY-MM-DD.
export function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function timeZone() {
  return process.env.CONTENT_TIME_ZONE || DEFAULT_TIME_ZONE;
}

// Milliseconds from now until the next occurrence of hour:minute wall-clock
// time in the content time zone.
export function msUntilNext(hour, minute, tz = timeZone()) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);

  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const nowMinutes = get('hour') * 60 + get('minute') + get('second') / 60;
  const targetMinutes = hour * 60 + minute;

  let deltaMinutes = targetMinutes - nowMinutes;
  if (deltaMinutes <= 0) deltaMinutes += 24 * 60;

  return Math.round(deltaMinutes * 60 * 1000);
}
