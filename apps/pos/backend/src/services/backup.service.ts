import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { query } from '../config/database';
import { createError } from '../middleware/error';
import { Settings } from '../types';

// Full-database `pg_dump`/`pg_restore` of the `public` schema — this
// install's one and only business. Verified end-to-end before this was
// wired into the app: dump, mutate data, restore, confirm the mutation is
// gone and the pre-dump state is back.
const SCHEMA = 'public';
const BACKUP_FILE_PREFIX = 'backup-';
const BACKUP_FILE_EXT = '.dump';
const SCHEDULED_BACKUPS_TO_KEEP = 7;

function getPgBinary(name: 'pg_dump' | 'pg_restore'): string {
  const envOverride = name === 'pg_dump' ? process.env.PG_DUMP_PATH : process.env.PG_RESTORE_PATH;
  return envOverride || name;
}

// Every pg_dump/pg_restore call in this file goes through this — same single
// code path whether production supplies DATABASE_URL or local dev supplies
// discrete DB_HOST/PORT/USER/PASSWORD/NAME vars.
function getConnectionUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME || 'retail_pos';
  const user = process.env.DB_USER || 'postgres';
  const password = encodeURIComponent(process.env.DB_PASSWORD || '');
  return `postgresql://${user}:${password}@${host}:${port}/${name}`;
}

function runChildProcess(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      reject(createError(`Could not run ${bin}: ${err.message}. Is it installed and on PATH?`, 500));
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(createError(`${bin} exited with code ${code}: ${stderr.slice(-2000)}`, 500));
    });
  });
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function dumpSchemaToFile(outFile: string): Promise<void> {
  await runChildProcess(getPgBinary('pg_dump'), [
    '-d', getConnectionUrl(),
    '--schema', SCHEMA,
    '--no-owner',
    '--no-privileges',
    '-Fc',
    '-f', outFile,
  ]);
}

async function restoreSchemaFromFile(inFile: string): Promise<void> {
  await runChildProcess(getPgBinary('pg_restore'), [
    '-d', getConnectionUrl(),
    '--schema', SCHEMA,
    '--clean',
    '--if-exists',
    '--single-transaction',
    '--no-owner',
    '--no-privileges',
    inFile,
  ]);
}

// ─── On-demand export/import (from the frontend's "Backup Now" / "Restore"
// buttons) ────────────────────────────────────────────────────────────────

export const exportOnDemandBackup = async (): Promise<{ filePath: string; downloadName: string }> => {
  const filePath = path.join(os.tmpdir(), `${BACKUP_FILE_PREFIX}${formatTimestamp(new Date())}${BACKUP_FILE_EXT}`);
  await dumpSchemaToFile(filePath);
  return { filePath, downloadName: `BloomSwiftPOS-Backup-${formatTimestamp(new Date())}.dump` };
};

export const restoreFromUpload = async (uploadedFilePath: string): Promise<void> => {
  if (!fs.existsSync(uploadedFilePath)) throw createError('Uploaded backup file not found', 400);
  await restoreSchemaFromFile(uploadedFilePath);
};

// ─── Automatic schedule (stored on this install's own `settings` row) ──────

export interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  dayOfWeek: number;
  dayOfMonth: number;
  lastRunAt: string | null;
}

const toSchedule = (s: Settings): BackupSchedule => ({
  enabled: s.backup_schedule_enabled,
  frequency: s.backup_schedule_frequency,
  time: s.backup_schedule_time,
  dayOfWeek: s.backup_schedule_day_of_week,
  dayOfMonth: s.backup_schedule_day_of_month,
  lastRunAt: s.backup_last_run_at ? new Date(s.backup_last_run_at).toISOString() : null,
});

export const getBackupSchedule = async (): Promise<BackupSchedule> => {
  const result = await query('SELECT * FROM settings WHERE id = 1', []);
  if (result.rows.length === 0) throw createError('Settings not found', 404);
  return toSchedule(result.rows[0]);
};

export const updateBackupSchedule = async (data: Partial<{
  enabled: boolean; frequency: string; time: string; dayOfWeek: number; dayOfMonth: number;
}>): Promise<BackupSchedule> => {
  const existing = await query('SELECT * FROM settings WHERE id = 1', []);
  if (existing.rows.length === 0) throw createError('Settings not found', 404);
  const current: Settings = existing.rows[0];

  const frequency = ['daily', 'weekly', 'monthly'].includes(data.frequency || '')
    ? (data.frequency as 'daily' | 'weekly' | 'monthly')
    : current.backup_schedule_frequency;
  const dayOfMonth = Number.isInteger(data.dayOfMonth) ? Math.min(28, Math.max(1, data.dayOfMonth as number)) : current.backup_schedule_day_of_month;
  const dayOfWeek = Number.isInteger(data.dayOfWeek) ? Math.min(6, Math.max(0, data.dayOfWeek as number)) : current.backup_schedule_day_of_week;

  const result = await query(
    `UPDATE settings SET
       backup_schedule_enabled = $1, backup_schedule_frequency = $2, backup_schedule_time = $3,
       backup_schedule_day_of_week = $4, backup_schedule_day_of_month = $5, updated_at = NOW()
     WHERE id = 1 RETURNING *`,
    [
      data.enabled ?? current.backup_schedule_enabled,
      frequency,
      typeof data.time === 'string' ? data.time : current.backup_schedule_time,
      dayOfWeek,
      dayOfMonth,
    ]
  );
  return toSchedule(result.rows[0]);
};

