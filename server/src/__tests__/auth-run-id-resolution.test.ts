import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Db } from "@paperclipai/db";
import { actorMiddleware } from "../middleware/auth.js";

// Mock board-auth service to avoid real DB calls in the board-key path
vi.mock("../services/board-auth.js", () => ({
  boardAuthService: () => ({
    findBoardApiKeyByToken: vi.fn().mockResolvedValue(null),
    resolveBoardAccess: vi.fn().mockResolvedValue({ user: null, companyIds: [], isInstanceAdmin: false }),
    touchBoardApiKey: vi.fn(),
  }),
}));

const AGENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COMPANY_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const RUN_ID = "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr";

/**
 * Build a mock Db that returns specific rows for heartbeat_runs and agents table lookups.
 */
function mockDb(opts: {
  run?: { agentId: string; companyId: string } | null;
  agent?: { id: string; companyId: string; status: string } | null;
}): Db {
  // Track the chain: select → from(table) → where → then(rows)
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockImplementation((table: { _: { name: string } }) => {
        const tableName = table?._ ?.name ?? table?.[Symbol.for("drizzle:Name")] ?? "";
        return {
          where: vi.fn().mockImplementation(() => {
            // Determine which table is being queried based on call context
            // The mock is called sequentially: first heartbeatRuns, then agents
            return {
              then: vi.fn().mockImplementation((fn: (rows: unknown[]) => unknown) => {
                // We can't easily distinguish tables in a chain mock,
                // so we use a counter approach
                return Promise.resolve([]);
              }),
            };
          }),
        };
      }),
    }),
  } as unknown as Db;
}

/**
 * More refined mock that distinguishes heartbeatRuns vs agents queries
 * by tracking the call sequence.
 */
function createMockDb(opts: {
  run?: { agentId: string; companyId: string } | null;
  agent?: { id: string; companyId: string; status: string } | null;
}): Db {
  let queryCount = 0;
  const selectFn = () => ({
    from: () => ({
      where: () => {
        const currentQuery = queryCount++;
        if (currentQuery === 0) {
          // First query: heartbeatRuns lookup
          return Promise.resolve(opts.run ? [opts.run] : []);
        }
        // Second query: agents lookup
        return Promise.resolve(opts.agent ? [opts.agent] : []);
      },
    }),
  });

  return { select: selectFn } as unknown as Db;
}

function createApp(db: Db) {
  const app = express();
  app.use(express.json());
  app.use(actorMiddleware(db, { deploymentMode: "local_trusted" }));
  app.get("/test", (req, res) => {
    res.json({
      actorType: req.actor.type,
      agentId: req.actor.agentId ?? null,
      userId: req.actor.userId ?? null,
      runId: req.actor.runId ?? null,
      source: req.actor.source ?? null,
    });
  });
  return app;
}

describe("auth middleware: run-ID agent resolution in local_trusted mode", () => {
  it("resolves agent identity from x-paperclip-run-id when no bearer token is present", async () => {
    const db = createMockDb({
      run: { agentId: AGENT_ID, companyId: COMPANY_ID },
      agent: { id: AGENT_ID, companyId: COMPANY_ID, status: "running" },
    });

    const app = createApp(db);
    const res = await request(app)
      .get("/test")
      .set("x-paperclip-run-id", RUN_ID);

    expect(res.body.actorType).toBe("agent");
    expect(res.body.agentId).toBe(AGENT_ID);
    expect(res.body.runId).toBe(RUN_ID);
    expect(res.body.source).toBe("run_id");
  });

  it("falls back to board when run ID is unknown", async () => {
    const db = createMockDb({
      run: null,
      agent: null,
    });

    const app = createApp(db);
    const res = await request(app)
      .get("/test")
      .set("x-paperclip-run-id", RUN_ID);

    expect(res.body.actorType).toBe("board");
    expect(res.body.agentId).toBeNull();
    expect(res.body.userId).toBe("local-board");
    expect(res.body.runId).toBe(RUN_ID);
  });

  it("falls back to board when agent is terminated", async () => {
    const db = createMockDb({
      run: { agentId: AGENT_ID, companyId: COMPANY_ID },
      agent: { id: AGENT_ID, companyId: COMPANY_ID, status: "terminated" },
    });

    const app = createApp(db);
    const res = await request(app)
      .get("/test")
      .set("x-paperclip-run-id", RUN_ID);

    expect(res.body.actorType).toBe("board");
    expect(res.body.userId).toBe("local-board");
    expect(res.body.runId).toBe(RUN_ID);
  });

  it("stays board when no run-id header is present", async () => {
    const db = createMockDb({ run: null, agent: null });

    const app = createApp(db);
    const res = await request(app).get("/test");

    expect(res.body.actorType).toBe("board");
    expect(res.body.userId).toBe("local-board");
    expect(res.body.runId).toBeNull();
    expect(res.body.source).toBe("local_implicit");
  });
});
