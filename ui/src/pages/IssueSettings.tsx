import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { goalsApi } from "../api/goals";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { Field, HintIcon } from "../components/agent-config-primitives";
import { EmptyState } from "../components/EmptyState";
import { Settings, CircleDot } from "lucide-react";
import type { Goal } from "@paperclipai/shared";

function ReadOnlyValue({ value, mono }: { value: string; mono?: boolean }) {
  return (
    <div
      className={`rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm ${mono ? "font-mono" : ""} text-muted-foreground`}
    >
      {value}
    </div>
  );
}

function findDefaultCompanyGoal(goals: Goal[]): Goal | null {
  const companyGoals = goals.filter((g) => g.level === "company" && !g.parentId);
  const active = companyGoals.find((g) => g.status === "active");
  if (active) return active;
  return companyGoals[0] ?? null;
}

export function IssueSettings() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(selectedCompanyId!),
    queryFn: () => issuesApi.listLabels(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Issues", href: "/issues" },
      { label: "Settings" },
    ]);
  }, [setBreadcrumbs]);

  if (!selectedCompany || !selectedCompanyId) {
    return <EmptyState icon={CircleDot} message="Select a company to view issue settings." />;
  }

  const defaultGoal = goals ? findDefaultCompanyGoal(goals) : null;
  const fromBoardLabel = labels?.find((l) => l.name === "From Board") ?? null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Issue Settings</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Read-only view of the current issue configuration for this company.
        These settings reflect hardcoded defaults and active company state.
      </p>

      {/* Issue Identification */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Issue Identification
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label="Issue prefix" hint="The prefix used for all issue identifiers in this company (e.g. PAP-1, PAP-2).">
            <ReadOnlyValue value={selectedCompany.issuePrefix} mono />
          </Field>
          <Field label="Next issue number" hint="The next sequential number that will be assigned to a new issue.">
            <ReadOnlyValue value={String(selectedCompany.issueCounter + 1)} mono />
          </Field>
        </div>
      </div>

      {/* Default Behaviors */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Default Behaviors
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label="Default status" hint="The status assigned to new issues when no explicit status is provided.">
            <ReadOnlyValue value="backlog" />
          </Field>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/60">Hardcoded in schema. Not yet configurable per company.</span>
          </div>

          <div className="border-t border-border pt-3" />

          <Field label="Default priority" hint="The priority assigned to new issues when no explicit priority is provided.">
            <ReadOnlyValue value="medium" />
          </Field>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/60">Hardcoded in schema. Not yet configurable per company.</span>
          </div>
        </div>
      </div>

      {/* Goal Fallback */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Goal Fallback
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>When a new issue is created without an explicit goal, the system resolves one using this cascade:</p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Explicit <code className="text-[11px] bg-muted px-1 rounded">goalId</code> provided at creation time</li>
              <li>The goal linked to the issue's project (if any)</li>
              <li>The default company goal (shown below)</li>
            </ol>
          </div>

          <div className="border-t border-border pt-3" />

          <Field label="Default company goal" hint="The active root-level company goal used as fallback when no project goal applies.">
            {defaultGoal ? (
              <Link
                to={`/goals/${defaultGoal.id}`}
                className="block rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm hover:bg-accent/30 transition-colors"
              >
                <span className="font-medium">{defaultGoal.title}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  ({defaultGoal.status})
                </span>
              </Link>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm text-muted-foreground italic">
                No company-level goal found. Issues created without a project will not inherit a goal.
              </div>
            )}
          </Field>
        </div>
      </div>

      {/* Automatic Labeling */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Automatic Labeling
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">&quot;From Board&quot; auto-label</span>
              <HintIcon text="When a board user creates an issue, the system automatically applies a 'From Board' label to distinguish board-authored issues from agent-created ones." />
            </div>
            <span className="rounded-full bg-green-600/15 px-2 py-0.5 text-[10px] font-medium text-green-600">
              Active
            </span>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>This behavior is hardcoded in the issue creation service. When a board user creates an issue:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>The <strong>From Board</strong> label is looked up or created automatically</li>
              <li>It is applied to the new issue alongside any explicitly provided labels</li>
              <li>Agent-created issues are not affected</li>
            </ul>
          </div>

          <div className="border-t border-border pt-3" />

          <Field label="Label status" hint="Whether the 'From Board' label currently exists in this company.">
            {fromBoardLabel ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm">
                <span
                  className="inline-block h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: fromBoardLabel.color }}
                />
                <span>{fromBoardLabel.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">exists</span>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm text-muted-foreground italic">
                Not yet created. Will be auto-created on the first board-authored issue.
              </div>
            )}
          </Field>
        </div>
      </div>

      {/* Phase 2 recommendation */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Future Scope
        </div>
        <div className="rounded-md border border-dashed border-border px-4 py-4 text-xs text-muted-foreground space-y-2">
          <p>
            <strong>Phase 2 recommendation:</strong> A generalized auto-label rules engine that allows board users to define
            conditions and labels beyond the hardcoded &quot;From Board&quot; behavior.
          </p>
          <p>
            This could include rules like &quot;apply label X when issue is created by agent Y&quot; or &quot;apply label Z when
            issue matches origin kind W&quot;, replacing the current hardcoded logic with a configurable system.
          </p>
        </div>
      </div>
    </div>
  );
}
