import { BadRequestException } from '@nestjs/common';

const timeZone = 'America/Argentina/Buenos_Aires';
const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const zone = new Intl.DateTimeFormat('en', {
  timeZone,
  timeZoneName: 'longOffset',
});

export function buenosAiresDay(instant: Date): string {
  const parts = calendar.formatToParts(instant);
  return ['year', 'month', 'day']
    .map((type) =>
      parts
        .find((part) => part.type === type)!
        .value.padStart(type === 'year' ? 4 : 2, '0'),
    )
    .join('-');
}

export function buenosAiresMidnight(day: Date): Date {
  const wanted = day.toISOString().slice(0, 10);
  // Observe both sides of an offset transition to handle skipped or repeated midnight.
  const offsets = new Set(
    [-86400000, 43200000, 129600000].map((delta) => {
      const text = zone
        .formatToParts(new Date(day.getTime() + delta))
        .find((part) => part.type === 'timeZoneName')!.value;
      if (text === 'GMT') return 0;
      const match = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
      if (!match) throw new Error('Unsupported IANA timezone offset');
      return (
        (match[1] === '+' ? 1 : -1) *
        (Number(match[2]) * 3600 +
          Number(match[3]) * 60 +
          Number(match[4] ?? 0)) *
        1000
      );
    }),
  );
  const candidates = [...offsets]
    .map((offset) => new Date(day.getTime() - offset))
    .filter((candidate) => buenosAiresDay(candidate) === wanted);
  if (!candidates.length) throw new BadRequestException('Fecha local inválida');
  return new Date(
    Math.min(...candidates.map((candidate) => candidate.getTime())),
  );
}
