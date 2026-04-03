/**
 * Mocked fixture data for workflow components.
 *
 * These fixtures drive the WorkflowDiagram and WorkflowStepTimeline
 * components during the presentational prototype phase. They will be
 * replaced by real API data once the backend workflow contract
 * (DSPA-1365) is implemented and wired.
 */

// ---------------------------------------------------------------------------
// Workflow step status — mirrors the expected backend contract
// ---------------------------------------------------------------------------

export type WorkflowStepStatus = "completed" | "active" | "pending" | "failed" | "skipped";

// ---------------------------------------------------------------------------
// Workflow step — a single step in a workflow run
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  id: string;
  name: string;
  status: WorkflowStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  result?: string | null;
}

// ---------------------------------------------------------------------------
// Workflow run — a single execution of a workflow
// ---------------------------------------------------------------------------

export interface WorkflowRun {
  id: string;
  workflowId: string;
  agentId: string;
  agentName: string;
  status: "active" | "completed" | "failed" | "waiting";
  currentStepId: string | null;
  parentRunId: string | null;
  childRunIds: string[];
  steps: WorkflowStep[];
  startedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Mermaid diagram source — example workflow definition compiled to Mermaid
// ---------------------------------------------------------------------------

export const MOCK_WORKFLOW_MERMAID = `graph TD
    A([Start]) --> B[Validate Input]
    B --> C{Input Valid?}
    C -- Yes --> D[Assign Agent]
    C -- No --> E[Request Correction]
    E --> B
    D --> F[Execute Task]
    F --> G{Task Succeeded?}
    G -- Yes --> H[Post Results]
    G -- No --> I[Retry or Escalate]
    I --> F
    H --> J([End])`;

export const MOCK_ONBOARDING_MERMAID = `graph LR
    A([Hire Request]) --> B[Create Agent Record]
    B --> C[Generate API Key]
    C --> D[Install Skills]
    D --> E{Adapter Ready?}
    E -- Yes --> F[Assign First Task]
    E -- No --> G[Configure Adapter]
    G --> E
    F --> H([Agent Active])`;

// ---------------------------------------------------------------------------
// Mock workflow run — a completed run with step history
// ---------------------------------------------------------------------------

export const MOCK_COMPLETED_RUN: WorkflowRun = {
  id: "run-001",
  workflowId: "wf-task-execution",
  agentId: "agent-coder-001",
  agentName: "Paperclip Frontend Engineer",
  status: "completed",
  currentStepId: null,
  parentRunId: null,
  childRunIds: ["run-002"],
  steps: [
    {
      id: "step-1",
      name: "Validate Input",
      status: "completed",
      startedAt: "2026-04-03T10:00:00Z",
      completedAt: "2026-04-03T10:00:05Z",
      result: "Input schema validated successfully.",
    },
    {
      id: "step-2",
      name: "Assign Agent",
      status: "completed",
      startedAt: "2026-04-03T10:00:05Z",
      completedAt: "2026-04-03T10:00:08Z",
      result: "Assigned to Paperclip Frontend Engineer.",
    },
    {
      id: "step-3",
      name: "Execute Task",
      status: "completed",
      startedAt: "2026-04-03T10:00:08Z",
      completedAt: "2026-04-03T10:05:30Z",
      result: "Task completed with 3 commits.",
    },
    {
      id: "step-4",
      name: "Post Results",
      status: "completed",
      startedAt: "2026-04-03T10:05:30Z",
      completedAt: "2026-04-03T10:05:32Z",
      result: "Results posted to issue DSPA-1407.",
    },
  ],
  startedAt: "2026-04-03T10:00:00Z",
  completedAt: "2026-04-03T10:05:32Z",
};

// ---------------------------------------------------------------------------
// Mock workflow run — an active run mid-execution
// ---------------------------------------------------------------------------

export const MOCK_ACTIVE_RUN: WorkflowRun = {
  id: "run-003",
  workflowId: "wf-task-execution",
  agentId: "agent-coder-001",
  agentName: "Technical Lead",
  status: "active",
  currentStepId: "step-3",
  parentRunId: "run-001",
  childRunIds: [],
  steps: [
    {
      id: "step-1",
      name: "Validate Input",
      status: "completed",
      startedAt: "2026-04-03T14:00:00Z",
      completedAt: "2026-04-03T14:00:03Z",
      result: "Input schema validated successfully.",
    },
    {
      id: "step-2",
      name: "Assign Agent",
      status: "completed",
      startedAt: "2026-04-03T14:00:03Z",
      completedAt: "2026-04-03T14:00:06Z",
      result: "Assigned to Technical Lead.",
    },
    {
      id: "step-3",
      name: "Execute Task",
      status: "active",
      startedAt: "2026-04-03T14:00:06Z",
      completedAt: null,
      result: null,
    },
    {
      id: "step-4",
      name: "Post Results",
      status: "pending",
      startedAt: null,
      completedAt: null,
      result: null,
    },
  ],
  startedAt: "2026-04-03T14:00:00Z",
  completedAt: null,
};

// ---------------------------------------------------------------------------
// Mock workflow run — a failed run
// ---------------------------------------------------------------------------

export const MOCK_FAILED_RUN: WorkflowRun = {
  id: "run-004",
  workflowId: "wf-onboarding",
  agentId: "agent-director-001",
  agentName: "Director",
  status: "failed",
  currentStepId: "step-4",
  parentRunId: null,
  childRunIds: [],
  steps: [
    {
      id: "step-1",
      name: "Create Agent Record",
      status: "completed",
      startedAt: "2026-04-03T09:00:00Z",
      completedAt: "2026-04-03T09:00:02Z",
      result: "Agent record created.",
    },
    {
      id: "step-2",
      name: "Generate API Key",
      status: "completed",
      startedAt: "2026-04-03T09:00:02Z",
      completedAt: "2026-04-03T09:00:04Z",
      result: "API key generated and stored.",
    },
    {
      id: "step-3",
      name: "Install Skills",
      status: "completed",
      startedAt: "2026-04-03T09:00:04Z",
      completedAt: "2026-04-03T09:00:10Z",
      result: "3 skills installed.",
    },
    {
      id: "step-4",
      name: "Configure Adapter",
      status: "failed",
      startedAt: "2026-04-03T09:00:10Z",
      completedAt: "2026-04-03T09:00:15Z",
      result: "Adapter configuration failed: missing cwd parameter.",
    },
    {
      id: "step-5",
      name: "Assign First Task",
      status: "skipped",
      startedAt: null,
      completedAt: null,
      result: null,
    },
  ],
  startedAt: "2026-04-03T09:00:00Z",
  completedAt: "2026-04-03T09:00:15Z",
};
