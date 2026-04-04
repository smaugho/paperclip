import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { GitBranch } from "lucide-react";
import { workflowsApi } from "../api/workflows";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { timeAgo } from "../lib/timeAgo";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import type { WorkflowListItem } from "@paperclipai/shared";

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: "bg-green-500/10 text-green-600",
    draft: "bg-yellow-500/10 text-yellow-600",
    archived: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? colors.draft}`}>
      {status}
    </span>
  );
}

export function Workflows() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  useEffect(() => {
    setBreadcrumbs([{ label: "Workflows" }]);
  }, [setBreadcrumbs]);

  const { data: workflows, isLoading } = useQuery({
    queryKey: queryKeys.workflows.list(selectedCompanyId!),
    queryFn: () => workflowsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (isLoading) return <PageSkeleton />;

  if (!workflows?.length) {
    return (
      <EmptyState
        icon={GitBranch}
        message="No workflows yet. Create one from the API or CLI."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Agents</th>
              <th className="px-4 py-2 text-right">Active Runs</th>
              <th className="px-4 py-2">Last Run</th>
              <th className="px-4 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((wf: WorkflowListItem) => (
              <tr
                key={wf.id}
                className="cursor-pointer border-b last:border-b-0 hover:bg-accent/40 transition-colors"
                onClick={() => navigate(`/workflows/${wf.id}`)}
              >
                <td className="px-4 py-3 font-medium">{wf.name}</td>
                <td className="px-4 py-3">{statusBadge(wf.status)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{wf.assignmentCount}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{wf.activeRunCount}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {wf.lastRun ? timeAgo(wf.lastRun.createdAt) : "Never"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{timeAgo(wf.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
