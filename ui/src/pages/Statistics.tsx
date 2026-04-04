import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  IssueStatistics,
  AgentPerformanceRow,
  TokenUsageByAgent,
  TokenUsageByIssue,
  AgingIssueRow,
} from "@paperclipai/shared";
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Users,
  Coins,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
} from "lucide-react";
import { statisticsApi } from "../api/statistics";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useDateRange, PRESET_KEYS, PRESET_LABELS, type DatePreset } from "../hooks/useDateRange";
import { queryKeys } from "../lib/queryKeys";
import { formatCents, formatTokens } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { ChartCard } from "../components/ActivityCharts";
import { useNavigate } from "@/lib/router";

/* ---- Preset config for statistics page ---- */

const STAT_PRESETS: DatePreset[] = ["7d", "30d", "ytd", "all"];

/* ---- Small helper components ---- */

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClasses = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
  };
  return (
    <div className="border border-border rounded-lg p-4 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${toneClasses[tone ?? "default"]}`}>
        {value}
      </div>
      {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
    </div>
  );
}

function HorizontalBar({
  items,
  colorMap,
}: {
  items: Array<{ label: string; value: number }>;
  colorMap: Record<string, string>;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">No data</p>;

  return (
    <div className="space-y-2">
      <div className="flex h-5 rounded overflow-hidden">
        {items
          .filter((i) => i.value > 0)
          .map((item) => (
            <div
              key={item.label}
              className="h-full"
              style={{
                width: `${(item.value / total) * 100}%`,
                backgroundColor: colorMap[item.label] ?? "#6b7280",
                minWidth: item.value > 0 ? 4 : 0,
              }}
              title={`${item.label}: ${item.value}`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {items
          .filter((i) => i.value > 0)
          .map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: colorMap[item.label] ?? "#6b7280" }}
              />
              {item.label} ({item.value})
            </span>
          ))}
      </div>
    </div>
  );
}

/* ---- Created vs Closed chart ---- */

function CreatedVsClosedChart({
  data,
}: {
  data: Array<{ date: string; created: number; closed: number }>;
}) {
  if (data.length === 0) return <p className="text-xs text-muted-foreground">No data</p>;

  const maxValue = Math.max(...data.map((d) => Math.max(d.created, d.closed)), 1);

  return (
    <div>
      <div className="flex items-end gap-[3px] h-24">
        {data.map((day) => (
          <div key={day.date} className="flex-1 h-full flex flex-col justify-end gap-px" title={`${day.date}: ${day.created} created, ${day.closed} closed`}>
            <div className="flex gap-px items-end h-full">
              <div
                className="flex-1 bg-blue-500 rounded-t-sm"
                style={{ height: `${(day.created / maxValue) * 100}%`, minHeight: day.created > 0 ? 2 : 0 }}
              />
              <div
                className="flex-1 bg-emerald-500 rounded-t-sm"
                style={{ height: `${(day.closed / maxValue) * 100}%`, minHeight: day.closed > 0 ? 2 : 0 }}
              />
            </div>
          </div>
        ))}
      </div>
      {data.length > 0 && (
        <div className="flex gap-[3px] mt-1.5">
          {data.map((d, i) => (
            <div key={d.date} className="flex-1 text-center">
              {(i === 0 || i === Math.floor(data.length / 2) || i === data.length - 1) ? (
                <span className="text-[9px] text-muted-foreground tabular-nums">
                  {new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-x-3 mt-2">
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Created
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Closed
        </span>
      </div>
    </div>
  );
}

/* ---- Agent Performance Table ---- */

function AgentPerformanceTable({ rows }: { rows: AgentPerformanceRow[] }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No agent activity</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Agent</th>
            <th className="py-2 px-3 font-medium text-right">Completed</th>
            <th className="py-2 px-3 font-medium text-right">Runs</th>
            <th className="py-2 px-3 font-medium text-right">Success</th>
            <th className="py-2 px-3 font-medium text-right">Runs/Issue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.agentId} className="border-b border-border/50">
              <td className="py-2 pr-3 font-medium truncate max-w-[180px]">{row.agentName}</td>
              <td className="py-2 px-3 text-right tabular-nums">{row.issuesCompleted}</td>
              <td className="py-2 px-3 text-right tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">{row.successfulRuns}</span>
                {row.failedRuns > 0 && (
                  <span className="text-red-500 ml-1">/ {row.failedRuns}</span>
                )}
              </td>
              <td className="py-2 px-3 text-right tabular-nums">{row.successRate}%</td>
              <td className="py-2 px-3 text-right tabular-nums">{row.avgRunsPerCompletion ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Token Usage Table ---- */

function TokenUsageTable({ rows }: { rows: TokenUsageByAgent[] }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No token data</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Agent</th>
            <th className="py-2 px-3 font-medium text-right">Input</th>
            <th className="py-2 px-3 font-medium text-right">Output</th>
            <th className="py-2 px-3 font-medium text-right">Cached</th>
            <th className="py-2 px-3 font-medium text-right">Cost</th>
            <th className="py-2 px-3 font-medium text-right">Avg/Run</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.agentId} className="border-b border-border/50">
              <td className="py-2 pr-3 font-medium truncate max-w-[180px]">{row.agentName}</td>
              <td className="py-2 px-3 text-right tabular-nums font-mono">{formatTokens(row.totalInputTokens)}</td>
              <td className="py-2 px-3 text-right tabular-nums font-mono">{formatTokens(row.totalOutputTokens)}</td>
              <td className="py-2 px-3 text-right tabular-nums font-mono">{formatTokens(row.totalCachedTokens)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatCents(row.totalCostCents)}</td>
              <td className="py-2 px-3 text-right tabular-nums font-mono">{formatTokens(row.avgTokensPerRun)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Top Issues by Cost ---- */

function TopIssuesCostTable({ rows, companyPrefix }: { rows: TokenUsageByIssue[]; companyPrefix: string }) {
  const navigate = useNavigate();
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No cost data</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Issue</th>
            <th className="py-2 px-3 font-medium text-right">Input</th>
            <th className="py-2 px-3 font-medium text-right">Output</th>
            <th className="py-2 px-3 font-medium text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.issueId}
              className="border-b border-border/50 hover:bg-accent/30 cursor-pointer transition-colors"
              onClick={() => navigate(`/${companyPrefix}/issues/${row.issueId}`)}
            >
              <td className="py-2 pr-3">
                <span className="font-mono text-muted-foreground mr-1.5">{row.identifier}</span>
                <span className="truncate">{row.title}</span>
              </td>
              <td className="py-2 px-3 text-right tabular-nums font-mono">{formatTokens(row.totalInputTokens)}</td>
              <td className="py-2 px-3 text-right tabular-nums font-mono">{formatTokens(row.totalOutputTokens)}</td>
              <td className="py-2 px-3 text-right tabular-nums font-medium">{formatCents(row.totalCostCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Aging Issues Table ---- */

function AgingIssuesTable({ rows, companyPrefix }: { rows: AgingIssueRow[]; companyPrefix: string }) {
  const navigate = useNavigate();
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No aging issues</p>;

  return (
    <div className="overflow-x-auto max-h-64 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Issue</th>
            <th className="py-2 px-3 font-medium text-right">Days Open</th>
            <th className="py-2 px-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row) => (
            <tr
              key={row.id}
              className="border-b border-border/50 hover:bg-accent/30 cursor-pointer transition-colors"
              onClick={() => navigate(`/${companyPrefix}/issues/${row.id}`)}
            >
              <td className="py-1.5 pr-3">
                <span className="font-mono text-muted-foreground mr-1.5">{row.identifier}</span>
                <span className="truncate">{row.title}</span>
              </td>
              <td className="py-1.5 px-3 text-right tabular-nums font-medium">{row.daysOpen}d</td>
              <td className="py-1.5 px-3">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  row.status === "blocked" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                  row.status === "in_review" ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {row.status.replace("_", " ")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Time Range Selector ---- */

function TimeRangeSelector({
  preset,
  setPreset,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
}: {
  preset: DatePreset;
  setPreset: (p: DatePreset) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex rounded-lg border border-border overflow-hidden">
        {STAT_PRESETS.map((key) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              preset === key
                ? "bg-foreground text-background"
                : "bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            {PRESET_LABELS[key]}
          </button>
        ))}
        <button
          onClick={() => setPreset("custom")}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            preset === "custom"
              ? "bg-foreground text-background"
              : "bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          }`}
        >
          Custom
        </button>
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="border border-border rounded px-2 py-1 text-xs bg-background text-foreground"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="border border-border rounded px-2 py-1 text-xs bg-background text-foreground"
          />
        </div>
      )}
    </div>
  );
}

/* ---- Color maps ---- */

const priorityColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#6b7280",
};

const projectColors = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
  "#06b6d4", "#84cc16", "#a855f7", "#f43f5e", "#22c55e",
];

/* ---- Main Page ---- */

export function Statistics() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const companyPrefix = selectedCompany?.issuePrefix ?? "";

  useEffect(() => {
    setBreadcrumbs([{ label: "Statistics" }]);
  }, [setBreadcrumbs]);

  const dateRange = useDateRange();
  // Override default preset to 30d for statistics
  useEffect(() => {
    dateRange.setPreset("30d");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.statistics(selectedCompanyId!, dateRange.from, dateRange.to),
    queryFn: () => statisticsApi.summary(selectedCompanyId!, dateRange.from || undefined, dateRange.to || undefined),
    enabled: !!selectedCompanyId && dateRange.customReady,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={BarChart3} message="Select a company to view statistics." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (!data) {
    return <EmptyState icon={BarChart3} message="No statistics available." />;
  }

  const { velocity, agentPerformance, problemDetection, distribution, tokenUsage } = data;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header with time range selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-lg font-semibold">Issue Statistics</h1>
        <TimeRangeSelector
          preset={dateRange.preset}
          setPreset={dateRange.setPreset}
          customFrom={dateRange.customFrom}
          setCustomFrom={dateRange.setCustomFrom}
          customTo={dateRange.customTo}
          setCustomTo={dateRange.setCustomTo}
        />
      </div>

      {/* Velocity Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={TrendingUp}
          label="Completion Rate"
          value={`${velocity.completionRate}%`}
          subtitle={`${velocity.totalClosed} closed / ${velocity.totalCreated} created`}
          tone={velocity.completionRate >= 80 ? "success" : velocity.completionRate >= 50 ? "warning" : "danger"}
        />
        <StatCard
          icon={Clock}
          label="Avg Completion Time"
          value={velocity.avgCompletionHours != null ? `${velocity.avgCompletionHours}h` : "—"}
          subtitle="From start to done"
        />
        <StatCard
          icon={PauseCircle}
          label="Blocked Issues"
          value={velocity.blockedCount}
          subtitle={velocity.avgBlockedHours != null ? `Avg ${velocity.avgBlockedHours}h blocked` : undefined}
          tone={velocity.blockedCount > 10 ? "danger" : velocity.blockedCount > 5 ? "warning" : "default"}
        />
        <StatCard
          icon={AlertTriangle}
          label="Unassigned"
          value={problemDetection.unassignedCount}
          subtitle="Open issues without assignee"
          tone={problemDetection.unassignedCount > 5 ? "warning" : "default"}
        />
      </div>

      {/* Created vs Closed + Priority Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Issues Created vs Closed" subtitle="Over selected time range">
          <CreatedVsClosedChart data={velocity.createdVsClosed} />
        </ChartCard>

        <ChartCard title="Priority Distribution" subtitle="Active issues">
          <HorizontalBar
            items={distribution.byPriority.map((p) => ({
              label: p.priority.charAt(0).toUpperCase() + p.priority.slice(1),
              value: p.count,
            }))}
            colorMap={{
              Critical: priorityColors.critical,
              High: priorityColors.high,
              Medium: priorityColors.medium,
              Low: priorityColors.low,
            }}
          />
        </ChartCard>
      </div>

      {/* Agent Performance + Assignment Balance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Agent Performance" subtitle="Runs, completions, and success rate">
          <AgentPerformanceTable rows={agentPerformance} />
        </ChartCard>

        <ChartCard title="Assignment Balance" subtitle="Active issues per agent">
          <HorizontalBar
            items={distribution.byAssignee.map((a) => ({
              label: a.agentName,
              value: a.count,
            }))}
            colorMap={Object.fromEntries(
              distribution.byAssignee.map((a, i) => [a.agentName, projectColors[i % projectColors.length]]),
            )}
          />
        </ChartCard>
      </div>

      {/* Project Distribution */}
      <ChartCard title="Issues by Project" subtitle="Active issues">
        <HorizontalBar
          items={distribution.byProject.map((p) => ({
            label: p.projectName,
            value: p.count,
          }))}
          colorMap={Object.fromEntries(
            distribution.byProject.map((p, i) => [p.projectName, projectColors[i % projectColors.length]]),
          )}
        />
      </ChartCard>

      {/* Token Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Token Usage by Agent" subtitle="Input, output, cached tokens and cost">
          <TokenUsageTable rows={tokenUsage.byAgent} />
        </ChartCard>

        <ChartCard title="Most Expensive Issues" subtitle="Top 20 by total cost">
          <TopIssuesCostTable rows={tokenUsage.topIssues} companyPrefix={companyPrefix} />
        </ChartCard>
      </div>

      {/* Problem Detection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Aging Issues"
          subtitle={`${problemDetection.agingIssues.length} issues open > 7 days`}
        >
          <AgingIssuesTable rows={problemDetection.agingIssues} companyPrefix={companyPrefix} />
        </ChartCard>

        <ChartCard
          title="Stuck in Review"
          subtitle={`${problemDetection.stuckInReview.length} issues in review`}
        >
          {problemDetection.stuckInReview.length === 0 ? (
            <p className="text-xs text-muted-foreground">No issues stuck in review</p>
          ) : (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Issue</th>
                    <th className="py-2 px-3 font-medium text-right">Days in Review</th>
                  </tr>
                </thead>
                <tbody>
                  {problemDetection.stuckInReview.map((row) => (
                    <tr key={row.id} className="border-b border-border/50">
                      <td className="py-1.5 pr-3">
                        <span className="font-mono text-muted-foreground mr-1.5">{row.identifier}</span>
                        <span className="truncate">{row.title}</span>
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-medium">{row.daysInReview}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
