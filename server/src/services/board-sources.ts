import { and, eq, gte, isNotNull, isNull, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, issues, issueComments } from "@paperclipai/db";
import { notFound } from "../errors.js";

export function boardSourcesService(db: Db) {
  return {
    /**
     * Enumerate all board-authored (user-authored) issues and comments
     * within a time window for a given company.
     */
    list: async (companyId: string, windowHours: number) => {
      const company = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const windowEnd = new Date();
      const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);

      // Board-authored issues: createdByUserId is set (not null)
      const boardIssues = await db
        .select({
          id: issues.id,
          identifier: issues.identifier,
          title: issues.title,
          status: issues.status,
          createdByUserId: issues.createdByUserId,
          createdAt: issues.createdAt,
        })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            isNotNull(issues.createdByUserId),
            gte(issues.createdAt, windowStart),
            isNull(issues.hiddenAt),
          ),
        )
        .orderBy(desc(issues.createdAt));

      // Board-authored comments: authorUserId is set (not null)
      // Join with issues to get the issue identifier
      const boardComments = await db
        .select({
          id: issueComments.id,
          issueId: issueComments.issueId,
          issueIdentifier: issues.identifier,
          authorUserId: issueComments.authorUserId,
          body: issueComments.body,
          createdAt: issueComments.createdAt,
        })
        .from(issueComments)
        .innerJoin(issues, eq(issueComments.issueId, issues.id))
        .where(
          and(
            eq(issueComments.companyId, companyId),
            isNotNull(issueComments.authorUserId),
            gte(issueComments.createdAt, windowStart),
          ),
        )
        .orderBy(desc(issueComments.createdAt));

      // Truncate comment bodies to a preview
      const commentsWithPreview = boardComments.map((c) => ({
        id: c.id,
        issueId: c.issueId,
        issueIdentifier: c.issueIdentifier,
        authorUserId: c.authorUserId,
        bodyPreview: c.body.length > 200 ? c.body.slice(0, 200) + "..." : c.body,
        createdAt: c.createdAt,
      }));

      return {
        companyId,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        windowHours,
        issues: boardIssues,
        comments: commentsWithPreview,
        summary: {
          totalIssues: boardIssues.length,
          totalComments: commentsWithPreview.length,
          totalSources: boardIssues.length + commentsWithPreview.length,
        },
      };
    },
  };
}
