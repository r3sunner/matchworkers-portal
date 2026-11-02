import { runDatabaseBackup } from '../services/database-backup.service';

function isEnabled(value?: string): boolean {
  return String(value ?? '').trim().toLowerCase() === 'on';
}

export async function databaseBackupJob({ strapi }: { strapi: any }) {
  const enabled = isEnabled(
    process.env.AUTO_BACKUP ?? process.env['auto-backup'] ?? 'off'
  );

  if (!enabled) {
    strapi.log.info(
      '[database-backup] Skipped because AUTO_BACKUP is not on.'
    );
    return;
  }

  await runDatabaseBackup(strapi, { trigger: 'cron' });
}
