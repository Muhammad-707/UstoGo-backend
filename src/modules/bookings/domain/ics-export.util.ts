/**
 * B-40-adjacent (calendar export, not two-way sync). Pure text generation —
 * RFC 5545 (iCalendar), no dependency: the format is a handful of `KEY:value`
 * lines with CRLF endings, which a small hand-rolled builder covers completely for
 * the read-only VEVENT subset this export needs.
 */
export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location: string;
};

const CRLF = '\r\n';

const toIcsUtc = (date: Date): string =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

/** Escapes text per RFC 5545 §3.3.11 — backslash, semicolon, comma, then newlines. */
const escapeText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const buildEvent = (event: IcsEvent, stamp: string): string =>
  [
    'BEGIN:VEVENT',
    `UID:${event.uid}@ustogo.tj`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `LOCATION:${escapeText(event.location)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
  ].join(CRLF);

export const buildIcsCalendar = (events: readonly IcsEvent[]): string => {
  const stamp = toIcsUtc(new Date());

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UstoGo//Booking Schedule//EN',
    'CALSCALE:GREGORIAN',
    ...events.map((event) => buildEvent(event, stamp)),
    'END:VCALENDAR',
  ].join(CRLF);
};
