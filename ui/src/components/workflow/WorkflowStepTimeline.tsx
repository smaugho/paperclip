import { CheckCircle2, Circle, Loader2, XCircle, SkipForward } from "lucide-react";
import { cn } from "../../lib/utils";
import { relativeTime } from "../../lib/utils";
import type { WorkflowStep, WorkflowStepStatus } from "./fixtures";

interface WorkflowStepTimelineProps {
  steps: WorkflowStep[];
  /** ID of the currently active step (highlighted). */
  currentStepId?: string | null;
  className?: string;
}

const statusConfig: Record<
  WorkflowStepStatus,
  { icon: typeof Circle; color: string; label: string }
> = {
  completed: {
    icon: CheckCircle2,
    color: "text-green-600 dark:text-green-400",
    label: "Completed",
  },
  active: {
    icon: Loader2,
    color: "text-yellow-600 dark:text-yellow-400",
    label: "Active",
  },
  pending: {
    icon: Circle,
    color: "text-muted-foreground",
    label: "Pending",
  },
  failed: {
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    label: "Failed",
  },
  skipped: {
    icon: SkipForward,
    color: "text-muted-foreground",
    label: "Skipped",
  },
};

/**
 * Ordered step timeline for a workflow run. Shows each step's status,
 * timestamps, and collapsible result summary.
 *
 * Future integration points:
 * - Steps will come from `GET /api/workflows/:workflowId/runs/:runId` → `steps[]`.
 * - `currentStepId` will map to the run's `currentStepId` field.
 * - Step-to-Mermaid-node linking (for active-step diagram highlighting) is deferred to V2.
 */
export function WorkflowStepTimeline({
  steps,
  currentStepId,
  className,
}: WorkflowStepTimelineProps) {
  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Step Timeline</h3>
      </div>
      <ol className="divide-y">
        {steps.map((step, index) => {
          const config = statusConfig[step.status];
          const Icon = config.icon;
          const isCurrent = step.id === currentStepId;
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.id}
              className={cn(
                "relative flex gap-3 px-4 py-3",
                isCurrent && "bg-yellow-50/50 dark:bg-yellow-900/10",
              )}
            >
              {/* Vertical connector line */}
              {!isLast && (
                <div
                  className="absolute left-[1.625rem] top-9 bottom-0 w-px bg-border"
                  aria-hidden
                />
              )}

              {/* Status icon */}
              <div className="relative z-10 flex shrink-0 items-start pt-0.5">
                <Icon
                  className={cn(
                    "h-4 w-4",
                    config.color,
                    step.status === "active" && "animate-spin",
                  )}
                />
              </div>

              {/* Step content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {step.name}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                      step.status === "completed" &&
                        "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
                      step.status === "active" &&
                        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
                      step.status === "pending" && "bg-muted text-muted-foreground",
                      step.status === "failed" &&
                        "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
                      step.status === "skipped" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {config.label}
                  </span>
                </div>

                {/* Timestamps */}
                <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
                  {step.startedAt && (
                    <span>Started {relativeTime(step.startedAt)}</span>
                  )}
                  {step.completedAt && (
                    <span>
                      Finished {relativeTime(step.completedAt)}
                    </span>
                  )}
                </div>

                {/* Result summary */}
                {step.result && (
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {step.result}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
