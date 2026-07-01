const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function todayDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.CONTENT_TIME_ZONE || DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}
