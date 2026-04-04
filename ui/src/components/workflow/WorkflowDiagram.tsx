import { MarkdownBody } from "../MarkdownBody";
import { cn } from "../../lib/utils";

interface WorkflowDiagramProps {
  source: string;
  title?: string;
  className?: string;
}

export function WorkflowDiagram({ source, title, className }: WorkflowDiagramProps) {
  const markdown = `\`\`\`mermaid\n${source}\n\`\`\``;

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      {title && <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>}
      <div className="overflow-x-auto">
        <MarkdownBody>{markdown}</MarkdownBody>
      </div>
    </div>
  );
}
