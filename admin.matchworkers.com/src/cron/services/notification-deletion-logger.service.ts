import path from 'node:path';
import { promises as fs } from 'node:fs';

const DEFAULT_TIMEZONE = 'Asia/Dubai';

function resolveProjectPath(value: string): string {
  return path.isAbsolute(value)
    ? value
    : path.resolve(process.cwd(), value);
}

function getDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

function logTimestamp(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const dateText = [
    getDatePart(parts, 'day'),
    getDatePart(parts, 'month').toLowerCase(),
    getDatePart(parts, 'year'),
  ].join('-');

  const timeText = [
    getDatePart(parts, 'hour'),
    getDatePart(parts, 'minute'),
    getDatePart(parts, 'second'),
  ].join(':');

  return `${dateText} ${timeText} ${getDatePart(
    parts,
    'dayPeriod'
  ).toLowerCase()}`;
}

function yearInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
  }).format(date);
}

export function getNotificationCleanupDirectory(): string {
  return resolveProjectPath(
    process.env.NOTIFICATION_CLEANUP_LOG_DIR ??
      process.env.BACKUP_LOG_DIR ??
      './backup-log'
  );
}

export function getNotificationDeletionLogPath(
  date: Date = new Date()
): string {
  const timeZone =
    process.env.NOTIFICATION_CLEANUP_TIMEZONE ??
    'Asia/Dubai';
  const year = yearInTimeZone(date, timeZone);

  return path.join(
    getNotificationCleanupDirectory(),
    `notification-deletion-log-${year}.txt`
  );
}

export async function writeNotificationDeletionLog(
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  date: Date = new Date()
): Promise<void> {
  const timeZone =
    process.env.NOTIFICATION_CLEANUP_TIMEZONE ??
    DEFAULT_TIMEZONE;
  const logFile = getNotificationDeletionLogPath(date);

  await fs.mkdir(path.dirname(logFile), { recursive: true });

  const line =
    `${logTimestamp(date, timeZone)} ` +
    `[${timeZone}] [${level}] ${message}\n`;

  await fs.appendFile(logFile, line, 'utf8');
}
