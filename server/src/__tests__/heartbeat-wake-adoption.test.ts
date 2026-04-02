import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  agentWakeupRequests,
  companies,
  heartbeatRunEvents,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import type { createDb } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { heartbeatService } from "../services/heartbeat.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres wake-adoption tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("heartbeat wake-run adoption scoping", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-wake-adoption-");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createDb: createDbFn } = await import("@paperclipai/db");
    db = createDbFn(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issues);
    await db.delete(heartbeatRunEvents);
    await db.delete(heartbeatRuns);
    await db.delete(agentWakeupRequests);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedTwoAgentFixture() {
    const companyId = randomUUID();
    const agentA = randomUUID(); // Issue assignee (PSE)
    const agentB = randomUUID(); // Mentioned agent (TL)
    const issueId = randomUUID();
    const runA = randomUUID(); // Active run by agent A
    const wakeupA = randomUUID();
    const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Test Company",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values([
      {
        id: agentA,
        companyId,
        name: "Agent-A",
        role: "engineer",
        status: "running",
        adapterType: "claude_local",
        adapterConfig: {},
        runtimeConfig: { heartbeat: { enabled: true, intervalSec: 3600, wakeOnDemand: true } },
        permissions: {},
      },
      {
        id: agentB,
        companyId,
        name: "Agent-B",
        role: "general",
        status: "running",
        adapterType: "claude_local",
        adapterConfig: {},
        runtimeConfig: { heartbeat: { enabled: true, intervalSec: 3600, wakeOnDemand: true } },
        permissions: {},
      },
    ]);

    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Cross-agent adoption test issue",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentA,
      checkoutRunId: runA,
      executionRunId: runA,
      issueNumber: 1,
      identifier: `${issuePrefix}-1`,
    });

    // Agent A has an active running run for the issue
    await db.insert(agentWakeupRequests).values({
      id: wakeupA,
      companyId,
      agentId: agentA,
      source: "assignment",
      triggerDetail: "system",
      reason: "issue_assigned",
      payload: { issueId },
      status: "claimed",
      runId: runA,
      claimedAt: new Date(),
    });

    await db.insert(heartbeatRuns).values({
      id: runA,
      companyId,
      agentId: agentA,
      invocationSource: "assignment",
      triggerDetail: "system",
      status: "running",
      wakeupRequestId: wakeupA,
      contextSnapshot: { issueId },
      startedAt: new Date(),
      updatedAt: new Date(),
    });

    return { companyId, agentA, agentB, issueId, runA };
  }

  it("does not adopt a foreign agent's run as the execution lock (cross-agent regression)", async () => {
    const { companyId, agentA, agentB, issueId, runA } = await seedTwoAgentFixture();
    const heartbeat = heartbeatService(db);

    // Agent B wakes for the same issue (e.g. mentioned in a comment)
    // The enqueueWakeup with bypassIssueExecutionLock=false should NOT adopt agent A's run
    const result = await heartbeat.wakeup(agentB, {
      source: "on_demand",
      reason: "issue_assigned",
      contextSnapshot: { issueId },
    });

    // The wakeup should succeed (creates a new run for agent B)
    // But the issue's executionRunId should still point to agent A's run
    const issue = await db
      .select({ executionRunId: issues.executionRunId })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);

    expect(issue?.executionRunId).toBe(runA);
  });

  it("adopts same-agent run as execution lock normally", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();
    const existingRunId = randomUUID();
    const wakeupId = randomUUID();
    const issuePrefix = `S${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Same Agent Co",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Solo-Agent",
      role: "engineer",
      status: "running",
      adapterType: "claude_local",
      adapterConfig: {},
      runtimeConfig: { heartbeat: { enabled: true, intervalSec: 3600, wakeOnDemand: true } },
      permissions: {},
    });

    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Same-agent adoption test",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentId,
      // No executionRunId yet — this is the legacy path
      issueNumber: 1,
      identifier: `${issuePrefix}-1`,
    });

    await db.insert(agentWakeupRequests).values({
      id: wakeupId,
      companyId,
      agentId,
      source: "assignment",
      triggerDetail: "system",
      reason: "issue_assigned",
      payload: { issueId },
      status: "claimed",
      runId: existingRunId,
      claimedAt: new Date(),
    });

    await db.insert(heartbeatRuns).values({
      id: existingRunId,
      companyId,
      agentId,
      invocationSource: "assignment",
      triggerDetail: "system",
      status: "running",
      wakeupRequestId: wakeupId,
      contextSnapshot: { issueId },
      startedAt: new Date(),
      updatedAt: new Date(),
    });

    const heartbeat = heartbeatService(db);

    // Same agent wakes for the same issue — should adopt the existing run
    await heartbeat.wakeup(agentId, {
      source: "on_demand",
      reason: "issue_assigned",
      contextSnapshot: { issueId },
    });

    const issue = await db
      .select({ executionRunId: issues.executionRunId })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);

    // The existing run should be adopted as the execution lock
    expect(issue?.executionRunId).toBe(existingRunId);
  });
});
