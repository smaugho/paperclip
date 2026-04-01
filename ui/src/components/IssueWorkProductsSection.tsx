import { useQuery } from "@tanstack/react-query";
import type { IssueWorkProduct } from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "../lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  FileText,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Package,
  Server,
  Star,
  Link2,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const TYPE_META: Record<string, { icon: typeof GitPullRequest; label: string }> = {
  pull_request: { icon: GitPullRequest, label: "Pull Request" },
  branch: { icon: GitBranch, label: "Branch" },
  commit: { icon: GitCommit, label: "Commit" },
  document: { icon: FileText, label: "Document" },
  preview_url: { icon: ExternalLink, label: "Preview" },
  artifact: { icon: Package, label: "Artifact" },
  runtime_service: { icon: Server, label: "Service" },
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-700 dark:text-green-400",
  draft: "bg-muted text-muted-foreground",
  ready_for_review: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  approved: "bg-green-500/15 text-green-700 dark:text-green-400",
  changes_requested: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  merged: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  closed: "bg-muted text-muted-foreground",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400",
  archived: "bg-muted text-muted-foreground",
};

const REVIEW_STATE_COLORS: Record<string, string> = {
  needs_board_review: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  approved: "bg-green-500/15 text-green-700 dark:text-green-400",
  changes_requested: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

/* -------------------------------------------------------------------------- */
/*  Work Product Row                                                           */
/* -------------------------------------------------------------------------- */

function WorkProductRow({ wp }: { wp: IssueWorkProduct }) {
  const meta = TYPE_META[wp.type] ?? { icon: Link2, label: wp.type };
  const Icon = meta.icon;

  return (
    <div className="flex items-start gap-2 rounded-md border border-border p-2 text-xs">
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1 space-y-1">
        {/* Title + primary marker */}
        <div className="flex items-center gap-1.5">
          {wp.isPrimary && (
            <Star className="h-3 w-3 shrink-0 text-yellow-500 fill-yellow-500" />
          )}
          {wp.url ? (
            <a
              href={wp.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground hover:underline truncate"
            >
              {wp.title || meta.label}
            </a>
          ) : (
            <span className="font-medium text-foreground truncate">
              {wp.title || meta.label}
            </span>
          )}
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              STATUS_COLORS[wp.status] ?? STATUS_COLORS.active,
            )}
          >
            {formatLabel(String(wp.status))}
          </span>

          {wp.reviewState && wp.reviewState !== "none" && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                REVIEW_STATE_COLORS[wp.reviewState] ?? "bg-muted text-muted-foreground",
              )}
            >
              {formatLabel(wp.reviewState)}
            </span>
          )}

          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-auto">
            {meta.label}
          </Badge>

          {wp.provider && wp.provider !== "custom" && (
            <span className="text-[10px] text-muted-foreground">
              {wp.provider}
            </span>
          )}
        </div>

        {/* Summary preview */}
        {wp.summary && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">
            {wp.summary}
          </p>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground">
          {relativeTime(wp.updatedAt)}
        </span>
      </div>

      {/* External link icon */}
      {wp.url && (
        <a
          href={wp.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 p-0.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"
          title="Open link"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                             */
/* -------------------------------------------------------------------------- */

interface IssueWorkProductsSectionProps {
  issueId: string;
}

export function IssueWorkProductsSection({ issueId }: IssueWorkProductsSectionProps) {
  const { data: workProducts, isLoading } = useQuery({
    queryKey: queryKeys.issues.workProducts(issueId),
    queryFn: () => issuesApi.listWorkProducts(issueId),
  });

  if (isLoading || !workProducts || workProducts.length === 0) return null;

  const sorted = [...workProducts].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
        <Package className="h-3.5 w-3.5" />
        Work Products
        <span className="text-[10px] font-normal">({workProducts.length})</span>
      </h3>
      <div className="space-y-1.5">
        {sorted.map((wp) => (
          <WorkProductRow key={wp.id} wp={wp} />
        ))}
      </div>
    </div>
  );
}
