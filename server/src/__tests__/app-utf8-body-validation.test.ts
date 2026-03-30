import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { isUtf8 } from "node:buffer";

/**
 * Mirrors the verify callback used in createApp's express.json middleware.
 * Extracted here so we can unit-test it without a full HTTP round-trip.
 */
function verifyUtf8(_req: unknown, _res: unknown, buf: Buffer): void {
  if (!isUtf8(buf)) {
    const err = Object.assign(new Error("Request body must be valid UTF-8"), {
      status: 400,
      type: "encoding.not.supported",
    });
    throw err;
  }
}

function createApp() {
  const app = express();
  app.use(
    express.json({
      limit: "10mb",
      verify: verifyUtf8,
    }),
  );
  app.post("/echo", (req, res) => {
    res.json(req.body);
  });
  return app;
}

describe("express.json UTF-8 body validation", () => {
  describe("HTTP integration (valid payloads accepted)", () => {
    it("accepts valid UTF-8 JSON including Polish diacritics", async () => {
      const app = createApp();
      const payload = { text: "Zażółć gęślą jaźń — ą ę ó ś ż ź ć ń ł" };
      const res = await request(app)
        .post("/echo")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(payload));
      expect(res.status).toBe(200);
      expect(res.body.text).toBe(payload.text);
    });

    it("accepts plain ASCII JSON", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/echo")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ hello: "world" }));
      expect(res.status).toBe(200);
      expect(res.body.hello).toBe("world");
    });
  });

  describe("verifyUtf8 unit tests (invalid payloads rejected)", () => {
    it("throws for a buffer with a bare UTF-8 continuation byte (0x80)", () => {
      const invalid = Buffer.from([0x80]);
      expect(() => verifyUtf8(null, null, invalid)).toThrow(
        "Request body must be valid UTF-8",
      );
    });

    it("throws for a buffer with an incomplete multi-byte sequence", () => {
      // 0xC4 starts a 2-byte sequence but 0x20 is not a continuation byte
      const invalid = Buffer.from([0x7b, 0xc4, 0x20, 0x7d]);
      expect(() => verifyUtf8(null, null, invalid)).toThrow(
        "Request body must be valid UTF-8",
      );
    });

    it("does not throw for valid ASCII bytes", () => {
      const valid = Buffer.from('{"hello":"world"}', "utf8");
      expect(() => verifyUtf8(null, null, valid)).not.toThrow();
    });

    it("does not throw for valid multi-byte UTF-8 (Polish diacritics)", () => {
      const valid = Buffer.from('{"text":"Zażółć gęślą jaźń"}', "utf8");
      expect(() => verifyUtf8(null, null, valid)).not.toThrow();
    });

    it("error has status 400 and encoding type tag", () => {
      const invalid = Buffer.from([0x80]);
      let caught: ReturnType<typeof Object.assign> | null = null;
      try {
        verifyUtf8(null, null, invalid);
      } catch (e) {
        caught = e as typeof caught;
      }
      expect(caught).not.toBeNull();
      expect((caught as { status: number }).status).toBe(400);
      expect((caught as { type: string }).type).toBe("encoding.not.supported");
    });
  });
});
