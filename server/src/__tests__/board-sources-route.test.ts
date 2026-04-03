import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { companyRoutes } from "../routes/companies.js";
import { errorHandler } from "../middleware/index.js";

const mockBoardSourcesList = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    companyId: "company-1",
    windowStart: "2026-04-01T00:00:00.000Z",
    windowEnd: "2026-04-02T00:00:00.000Z",
    windowHours: 48,
    issues: [],
    comments: [],
    summary: { totalIssues: 0, totalComments: 0, totalSources: 0 },
  }),
);

vi.mock("../services/index.js", () => ({
  accessService: () => ({ ensureMembership: vi.fn() }),
  agentService: () => ({ getById: vi.fn() }),
  boardSourcesService: () => ({ list: mockBoardSourcesList }),
  budgetService: () => ({ upsertPolicy: vi.fn() }),
  companyPortabilityService: () => ({
    exportBundle: vi.fn(),
    previewExport: vi.fn(),
    previewImport: vi.fn(),
    importBundle: vi.fn(),
  }),
  companyService: () => ({
    list: vi.fn(),
    stats: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    remove: vi.fn(),
  }),
  logActivity: vi.fn(),
}));

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.actor = actor;
    next();
  });
  app.use("/api/companies", companyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

const agentActor = {
  type: "agent",
  agentId: "agent-1",
  companyId: "company-1",
  source: "agent_key",
};

const boardActor = {
  type: "board",
  userId: "user-1",
  companyIds: ["company-1"],
  source: "session",
};

describe("GET /api/companies/:companyId/board-authored-sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns board-authored sources with default 48h windowHours", async () => {
    const app = createApp(agentActor);
    const res = await request(app).get("/api/companies/company-1/board-authored-sources");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("companyId", "company-1");
    expect(res.body).toHaveProperty("summary");
    expect(mockBoardSourcesList).toHaveBeenCalledWith("company-1", 48);
  });

  it("passes windowHours query parameter to service", async () => {
    const app = createApp(agentActor);
    const res = await request(app).get("/api/companies/company-1/board-authored-sources?windowHours=72");

    expect(res.status).toBe(200);
    expect(mockBoardSourcesList).toHaveBeenCalledWith("company-1", 72);
  });

  it("clamps windowHours to minimum of 1", async () => {
    const app = createApp(agentActor);
    await request(app).get("/api/companies/company-1/board-authored-sources?windowHours=0");

    expect(mockBoardSourcesList).toHaveBeenCalledWith("company-1", 1);
  });

  it("clamps windowHours to maximum of 720", async () => {
    const app = createApp(agentActor);
    await request(app).get("/api/companies/company-1/board-authored-sources?windowHours=9999");

    expect(mockBoardSourcesList).toHaveBeenCalledWith("company-1", 720);
  });

  it("is accessible with board auth", async () => {
    const app = createApp(boardActor);
    const res = await request(app).get("/api/companies/company-1/board-authored-sources");

    expect(res.status).toBe(200);
  });

  it("rejects access to a different company", async () => {
    const app = createApp(agentActor);
    const res = await request(app).get("/api/companies/other-company/board-authored-sources");

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
