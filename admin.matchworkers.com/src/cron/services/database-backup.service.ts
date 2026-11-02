import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import archiver = require('archiver');
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  getBackupLogPath,
  writeBackupLog,
} from './backup-logger.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = 'Asia/Dubai';

type BackupTrigger = 'cron' | 'manual';

type BackupRuntime = {
  log: {
    info(message: string): unknown;
    warn(message: string): unknown;
    error(message: string): unknown;
  };
};

export type DatabaseBackupResult =
  | {
      status: 'success';
      s3Uri: string;
      filename: string;
      sizeBytes: number;
      expiredBackupsDeleted: number;
      durationSeconds: number;
    }
  | {
      status: 'skipped';
      reason: string;
    }
  | {
      status: 'failed';
      reason: string;
      retainedZipPath?: string;
    };

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function resolveProjectPath(value: string): string {
  return path.isAbsolute(value)
    ? value
    : path.resolve(process.cwd(), value);
}

function parseExtraArgs(): string[] {
  const raw = process.env.BACKUP_DB_DUMP_EXTRA_ARGS?.trim();

  if (!raw) {
    return [];
  }

  const parsed: unknown = JSON.parse(raw);

  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === 'string')
  ) {
    throw new Error(
      'BACKUP_DB_DUMP_EXTRA_ARGS must be a JSON array of strings.'
    );
  }

  return parsed;
}

function safeNamePart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

/** Example: 16-jun-2026-9-am */
export function backupFilenameTimestamp(
  date: Date,
  timeZone: string
): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    hour12: true,
  }).formatToParts(date);

  return [
    getDatePart(parts, 'day'),
    getDatePart(parts, 'month').toLowerCase(),
    getDatePart(parts, 'year'),
    getDatePart(parts, 'hour'),
    getDatePart(parts, 'dayPeriod').toLowerCase(),
  ].join('-');
}

function backupDateFolders(
  date: Date,
  timeZone: string
): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);

  return {
    year: getDatePart(parts, 'year'),
    month: getDatePart(parts, 'month'),
  };
}

function buildS3Key(
  prefix: string,
  date: Date,
  timeZone: string,
  filename: string
): string {
  const { year, month } = backupDateFolders(date, timeZone);
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');

  return [cleanPrefix, year, month, filename]
    .filter(Boolean)
    .join('/');
}

function createS3Client(): S3Client {
  const region =
    process.env.BACKUP_AWS_REGION ??
    process.env.AWS_REGION ??
    'us-east-1';

  const accessKeyId =
    process.env.BACKUP_AWS_ACCESS_KEY_ID ??
    process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.BACKUP_AWS_SECRET_ACCESS_KEY ??
    process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken =
    process.env.BACKUP_AWS_SESSION_TOKEN ??
    process.env.AWS_SESSION_TOKEN;

  const config: S3ClientConfig = { region };

  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }

  return new S3Client(config);
}

