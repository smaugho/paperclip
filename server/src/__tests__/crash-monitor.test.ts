import { afterEach, describe, expect, it } from "vitest";
import {
  recordRunSuccess,
  recordRunFailure,
  shouldWakeMonitor,
  markMonitorWoken,
  getAgentFailureRecord,
  resetAllCrashMonitorState,
  type AgentFailureRecord,
} from "../services/crash-monitor.js";
import type { CrashMonitoringSettings } from "@paperclipai/shared";

const AGENT_A = "aaaa-aaaa-aaaa";
const AGENT_B = "bbbb-bbbb-bbbb";
const MONITOR_AGENT = "mmmm-mmmm-mmmm";

const defaultConfig: CrashMonitoringSettings = {
  enabled: true,
  monitoringAgentId: MONITOR_AGENT,
  failureThreshold: 3,
  timeWindowMs: 3_600_000,
  cooldownMs: 300_000,
};

describe("crash-monitor tracker", () => {
  afterEach(() => {
    resetAllCrashMonitorState();
  });

  it("starts with no failure record", () => {
    expect(getAgentFailureRecord(AGENT_A)).toBeUndefined();
  });

  it("records consecutive failures", () => {
    recordRunFailure(AGENT_A, "error 1", "adapter_failed");
    recordRunFailure(AGENT_A, "error 2", "adapter_failed");
    const record = recordRunFailure(AGENT_A, "error 3", "timeout");
    expect(record.consecutiveFailures).toBe(3);
    expect(record.lastError).toBe("error 3");
    expect(record.lastErrorCode).toBe("timeout");
  });

  it("resets failure count on success", () => {
    recordRunFailure(AGENT_A, "err", "adapter_failed");
    recordRunFailure(AGENT_A, "err", "adapter_failed");
    recordRunSuccess(AGENT_A);
    expect(getAgentFailureRecord(AGENT_A)).toBeUndefined();
  });

  it("tracks agents independently", () => {
    recordRunFailure(AGENT_A, "err", "adapter_failed");
    recordRunFailure(AGENT_A, "err", "adapter_failed");
    recordRunFailure(AGENT_B, "err", "adapter_failed");

    expect(getAgentFailureRecord(AGENT_A)?.consecutiveFailures).toBe(2);
    expect(getAgentFailureRecord(AGENT_B)?.consecutiveFailures).toBe(1);
  });

  describe("shouldWakeMonitor", () => {
    it("returns false when disabled", () => {
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");

      const decision = shouldWakeMonitor(AGENT_A, { ...defaultConfig, enabled: false });
      expect(decision.shouldWake).toBe(false);
      expect(decision.reason).toBe("crash_monitoring_disabled");
    });

    it("returns false when no monitoring agent configured", () => {
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");

      const decision = shouldWakeMonitor(AGENT_A, { ...defaultConfig, monitoringAgentId: null });
      expect(decision.shouldWake).toBe(false);
      expect(decision.reason).toBe("no_monitoring_agent_configured");
    });

    it("returns false for monitoring agent self-failures (loop guard)", () => {
      recordRunFailure(MONITOR_AGENT, "err", "adapter_failed");
      recordRunFailure(MONITOR_AGENT, "err", "adapter_failed");
      recordRunFailure(MONITOR_AGENT, "err", "adapter_failed");

      const decision = shouldWakeMonitor(MONITOR_AGENT, defaultConfig);
      expect(decision.shouldWake).toBe(false);
      expect(decision.reason).toBe("monitoring_agent_self_exclusion");
    });

    it("returns false below threshold", () => {
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");

      const decision = shouldWakeMonitor(AGENT_A, defaultConfig);
      expect(decision.shouldWake).toBe(false);
      expect(decision.reason).toBe("below_threshold");
    });

    it("returns true at threshold", () => {
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");

      const decision = shouldWakeMonitor(AGENT_A, defaultConfig);
      expect(decision.shouldWake).toBe(true);
      expect(decision.reason).toBe("threshold_reached");
    });

    it("returns true above threshold", () => {
      for (let i = 0; i < 5; i++) {
        recordRunFailure(AGENT_A, `err ${i}`, "adapter_failed");
      }

      const decision = shouldWakeMonitor(AGENT_A, defaultConfig);
      expect(decision.shouldWake).toBe(true);
    });

    it("returns false during cooldown", () => {
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");

      // Simulate: woke monitor, then new failures come in
      markMonitorWoken(AGENT_A);

      // New failures after monitor was woken (counter was reset by markMonitorWoken)
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");

      const decision = shouldWakeMonitor(AGENT_A, defaultConfig);
      expect(decision.shouldWake).toBe(false);
      expect(decision.reason).toBe("cooldown_active");
    });
  });

  describe("markMonitorWoken", () => {
    it("resets consecutive failures but preserves lastAlertAt", () => {
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_A, "err", "adapter_failed");

      markMonitorWoken(AGENT_A);

      const record = getAgentFailureRecord(AGENT_A);
      expect(record).toBeDefined();
      expect(record!.consecutiveFailures).toBe(0);
      expect(record!.lastAlertAt).toBeTruthy();
    });
  });

  describe("resetAllCrashMonitorState", () => {
    it("clears all tracked agents", () => {
      recordRunFailure(AGENT_A, "err", "adapter_failed");
      recordRunFailure(AGENT_B, "err", "adapter_failed");

      resetAllCrashMonitorState();

      expect(getAgentFailureRecord(AGENT_A)).toBeUndefined();
      expect(getAgentFailureRecord(AGENT_B)).toBeUndefined();
    });
  });
});
