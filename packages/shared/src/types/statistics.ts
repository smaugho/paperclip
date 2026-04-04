export interface IssueStatisticsVelocity {
  totalCreated: number;
  totalClosed: number;
  completionRate: number;
  avgCompletionHours: number | null;
  blockedCount: number;
  avgBlockedHours: number | null;
  createdVsClosed: Array<{ date: string; created: number; closed: number }>;
}

export interface AgentPerformanceRow {
  agentId: string;
  agentName: string;
  issuesCompleted: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  avgRunsPerCompletion: number | null;
}

export interface AgingIssueRow {
  id: string;
  identifier: string;
  title: string;
  daysOpen: number;
  status: string;
  assigneeAgentId: string | null;
}

export interface IssueStatisticsProblemDetection {
  agingIssues: AgingIssueRow[];
  stuckInReview: Array<{
    id: string;
    identifier: string;
    title: string;
    daysInReview: number;
  }>;
  unassignedCount: number;
}

export interface IssueStatisticsDistribution {
  byProject: Array<{ projectId: string | null; projectName: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  byAssignee: Array<{ agentId: string | null; agentName: string; count: number }>;
}

export interface TokenUsageByAgent {
  agentId: string;
  agentName: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalCostCents: number;
  avgTokensPerRun: number;
}

export interface TokenUsageByIssue {
  issueId: string;
  identifier: string;
  title: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
}

export interface IssueStatisticsTokenUsage {
  byAgent: TokenUsageByAgent[];
  topIssues: TokenUsageByIssue[];
}

export interface IssueStatistics {
  timeRange: { from: string; to: string };
  velocity: IssueStatisticsVelocity;
  agentPerformance: AgentPerformanceRow[];
  problemDetection: IssueStatisticsProblemDetection;
  distribution: IssueStatisticsDistribution;
  tokenUsage: IssueStatisticsTokenUsage;
}
