import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { statisticsService } from "../services/statistics.js";
import { assertCompanyAccess } from "./authz.js";

export function statisticsRoutes(db: Db) {
  const router = Router();
  const svc = statisticsService(db);

  router.get("/companies/:companyId/statistics", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const fromStr = req.query.from as string | undefined;
    const toStr = req.query.to as string | undefined;

    const from = fromStr ? new Date(fromStr) : null;
    const to = toStr ? new Date(toStr) : null;

    const stats = await svc.summary(companyId, { from, to });
    res.json(stats);
  });

  return router;
}
