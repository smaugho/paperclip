import type { RequestHandler } from "express";

/**
 * Recursively strip null bytes (\0) from all string values in an object.
 * PostgreSQL text columns reject 0x00 bytes with:
 *   "invalid byte sequence for encoding 'UTF8': 0x00"
 * Agent-generated content occasionally embeds them, so we sanitize at
 * the middleware boundary instead of per-route.
 */
function stripNulls(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replaceAll("\0", "");
  }
  if (Array.isArray(value)) {
    return value.map(stripNulls);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

export const stripNullBytes: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = stripNulls(req.body);
  }
  next();
};
