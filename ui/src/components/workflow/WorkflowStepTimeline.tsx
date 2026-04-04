import { CheckCircle2, Circle, Loader2, XCircle, SkipForward } from "lucide-react";
import { cn, relativeTime } from "../../lib/utils";
import type { WorkflowRunStep } from "@paperclipai/shared";

type UIStepStatus = "completed" | "active" | "pending" | "failed" | "skipped";

const statusConfig: Record<UIStepStatus, { icon: typeof Circle; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
  active: { icon: Loader2, color: "text-blue-500", label: "Active" },
  pending: { icon: Circle, color: "text-muted-foreground", label: "Pending" },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed" },
  skipped: { icon: SkipForward, color: "text-muted-foreground/60", label: "Skipped" },
};

function mapBackendStatus(status: string): UIStepStatus {
  switch (status) {
    case "accepted":
    case "submitted":
      return "completed";
    case "active":
      return "active";
    case "rejected":
      return "failed";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

interface WorkflowStepTimelineProps {
  steps: WorkflowRunStep[];
  currentStepKey?: string | null;
  className?: string;
}

export function WorkflowStepTimeline({ steps, currentStepKey, className }: WorkflowStepTimelineProps) {
  const sorted = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);

  return (
    <div className={cn("space-y-0", className)}>
      {sorted.map((step, i) => {
        const uiStatus = step.stepKey === currentStepKey && step.status === "pending"
          ? "active"
          : mapBackendStatus(step.status);
        const config = statusConfig[uiStatus];
        const Icon = config.icon;
        const isLast = i === sorted.length - 1;

        return (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Icon
                className={cn("h-5 w-5 shrink-0", config.color, uiStatus === "active" && "animate-spin")}
              />
              {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className={cn("pb-4", isLast && "pb-0")}>
              <p className="text-sm font-medium leading-5">{step.stepKey}</p>
              <p className="text-xs text-muted-foreground">
                {config.label}
                {step.startedAt && ` \u00b7 started ${relativeTime(step.startedAt)}`}
                {step.completedAt && ` \u00b7 completed ${relativeTime(step.completedAt)}`}
              </p>
              {step.submissionJson && (
                <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted/30 p-2 text-xs">
                  {JSON.stringify(step.submissionJson, null, 2)}
                </pre>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
