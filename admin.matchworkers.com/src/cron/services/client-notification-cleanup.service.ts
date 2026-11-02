import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  getNotificationCleanupDirectory,
  getNotificationDeletionLogPath,
  writeNotificationDeletionLog,
} from './notification-deletion-logger.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const CONTENT_TYPE_UID =
  'api::client-notification.client-notification';

type CleanupTrigger = 'cron';

type CleanupRuntime = {
  log: {
    info(message: string): unknown;
    warn(message: string): unknown;
    error(message: string): unknown;
  };
  documents(uid: string): {
    count(params: Record<string, unknown>): Promise<number>;
    deleteMany(params: Record<string, unknown>): Promise<{
      documentId?: string;
      entries?: number;
    }>;
  };
};

type CleanupState = {
  lastCompletedAt: string;
  lastStatus: 'success' | 'disabled';
  lastCutoff?: string;
  lastMatchedDocuments: number;
  lastDeletedEntries: number;
};

export type NotificationCleanupResult =
  | {
      status: 'success';
      cutoff: string;
      matchedDocuments: number;
      deletedEntries: number;
      durationSeconds: number;
    }
  | {
      status: 'skipped';
      reason: string;
    }
  | {
      status: 'failed';
      reason: string;
    };

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function getStatePath(): string {
  return path.join(
    getNotificationCleanupDirectory(),
    '.client-notification-cleanup-state.json'
  );
}

function getLockPath(): string {
  return path.join(
    getNotificationCleanupDirectory(),
    '.client-notification-cleanup.lock'
  );
}

async function readState(): Promise<CleanupState | null> {
  try {
    const raw = await fs.readFile(getStatePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<CleanupState>;

    if (
      typeof parsed.lastCompletedAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.lastCompletedAt))
    ) {
      return null;
    }

    return {
      lastCompletedAt: parsed.lastCompletedAt,
      lastStatus:
        parsed.lastStatus === 'disabled'
          ? 'disabled'
          : 'success',
      lastCutoff:
        typeof parsed.lastCutoff === 'string'
          ? parsed.lastCutoff
          : undefined,
      lastMatchedDocuments: Number(
        parsed.lastMatchedDocuments ?? 0
      ),
      lastDeletedEntries: Number(
        parsed.lastDeletedEntries ?? 0
      ),
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function writeState(state: CleanupState): Promise<void> {
  const statePath = getStatePath();
  const directory = path.dirname(statePath);
  const temporaryPath = `${statePath}.${process.pid}.tmp`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8'
  );
  await fs.rename(temporaryPath, statePath);
}

function subtractCalendarMonths(
  value: Date,
  months: number
): Date {
  const result = new Date(value.getTime());
  const originalDay = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);

  const finalDayOfTargetMonth = new Date(
    Date.UTC(
      result.getUTCFullYear(),
      result.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();

  result.setUTCDate(
    Math.min(originalDay, finalDayOfTargetMonth)
  );

  return result;
}

async function acquireLock(): Promise<
  (() => Promise<void>) | null
> {
  const lockPath = getLockPath();
  const staleMinutes = positiveInteger(
    'NOTIFICATION_CLEANUP_LOCK_STALE_MINUTES',
    120
  );

  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  try {
    const handle = await fs.open(lockPath, 'wx');

    await handle.writeFile(
      JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString(),
      })
    );

    await handle.close();
  } catch (error: any) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }

    const stat = await fs.stat(lockPath).catch(() => null);
    const stale =
      stat &&
      Date.now() - stat.mtimeMs > staleMinutes * 60 * 1000;

    if (!stale) {
      return null;
    }

    await fs.unlink(lockPath).catch(() => undefined);
    return acquireLock();
  }

  return async () => {
    await fs.unlink(lockPath).catch(() => undefined);
  };
}

function datePartsInTimeZone(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
  };
}

function calendarDayNumber(
  date: Date,
  timeZone: string
): number {
  const { year, month, day } = datePartsInTimeZone(
    date,
    timeZone
  );

  return Math.floor(
    Date.UTC(year, month - 1, day) / DAY_MS
  );
}

function calendarDateFromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

async function checkDue(
  intervalDays: number,
  now: Date,
  timeZone: string
): Promise<{
  due: boolean;
  lastCompletedAt?: string;
  nextDueDubaiDate?: string;
}> {
  const state = await readState();

  if (!state) {
    return { due: true };
  }

  const lastCompletedDate = new Date(state.lastCompletedAt);
  const lastDay = calendarDayNumber(
    lastCompletedDate,
    timeZone
  );
  const currentDay = calendarDayNumber(now, timeZone);
  const nextDueDay = lastDay + intervalDays;

  return {
    due: currentDay >= nextDueDay,
    lastCompletedAt: state.lastCompletedAt,
    nextDueDubaiDate: calendarDateFromDayNumber(nextDueDay),
  };
}

