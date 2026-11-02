import 'dotenv/config';
import {
  runDatabaseBackup,
  type DatabaseBackupResult,
} from '../src/cron/services/database-backup.service';

const runtime = {
  log: {
    info(message: string) {
      console.log(message);
    },
    warn(message: string) {
      console.warn(message);
    },
    error(message: string) {
      console.error(message);
    },
  },
};

async function main(): Promise<void> {
  console.log('[manual-backup] Manual backup command started.');

  const result: DatabaseBackupResult = await runDatabaseBackup(
    runtime,
    { trigger: 'manual' }
  );

  if (result.status === 'failed') {
    console.error('[manual-backup] Backup failed.');
    process.exitCode = 1;
    return;
  }

  if (result.status === 'skipped') {
    console.warn(`[manual-backup] ${result.reason}`);
    return;
  }

  console.log(
    `[manual-backup] Completed successfully: ${result.s3Uri}`
  );
}

main().catch((error) => {
  console.error('[manual-backup] Unexpected error:', error);
  process.exitCode = 1;
});
