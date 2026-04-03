import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INBOX_LITE_ISSUE_STATUS_FILTER } from "@paperclipai/shared";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";

const agentId = "11111111-1111-4111-8111-111111111111";
const managerId = "22222222-2222-4222-8222-222222222222";
const companyId = "33333333-3333-4333-8333-333333333333";

const baseAgent = {
  id: agentId,
  companyId,
  name: "Builder",
  urlKey: "builder",
  role: "engineer",
  title: "Builder",
  icon: null,
  status: "idle",
  reportsTo: null,
  capabilities: null,
  adapterType: "process",
  adapterConfig: {},
  runtimeConfig: {},
  budgetMonthlyCents: 0,
  spentMonthlyCents: 0,
  pauseReason: null,
  pausedAt: null,
  permissions: { canCreateAgents: false },
  lastHeartbeatAt: null,
  metadata: null,
  createdAt: new Date("2026-03-19T00:00:00.000Z"),
  updatedAt: new Date("2026-03-19T00:00:00.000Z"),
};

const managerAgent = {
  ...baseAgent,
  id: managerId,
  name: "Manager",
  urlKey: "manager",
  role: "general",
  title: "Technical Lead",
};

const reportAgent = {
  ...baseAgent,
  id: agentId,
  reportsTo: managerId,
};

const sampleIssues = [
  {
    id: "issue-todo",
    identifier: "PAP-100",
    title: "Todo task",
    status: "todo",
    priority: "high",
    projectId: null,
    goalId: null,
    parentId: null,
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    activeRun: null,
  },
  {
    id: "issue-in-progress",
    identifier: "PAP-101",
    title: "In-progress task",
    status: "in_progress",
    priority: "medium",
    projectId: null,
    goalId: null,
    parentId: null,
    updatedAt: new Date("2026-04-01T01:00:00.000Z"),
    activeRun: null,
  },
  {
    id: "issue-blocked",
    identifier: "PAP-102",
    title: "Blocked task",
    status: "blocked",
    priority: "high",
    projectId: null,
    goalId: null,
    parentId: null,
    updatedAt: new Date("2026-04-01T02:00:00.000Z"),
    activeRun: null,
  },
  {
    id: "issue-in-review",
    identifier: "PAP-103",
    title: "In-review task",
    status: "in_review",
    priority: "critical",
    projectId: null,
    goalId: null,
    parentId: null,
    updatedAt: new Date("2026-04-01T03:00:00.000Z"),
    activeRun: null,
  },
];

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  create: vi.fn(),
  updatePermissions: vi.fn(),
  getChainOfCommand: vi.fn(),
  resolveByReference: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
  getMembership: vi.fn(),
  ensureMembership: vi.fn(),
  listPrincipalGrants: vi.fn(),
  setPrincipalPermission: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  listTaskSessions: vi.fn(),
  resetRuntimeSession: vi.fn(),
}));

const mockIssueApprovalService = vi.hoisted(() => ({
  linkManyForApproval: vi.fn(),
}));

const mockIssueService = vi.hoisted(() => ({
  list: vi.fn(),
}));

const mockSecretService = vi.hoisted(() => ({
  normalizeAdapterConfigForPersistence: vi.fn(),
  resolveAdapterConfigForRuntime: vi.fn(),
}));

const mockAgentInstructionsService = vi.hoisted(() => ({
  materializeManagedBundle: vi.fn(),
}));
const mockCompanySkillService = vi.hoisted(() => ({
  listRuntimeSkillEntries: vi.fn(),
  resolveRequestedSkillKeys: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  agentService: () => mockAgentService,
  agentInstructionsService: () => mockAgentInstructionsService,
  accessService: () => mockAccessService,
  approvalService: () => mockApprovalService,
  companySkillService: () => mockCompanySkillService,
  budgetService: () => mockBudgetService,
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => mockIssueApprovalService,
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  secretService: () => mockSecretService,
  syncInstructionsBundleConfigFromFilePath: vi.fn((_agent, config) => config),
  workspaceOperationService: () => mockWorkspaceOperationService,
}));

function createDbStub() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          then: vi.fn().mockResolvedValue([{
            id: companyId,
            name: "TestCo",
            requireBoardApprovalForNewAgents: false,
          }]),
        }),
      }),
    }),
  };
}

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", agentRoutes(createDbStub() as any));
  app.use(errorHandler);
  return app;
}

describe("GET /api/agents/me/inbox-lite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentService.getById.mockResolvedValue(reportAgent);
    mockAgentService.getChainOfCommand.mockResolvedValue([]);
    mockIssueService.list.mockResolvedValue(sampleIssues);
  });

  it("includes in_review issues in the status filter", async () => {
    const app = createApp({
      type: "agent",
      agentId,
      companyId,
      runId: "run-1",
      source: "agent_key",
    });

    const res = await request(app).get("/api/agents/me/inbox-lite");

    expect(res.status).toBe(200);
    expect(mockIssueService.list).toHaveBeenCalledWith(companyId, {
      assigneeAgentId: agentId,
      status: INBOX_LITE_ISSUE_STATUS_FILTER,
    });
    expect(INBOX_LITE_ISSUE_STATUS_FILTER).toContain("in_review");
  });

  it("returns all four non-terminal statuses", async () => {
    const app = createApp({
      type: "agent",
      agentId,
      companyId,
      runId: "run-1",
      source: "agent_key",
    });

    const res = await request(app).get("/api/agents/me/inbox-lite");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    const statuses = res.body.map((i: { status: string }) => i.status).sort();
    expect(statuses).toEqual(["blocked", "in_progress", "in_review", "todo"]);
  });
});

