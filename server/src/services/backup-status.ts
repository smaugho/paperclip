/**
 * In-memory backup status tracker.
 *
 * Tracks the last backup result (success/failure), consecutive failure count,
 * and timestamps so the platform can emit structured signals on failure.
 */

export interface BackupStatus {
  /** Last backup outcome. `null` before any backup has run. */
  lastResult: "success" | "failure" | null;
  /** ISO-8601 timestamp of the last backup attempt. */
  lastTimestamp: string | null;
  /** Number of consecutive failures (resets to 0 on success). */
  consecutiveFailures: number;
  /** Error type from the most recent failure (e.g. constructor name). */
  lastErrorType: string | null;
  /** Error message from the most recent failure. */
  lastErrorMessage: string | null;
}

let status: BackupStatus = {
  lastResult: null,
  lastTimestamp: null,
  consecutiveFailures: 0,
  lastErrorType: null,
  lastErrorMessage: null,
};

/** Record a successful backup and reset failure counters. */
export function recordBackupSuccess(): BackupStatus {
  status = {
    lastResult: "success",
    lastTimestamp: new Date().toISOString(),
    consecutiveFailures: 0,
    lastErrorType: null,
    lastErrorMessage: null,
  };
  return { ...status };
}

/** Record a backup failure and increment the consecutive failure counter. */
export function recordBackupFailure(err: unknown): BackupStatus {
  status = {
    lastResult: "failure",
    lastTimestamp: new Date().toISOString(),
    consecutiveFailures: status.consecutiveFailures + 1,
    lastErrorType: err instanceof Error ? err.constructor.name : "UnknownError",
    lastErrorMessage: err instanceof Error ? err.message : String(err),
  };
  return { ...status };
}

/** Return a snapshot of the current backup status. */
export function getBackupStatus(): BackupStatus {
  return { ...status };
}

/** Reset to initial state (for testing). */
export function resetBackupStatus(): void {
  status = {
    lastResult: null,
    lastTimestamp: null,
    consecutiveFailures: 0,
    lastErrorType: null,
    lastErrorMessage: null,
  };
}
