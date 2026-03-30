import { isUtf8 } from "node:buffer";

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
    const err = Object.assign(
      new Error("Request body must be valid UTF-8"),
      { status: 400, type: "encoding.not.supported" },
    );
    throw err;
  }
}
