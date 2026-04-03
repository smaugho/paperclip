import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";
import { conflict } from "../errors.js";

const OLD_RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  addComment: vi.fn(),
  findMentionedAgents: vi.fn(),
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

const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  documentService: () => ({}),
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
  workProductService: () => ({}),
}));

vi.mock("../services/issue-assignment-wakeup.js", () => ({
  queueIssueAssignmentWakeup: vi.fn(),
}));

const ISSUE_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "agent",
      agentId: AGENT_ID,
      companyId: "company-1",
      runId: RUN_ID,
    };
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
    title: "Test issue",
    ...overrides,
  };
}

describe("same-agent sibling-run adoption through route ownership gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.findMentionedAgents.mockResolvedValue([]);
  });

  describe("PATCH /issues/:id", () => {
    it("succeeds when assertCheckoutOwner returns sibling adoption", async () => {
      mockIssueService.getById.mockResolvedValue(makeIssue());
      mockIssueService.assertCheckoutOwner.mockResolvedValue({
        id: ISSUE_ID,
        status: "in_progress",
        assigneeAgentId: AGENT_ID,
        checkoutRunId: RUN_ID,
        adoptedFromRunId: OLD_RUN_ID,
        adoptionReason: "same_agent_sibling_not_on_issue",
      });
      mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
        ...makeIssue(),
        ...patch,
      }));

      const res = await request(createApp())
        .patch(`/api/issues/${ISSUE_ID}`)
        .send({ status: "blocked" });

      expect(res.status).toBe(200);
      expect(mockIssueService.assertCheckoutOwner).toHaveBeenCalledWith(ISSUE_ID, AGENT_ID, RUN_ID);
      expect(mockIssueService.update).toHaveBeenCalled();
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "issue.checkout_lock_adopted",
          entityId: ISSUE_ID,
          details: expect.objectContaining({
            previousCheckoutRunId: OLD_RUN_ID,
            checkoutRunId: RUN_ID,
            reason: "same_agent_sibling_not_on_issue",
          }),
        }),
      );
    });

    it("returns 409 when same-agent sibling is still on the same issue", async () => {
      mockIssueService.getById.mockResolvedValue(makeIssue());
      mockIssueService.assertCheckoutOwner.mockRejectedValue(
        conflict("Issue run ownership conflict", {
          issueId: ISSUE_ID,
          status: "in_progress",
          assigneeAgentId: AGENT_ID,
          checkoutRunId: OLD_RUN_ID,
          actorAgentId: AGENT_ID,
          actorRunId: RUN_ID,
        }),
      );

      const res = await request(createApp())
        .patch(`/api/issues/${ISSUE_ID}`)
        .send({ status: "blocked" });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Issue run ownership conflict");
      expect(mockIssueService.update).not.toHaveBeenCalled();
    });
  });

  describe("POST /issues/:id/comments", () => {
    it("succeeds when assertCheckoutOwner returns sibling adoption", async () => {
      mockIssueService.getById.mockResolvedValue(makeIssue());
      mockIssueService.assertCheckoutOwner.mockResolvedValue({
        id: ISSUE_ID,
        status: "in_progress",
        assigneeAgentId: AGENT_ID,
        checkoutRunId: RUN_ID,
        adoptedFromRunId: OLD_RUN_ID,
        adoptionReason: "same_agent_sibling_not_on_issue",
      });
      mockIssueService.addComment.mockResolvedValue({
        id: "comment-1",
        issueId: ISSUE_ID,
        companyId: "company-1",
        body: "Progress update",
        createdAt: new Date(),
        updatedAt: new Date(),
        authorAgentId: AGENT_ID,
        authorUserId: null,
      });

      const res = await request(createApp())
        .post(`/api/issues/${ISSUE_ID}/comments`)
        .send({ body: "Progress update" });

      expect(res.status).toBe(201);
      expect(mockIssueService.assertCheckoutOwner).toHaveBeenCalledWith(ISSUE_ID, AGENT_ID, RUN_ID);
      expect(mockIssueService.addComment).toHaveBeenCalled();
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "issue.checkout_lock_adopted",
          entityId: ISSUE_ID,
          details: expect.objectContaining({
            previousCheckoutRunId: OLD_RUN_ID,
            checkoutRunId: RUN_ID,
            reason: "same_agent_sibling_not_on_issue",
          }),
        }),
      );
    });

    it("returns 409 when same-agent sibling is still on the same issue", async () => {
      mockIssueService.getById.mockResolvedValue(makeIssue());
      mockIssueService.assertCheckoutOwner.mockRejectedValue(
        conflict("Issue run ownership conflict", {
          issueId: ISSUE_ID,
          status: "in_progress",
          assigneeAgentId: AGENT_ID,
          checkoutRunId: OLD_RUN_ID,
          actorAgentId: AGENT_ID,
          actorRunId: RUN_ID,
        }),
      );

      const res = await request(createApp())
        .post(`/api/issues/${ISSUE_ID}/comments`)
        .send({ body: "Progress update" });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Issue run ownership conflict");
      expect(mockIssueService.addComment).not.toHaveBeenCalled();
    });
  });
});
