import { and, eq, gte, lt, sql, isNull, isNotNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, costEvents, heartbeatRuns, issues, projects } from "@paperclipai/db";
import type { IssueStatistics } from "@paperclipai/shared";

interface TimeRange {
  from: Date | null;
  to: Date | null;
}

export function statisticsService(db: Db) {
  return {
    summary: async (companyId: string, range: TimeRange): Promise<IssueStatistics> => {
      const companyFilter = eq(issues.companyId, companyId);
      const rangeConds = [];
      if (range.from) rangeConds.push(gte(issues.createdAt, range.from));
      if (range.to) rangeConds.push(lt(issues.createdAt, range.to));

      // ---- Velocity ----

      // Issues created in range
      const [createdRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(companyFilter, ...rangeConds));
      const totalCreated = Number(createdRow?.count ?? 0);

      // Issues closed in range (completedAt within range)
      const closedConds = [companyFilter];
      if (range.from) closedConds.push(gte(issues.completedAt, range.from));
      if (range.to) closedConds.push(lt(issues.completedAt, range.to));
      closedConds.push(isNotNull(issues.completedAt));

      const [closedRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(...closedConds));
      const totalClosed = Number(closedRow?.count ?? 0);

      // Average completion time (hours) for issues completed in range
      const [avgCompRow] = await db
        .select({
          avgHours: sql<number>`avg(extract(epoch from (${issues.completedAt} - ${issues.startedAt})) / 3600.0)`,
        })
        .from(issues)
        .where(
          and(
            companyFilter,
            isNotNull(issues.completedAt),
            isNotNull(issues.startedAt),
            ...(range.from ? [gte(issues.completedAt, range.from)] : []),
            ...(range.to ? [lt(issues.completedAt, range.to)] : []),
          ),
        );
      const avgCompletionHours = avgCompRow?.avgHours != null ? Math.round(Number(avgCompRow.avgHours) * 10) / 10 : null;

      // Blocked issues (currently blocked regardless of range)
      const [blockedRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(companyFilter, eq(issues.status, "blocked")));
      const blockedCount = Number(blockedRow?.count ?? 0);

      // Avg time blocked (hours) — how long current blocked issues have been updated
      const [avgBlockedRow] = await db
        .select({
          avgHours: sql<number>`avg(extract(epoch from (now() - ${issues.updatedAt})) / 3600.0)`,
        })
        .from(issues)
        .where(and(companyFilter, eq(issues.status, "blocked")));
      const avgBlockedHours = avgBlockedRow?.avgHours != null ? Math.round(Number(avgBlockedRow.avgHours) * 10) / 10 : null;

      // Created vs closed time series (daily buckets)
      const createdSeries = await db
        .select({
          date: sql<string>`to_char(${issues.createdAt}::date, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(and(companyFilter, ...rangeConds))
        .groupBy(sql`${issues.createdAt}::date`)
        .orderBy(sql`${issues.createdAt}::date`);

      const closedSeries = await db
        .select({
          date: sql<string>`to_char(${issues.completedAt}::date, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(
          and(
            companyFilter,
            isNotNull(issues.completedAt),
            ...(range.from ? [gte(issues.completedAt, range.from)] : []),
            ...(range.to ? [lt(issues.completedAt, range.to)] : []),
          ),
        )
        .groupBy(sql`${issues.completedAt}::date`)
        .orderBy(sql`${issues.completedAt}::date`);

      // Merge created/closed into a single series
      const dateMap = new Map<string, { created: number; closed: number }>();
      for (const row of createdSeries) {
        const existing = dateMap.get(row.date) ?? { created: 0, closed: 0 };
        existing.created = Number(row.count);
        dateMap.set(row.date, existing);
      }
      for (const row of closedSeries) {
        const existing = dateMap.get(row.date) ?? { created: 0, closed: 0 };
        existing.closed = Number(row.count);
        dateMap.set(row.date, existing);
      }
      const createdVsClosed = Array.from(dateMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({ date, ...vals }));

      const completionRate = totalCreated > 0 ? Math.round((totalClosed / totalCreated) * 100 * 10) / 10 : 0;

      // ---- Agent Performance ----
      const runRangeConds = [eq(heartbeatRuns.companyId, companyId)];
      if (range.from) runRangeConds.push(gte(heartbeatRuns.createdAt, range.from));
      if (range.to) runRangeConds.push(lt(heartbeatRuns.createdAt, range.to));

      const agentRunStats = await db
        .select({
          agentId: heartbeatRuns.agentId,
          agentName: agents.name,
          totalRuns: sql<number>`count(*)::int`,
          successfulRuns: sql<number>`count(*) filter (where ${heartbeatRuns.status} = 'succeeded')::int`,
          failedRuns: sql<number>`count(*) filter (where ${heartbeatRuns.status} in ('failed', 'timed_out'))::int`,
        })
        .from(heartbeatRuns)
        .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
        .where(and(...runRangeConds))
        .groupBy(heartbeatRuns.agentId, agents.name);

      // Issues completed per agent in range
      const agentCompletions = await db
        .select({
          agentId: issues.assigneeAgentId,
          completed: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(
          and(
            companyFilter,
            isNotNull(issues.assigneeAgentId),
            isNotNull(issues.completedAt),
            ...(range.from ? [gte(issues.completedAt, range.from)] : []),
            ...(range.to ? [lt(issues.completedAt, range.to)] : []),
          ),
        )
        .groupBy(issues.assigneeAgentId);

      const completionMap = new Map(agentCompletions.map((r) => [r.agentId, Number(r.completed)]));

      const agentPerformance = agentRunStats.map((row) => {
        const issuesCompleted = completionMap.get(row.agentId) ?? 0;
        const totalRuns = Number(row.totalRuns);
        const successfulRuns = Number(row.successfulRuns);
        const failedRuns = Number(row.failedRuns);
        return {
          agentId: row.agentId,
          agentName: row.agentName,
          issuesCompleted,
          totalRuns,
          successfulRuns,
          failedRuns,
          successRate: totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100 * 10) / 10 : 0,
          avgRunsPerCompletion: issuesCompleted > 0 ? Math.round((totalRuns / issuesCompleted) * 10) / 10 : null,
        };
      });

      // ---- Problem Detection ----

      // Aging issues: open > 7 days, not done/cancelled
      const agingIssues = await db
        .select({
          id: issues.id,
          identifier: issues.identifier,
          title: issues.title,
          status: issues.status,
          assigneeAgentId: issues.assigneeAgentId,
          daysOpen: sql<number>`extract(day from (now() - ${issues.createdAt}))::int`,
        })
        .from(issues)
        .where(
          and(
            companyFilter,
            sql`${issues.status} not in ('done', 'cancelled')`,
            sql`${issues.createdAt} < now() - interval '7 days'`,
          ),
        )
        .orderBy(sql`${issues.createdAt} asc`)
        .limit(50);

      // Issues stuck in_review
      const stuckInReview = await db
        .select({
          id: issues.id,
          identifier: issues.identifier,
          title: issues.title,
          daysInReview: sql<number>`extract(day from (now() - ${issues.updatedAt}))::int`,
        })
        .from(issues)
        .where(and(companyFilter, eq(issues.status, "in_review")))
        .orderBy(sql`${issues.updatedAt} asc`);

      // Unassigned open issues
      const [unassignedRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(
          and(
            companyFilter,
            isNull(issues.assigneeAgentId),
            isNull(issues.assigneeUserId),
            sql`${issues.status} not in ('done', 'cancelled')`,
          ),
        );
      const unassignedCount = Number(unassignedRow?.count ?? 0);

      // ---- Distribution ----

      // By project (active issues)
      const byProject = await db
        .select({
          projectId: issues.projectId,
          projectName: sql<string>`coalesce(${projects.name}, 'No Project')`,
          count: sql<number>`count(*)::int`,
        })
        .from(issues)
        .leftJoin(projects, eq(issues.projectId, projects.id))
        .where(
          and(
            companyFilter,
            sql`${issues.status} not in ('done', 'cancelled')`,
          ),
        )
        .groupBy(issues.projectId, projects.name)
        .orderBy(sql`count(*) desc`);

      // By priority (active issues)
      const byPriority = await db
        .select({
          priority: issues.priority,
          count: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(
          and(
            companyFilter,
            sql`${issues.status} not in ('done', 'cancelled')`,
          ),
        )
        .groupBy(issues.priority)
        .orderBy(sql`count(*) desc`);

      // By assignee (active issues)
      const byAssignee = await db
        .select({
          agentId: issues.assigneeAgentId,
          agentName: sql<string>`coalesce(${agents.name}, 'Unassigned')`,
          count: sql<number>`count(*)::int`,
        })
        .from(issues)
        .leftJoin(agents, eq(issues.assigneeAgentId, agents.id))
        .where(
          and(
            companyFilter,
            sql`${issues.status} not in ('done', 'cancelled')`,
          ),
        )
        .groupBy(issues.assigneeAgentId, agents.name)
        .orderBy(sql`count(*) desc`);

      // ---- Token Usage ----

      const costRangeConds = [eq(costEvents.companyId, companyId)];
      if (range.from) costRangeConds.push(gte(costEvents.occurredAt, range.from));
      if (range.to) costRangeConds.push(lt(costEvents.occurredAt, range.to));

      // Token usage by agent
      const tokenByAgent = await db
        .select({
          agentId: costEvents.agentId,
          agentName: agents.name,
          totalInputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          totalOutputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
          totalCachedTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)::int`,
          totalCostCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          runCount: sql<number>`count(distinct ${costEvents.heartbeatRunId})::int`,
        })
        .from(costEvents)
        .innerJoin(agents, eq(costEvents.agentId, agents.id))
        .where(and(...costRangeConds))
        .groupBy(costEvents.agentId, agents.name)
        .orderBy(sql`sum(${costEvents.costCents}) desc`);

      const tokenUsageByAgent = tokenByAgent.map((row) => {
        const totalTokens = Number(row.totalInputTokens) + Number(row.totalOutputTokens) + Number(row.totalCachedTokens);
        const runCount = Number(row.runCount);
        return {
          agentId: row.agentId,
          agentName: row.agentName,
          totalInputTokens: Number(row.totalInputTokens),
          totalOutputTokens: Number(row.totalOutputTokens),
          totalCachedTokens: Number(row.totalCachedTokens),
          totalCostCents: Number(row.totalCostCents),
          avgTokensPerRun: runCount > 0 ? Math.round(totalTokens / runCount) : 0,
        };
      });

      // Token usage by issue (top 20 most expensive)
      const tokenByIssue = await db
        .select({
          issueId: costEvents.issueId,
          identifier: issues.identifier,
          title: issues.title,
          totalInputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          totalOutputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
          totalCostCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
        })
        .from(costEvents)
        .innerJoin(issues, eq(costEvents.issueId, issues.id))
        .where(and(...costRangeConds, isNotNull(costEvents.issueId)))
        .groupBy(costEvents.issueId, issues.identifier, issues.title)
        .orderBy(sql`sum(${costEvents.costCents}) desc`)
        .limit(20);

      return {
        timeRange: {
          from: range.from?.toISOString() ?? "",
          to: range.to?.toISOString() ?? "",
        },
        velocity: {
          totalCreated,
          totalClosed,
          completionRate,
          avgCompletionHours,
          blockedCount,
          avgBlockedHours,
          createdVsClosed,
        },
        agentPerformance,
        problemDetection: {
          agingIssues: agingIssues.map((r) => ({
            id: r.id,
            identifier: r.identifier ?? r.id,
            title: r.title,
            daysOpen: Number(r.daysOpen),
            status: r.status,
            assigneeAgentId: r.assigneeAgentId,
          })),
          stuckInReview: stuckInReview.map((r) => ({
            id: r.id,
            identifier: r.identifier ?? r.id,
            title: r.title,
            daysInReview: Number(r.daysInReview),
          })),
          unassignedCount,
        },
        distribution: {
          byProject: byProject.map((r) => ({
            projectId: r.projectId,
            projectName: r.projectName,
            count: Number(r.count),
          })),
          byPriority: byPriority.map((r) => ({
            priority: r.priority,
            count: Number(r.count),
          })),
          byAssignee: byAssignee.map((r) => ({
            agentId: r.agentId,
            agentName: r.agentName,
            count: Number(r.count),
          })),
        },
        tokenUsage: {
          byAgent: tokenUsageByAgent,
          topIssues: tokenByIssue.map((r) => ({
            issueId: r.issueId!,
            identifier: r.identifier ?? r.issueId!,
            title: r.title,
            totalInputTokens: Number(r.totalInputTokens),
            totalOutputTokens: Number(r.totalOutputTokens),
            totalCostCents: Number(r.totalCostCents),
          })),
        },
      };
    },
  };
}
