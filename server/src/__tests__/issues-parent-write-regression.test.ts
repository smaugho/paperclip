/**
 * Regression coverage for older-issue parent comment/update writes.
 *
 * Exercises both write paths on issues with mixed shapes:
 *   - POST /api/issues/{id}/comments  (via issueService.addComment)
 *   - PATCH /api/issues/{id}          (via issueService.update with status change)
 *
 * Covers plain issues, plan-document issues, and project-linked issues.
 *
 * Ref: DSPA-651
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agents,
  companies,
  createDb,
  documents,
  goals,
  issueComments,
  issueDocuments,
  issues,
  projects,
  projectWorkspaces,
  activityLog,
  instanceSettings,
  issueInboxArchives,
  executionWorkspaces,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported
  ? describe
  : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres parent-write regression tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issueService parent write regression (DSPA-651)", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof issueService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  // Shared fixture IDs populated in beforeAll
  let companyId: string;
  let agentId: string;
  let plainIssueId: string;
  let docIssueId: string;
  let projectIssueId: string;
  let projectId: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-parent-write-regression-");
    db = createDb(tempDb.connectionString);
    svc = issueService(db);
  }, 20_000);

  afterEach(async () => {
    // Clean up in FK-safe order
    await db.delete(issueDocuments);
    await db.delete(documents);
    await db.delete(issueComments);
    await db.delete(issueInboxArchives);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(executionWorkspaces);
    await db.delete(projectWorkspaces);
    await db.delete(projects);
    await db.delete(goals);
    await db.delete(agents);
    await db.delete(instanceSettings);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  /** Seed three issue shapes: plain, plan-document, and project-linked. */
  async function seedFixtures() {
    companyId = randomUUID();
    agentId = randomUUID();
    projectId = randomUUID();
    plainIssueId = randomUUID();
    docIssueId = randomUUID();
    projectIssueId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "RegressionCo",
      issuePrefix: `R${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "TestAgent",
      role: "engineer",
      status: "active",
      adapterType: "claude_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Regression project",
      status: "in_progress",
    });

    // --- 1. Plain older issue (no project, no documents) ---
    await db.insert(issues).values({
      id: plainIssueId,
      companyId,
      title: "Plain older issue",
      status: "in_progress",
      priority: "high",
      assigneeAgentId: agentId,
      createdByAgentId: agentId,
      createdAt: new Date("2026-01-15T00:00:00.000Z"),
      updatedAt: new Date("2026-01-15T00:00:00.000Z"),
    });

    // --- 2. Issue with a plan document ---
    await db.insert(issues).values({
      id: docIssueId,
      companyId,
      title: "Plan-document issue",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentId,
      createdByAgentId: agentId,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const docId = randomUUID();
    await db.insert(documents).values({
      id: docId,
      companyId,
      title: "Plan",
      format: "markdown",
      latestBody: "# Plan\n\nStep 1: Investigate\nStep 2: Fix",
      createdByAgentId: agentId,
    });
    await db.insert(issueDocuments).values({
      companyId,
      issueId: docIssueId,
      documentId: docId,
      key: "plan",
    });

    // --- 3. Project-linked issue ---
    await db.insert(issues).values({
      id: projectIssueId,
      companyId,
      projectId,
      title: "Project-linked issue",
      status: "in_progress",
      priority: "low",
      assigneeAgentId: agentId,
      createdByAgentId: agentId,
      createdAt: new Date("2026-02-15T00:00:00.000Z"),
      updatedAt: new Date("2026-02-15T00:00:00.000Z"),
    });
  }

  // -----------------------------------------------------------------------
  // POST /api/issues/{id}/comments  (issueService.addComment)
  // -----------------------------------------------------------------------

  describe("addComment on older issue shapes", () => {
    it("succeeds on a plain older issue", async () => {
      await seedFixtures();
      const comment = await svc.addComment(plainIssueId, "Status update on plain issue", {
        agentId,
      });
      expect(comment).toBeDefined();
      expect(comment.issueId).toBe(plainIssueId);
      expect(comment.body).toBe("Status update on plain issue");
      expect(comment.authorAgentId).toBe(agentId);
    });

    it("succeeds on an issue with a plan document", async () => {
      await seedFixtures();
      const comment = await svc.addComment(docIssueId, "Updated the plan document", {
        agentId,
      });
      expect(comment).toBeDefined();
      expect(comment.issueId).toBe(docIssueId);
      expect(comment.body).toBe("Updated the plan document");
    });

    it("succeeds on a project-linked issue", async () => {
      await seedFixtures();
      const comment = await svc.addComment(projectIssueId, "Project build is green", {
        agentId,
      });
      expect(comment).toBeDefined();
      expect(comment.issueId).toBe(projectIssueId);
      expect(comment.body).toBe("Project build is green");
    });

    it("updates the issue updatedAt timestamp after comment", async () => {
      await seedFixtures();
      const before = await db
        .select({ updatedAt: issues.updatedAt })
        .from(issues)
        .where(
          eq(issues.id, plainIssueId),
        )
        .then((rows) => rows[0]!.updatedAt);

      // Small delay so timestamp differs
      await new Promise((r) => setTimeout(r, 50));

      await svc.addComment(plainIssueId, "Trigger updatedAt bump", { agentId });

      const after = await db
        .select({ updatedAt: issues.updatedAt })
        .from(issues)
        .where(
          eq(issues.id, plainIssueId),
        )
        .then((rows) => rows[0]!.updatedAt);

      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/issues/{id}  (issueService.update with status field)
  // -----------------------------------------------------------------------

  describe("update on older issue shapes", () => {
    it("succeeds status transition on a plain older issue", async () => {
      await seedFixtures();
      const updated = await svc.update(plainIssueId, { status: "blocked" });
      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(plainIssueId);
      expect(updated!.status).toBe("blocked");
    });

    it("succeeds status transition on an issue with a plan document", async () => {
      await seedFixtures();
      const updated = await svc.update(docIssueId, { status: "blocked" });
      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(docIssueId);
      expect(updated!.status).toBe("blocked");
    });

    it("succeeds status transition on a project-linked issue", async () => {
      await seedFixtures();
      const updated = await svc.update(projectIssueId, { status: "blocked" });
      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(projectIssueId);
      expect(updated!.status).toBe("blocked");
    });

    it("succeeds combined update + addComment flow on a plain older issue", async () => {
      await seedFixtures();
      const updated = await svc.update(plainIssueId, { status: "blocked" });
      expect(updated).not.toBeNull();

      const comment = await svc.addComment(plainIssueId, "Blocked on dependency", {
        agentId,
      });
      expect(comment).toBeDefined();
      expect(comment.issueId).toBe(plainIssueId);
    });

    it("succeeds combined update + addComment flow on a plan-document issue", async () => {
      await seedFixtures();
      const updated = await svc.update(docIssueId, { priority: "high" });
      expect(updated).not.toBeNull();

      const comment = await svc.addComment(docIssueId, "Escalated priority", {
        agentId,
      });
      expect(comment).toBeDefined();
      expect(comment.issueId).toBe(docIssueId);
    });

    it("succeeds combined update + addComment flow on a project-linked issue", async () => {
      await seedFixtures();
      const updated = await svc.update(projectIssueId, { status: "done" });
      expect(updated).not.toBeNull();

      const comment = await svc.addComment(projectIssueId, "Work completed", {
        agentId,
      });
      expect(comment).toBeDefined();
      expect(comment.issueId).toBe(projectIssueId);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple sequential writes (stress the paths)
  // -----------------------------------------------------------------------

  describe("sequential writes on older issues", () => {
    it("handles multiple comments in sequence on a plain older issue", async () => {
      await seedFixtures();

      for (let i = 0; i < 5; i++) {
        const comment = await svc.addComment(plainIssueId, `Sequential comment #${i}`, {
          agentId,
        });
        expect(comment.body).toBe(`Sequential comment #${i}`);
      }

      const allComments = await svc.listComments(plainIssueId);
      expect(allComments).toHaveLength(5);
    });

    it("handles interleaved updates and comments on a project-linked issue", async () => {
      await seedFixtures();

      await svc.addComment(projectIssueId, "Starting work", { agentId });
      await svc.update(projectIssueId, { status: "blocked" });
      await svc.addComment(projectIssueId, "Blocked on review", { agentId });
      const unblocked = await svc.update(projectIssueId, { status: "in_progress" });
      expect(unblocked!.status).toBe("in_progress");
      await svc.addComment(projectIssueId, "Unblocked, continuing", { agentId });

      const allComments = await svc.listComments(projectIssueId);
      expect(allComments).toHaveLength(3);
    });
  });
});
