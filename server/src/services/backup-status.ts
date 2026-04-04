/**
 * In-memory backup status tracker.
 *
 * Tracks the last backup result (success/failure), consecutive failure count,
 * and timestamps so the platform can emit structured signals on failure.
 *
 * `issueCreatedForCurrentStreak` prevents duplicate auto-issue creation
 * within the same failure streak.  It resets when a backup succeeds or
 * when the process restarts (in-memory state).
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

interface InternalState extends BackupStatus {
  issueCreatedForCurrentStreak: boolean;
}

let status: InternalState = {
  lastResult: null,
  lastTimestamp: null,
  consecutiveFailures: 0,
  lastErrorType: null,
  lastErrorMessage: null,
  issueCreatedForCurrentStreak: false,
};

function toPublic(s: InternalState): BackupStatus {
  return {
    lastResult: s.lastResult,
    lastTimestamp: s.lastTimestamp,
    consecutiveFailures: s.consecutiveFailures,
    lastErrorType: s.lastErrorType,
    lastErrorMessage: s.lastErrorMessage,
  };
}

export function recordBackupSuccess(): BackupStatus {
  status = {
    lastResult: "success",
    lastTimestamp: new Date().toISOString(),
    consecutiveFailures: 0,
    lastErrorType: null,
    lastErrorMessage: null,
    issueCreatedForCurrentStreak: false,
  };
  return toPublic(status);
}

export function recordBackupFailure(err: unknown): BackupStatus {
  status = {
    ...status,
    lastResult: "failure",
    lastTimestamp: new Date().toISOString(),
    consecutiveFailures: status.consecutiveFailures + 1,
    lastErrorType: err instanceof Error ? err.constructor.name : "UnknownError",
    lastErrorMessage: err instanceof Error ? err.message : String(err),
  };
  return toPublic(status);
}

export function getBackupStatus(): BackupStatus {
  return toPublic(status);
}

export function shouldCreateFailureIssue(threshold: number): boolean {
  return status.consecutiveFailures >= threshold && !status.issueCreatedForCurrentStreak;
}

export function markFailureIssueCreated(): void {
  status = { ...status, issueCreatedForCurrentStreak: true };
}

export function resetBackupStatus(): void {
  status = {
    lastResult: null,
    lastTimestamp: null,
    consecutiveFailures: 0,
    lastErrorType: null,
    lastErrorMessage: null,
    issueCreatedForCurrentStreak: false,
  };
}
