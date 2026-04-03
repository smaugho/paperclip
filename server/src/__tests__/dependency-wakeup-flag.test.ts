import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";

// ---------- hoisted mocks ----------

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  addComment: vi.fn(),
  findMentionedAgents: vi.fn().mockResolvedValue([]),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(async () => undefined),
  reportRunActivity: vi.fn(async () => undefined),
  getRun: vi.fn(async () => null),
  getActiveRunForAgent: vi.fn(async () => null),
  cancelRun: vi.fn(async () => null),
}));

const mockGetExperimental = vi.hoisted(() => vi.fn());
const mockFindDependentsReadyToWake = vi.hoisted(() => vi.fn());
const mockListBlockers = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockListDependents = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("../services/index.js", () => ({
  accessService: () => ({
    canUser: vi.fn().mockResolvedValue(true),
    hasPermission: vi.fn().mockResolvedValue(true),
  }),
  agentService: () => ({ getById: vi.fn() }),
  documentService: () => ({}),
  executionWorkspaceService: () => ({}),
  goalService: () => ({}),
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => ({}),
  instanceSettingsService: () => ({
    getExperimental: mockGetExperimental,
  }),
  issueDependencyService: () => ({
    addDependency: vi.fn(),
    removeDependency: vi.fn(),
    listBlockers: mockListBlockers,
    listDependents: mockListDependents,
    findDependentsReadyToWake: mockFindDependentsReadyToWake,
  }),
  issueService: () => mockIssueService,
  logActivity: vi.fn(async () => undefined),
  projectService: () => ({}),
  routineService: () => ({
    syncRunStatusForIssue: vi.fn(async () => undefined),
  }),
  workProductService: () => ({}),
}));

// ---------- helpers ----------

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      actorType: "board",
      actorId: "local-board",
      userId: "local-board",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

function makeIssue(overrides?: Record<string, unknown>) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    companyId: "company-1",
    status: "in_progress",
    assigneeAgentId: "agent-1",
    assigneeUserId: null,
    createdByUserId: "local-board",
    identifier: "TST-1",
    title: "Test blocker issue",
    ...overrides,
  };
}

const DEPENDENT_ISSUE = {
  id: "22222222-2222-4222-8222-222222222222",
  companyId: "company-1",
  assigneeAgentId: "agent-2",
};

describe("enableDependencies flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.findMentionedAgents.mockResolvedValue([]);
    mockIssueService.addComment.mockResolvedValue({
      id: "c-1",
      issueId: "11111111-1111-4111-8111-111111111111",
      companyId: "company-1",
      body: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // ── Wakeup gating ──────────────────────────────────────────────────

  it("skips dependency wakeups when enableDependencies is false (default off path)", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue({ status: "in_progress" }));
    mockIssueService.update.mockResolvedValue(makeIssue({ status: "done" }));
    mockGetExperimental.mockResolvedValue({ enableDependencies: false });
    mockFindDependentsReadyToWake.mockResolvedValue([DEPENDENT_ISSUE]);

    const app = createApp();
    const res = await request(app)
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ status: "done" });

    expect(res.status).toBe(200);
    // Flag is off: findDependentsReadyToWake should NOT be called
    expect(mockFindDependentsReadyToWake).not.toHaveBeenCalled();
    // No dependency_resolved wakeup should be queued
    const wakeupCalls = mockHeartbeatService.wakeup.mock.calls;
    const depWakeups = wakeupCalls.filter((c: any[]) => c[1]?.reason === "dependency_resolved");
    expect(depWakeups).toHaveLength(0);
  });

  it("wakes dependents when enableDependencies is true (enabled path)", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue({ status: "in_progress" }));
    mockIssueService.update.mockResolvedValue(makeIssue({ status: "done" }));
    mockGetExperimental.mockResolvedValue({ enableDependencies: true });
    mockFindDependentsReadyToWake.mockResolvedValue([DEPENDENT_ISSUE]);

    const app = createApp();
    const res = await request(app)
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ status: "done" });

    expect(res.status).toBe(200);
    // Flag is on: findDependentsReadyToWake SHOULD be called
    expect(mockFindDependentsReadyToWake).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    // A wakeup for the dependent's agent should be queued
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(
      "agent-2",
      expect.objectContaining({
        reason: "dependency_resolved",
      }),
    );
  });

  it("does not trigger dependency check when status does not resolve a blocker", async () => {
    // Transition from todo to in_progress — not a blocker resolve
    mockIssueService.getById.mockResolvedValue(makeIssue({ status: "todo" }));
    mockIssueService.update.mockResolvedValue(makeIssue({ status: "in_progress" }));
    mockGetExperimental.mockResolvedValue({ enableDependencies: true });

    const app = createApp();
    const res = await request(app)
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ status: "in_progress" });

    expect(res.status).toBe(200);
    // Not a terminal transition, so findDependentsReadyToWake should NOT be called
    expect(mockFindDependentsReadyToWake).not.toHaveBeenCalled();
  });

  // ── CRUD route gating ──────────────────────────────────────────────

  it("returns 403 for GET /issues/:id/dependencies when flag is off", async () => {
    mockGetExperimental.mockResolvedValue({ enableDependencies: false });
    mockIssueService.getById.mockResolvedValue(makeIssue());

    const app = createApp();
    const res = await request(app)
      .get("/api/issues/11111111-1111-4111-8111-111111111111/dependencies");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not enabled/i);
    expect(mockListBlockers).not.toHaveBeenCalled();
  });

  it("allows GET /issues/:id/dependencies when flag is on", async () => {
    mockGetExperimental.mockResolvedValue({ enableDependencies: true });
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockListBlockers.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get("/api/issues/11111111-1111-4111-8111-111111111111/dependencies");

    expect(res.status).toBe(200);
    expect(mockListBlockers).toHaveBeenCalled();
  });

  it("returns 403 for GET /issues/:id/dependents when flag is off", async () => {
    mockGetExperimental.mockResolvedValue({ enableDependencies: false });
    mockIssueService.getById.mockResolvedValue(makeIssue());

    const app = createApp();
    const res = await request(app)
      .get("/api/issues/11111111-1111-4111-8111-111111111111/dependents");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not enabled/i);
    expect(mockListDependents).not.toHaveBeenCalled();
  });

  it("returns 403 for POST /issues/:id/dependencies when flag is off", async () => {
    mockGetExperimental.mockResolvedValue({ enableDependencies: false });
    mockIssueService.getById.mockResolvedValue(makeIssue());

    const app = createApp();
    const res = await request(app)
      .post("/api/issues/11111111-1111-4111-8111-111111111111/dependencies")
      .send({ blockerIssueId: "22222222-2222-4222-8222-222222222222" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not enabled/i);
  });

  it("returns 403 for DELETE /issues/:id/dependencies/:blockerIssueId when flag is off", async () => {
    mockGetExperimental.mockResolvedValue({ enableDependencies: false });
    mockIssueService.getById.mockResolvedValue(makeIssue());

    const app = createApp();
    const res = await request(app)
      .delete("/api/issues/11111111-1111-4111-8111-111111111111/dependencies/22222222-2222-4222-8222-222222222222");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not enabled/i);
  });
});