describe("GET /api/agents/:id/inbox-lite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentService.getById.mockImplementation(async (id: string) => {
      if (id === managerId) return managerAgent;
      if (id === agentId) return reportAgent;
      return null;
    });
    mockAgentService.getChainOfCommand.mockResolvedValue([
      { id: managerId, name: "Manager", role: "general", title: "Technical Lead" },
    ]);
    mockIssueService.list.mockResolvedValue(sampleIssues);
  });

  it("manager read includes in_review issues (parity with /me route)", async () => {
    const app = createApp({
      type: "agent",
      agentId: managerId,
      companyId,
      runId: "run-mgr",
      source: "agent_key",
    });

    const res = await request(app).get(`/api/agents/${agentId}/inbox-lite`);

    expect(res.status).toBe(200);
    expect(mockIssueService.list).toHaveBeenCalledWith(companyId, {
      assigneeAgentId: agentId,
      status: INBOX_LITE_ISSUE_STATUS_FILTER,
    });
    expect(res.body).toHaveLength(4);
    const identifiers = res.body.map((i: { identifier: string }) => i.identifier).sort();
    expect(identifiers).toEqual(["PAP-100", "PAP-101", "PAP-102", "PAP-103"]);
  });

  it("board read includes in_review issues", async () => {
    const app = createApp({
      type: "board",
      userId: "board-user",
      source: "local_implicit",
      isInstanceAdmin: true,
      companyIds: [companyId],
    });

    const res = await request(app).get(`/api/agents/${agentId}/inbox-lite`);

    expect(res.status).toBe(200);
    expect(mockIssueService.list).toHaveBeenCalledWith(companyId, {
      assigneeAgentId: agentId,
      status: INBOX_LITE_ISSUE_STATUS_FILTER,
    });
    expect(res.body).toHaveLength(4);
  });

  it("returns 403 for non-manager agent reading another agent's inbox-lite", async () => {
    const otherAgentId = "44444444-4444-4444-8444-444444444444";
    mockAgentService.getById.mockImplementation(async (id: string) => {
      if (id === agentId) return reportAgent;
      if (id === otherAgentId) return { ...baseAgent, id: otherAgentId, urlKey: "other" };
      return null;
    });
    mockAgentService.getChainOfCommand.mockResolvedValue([]);

    const app = createApp({
      type: "agent",
      agentId,
      companyId,
      runId: "run-1",
      source: "agent_key",
    });

    const res = await request(app).get(`/api/agents/${otherAgentId}/inbox-lite`);

    expect(res.status).toBe(403);
    expect(mockIssueService.list).not.toHaveBeenCalled();
  });

  it("manager reads multiple direct reports in sequence without false-empty results", async () => {
    const reportIds = [
      "aaaa1111-1111-4111-8111-111111111111",
      "aaaa2222-2222-4222-8222-222222222222",
      "aaaa3333-3333-4333-8333-333333333333",
    ];
    const reports = reportIds.map((id, i) => ({
      ...baseAgent,
      id,
      name: `Report${i + 1}`,
      urlKey: `report${i + 1}`,
      reportsTo: managerId,
    }));

    const issuesPerReport: Record<string, typeof sampleIssues> = {};
    for (const [i, id] of reportIds.entries()) {
      issuesPerReport[id] = [
        {
          id: `issue-${id}`,
          identifier: `PAP-${200 + i}`,
          title: `Task for report ${i + 1}`,
          status: i === 0 ? "in_review" : "todo",
          priority: "high",
          projectId: null,
          goalId: null,
          parentId: null,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
          activeRun: null,
        },
      ];
    }

    mockAgentService.getById.mockImplementation(async (id: string) => {
      if (id === managerId) return managerAgent;
      return reports.find((r) => r.id === id) ?? null;
    });
    mockAgentService.getChainOfCommand.mockResolvedValue([
      { id: managerId, name: "Manager", role: "general", title: "Technical Lead" },
    ]);
    mockIssueService.list.mockImplementation(
      async (_companyId: string, filters: { assigneeAgentId?: string }) => {
        return issuesPerReport[filters.assigneeAgentId ?? ""] ?? [];
      },
    );

    const app = createApp({
      type: "agent",
      agentId: managerId,
      companyId,
      runId: "run-mgr-multi",
      source: "agent_key",
    });

    for (const [i, id] of reportIds.entries()) {
      const res = await request(app).get(`/api/agents/${id}/inbox-lite`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].identifier).toBe(`PAP-${200 + i}`);
    }
  });
});
