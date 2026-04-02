import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  addComment: vi.fn(),
  findMentionedAgents: vi.fn(),
  listAttachments: vi.fn(),
  assertCheckoutOwner: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(async () => undefined),
  reportRunActivity: vi.fn(async () => undefined),
  getRun: vi.fn(async () => null),
  getActiveRunForAgent: vi.fn(async () => null),
  cancelRun: vi.fn(async () => null),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockDocumentService = vi.hoisted(() => ({
  listIssueDocuments: vi.fn(),
}));

const mockWorkProductService = vi.hoisted(() => ({
  listForIssue: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  documentService: () => mockDocumentService,
  executionWorkspaceService: () => ({}),
  goalService: () => ({}),
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => ({}),
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => ({}),
  routineService: () => ({
    syncRunStatusForIssue: vi.fn(async () => undefined),
  }),
  workProductService: () => mockWorkProductService,
}));

const ISSUE_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function createApp(actorType: "board" | "agent" = "agent") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (actorType === "board") {
      (req as any).actor = {
        type: "board",
        userId: "local-board",
        companyIds: ["company-1"],
        source: "local_implicit",
        isInstanceAdmin: false,
      };
    } else {
      (req as any).actor = {
        type: "agent",
        agentId: AGENT_ID,
        companyId: "company-1",
        runId: RUN_ID,
      };
    }
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: ISSUE_ID,
    companyId: "company-1",
    status: "in_progress",
    assigneeAgentId: AGENT_ID,
    assigneeUserId: null,
    createdByUserId: null,
    identifier: "PAP-1",
    title: "Closeout test",
    closeoutPolicy: null,
    ...overrides,
  };
}

describe("closeout policy enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.findMentionedAgents.mockResolvedValue([]);
    mockIssueService.assertCheckoutOwner.mockResolvedValue({ adoptedFromRunId: null });
    mockIssueService.addComment.mockResolvedValue({
      id: "comment-1",
      issueId: ISSUE_ID,
      companyId: "company-1",
      body: "done",
      createdAt: new Date(),
      updatedAt: new Date(),
      authorAgentId: AGENT_ID,
      authorUserId: null,
    });
    mockWorkProductService.listForIssue.mockResolvedValue([]);
    mockDocumentService.listIssueDocuments.mockResolvedValue([]);
    mockIssueService.listAttachments.mockResolvedValue([]);
  });

  it("allows done transition when no closeout policy is set", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue(),
      ...patch,
    }));

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "All done" });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalled();
  });

  it("rejects done transition when required work products are missing", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request"],
        },
      }),
    );

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "All done" });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Closeout requirements not met");
    expect(res.body.violations).toContain("Missing required work products: pull_request");
    expect(mockIssueService.update).not.toHaveBeenCalled();
  });

  it("allows done transition when required work products exist", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request"],
        },
      }),
    );
    mockWorkProductService.listForIssue.mockResolvedValue([
      { id: "wp-1", type: "pull_request", title: "PR #1" },
    ]);
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue(),
      ...patch,
    }));

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "PR merged" });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalled();
  });

  it("allows done transition with alternative document evidence", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request"],
          acceptAlternativeEvidence: ["document"],
        },
      }),
    );
    mockDocumentService.listIssueDocuments.mockResolvedValue([
      { id: "doc-1", key: "plan", title: "Plan" },
    ]);
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue(),
      ...patch,
    }));

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "Documented findings" });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalled();
  });

  it("allows done transition with alternative attachment evidence", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["commit"],
          acceptAlternativeEvidence: ["attachment"],
        },
      }),
    );
    mockIssueService.listAttachments.mockResolvedValue([
      { id: "att-1", originalFilename: "report.pdf" },
    ]);
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue(),
      ...patch,
    }));

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "Report attached" });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalled();
  });

  it("allows done transition with alternative comment evidence", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request"],
          acceptAlternativeEvidence: ["comment"],
        },
      }),
    );
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue(),
      ...patch,
    }));

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "Closing with rationale" });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalled();
  });

  it("rejects done when alternative evidence required but not present", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request"],
          acceptAlternativeEvidence: ["document"],
        },
      }),
    );

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "All done" });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Closeout requirements not met");
  });

  it("allows done transition with exemption marker in comment", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request"],
          allowExemption: true,
        },
      }),
    );
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue(),
      ...patch,
    }));

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "Coordination-only task [CLOSEOUT-EXEMPT]" });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalled();
  });

  it("rejects done when exemption is not allowed and no evidence", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request"],
          allowExemption: false,
        },
      }),
    );

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "All done [CLOSEOUT-EXEMPT]" });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Closeout requirements not met");
  });

  it("board users bypass closeout validation", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request", "commit"],
        },
      }),
    );
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue(),
      ...patch,
    }));

    const res = await request(createApp("board"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "Board override" });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalled();
    expect(mockWorkProductService.listForIssue).not.toHaveBeenCalled();
  });

  it("does not enforce closeout when status is not transitioning to done", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request"],
        },
      }),
    );
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue(),
      ...patch,
    }));

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "blocked", comment: "Need help" });

    expect(res.status).toBe(200);
    expect(mockWorkProductService.listForIssue).not.toHaveBeenCalled();
  });

  it("does not enforce closeout when issue is already done (no transition)", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        status: "done",
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request"],
        },
      }),
    );
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue({ status: "done" }),
      ...patch,
    }));

    const res = await request(createApp("board"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ comment: "Follow-up note" });

    expect(res.status).toBe(200);
    expect(mockWorkProductService.listForIssue).not.toHaveBeenCalled();
  });

  it("provides hint about exemption marker when allowed but not used", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({
        closeoutPolicy: {
          requiredWorkProductTypes: ["pull_request"],
          allowExemption: true,
        },
      }),
    );

    const res = await request(createApp("agent"))
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done", comment: "All done" });

    expect(res.status).toBe(422);
    expect(res.body.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("[CLOSEOUT-EXEMPT]"),
      ]),
    );
  });
});
