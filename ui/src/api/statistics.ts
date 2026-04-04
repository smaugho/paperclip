import type { IssueStatistics } from "@paperclipai/shared";
import { api } from "./client";

export const statisticsApi = {
  summary: (companyId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return api.get<IssueStatistics>(`/companies/${companyId}/statistics${qs ? `?${qs}` : ""}`);
  },
};
