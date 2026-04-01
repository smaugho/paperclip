import { describe, expect, it } from "vitest";
import { buildWakeContextBlock } from "@paperclipai/adapter-utils/server-utils";

describe("buildWakeContextBlock", () => {
  it("returns a formatted block when all fields are present", () => {
    const result = buildWakeContextBlock({
      taskId: "task-123",
      wakeReason: "issue_assigned",
      wakeCommentId: "comment-abc",
    });
    expect(result).toBe(
      "[Paperclip wake context]\ntask_id: task-123\nwake_reason: issue_assigned\nwake_comment_id: comment-abc",
    );
  });

  it("omits missing fields gracefully", () => {
    const result = buildWakeContextBlock({
      taskId: "task-456",
      wakeReason: "issue_comment_mentioned",
      wakeCommentId: null,
    });
    expect(result).toBe(
      "[Paperclip wake context]\ntask_id: task-456\nwake_reason: issue_comment_mentioned",
    );
  });

  it("returns empty string when no fields are present", () => {
    expect(buildWakeContextBlock({})).toBe("");
    expect(buildWakeContextBlock({ taskId: null, wakeReason: null, wakeCommentId: null })).toBe("");
  });

  it("returns a block with only taskId", () => {
    const result = buildWakeContextBlock({ taskId: "task-789" });
    expect(result).toBe("[Paperclip wake context]\ntask_id: task-789");
  });

  it("returns empty string for empty-string fields", () => {
    expect(buildWakeContextBlock({ taskId: "", wakeReason: "", wakeCommentId: "" })).toBe("");
  });
});
