import { isUtf8 } from "node:buffer";
import { badRequest } from "../errors.js";

/**
 * Express body-parser `verify` callback that rejects non-UTF-8 request bodies
 * with a 400 status and `encoding.not.supported` type tag.
 */
export function verifyUtf8Body(
  _req: unknown,
  _res: unknown,
  buf: Buffer,
): void {
  if (!isUtf8(buf)) {
    throw badRequest("Request body must be valid UTF-8");
  }
}