export async function runClientNotificationCleanup(
  strapi: CleanupRuntime,
  options: { trigger?: CleanupTrigger } = {}
): Promise<NotificationCleanupResult> {
  const startedAt = Date.now();
  const trigger = options.trigger ?? 'cron';
  const now = new Date();
  const intervalDays = positiveInteger(
    'NOTIFICATION_CLEANUP_INTERVAL_DAYS',
    4
  );
  const timeZone =
    process.env.NOTIFICATION_CLEANUP_TIMEZONE ??
    'Asia/Dubai';
  const retentionMonths = nonNegativeInteger(
    'NOTIFICATION_DELETE_OLDER_THAN_MONTHS',
    6
  );

  const due = await checkDue(
    intervalDays,
    now,
    timeZone
  );

  if (!due.due) {
    const reason =
      `Not due yet. intervalDays=${intervalDays}; ` +
      `lastCompletedAt=${due.lastCompletedAt}; ` +
      `nextDueDubaiDate=${due.nextDueDubaiDate}.`;

    strapi.log.info(
      `[client-notification-cleanup] ${reason}`
    );

    return { status: 'skipped', reason };
  }

  const releaseLock = await acquireLock();

  if (!releaseLock) {
    const reason =
      'Skipped because another notification cleanup is running.';

    strapi.log.warn(
      `[client-notification-cleanup] ${reason}`
    );
    await writeNotificationDeletionLog(
      'WARN',
      `${reason} trigger=${trigger}.`,
      now
    );

    return { status: 'skipped', reason };
  }

  try {
    if (retentionMonths === 0) {
      const message =
        'Cleanup checked but deletion is disabled because ' +
        'NOTIFICATION_DELETE_OLDER_THAN_MONTHS=0. ' +
        `trigger=${trigger}; intervalDays=${intervalDays}; ` +
        'matchedDocuments=0; deletedEntries=0.';

      strapi.log.info(
        `[client-notification-cleanup] ${message}`
      );
      await writeNotificationDeletionLog('INFO', message, now);
      await writeState({
        lastCompletedAt: now.toISOString(),
        lastStatus: 'disabled',
        lastMatchedDocuments: 0,
        lastDeletedEntries: 0,
      });

      return {
        status: 'skipped',
        reason:
          'Deletion disabled because retention months is 0.',
      };
    }

    const cutoff = subtractCalendarMonths(
      now,
      retentionMonths
    );
    const cutoffIso = cutoff.toISOString();
    const filters = {
      createdAt: {
        $lt: cutoffIso,
      },
    };

    strapi.log.info(
      '[client-notification-cleanup] Starting cleanup. ' +
        `Deleting documents created before ${cutoffIso}.`
    );

    const documents = strapi.documents(CONTENT_TYPE_UID);
    const matchedDocuments = await documents.count({ filters });

    let deletedEntries = 0;

    if (matchedDocuments > 0) {
      const deleted = await documents.deleteMany({ filters });
      deletedEntries = Number(deleted?.entries ?? 0);
    }

    const durationSeconds = Number(
      ((Date.now() - startedAt) / 1000).toFixed(1)
    );
    const completedAt = new Date();
    const message =
      `Cleanup completed. trigger=${trigger}; ` +
      `contentType=${CONTENT_TYPE_UID}; ` +
      `retentionMonths=${retentionMonths}; ` +
      `cutoff=${cutoffIso}; matchedDocuments=${matchedDocuments}; ` +
      `deletedEntries=${deletedEntries}; ` +
      `duration=${durationSeconds}s.`;

    strapi.log.info(
      `[client-notification-cleanup] ${message}`
    );
    await writeNotificationDeletionLog(
      'INFO',
      message,
      completedAt
    );
    await writeState({
      lastCompletedAt: completedAt.toISOString(),
      lastStatus: 'success',
      lastCutoff: cutoffIso,
      lastMatchedDocuments: matchedDocuments,
      lastDeletedEntries: deletedEntries,
    });

    return {
      status: 'success',
      cutoff: cutoffIso,
      matchedDocuments,
      deletedEntries,
      durationSeconds,
    };
  } catch (error: any) {
    const reason = error?.stack || error?.message || String(error);

    strapi.log.error(
      `[client-notification-cleanup] ${reason}`
    );
    await writeNotificationDeletionLog(
      'ERROR',
      `Cleanup failed. trigger=${trigger}; ${reason}`
    );

    // Do not update lastCompletedAt after a failure. The daily check
    // will retry at the next configured time.
    return { status: 'failed', reason };
  } finally {
    await releaseLock();

    strapi.log.info(
      '[client-notification-cleanup] Log file: ' +
        getNotificationDeletionLogPath()
    );
  }
}
