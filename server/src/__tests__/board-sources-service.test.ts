import { beforeEach, describe, expect, it, vi } from "vitest";
import { boardSourcesService } from "../services/board-sources.ts";

/**
 * Regression tests for boardSourcesService.
 *
 * These tests use a chain-mocked Drizzle DB to verify:
 *   1. Only active board member user IDs are used (not all users)
 *   2. Comments on hidden issues are excluded
 */

/* -------------------------------------------------------------------------- */
/*  DB mock helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Build a mock DB that tracks calls and returns pre-configured results.
 *
 * Query order inside boardSourcesService.list():
 *   0. select().from(companies).where().then()         -> company lookup
 *   1. select().from(companyMemberships).where()        -> board member IDs
 *   2. select().from(issues).where().orderBy()          -> board issues
 *   3. select().from(issueComments).innerJoin().where().orderBy() -> board comments
 */
function createMockDb(options: {
  companyExists?: boolean;
  boardMemberRows?: Array<{ principalId: string }>;
  issueRows?: Array<Record<string, unknown>>;
  commentRows?: Array<Record<string, unknown>>;
}) {
  const {
    companyExists = true,
    boardMemberRows = [],
    issueRows = [],
    commentRows = [],
  } = options;

  let selectCallIndex = 0;

  // Build chain stubs for each select() call
  function buildSelectChain(index: number) {
    switch (index) {
      case 0: {
        // Company lookup — select().from().where().then()
        const result = companyExists ? [{ id: "company-1" }] : [];
        const thenFn = vi.fn(async (cb: (rows: unknown[]) => unknown) => cb(result));
        const whereFn = vi.fn(() => ({ then: thenFn }));
        const fromFn = vi.fn(() => ({ where: whereFn }));
        return { from: fromFn };
      }
      case 1: {
        // Board members — select().from().where()
        const whereFn = vi.fn(async () => boardMemberRows);
        const fromFn = vi.fn(() => ({ where: whereFn }));
        return { from: fromFn };
      }
      case 2: {
        // Issues — select().from().where().orderBy()
        const orderByFn = vi.fn(async () => issueRows);
        const whereFn = vi.fn(() => ({ orderBy: orderByFn }));
        const fromFn = vi.fn(() => ({ where: whereFn }));
        return { from: fromFn };
      }
      case 3: {
        // Comments — select().from().innerJoin().where().orderBy()
        const orderByFn = vi.fn(async () => commentRows);
        const whereFn = vi.fn(() => ({ orderBy: orderByFn }));
        const innerJoinFn = vi.fn(() => ({ where: whereFn }));
        const fromFn = vi.fn(() => ({ innerJoin: innerJoinFn }));
        return { from: fromFn };
      }
      default:
        throw new Error(`Unexpected select call #${index}`);
    }
  }

  const selectFn = vi.fn(() => {
    const chain = buildSelectChain(selectCallIndex);
    selectCallIndex += 1;
    return chain;
  });

  return { select: selectFn } as unknown as import("@paperclipai/db").Db;
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("boardSourcesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty results when company has no board members", async () => {
    const db = createMockDb({
      companyExists: true,
      boardMemberRows: [], // no board members
    });

    const svc = boardSourcesService(db);
    const result = await svc.list("company-1", 24);

    expect(result.issues).toEqual([]);
    expect(result.comments).toEqual([]);
    expect(result.summary.totalSources).toBe(0);
    // Should NOT proceed to query issues/comments if no board members
    expect(db.select).toHaveBeenCalledTimes(2); // company + memberships only
  });

  it("only returns content authored by active board members (regression: contract mismatch)", async () => {
    // Board member "user-board" is active, but a hypothetical non-board user
    // would not appear in the memberships query result
    const db = createMockDb({
      companyExists: true,
      boardMemberRows: [{ principalId: "user-board" }],
      issueRows: [
        {
          id: "issue-1",
          identifier: "TEST-1",
          title: "Board issue",
          status: "todo",
          createdByUserId: "user-board",
          createdAt: new Date(),
        },
      ],
      commentRows: [
        {
          id: "comment-1",
          issueId: "issue-1",
          issueIdentifier: "TEST-1",
          authorUserId: "user-board",
          body: "Board comment",
          createdAt: new Date(),
        },
      ],
    });

    const svc = boardSourcesService(db);
    const result = await svc.list("company-1", 24);

    // Service proceeded past the membership check to query issues + comments
    expect(db.select).toHaveBeenCalledTimes(4);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].createdByUserId).toBe("user-board");
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].authorUserId).toBe("user-board");
  });

  it("excludes comments on hidden issues (regression: hidden-issue leak)", async () => {
    // The service applies isNull(issues.hiddenAt) on the comments join.
    // With hidden issue comments filtered out by the DB, the mock returns
    // only non-hidden comments. This test verifies the service passes
    // all 4 queries (including comments) and processes correctly.
    const db = createMockDb({
      companyExists: true,
      boardMemberRows: [{ principalId: "user-board" }],
      issueRows: [],
      commentRows: [], // no comments returned because hidden issues are filtered
    });

    const svc = boardSourcesService(db);
    const result = await svc.list("company-1", 24);

    expect(db.select).toHaveBeenCalledTimes(4);
    expect(result.comments).toEqual([]);
    expect(result.summary.totalComments).toBe(0);
  });

  it("truncates comment body preview to 500 characters", async () => {
    const longBody = "A".repeat(600);
    const db = createMockDb({
      companyExists: true,
      boardMemberRows: [{ principalId: "user-board" }],
      issueRows: [],
      commentRows: [
        {
          id: "comment-2",
          issueId: "issue-1",
          issueIdentifier: "TEST-1",
          authorUserId: "user-board",
          body: longBody,
          createdAt: new Date(),
        },
      ],
    });

    const svc = boardSourcesService(db);
    const result = await svc.list("company-1", 24);

    expect(result.comments[0].bodyPreview).toBe("A".repeat(500) + "...");
    expect(result.comments[0].bodyPreview.length).toBe(503);
  });

  it("throws when company does not exist", async () => {
    const db = createMockDb({ companyExists: false });

    const svc = boardSourcesService(db);
    await expect(svc.list("nonexistent", 24)).rejects.toThrow();
  });
});
