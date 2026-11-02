import { databaseBackupJob } from '../../../src/cron/jobs/database-backup.job';
import { clientNotificationCleanupJob } from '../../../src/cron/jobs/client-notification-cleanup.job';




type EnvHelper = {
  (key: string, defaultValue?: unknown): any;
  int?: (
    key: string,
    defaultValue?: number
  ) => number;
};

function isEnabled(value: unknown): boolean {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'on';
}

function getInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);

  if (
    Number.isInteger(parsed) &&
    parsed >= minimum &&
    parsed <= maximum
  ) {
    return parsed;
  }

  return fallback;
}

export default ({
  env,
}: {
  env: EnvHelper;
}) => {
  const tasks: Record<string, unknown> = {};

  /*
   * Database backup cron
   */
  if (isEnabled(env('AUTO_BACKUP', 'off'))) {
    tasks.databaseBackup = {
      task: databaseBackupJob,

      options: {
        rule: String(
          env(
            'DATABASE_BACKUP_CRON',
            '0 0 9-19/2 * * *'
          )
        ).trim(),

        tz: String(
          env(
            'DATABASE_BACKUP_TIMEZONE',
            'Asia/Dubai'
          )
        ).trim(),
      },
    };
  }

  /*
   * Client notification cleanup cron
   */
  if (
    isEnabled(
      env('AUTO_NOTIFICATION_CLEANUP', 'off')
    )
  ) {
    const hour = getInteger(
      env('NOTIFICATION_CLEANUP_HOUR', 1),
      1,
      0,
      23
    );

    const minute = getInteger(
      env('NOTIFICATION_CLEANUP_MINUTE', 0),
      0,
      0,
      59
    );

    const customCron = String(
      env('NOTIFICATION_CLEANUP_CRON', '')
    ).trim();

    tasks.clientNotificationCleanup = {
      task: clientNotificationCleanupJob,

      options: {
        rule:
          customCron ||
          `0 ${minute} ${hour} * * *`,

        tz: String(
          env(
            'NOTIFICATION_CLEANUP_TIMEZONE',
            'Asia/Dubai'
          )
        ).trim(),
      },
    };
  }

  return tasks;
};