// ─── Scheduled backup storage (server-side disk, since backups must keep
// existing even if no browser tab is open when the schedule fires) ──────────

function getBackupStorageRoot(): string {
  return process.env.BACKUP_STORAGE_DIR || path.join(os.homedir(), 'retail-pos-backups');
}

export interface ScheduledBackupEntry {
  filename: string;
  createdAt: string;
  sizeBytes: number;
}

export const listScheduledBackups = async (): Promise<ScheduledBackupEntry[]> => {
  const dir = getBackupStorageRoot();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(BACKUP_FILE_PREFIX) && f.endsWith(BACKUP_FILE_EXT));
  const entries = files.map((filename) => {
    const stat = fs.statSync(path.join(dir, filename));
    return { filename, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size };
  });
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return entries;
};

// Rejects anything that isn't a plain filename already produced by this
// service — no path separators, no `..`.
export const getScheduledBackupPath = async (filenameRaw: string): Promise<string> => {
  const filename = path.basename(filenameRaw);
  if (!/^backup-[\w.-]+\.dump$/.test(filename)) {
    throw createError('Invalid backup filename', 400);
  }
  const fullPath = path.join(getBackupStorageRoot(), filename);
  if (!fs.existsSync(fullPath)) throw createError('Backup file not found', 404);
  return fullPath;
};

function pruneOldBackups(dir: string, keep: number): void {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith(BACKUP_FILE_PREFIX) && f.endsWith(BACKUP_FILE_EXT))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { f } of files.slice(keep)) {
    fs.unlinkSync(path.join(dir, f));
  }
}

async function runScheduledBackup(): Promise<void> {
  const dir = getBackupStorageRoot();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${BACKUP_FILE_PREFIX}${formatTimestamp(new Date())}${BACKUP_FILE_EXT}`);
  await dumpSchemaToFile(filePath);
  pruneOldBackups(dir, SCHEDULED_BACKUPS_TO_KEEP);
}

// Same "not due yet" vs. "overdue, catch up" distinction as the offline
// Electron app's scheduler (main.js) — a schedule set for e.g. 11pm on a
// server that's always on doesn't strictly need the catch-up branch the way
// a POS that's only open during business hours does, but keeping the exact
// same, already-tested logic here avoids two subtly different
// implementations of the same date math.
function isBackupDue(schedule: BackupSchedule, now: Date): boolean {
  if (!schedule.enabled) return false;

  const [h, m] = schedule.time.split(':').map(Number);
  const todayAtTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0, 0, 0);

  if (!schedule.lastRunAt) {
    if (now < todayAtTime) return false;
    if (schedule.frequency === 'weekly' && now.getDay() !== schedule.dayOfWeek) return false;
    if (schedule.frequency === 'monthly' && now.getDate() !== schedule.dayOfMonth) return false;
    return true;
  }

  const last = new Date(schedule.lastRunAt);
  const lastMidnight = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceLastRun = Math.round((todayMidnight.getTime() - lastMidnight.getTime()) / 86400000);

  const minGapDays = schedule.frequency === 'daily' ? 1 : schedule.frequency === 'weekly' ? 7 : 28;
  if (daysSinceLastRun < minGapDays) return false;
  if (daysSinceLastRun > minGapDays) return true;

  if (now < todayAtTime) return false;
  if (schedule.frequency === 'weekly' && now.getDay() !== schedule.dayOfWeek) return false;
  if (schedule.frequency === 'monthly' && now.getDate() !== schedule.dayOfMonth) return false;
  return true;
}

// Runs from a plain server-side timer (see app.ts) — checks this install's
// own schedule and, if due, runs its backup.
export const checkAndRunDueBackups = async (): Promise<void> => {
  try {
    const schedule = await getBackupSchedule();
    if (!isBackupDue(schedule, new Date())) return;
    await runScheduledBackup();
    await query('UPDATE settings SET backup_last_run_at = NOW() WHERE id = 1', []);
  } catch (err) {
    console.warn('[backup] Scheduled backup failed:', (err as Error).message);
  }
};
