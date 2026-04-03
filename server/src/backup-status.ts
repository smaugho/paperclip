/**
 * In-memory backup status tracker.
 *
 * The scheduled-backup loop in index.ts calls `recordBackupSuccess` /
 * `recordBackupFailure` after every attempt.  The health endpoint reads
 * the current snapshot via `getBackupStatus()`.
 */

export type BackupHealthStatus = {
  lastStatus: "success" | "failure" | null;
  lastTimestamp: string | null;
  consecutiveFailures: number;
};

let state: BackupHealthStatus = {
  lastStatus: null,
  lastTimestamp: null,
  consecutiveFailures: 0,
};

export function recordBackupSuccess(): void {
  state = {
    lastStatus: "success",
    lastTimestamp: new Date().toISOString(),
    consecutiveFailures: 0,
  };
}

export function recordBackupFailure(): void {
  state = {
    lastStatus: "failure",
    lastTimestamp: new Date().toISOString(),
    consecutiveFailures: state.consecutiveFailures + 1,
  };
}

export function getBackupStatus(): BackupHealthStatus {
  return { ...state };
}
