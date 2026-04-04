import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  agentRuntimeState,
  agentWakeupRequests,
  companies,
  heartbeatRunEvents,
  heartbeatRuns,
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
    `Skipping embedded Postgres error-recovery tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("heartbeat agent error-state auto-recovery", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-error-recovery-");
    const { createDb: createDbFn } = await import("@paperclipai/db");
    db = createDbFn(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(heartbeatRunEvents);
    await db.delete(heartbeatRuns);
    await db.delete(agentWakeupRequests);
    await db.delete(agentRuntimeState);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompanyAndAgent(overrides?: {
    agentStatus?: string;
    lastHeartbeatAt?: Date | null;
  }) {
    const companyId = randomUUID();
    const agentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Test Company",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Test-Agent",
      role: "engineer",
      status: overrides?.agentStatus ?? "error",
      adapterType: "claude_local",
      adapterConfig: {},
      runtimeConfig: { heartbeat: { enabled: true, intervalSec: 3600, wakeOnDemand: true } },
      permissions: {},
      lastHeartbeatAt: overrides?.lastHeartbeatAt ?? new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
    });

    return { companyId, agentId };
  }

  it("recovers an agent in error state with no active runs after timeout", async () => {
    const { agentId } = await seedCompanyAndAgent();
    const heartbeat = heartbeatService(db as any);

    const result = await heartbeat.recoverErroredAgents({ timeoutMs: 5 * 60 * 1000 });
    expect(result.recovered).toBe(1);
    expect(result.skippedCap).toBe(0);

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    expect(agent.status).toBe("idle");
  });

  it("does not recover an agent whose last heartbeat is within the timeout", async () => {
    const { agentId } = await seedCompanyAndAgent({
      lastHeartbeatAt: new Date(), // just now
    });
    const heartbeat = heartbeatService(db as any);

    const result = await heartbeat.recoverErroredAgents({ timeoutMs: 5 * 60 * 1000 });
    expect(result.recovered).toBe(0);

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    expect(agent.status).toBe("error");
  });

  it("does not recover agents in non-error states", async () => {
    await seedCompanyAndAgent({ agentStatus: "idle" });
    await seedCompanyAndAgent({ agentStatus: "paused" });
    const heartbeat = heartbeatService(db as any);

    const result = await heartbeat.recoverErroredAgents({ timeoutMs: 0 });
    expect(result.recovered).toBe(0);
  });

  it("does not recover an agent with active running runs", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();
    const wakeupId = randomUUID();

    await db.insert(agentWakeupRequests).values({
      id: wakeupId,
      agentId,
      companyId,
      status: "completed",
    });

    await db.insert(heartbeatRuns).values({
      id: randomUUID(),
      agentId,
      companyId,
      status: "running",
      wakeupRequestId: wakeupId,
      invocationSource: "on_demand",
      triggerDetail: "manual",
    });

    const heartbeat = heartbeatService(db as any);
    const result = await heartbeat.recoverErroredAgents({ timeoutMs: 0 });
    expect(result.recovered).toBe(0);
    expect(result.skippedActiveRuns).toBe(1);

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    expect(agent.status).toBe("error");
  });

  it("tracks recovery timestamps in agentRuntimeState.stateJson", async () => {
    const { agentId } = await seedCompanyAndAgent();
    const heartbeat = heartbeatService(db as any);

    await heartbeat.recoverErroredAgents({ timeoutMs: 0 });

    const [state] = await db
      .select()
      .from(agentRuntimeState)
      .where(eq(agentRuntimeState.agentId, agentId));
    expect(state).toBeTruthy();
    const stateJson = state.stateJson as Record<string, unknown>;
    expect(Array.isArray(stateJson.autoRecoveryTimestamps)).toBe(true);
    expect((stateJson.autoRecoveryTimestamps as string[]).length).toBe(1);
  });

  it("stops recovering after exceeding the recovery cap", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();

    // Pre-seed 3 recovery timestamps in the last hour
    const recentTimestamps = [
      new Date(Date.now() - 50 * 60 * 1000).toISOString(),
      new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    ];
    await db.insert(agentRuntimeState).values({
      agentId,
      companyId,
      adapterType: "claude_local",
      stateJson: { autoRecoveryTimestamps: recentTimestamps },
    });

    const heartbeat = heartbeatService(db as any);
    const result = await heartbeat.recoverErroredAgents({
      timeoutMs: 0,
      maxCount: 3,
      windowMs: 60 * 60 * 1000,
    });

    expect(result.recovered).toBe(0);
    expect(result.skippedCap).toBe(1);

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    expect(agent.status).toBe("error");
  });

  it("prunes old recovery timestamps outside the window", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();

    // Pre-seed 3 old timestamps outside the window
    const oldTimestamps = [
      new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() - 90 * 60 * 1000).toISOString(), // outside 1 hour window
    ];
    await db.insert(agentRuntimeState).values({
      agentId,
      companyId,
      adapterType: "claude_local",
      stateJson: { autoRecoveryTimestamps: oldTimestamps },
    });

    const heartbeat = heartbeatService(db as any);
    const result = await heartbeat.recoverErroredAgents({
      timeoutMs: 0,
      maxCount: 3,
      windowMs: 60 * 60 * 1000,
    });

    // Should recover because all old timestamps are outside the window
    expect(result.recovered).toBe(1);

    const [state] = await db
      .select()
      .from(agentRuntimeState)
      .where(eq(agentRuntimeState.agentId, agentId));
    const stateJson = state.stateJson as Record<string, unknown>;
    const timestamps = stateJson.autoRecoveryTimestamps as string[];
    // Only the new recovery timestamp should remain (old ones were pruned)
    expect(timestamps.length).toBe(1);
  });
});
