import { describe, expect, it } from "vitest";
import { buildWakeContextNotice, joinPromptSections } from "./server-utils.js";

describe("buildWakeContextNotice", () => {
  it("returns empty string when context has no wakeCommentId", () => {
    expect(buildWakeContextNotice({})).toBe("");
    expect(buildWakeContextNotice({ wakeReason: "issue_comment_mentioned" })).toBe("");
  });

  it("returns empty string when wakeCommentId is not a string", () => {
    expect(buildWakeContextNotice({ wakeCommentId: 123 })).toBe("");
    expect(buildWakeContextNotice({ wakeCommentId: null })).toBe("");
    expect(buildWakeContextNotice({ wakeCommentId: undefined })).toBe("");
    expect(buildWakeContextNotice({ wakeCommentId: true })).toBe("");
  });

  it("returns empty string when wakeCommentId is whitespace-only", () => {
    expect(buildWakeContextNotice({ wakeCommentId: "   " })).toBe("");
    expect(buildWakeContextNotice({ wakeCommentId: "" })).toBe("");
  });

  it("includes wake comment ID when no taskId or issueId is present", () => {
    const result = buildWakeContextNotice({ wakeCommentId: "comment-abc" });
    expect(result).toContain("Wake comment ID: comment-abc");
    expect(result).toContain("IMPORTANT: This heartbeat was triggered by a comment mention.");
    expect(result).toContain("You MUST fetch and respond to this comment BEFORE doing any other work");
  });

  it("includes API endpoint when taskId is present", () => {
    const result = buildWakeContextNotice({
      wakeCommentId: "comment-abc",
      taskId: "issue-123",
    });
    expect(result).toContain("GET /api/issues/issue-123/comments/comment-abc");
    expect(result).not.toContain("Wake comment ID:");
  });

  it("falls back to issueId when taskId is absent", () => {
    const result = buildWakeContextNotice({
      wakeCommentId: "comment-abc",
      issueId: "issue-456",
    });
    expect(result).toContain("GET /api/issues/issue-456/comments/comment-abc");
  });

  it("prefers taskId over issueId", () => {
    const result = buildWakeContextNotice({
      wakeCommentId: "comment-abc",
      taskId: "task-1",
      issueId: "issue-2",
    });
    expect(result).toContain("GET /api/issues/task-1/comments/comment-abc");
    expect(result).not.toContain("issue-2");
  });

  it("includes wakeReason in parentheses when provided", () => {
    const result = buildWakeContextNotice({
      wakeCommentId: "comment-abc",
      wakeReason: "issue_comment_mentioned",
    });
    expect(result).toContain("(issue_comment_mentioned)");
  });

  it("omits reason parenthetical when wakeReason is empty or non-string", () => {
    const noReason = buildWakeContextNotice({ wakeCommentId: "c1" });
    expect(noReason).toContain("by a comment mention.");
    expect(noReason).not.toContain("(");

    const emptyReason = buildWakeContextNotice({ wakeCommentId: "c1", wakeReason: "" });
    expect(emptyReason).not.toContain("(");

    const numericReason = buildWakeContextNotice({ wakeCommentId: "c1", wakeReason: 42 });
    expect(numericReason).not.toContain("(");
  });

  it("trims whitespace from taskId and issueId", () => {
    const result = buildWakeContextNotice({
      wakeCommentId: "comment-abc",
      taskId: "  ",
      issueId: "  issue-456  ",
    });
    // taskId is whitespace-only so falls through to issueId
    expect(result).toContain("GET /api/issues/issue-456/comments/comment-abc");
  });

  it("produces notice that joinPromptSections includes (non-empty integration)", () => {
    const notice = buildWakeContextNotice({
      wakeCommentId: "c1",
      taskId: "t1",
      wakeReason: "issue_comment_mentioned",
    });
    const prompt = joinPromptSections(["Bootstrap prompt", notice, "Main prompt"]);
    expect(prompt).toContain("IMPORTANT: This heartbeat was triggered by a comment mention");
    expect(prompt).toContain("Bootstrap prompt");
    expect(prompt).toContain("Main prompt");
  });

  it("produces empty string that joinPromptSections filters out", () => {
    const notice = buildWakeContextNotice({});
    expect(notice).toBe("");
    const prompt = joinPromptSections(["Bootstrap prompt", notice, "Main prompt"]);
    expect(prompt).toBe("Bootstrap prompt\n\nMain prompt");
  });
});

describe("joinPromptSections", () => {
  it("joins non-empty sections with default separator", () => {
    expect(joinPromptSections(["a", "b", "c"])).toBe("a\n\nb\n\nc");
  });

  it("filters out empty, null, and undefined sections", () => {
    expect(joinPromptSections(["a", "", null, undefined, "b"])).toBe("a\n\nb");
  });

  it("trims whitespace from sections", () => {
    expect(joinPromptSections(["  a  ", "  b  "])).toBe("a\n\nb");
  });

  it("uses custom separator", () => {
    expect(joinPromptSections(["a", "b"], "\n---\n")).toBe("a\n---\nb");
  });

  it("returns empty string when all sections are empty", () => {
    expect(joinPromptSections(["", null, undefined, "   "])).toBe("");
  });
});
