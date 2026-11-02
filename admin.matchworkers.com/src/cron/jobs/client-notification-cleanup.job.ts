import { runClientNotificationCleanup } from '../services/client-notification-cleanup.service';

function isEnabled(value?: string): boolean {
  return String(value ?? '').trim().toLowerCase() === 'on';
}

export async function clientNotificationCleanupJob({
  strapi,
}: {
  strapi: any;
}) {
  const enabled = isEnabled(
    process.env.AUTO_NOTIFICATION_CLEANUP ?? 'off'
  );

  if (!enabled) {
    strapi.log.info(
      '[client-notification-cleanup] Skipped because ' +
        'AUTO_NOTIFICATION_CLEANUP is not on.'
    );
    return;
  }

  await runClientNotificationCleanup(strapi, {
    trigger: 'cron',
  });
}
