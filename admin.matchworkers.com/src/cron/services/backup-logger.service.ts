import path from 'node:path';
import { promises as fs } from 'node:fs';

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_TIMEZONE = 'Asia/Dubai';
const ACTIVE_LOG_FILENAME = 'auto-backup-database.txt';

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

/** Example: 26-jun-2026-7-02-pm */
function rotatedFilenameTimestamp(
  date: Date,
  timeZone: string
): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);

  return [
    getDatePart(parts, 'day'),
    getDatePart(parts, 'month').toLowerCase(),
    getDatePart(parts, 'year'),
    getDatePart(parts, 'hour'),
    getDatePart(parts, 'minute'),
    getDatePart(parts, 'dayPeriod').toLowerCase(),
  ].join('-');
}

function logLineTimestamp(date: Date, timeZone: string): string {
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

  return [
    getDatePart(parts, 'day'),
    getDatePart(parts, 'month').toLowerCase(),
    getDatePart(parts, 'year'),
  ].join('-') +
    ' ' +
    [
      getDatePart(parts, 'hour'),
      getDatePart(parts, 'minute'),
      getDatePart(parts, 'second'),
    ].join(':') +
    ` ${getDatePart(parts, 'dayPeriod').toLowerCase()}`;
}

async function uniqueRotatedPath(
  directory: string,
  baseTimestamp: string
): Promise<string> {
  const baseName = `auto-backup-database-${baseTimestamp}`;
  let candidate = path.join(directory, `${baseName}.txt`);
  let suffix = 2;

  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(directory, `${baseName}-${suffix}.txt`);
      suffix += 1;
    } catch {
      return candidate;
    }
  }
}

async function rotateIfRequired(
  logFile: string,
  incomingBytes: number,
  maxBytes: number,
  timeZone: string
): Promise<void> {
  try {
    const stat = await fs.stat(logFile);

    if (stat.size + incomingBytes < maxBytes) {
      return;
    }

    const directory = path.dirname(logFile);
    const timestamp = rotatedFilenameTimestamp(new Date(), timeZone);
    const rotatedPath = await uniqueRotatedPath(directory, timestamp);

    await fs.rename(logFile, rotatedPath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

export function getBackupLogPath(): string {
  const logDirectory = resolveProjectPath(
    process.env.BACKUP_LOG_DIR ?? './backup-log'
  );

  return path.join(logDirectory, ACTIVE_LOG_FILENAME);
}

export async function writeBackupLog(
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string
): Promise<void> {
  const logFile = getBackupLogPath();
  const logDirectory = path.dirname(logFile);
  const configuredMaxBytes = Number(
    process.env.BACKUP_LOG_MAX_BYTES ?? DEFAULT_MAX_BYTES
  );
  const maxBytes =
    Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0
      ? configuredMaxBytes
      : DEFAULT_MAX_BYTES;
  const timeZone =
    process.env.DATABASE_BACKUP_TIMEZONE ?? DEFAULT_TIMEZONE;

  await fs.mkdir(logDirectory, { recursive: true });

  const line =
    `${logLineTimestamp(new Date(), timeZone)} ` +
    `[${timeZone}] [${level}] ${message}\n`;

  await rotateIfRequired(
    logFile,
    Buffer.byteLength(line, 'utf8'),
    maxBytes,
    timeZone
  );

  await fs.appendFile(logFile, line, 'utf8');
}