async function runDumpCommand(
  command: string,
  args: string[],
  outputPath: string,
  extraEnvironment: NodeJS.ProcessEnv
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath, { flags: 'w' });
    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...extraEnvironment,
      },
      windowsHide: true,
      shell: false,
    });

    let stderr = '';
    let childFinished = false;
    let streamFinished = false;
    let exitCode: number | null = null;
    let settled = false;

    const finish = () => {
      if (settled || !childFinished || !streamFinished) {
        return;
      }

      settled = true;

      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Database dump command failed with exit code ${exitCode}. ` +
            stderr.trim()
        )
      );
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      output.destroy();
      reject(error);
    };

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        fail(
          new Error(
            `Database dump executable not found: ${command}. ` +
              'Install it or set BACKUP_DB_DUMP_BIN to its full path.'
          )
        );
        return;
      }

      fail(error);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();

      if (stderr.length > 20_000) {
        stderr = stderr.slice(-20_000);
      }
    });

    child.on('close', (code) => {
      childFinished = true;
      exitCode = code;
      finish();
    });

    output.on('error', fail);
    output.on('finish', () => {
      streamFinished = true;
      finish();
    });

    child.stdout.pipe(output);
  });
}

async function createDatabaseDump(outputPath: string): Promise<void> {
  const client = (process.env.DATABASE_CLIENT ?? 'mysql').toLowerCase();
  const host = process.env.DATABASE_HOST ?? '127.0.0.1';
  const port = process.env.DATABASE_PORT;
  const database = required('DATABASE_NAME');
  const username = required('DATABASE_USERNAME');
  const password = process.env.DATABASE_PASSWORD ?? '';
  const extraArgs = parseExtraArgs();

  if (['mysql', 'mysql2', 'mariadb'].includes(client)) {
    const executable = process.env.BACKUP_DB_DUMP_BIN ?? 'mysqldump';
    const args = [
      `--host=${host}`,
      `--user=${username}`,
      ...(port ? [`--port=${port}`] : []),
      '--single-transaction',
      '--quick',
      '--triggers',
      '--hex-blob',
      '--default-character-set=utf8mb4',
      ...extraArgs,
      database,
    ];

    await runDumpCommand(executable, args, outputPath, {
      MYSQL_PWD: password,
    });
    return;
  }

  if (['postgres', 'postgresql'].includes(client)) {
    const executable = process.env.BACKUP_DB_DUMP_BIN ?? 'pg_dump';
    const args = [
      `--host=${host}`,
      `--username=${username}`,
      ...(port ? [`--port=${port}`] : []),
      '--format=p',
      '--no-owner',
      '--no-privileges',
      ...extraArgs,
      database,
    ];

    await runDumpCommand(executable, args, outputPath, {
      PGPASSWORD: password,
    });
    return;
  }

  throw new Error(
    `Unsupported DATABASE_CLIENT "${client}". ` +
      'This job supports MySQL/MariaDB and PostgreSQL.'
  );
}

async function createZip(
  sqlPath: string,
  zipPath: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath, { flags: 'w' });
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('warning', (error: any) => {
      if (error?.code !== 'ENOENT') {
        reject(error);
      }
    });
    archive.on('error', reject);

    archive.pipe(output);
    archive.file(sqlPath, { name: path.basename(sqlPath) });
    void archive.finalize();
  });
}

async function uploadBackup(
  client: S3Client,
  zipPath: string,
  bucket: string,
  key: string
): Promise<void> {
  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: createReadStream(zipPath),
      ContentType: 'application/zip',
      ServerSideEncryption: 'AES256',
      Metadata: {
        source: 'strapi-database-backup',
        createdAt: new Date().toISOString(),
      },
    },
    queueSize: positiveInteger(
      'BACKUP_S3_UPLOAD_CONCURRENCY',
      2
    ),
    partSize:
      positiveInteger('BACKUP_S3_PART_SIZE_MB', 30) *
      1024 *
      1024,
    leavePartsOnError: false,
  });

  await upload.done();
}

async function deleteExpiredBackups(
  client: S3Client,
  bucket: string,
  prefix: string,
  keepDays: number
): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * DAY_MS);
  let continuationToken: string | undefined;
  const expiredKeys: string[] = [];

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of page.Contents ?? []) {
      if (
        object.Key &&
        object.LastModified &&
        object.LastModified.getTime() < cutoff.getTime()
      ) {
        expiredKeys.push(object.Key);
      }
    }

    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken);

  for (let index = 0; index < expiredKeys.length; index += 1000) {
    const chunk = expiredKeys.slice(index, index + 1000);

    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Quiet: true,
          Objects: chunk.map((Key) => ({ Key })),
        },
      })
    );
  }

  return expiredKeys.length;
}

async function acquireLock(
  lockPath: string
): Promise<(() => Promise<void>) | null> {
  const staleMinutes = positiveInteger(
    'BACKUP_LOCK_STALE_MINUTES',
    180
  );

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
    const isStale =
      stat &&
      Date.now() - stat.mtimeMs > staleMinutes * 60 * 1000;

    if (!isStale) {
      return null;
    }

    await fs.unlink(lockPath).catch(() => undefined);
    return acquireLock(lockPath);
  }

  return async () => {
    await fs.unlink(lockPath).catch(() => undefined);
  };
}

export async function runDatabaseBackup(
  runtime: BackupRuntime,
  options: { trigger?: BackupTrigger } = {}
): Promise<DatabaseBackupResult> {
  const startedAt = Date.now();
  const trigger = options.trigger ?? 'manual';
  const databaseName = required('DATABASE_NAME');
  const bucket = required('BACKUP_AWS_BUCKET');
  const prefix = (process.env.BACKUP_S3_PREFIX ?? 'database-backups')
    .replace(/^\/+|\/+$/g, '');
  const keepDays = positiveInteger('BACKUP_KEEP_DAYS', 10);
  const timeZone =
    process.env.DATABASE_BACKUP_TIMEZONE ?? DEFAULT_TIMEZONE;
  const tempDirectory = resolveProjectPath(
    process.env.BACKUP_TEMP_DIR ?? './backup-temp'
  );

  await fs.mkdir(tempDirectory, { recursive: true });

  const releaseLock = await acquireLock(
    path.join(tempDirectory, '.database-backup.lock')
  );

  if (!releaseLock) {
    const reason =
      'Skipped because another database backup is still running.';

    runtime.log.warn(`[database-backup] ${reason}`);
    await writeBackupLog('WARN', `${reason} trigger=${trigger}.`);

    return { status: 'skipped', reason };
  }

  const now = new Date();
  const filenameTimestamp = backupFilenameTimestamp(now, timeZone);
  const zipFilename = `${filenameTimestamp}.zip`;
  const sqlFilename =
    `database-${safeNamePart(databaseName)}-` +
    `${filenameTimestamp}.sql`;
  const sqlPath = path.join(tempDirectory, sqlFilename);
  const zipPath = path.join(tempDirectory, zipFilename);
  const s3Key = buildS3Key(
    prefix,
    now,
    timeZone,
    zipFilename
  );

  let zipCreated = false;
  let uploadedSuccessfully = false;

  try {
    runtime.log.info(
      `[database-backup] Starting ${trigger} database backup...`
    );
    await writeBackupLog(
      'INFO',
      `Backup started. trigger=${trigger}; database=${databaseName}.`
    );

    runtime.log.info('[database-backup] Creating database dump...');
    await createDatabaseDump(sqlPath);

    runtime.log.info('[database-backup] Compressing SQL dump...');
    await createZip(sqlPath, zipPath);
    zipCreated = true;

    // The raw SQL is no longer needed after the ZIP has been created.
    await fs.unlink(sqlPath).catch(() => undefined);

    const zipStat = await fs.stat(zipPath);
    const s3Client = createS3Client();

    runtime.log.info(
      `[database-backup] Uploading ${zipFilename} to S3...`
    );

    await uploadBackup(s3Client, zipPath, bucket, s3Key);
    uploadedSuccessfully = true;

    let expiredBackupsDeleted = 0;

    try {
      expiredBackupsDeleted = await deleteExpiredBackups(
        s3Client,
        bucket,
        prefix,
        keepDays
      );
    } catch (cleanupError: any) {
      const cleanupMessage =
        cleanupError?.message ?? String(cleanupError);

      runtime.log.warn(
        `[database-backup] Backup uploaded, but retention cleanup failed: ` +
          cleanupMessage
      );
      await writeBackupLog(
        'WARN',
        `Backup uploaded, but retention cleanup failed: ${cleanupMessage}`
      );
    }

    const durationSeconds = Number(
      ((Date.now() - startedAt) / 1000).toFixed(1)
    );
    const s3Uri = `s3://${bucket}/${s3Key}`;
    const message =
      `Backup completed. trigger=${trigger}; file=${zipFilename}; ` +
      `s3=${s3Uri}; size=${zipStat.size} bytes; ` +
      `duration=${durationSeconds}s; ` +
      `expired backups deleted=${expiredBackupsDeleted}; ` +
      `local temporary files removed=yes.`;

    runtime.log.info(`[database-backup] ${message}`);
    await writeBackupLog('INFO', message);

    return {
      status: 'success',
      s3Uri,
      filename: zipFilename,
      sizeBytes: zipStat.size,
      expiredBackupsDeleted,
      durationSeconds,
    };
  } catch (error: any) {
    const reason = error?.stack || error?.message || String(error);
    const retainedZipPath = zipCreated
      ? zipPath
      : undefined;

    runtime.log.error(`[database-backup] ${reason}`);

    if (retainedZipPath) {
      runtime.log.warn(
        `[database-backup] Upload did not complete. ` +
          `The ZIP was retained at: ${retainedZipPath}`
      );
    }

    await writeBackupLog(
      'ERROR',
      `${reason}` +
        (retainedZipPath
          ? ` ZIP retained at ${retainedZipPath}.`
          : '')
    );

    return {
      status: 'failed',
      reason,
      ...(retainedZipPath ? { retainedZipPath } : {}),
    };
  } finally {
    // Always remove the raw SQL/partial SQL file.
    await fs.unlink(sqlPath).catch(() => undefined);

    // Remove ZIP after successful S3 upload. If ZIP creation failed,
    // remove any partial ZIP. Keep a valid ZIP when upload failed.
    if (uploadedSuccessfully || !zipCreated) {
      await fs.unlink(zipPath).catch(() => undefined);
    }

    await releaseLock();

    runtime.log.info(
      `[database-backup] Log file: ${getBackupLogPath()}`
    );
  }
}
