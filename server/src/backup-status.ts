/**
 * In-memory backup status tracker.
 *
 * The scheduled-backup loop in index.ts calls `recordBackupSuccess` /
 * `recordBackupFailure` after every attempt.  The health endpoint reads
 * the current snapshot via `getBackupStatus()`.
 *
 * `issueCreatedForCurrentStreak` prevents duplicate auto-issue creation
 * within the same failure streak.  It resets when a backup succeeds or
 * when the process restarts (in-memory state).
 */

export interface BackupHealthStatus {
  lastStatus: "success" | "failure" | null;
  lastTimestamp: string | null;
  consecutiveFailures: number;
}

interface InternalState extends BackupHealthStatus {
  issueCreatedForCurrentStreak: boolean;
}

let state: InternalState = {
  lastStatus: null,
  lastTimestamp: null,
  consecutiveFailures: 0,
  issueCreatedForCurrentStreak: false,
};

export function recordBackupSuccess(): void {
  state = {
    lastStatus: "success",
    lastTimestamp: new Date().toISOString(),
    consecutiveFailures: 0,
    issueCreatedForCurrentStreak: false,
  };
}

export function recordBackupFailure(): BackupHealthStatus {
  state = {
    ...state,
    lastStatus: "failure",
    lastTimestamp: new Date().toISOString(),
    consecutiveFailures: state.consecutiveFailures + 1,
  };
  return { lastStatus: state.lastStatus, lastTimestamp: state.lastTimestamp, consecutiveFailures: state.consecutiveFailures };
}

export function getBackupStatus(): BackupHealthStatus {
  return { lastStatus: state.lastStatus, lastTimestamp: state.lastTimestamp, consecutiveFailures: state.consecutiveFailures };
}

export function shouldCreateFailureIssue(threshold: number): boolean {
  return state.consecutiveFailures >= threshold && !state.issueCreatedForCurrentStreak;
}

export function markFailureIssueCreated(): void {
  state = { ...state, issueCreatedForCurrentStreak: true };
}
