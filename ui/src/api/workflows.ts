import type {
  WorkflowListItem,
  WorkflowDetail,
  WorkflowRunSummary,
  WorkflowRun,
  WorkflowRunStep,
  WorkflowMermaidOutput,
  WorkflowRevision,
  WorkflowAgentAssignment,
} from "@paperclipai/shared";
import { api } from "./client";

export const workflowsApi = {
  list: (companyId: string) =>
    api.get<WorkflowListItem[]>(`/companies/${companyId}/workflows`),
  get: (id: string) => api.get<WorkflowDetail>(`/workflows/${id}`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<WorkflowDetail>(`/companies/${companyId}/workflows`, data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<WorkflowDetail>(`/workflows/${id}`, data),
  archive: (id: string) => api.delete<void>(`/workflows/${id}`),
  listRevisions: (id: string) =>
    api.get<WorkflowRevision[]>(`/workflows/${id}/revisions`),
  getMermaid: (id: string) =>
    api.get<WorkflowMermaidOutput>(`/workflows/${id}/mermaid`),
  listAssignments: (id: string) =>
    api.get<WorkflowAgentAssignment[]>(`/workflows/${id}/assignments`),
  assign: (id: string, agentId: string) =>
    api.post<WorkflowAgentAssignment>(`/workflows/${id}/assignments`, { agentId }),
  unassign: (assignmentId: string) =>
    api.delete<void>(`/workflow-assignments/${assignmentId}`),
  listRuns: (id: string) =>
    api.get<WorkflowRunSummary[]>(`/workflows/${id}/runs`),
  createRun: (id: string, data: Record<string, unknown>) =>
    api.post<WorkflowRun>(`/workflows/${id}/runs`, data),
  getRun: (runId: string) => api.get<WorkflowRun>(`/workflow-runs/${runId}`),
  getRunSteps: (runId: string) =>
    api.get<WorkflowRunStep[]>(`/workflow-runs/${runId}/steps`),
  getRunMermaid: (runId: string) =>
    api.get<WorkflowMermaidOutput>(`/workflow-runs/${runId}/mermaid`),
  cancelRun: (runId: string, reason?: string) =>
    api.post<WorkflowRun>(`/workflow-runs/${runId}/cancel`, { reason }),
};
