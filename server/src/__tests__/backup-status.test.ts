import { afterEach, describe, expect, it } from "vitest";
import {
  getBackupStatus,
  markFailureIssueCreated,
  recordBackupFailure,
  recordBackupSuccess,
  resetBackupStatus,
  shouldCreateFailureIssue,
} from "../services/backup-status.js";

describe("backup-status tracker", () => {
  afterEach(() => {
    resetBackupStatus();
  });

  it("starts with null/zero initial state", () => {
    const s = getBackupStatus();
    expect(s.lastResult).toBeNull();
    expect(s.lastTimestamp).toBeNull();
    expect(s.consecutiveFailures).toBe(0);
    expect(s.lastErrorType).toBeNull();
    expect(s.lastErrorMessage).toBeNull();
  });

  it("records a success and resets failure counters", () => {
    recordBackupFailure(new Error("disk full"));
    const s = recordBackupSuccess();
    expect(s.lastResult).toBe("success");
    expect(s.lastTimestamp).toBeTruthy();
    expect(s.consecutiveFailures).toBe(0);
    expect(s.lastErrorType).toBeNull();
    expect(s.lastErrorMessage).toBeNull();
  });

  it("records a failure with Error instance details", () => {
    const s = recordBackupFailure(new TypeError("ENOSPC: no space left"));
    expect(s.lastResult).toBe("failure");
    expect(s.lastTimestamp).toBeTruthy();
    expect(s.consecutiveFailures).toBe(1);
    expect(s.lastErrorType).toBe("TypeError");
    expect(s.lastErrorMessage).toBe("ENOSPC: no space left");
  });

  it("records a failure with non-Error value", () => {
    const s = recordBackupFailure("something went wrong");
    expect(s.lastResult).toBe("failure");
    expect(s.consecutiveFailures).toBe(1);
    expect(s.lastErrorType).toBe("UnknownError");
    expect(s.lastErrorMessage).toBe("something went wrong");
  });

  it("increments consecutive failures on repeated failures", () => {
    recordBackupFailure(new Error("fail 1"));
    recordBackupFailure(new Error("fail 2"));
    const s = recordBackupFailure(new Error("fail 3"));
    expect(s.consecutiveFailures).toBe(3);
    expect(s.lastErrorMessage).toBe("fail 3");
  });

  it("resets consecutive failures after a success", () => {
    recordBackupFailure(new Error("fail 1"));
    recordBackupFailure(new Error("fail 2"));
    recordBackupSuccess();
    const s = recordBackupFailure(new Error("fail after recovery"));
    expect(s.consecutiveFailures).toBe(1);
  });

  it("returns a snapshot copy, not a reference to internal state", () => {
    const s1 = recordBackupFailure(new Error("test"));
    const s2 = getBackupStatus();
    expect(s1).toEqual(s2);
    s1.consecutiveFailures = 999;
    expect(getBackupStatus().consecutiveFailures).toBe(1);
  });

  describe("failure issue dedup", () => {
    it("shouldCreateFailureIssue returns false below threshold", () => {
      recordBackupFailure(new Error("fail 1"));
      recordBackupFailure(new Error("fail 2"));
      expect(shouldCreateFailureIssue(3)).toBe(false);
    });

    it("shouldCreateFailureIssue returns true at threshold", () => {
      recordBackupFailure(new Error("fail 1"));
      recordBackupFailure(new Error("fail 2"));
      recordBackupFailure(new Error("fail 3"));
      expect(shouldCreateFailureIssue(3)).toBe(true);
    });

    it("markFailureIssueCreated prevents duplicate issues", () => {
      recordBackupFailure(new Error("fail 1"));
      recordBackupFailure(new Error("fail 2"));
      recordBackupFailure(new Error("fail 3"));
      expect(shouldCreateFailureIssue(3)).toBe(true);
      markFailureIssueCreated();
      expect(shouldCreateFailureIssue(3)).toBe(false);
    });

    it("dedup flag resets on success", () => {
      recordBackupFailure(new Error("fail 1"));
      recordBackupFailure(new Error("fail 2"));
      recordBackupFailure(new Error("fail 3"));
      markFailureIssueCreated();
      recordBackupSuccess();
      recordBackupFailure(new Error("new fail 1"));
      recordBackupFailure(new Error("new fail 2"));
      recordBackupFailure(new Error("new fail 3"));
      expect(shouldCreateFailureIssue(3)).toBe(true);
    });
  });
});
