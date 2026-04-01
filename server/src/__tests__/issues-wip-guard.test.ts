import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  companies,
  createDb,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres WIP guard tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issueService WIP guard", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof issueService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  const companyId = randomUUID();
  const agentId = randomUUID();

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-wip-guard-");
    db = createDb(tempDb.connectionString);
    svc = issueService(db);

    await db.insert(companies).values({
      id: companyId,
      name: "TestCo",
      issuePrefix: "WIP",
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "TestAgent",
      role: "engineer",
      status: "running",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
  }, 20_000);

  afterEach(async () => {
    await db.delete(issues);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("allows checkout when agent has fewer than 2 in-progress issues", async () => {
    const issueId = randomUUID();
    const existingIssueId = randomUUID();
    const runId = randomUUID();

    await db.insert(issues).values([
      {
        id: existingIssueId,
        companyId,
        title: "Existing in-progress",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: issueId,
        companyId,
        title: "Issue to checkout",
        status: "todo",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    const result = await svc.checkout(issueId, agentId, ["todo"], runId);
    expect(result).toBeTruthy();
    expect(result!.status).toBe("in_progress");
  });

  it("rejects checkout when agent already has 2 in-progress issues", async () => {
    const issueId = randomUUID();
    const runId = randomUUID();

    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: issueId,
        companyId,
        title: "Issue to checkout",
        status: "todo",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    await expect(svc.checkout(issueId, agentId, ["todo"], runId)).rejects.toThrow(
      "Agent has reached the maximum number of in-progress issues",
    );
  });

  it("allows checkout with override when agent has 2 in-progress issues", async () => {
    const issueId = randomUUID();
    const runId = randomUUID();

    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: issueId,
        companyId,
        title: "Issue to checkout",
        status: "todo",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    const result = await svc.checkout(issueId, agentId, ["todo"], runId, {
      overrideWipLimit: true,
    });
    expect(result).toBeTruthy();
    expect(result!.status).toBe("in_progress");
  });

  it("rejects update to in_progress when agent WIP limit reached", async () => {
    const issueId = randomUUID();

    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: issueId,
        companyId,
        title: "Issue to update",
        status: "todo",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    await expect(svc.update(issueId, { status: "in_progress" })).rejects.toThrow(
      "Agent has reached the maximum number of in-progress issues",
    );
  });

  it("allows update to in_progress with override", async () => {
    const issueId = randomUUID();

    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: issueId,
        companyId,
        title: "Issue to update",
        status: "todo",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    const result = await svc.update(issueId, { status: "in_progress" }, { overrideWipLimit: true });
    expect(result).toBeTruthy();
    expect(result!.status).toBe("in_progress");
  });

  it("does not trigger guard when issue is already in_progress", async () => {
    const issueId = randomUUID();

    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: issueId,
        companyId,
        title: "Already in-progress",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    // Updating other fields on an already in_progress issue should not trigger the guard
    const result = await svc.update(issueId, { title: "Updated title" });
    expect(result).toBeTruthy();
    expect(result!.title).toBe("Updated title");
  });

  it("does not count issues from other agents", async () => {
    const otherAgentId = randomUUID();
    const issueId = randomUUID();
    const runId = randomUUID();

    await db.insert(agents).values({
      id: otherAgentId,
      companyId,
      name: "OtherAgent",
      role: "engineer",
      status: "running",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "Other agent in-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: otherAgentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "Other agent in-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: otherAgentId,
      },
      {
        id: issueId,
        companyId,
        title: "Issue to checkout",
        status: "todo",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    const result = await svc.checkout(issueId, agentId, ["todo"], runId);
    expect(result).toBeTruthy();
    expect(result!.status).toBe("in_progress");
  });

  it("allows re-checkout of own in_progress issue when agent is at or above WIP limit", async () => {
    const ownIssueId = randomUUID();
    const originalRunId = randomUUID();
    const newRunId = randomUUID();

    // Agent has 2 in-progress issues — already at the WIP limit
    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: ownIssueId,
        companyId,
        title: "In-progress 2 (re-checkout target)",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
        checkoutRunId: originalRunId,
        executionRunId: originalRunId,
      },
    ]);

    // Re-checking out an already-in_progress issue owned by this agent must succeed
    // even though the agent is at the WIP limit, because the issue already counts
    // toward the agent's WIP — this is recovery, not a new WIP transition
    const result = await svc.checkout(
      ownIssueId,
      agentId,
      ["todo", "in_progress"],
      newRunId,
    );
    expect(result).toBeTruthy();
    expect(result!.status).toBe("in_progress");
    expect(result!.id).toBe(ownIssueId);
  });

  it("rejects assignee change on in_progress issue when target agent at WIP limit", async () => {
    const otherAgentId = randomUUID();
    const issueId = randomUUID();

    await db.insert(agents).values({
      id: otherAgentId,
      companyId,
      name: "TargetAgent",
      role: "engineer",
      status: "running",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    // Target agent already has 2 in-progress issues
    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "Target in-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: otherAgentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "Target in-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: otherAgentId,
      },
      {
        id: issueId,
        companyId,
        title: "In-progress to reassign",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    // Reassigning an in_progress issue to an agent at the WIP limit must be rejected
    await expect(
      svc.update(issueId, { assigneeAgentId: otherAgentId }),
    ).rejects.toThrow("Agent has reached the maximum number of in-progress issues");
  });

  it("allows assignee change on in_progress issue with override", async () => {
    const otherAgentId = randomUUID();
    const issueId = randomUUID();

    await db.insert(agents).values({
      id: otherAgentId,
      companyId,
      name: "TargetAgentOverride",
      role: "engineer",
      status: "running",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "Target in-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: otherAgentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "Target in-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: otherAgentId,
      },
      {
        id: issueId,
        companyId,
        title: "In-progress to reassign (override)",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    // Board override allows the reassignment even at WIP limit
    const result = await svc.update(
      issueId,
      { assigneeAgentId: otherAgentId },
      { overrideWipLimit: true },
    );
    expect(result).toBeTruthy();
    expect(result!.assigneeAgentId).toBe(otherAgentId);
  });

  it("allows assignee change on in_progress issue when target agent below WIP limit", async () => {
    const otherAgentId = randomUUID();
    const issueId = randomUUID();

    await db.insert(agents).values({
      id: otherAgentId,
      companyId,
      name: "TargetAgentUnder",
      role: "engineer",
      status: "running",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    // Target agent has only 1 in-progress issue (under the limit)
    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "Target in-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: otherAgentId,
      },
      {
        id: issueId,
        companyId,
        title: "In-progress to reassign",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    const result = await svc.update(issueId, { assigneeAgentId: otherAgentId });
    expect(result).toBeTruthy();
    expect(result!.assigneeAgentId).toBe(otherAgentId);
  });

  it("allows re-checkout of own in_progress issue when agent is above WIP limit (board override history)", async () => {
    const ownIssueId = randomUUID();
    const originalRunId = randomUUID();
    const newRunId = randomUUID();

    // Agent has 3 in-progress issues — above the WIP limit (e.g. from board overrides)
    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: ownIssueId,
        companyId,
        title: "In-progress 3 (re-checkout target)",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
        checkoutRunId: originalRunId,
        executionRunId: originalRunId,
      },
    ]);

    // Even above the limit, re-checkout of own in_progress issue must not be blocked
    const result = await svc.checkout(
      ownIssueId,
      agentId,
      ["todo", "in_progress"],
      newRunId,
    );
    expect(result).toBeTruthy();
    expect(result!.status).toBe("in_progress");
    expect(result!.id).toBe(ownIssueId);
  });

  // --- Create-path WIP guard tests ---

  it("allows create with in_progress + agent when agent is under WIP limit", async () => {
    // Agent has 1 in-progress issue (under the limit of 2)
    await db.insert(issues).values({
      id: randomUUID(),
      companyId,
      title: "In-progress 1",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentId,
    });

    const result = await svc.create(companyId, {
      title: "New in-progress via create",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentId,
    });
    expect(result).toBeTruthy();
    expect(result.status).toBe("in_progress");
    expect(result.assigneeAgentId).toBe(agentId);
  });

  it("rejects create with in_progress + agent when agent at WIP limit", async () => {
    // Agent already has 2 in-progress issues
    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    await expect(
      svc.create(companyId, {
        title: "Third in-progress via create",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      }),
    ).rejects.toThrow("Agent has reached the maximum number of in-progress issues");
  });

  it("allows create with in_progress + agent at WIP limit when override is set", async () => {
    // Agent already has 2 in-progress issues
    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    const result = await svc.create(
      companyId,
      {
        title: "Override create in-progress",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      { overrideWipLimit: true },
    );
    expect(result).toBeTruthy();
    expect(result.status).toBe("in_progress");
  });

  it("does not trigger WIP guard on create with non-in_progress status", async () => {
    // Agent at WIP limit
    await db.insert(issues).values([
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 1",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
      {
        id: randomUUID(),
        companyId,
        title: "In-progress 2",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: agentId,
      },
    ]);

    // Creating a todo issue assigned to the agent should always succeed
    const result = await svc.create(companyId, {
      title: "New todo for agent at limit",
      status: "todo",
      priority: "medium",
      assigneeAgentId: agentId,
    });
    expect(result).toBeTruthy();
    expect(result.status).toBe("todo");
  });
});
