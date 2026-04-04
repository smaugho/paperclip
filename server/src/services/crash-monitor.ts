/**
 * In-memory crash-monitoring tracker for heartbeat runs.
 *
 * Tracks consecutive run failures per agent and decides when to wake
 * a designated monitoring agent.  Cooldown prevents wake-storms.
 *
 * The monitoring agent's own failures are excluded to avoid infinite loops.
 */

import type { CrashMonitoringSettings } from "@paperclipai/shared";

export interface AgentFailureRecord {
  consecutiveFailures: number;
  firstFailureAt: string;
  lastFailureAt: string;
  lastError: string | null;
  lastErrorCode: string | null;
  /** ISO-8601 timestamp of the last time we woke the monitoring agent for this agent. */
  lastAlertAt: string | null;
}

const agentFailures = new Map<string, AgentFailureRecord>();

export function recordRunSuccess(agentId: string): void {
  agentFailures.delete(agentId);
}

export function recordRunFailure(
  agentId: string,
  error: string | null,
  errorCode: string | null,
): AgentFailureRecord {
  const now = new Date().toISOString();
  const existing = agentFailures.get(agentId);

  const record: AgentFailureRecord = {
    consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
    firstFailureAt: existing?.firstFailureAt ?? now,
    lastFailureAt: now,
    lastError: error,
    lastErrorCode: errorCode,
    lastAlertAt: existing?.lastAlertAt ?? null,
  };

  agentFailures.set(agentId, record);
  return record;
}

export interface CrashMonitorDecision {
  shouldWake: boolean;
  reason: string;
  record: AgentFailureRecord;
}

/**
 * Decides whether the monitoring agent should be woken for the given agent's failures.
 *
 * Returns `shouldWake: false` with a reason when any guard condition fails:
 * - Feature disabled
 * - No monitoring agent configured
 * - Failing agent IS the monitoring agent (infinite loop guard)
 * - Threshold not yet reached
 * - Failures outside time window
 * - Cooldown period not elapsed
 */
export function shouldWakeMonitor(
  agentId: string,
  config: CrashMonitoringSettings,
): CrashMonitorDecision {
  const record = agentFailures.get(agentId);
  const emptyRecord: AgentFailureRecord = {
    consecutiveFailures: 0,
    firstFailureAt: new Date().toISOString(),
    lastFailureAt: new Date().toISOString(),
    lastError: null,
    lastErrorCode: null,
    lastAlertAt: null,
  };

  if (!config.enabled) {
    return { shouldWake: false, reason: "crash_monitoring_disabled", record: record ?? emptyRecord };
  }

  if (!config.monitoringAgentId) {
    return { shouldWake: false, reason: "no_monitoring_agent_configured", record: record ?? emptyRecord };
  }

  // Infinite loop guard: never wake the monitor for its own failures
  if (agentId === config.monitoringAgentId) {
    return { shouldWake: false, reason: "monitoring_agent_self_exclusion", record: record ?? emptyRecord };
  }

  if (!record) {
    return { shouldWake: false, reason: "no_failure_record", record: emptyRecord };
  }

  if (record.consecutiveFailures < config.failureThreshold) {
    return { shouldWake: false, reason: "below_threshold", record };
  }

  // Check time window: first failure must be within the configured window
  const now = Date.now();
  const firstFailureMs = new Date(record.firstFailureAt).getTime();
  if (now - firstFailureMs > config.timeWindowMs) {
    // Failures are too spread out — reset and don't alert
    return { shouldWake: false, reason: "outside_time_window", record };
  }

  // Check cooldown: don't re-wake if we recently alerted for this agent
  if (record.lastAlertAt) {
    const lastAlertMs = new Date(record.lastAlertAt).getTime();
    if (now - lastAlertMs < config.cooldownMs) {
      return { shouldWake: false, reason: "cooldown_active", record };
    }
  }

  return { shouldWake: true, reason: "threshold_reached", record };
}

/**
 * Marks that the monitoring agent was woken for this agent's failures.
 * Resets consecutive count but preserves lastAlertAt for cooldown tracking.
 */
export function markMonitorWoken(agentId: string): void {
  const record = agentFailures.get(agentId);
  if (record) {
    agentFailures.set(agentId, {
      ...record,
      lastAlertAt: new Date().toISOString(),
      // Reset consecutive count so the next alert requires a fresh streak
      consecutiveFailures: 0,
      firstFailureAt: new Date().toISOString(),
    });
  }
}

export function getAgentFailureRecord(agentId: string): AgentFailureRecord | undefined {
  return agentFailures.get(agentId);
}

/** Reset all state. Intended for testing. */
export function resetAllCrashMonitorState(): void {
  agentFailures.clear();
}
