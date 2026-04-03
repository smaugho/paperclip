import { MarkdownBody } from "../MarkdownBody";
import { cn } from "../../lib/utils";

interface WorkflowDiagramProps {
  /** Mermaid source string (compiled by backend from workflow YAML definition). */
  source: string;
  /** Optional title rendered above the diagram. */
  title?: string;
  className?: string;
}

/**
 * Thin wrapper that renders a backend-compiled Mermaid diagram using the
 * existing MarkdownBody Mermaid rendering path.
 *
 * Future integration points:
 * - The `source` prop will come from `GET /api/workflows/:id` → `compiledMermaid` field.
 * - Active-step highlighting is deferred to V2 (requires backend step-to-node mapping).
 */
export function WorkflowDiagram({ source, title, className }: WorkflowDiagramProps) {
  const markdown = `\`\`\`mermaid\n${source}\n\`\`\``;

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      {title && (
        <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      )}
      <div className="overflow-x-auto">
        <MarkdownBody>{markdown}</MarkdownBody>
      </div>
    </div>
  );
}
