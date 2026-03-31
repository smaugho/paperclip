import { describe, expect, it } from "vitest";
import http from "node:http";
import express from "express";
import request from "supertest";
import { verifyUtf8Body } from "../middleware/verify-utf8-body.js";
import { HttpError } from "../errors.js";
import { errorHandler } from "../middleware/error-handler.js";

function createApp() {
  const app = express();
  app.use(
    express.json({
      limit: "10mb",
      verify: verifyUtf8Body,
    }),
  );
  app.post("/echo", (req, res) => {
    res.json(req.body);
  });
  return app;
}

describe("verifyUtf8Body", () => {
  describe("unit tests", () => {
    it("throws for a buffer with a bare UTF-8 continuation byte (0x80)", () => {
      const invalid = Buffer.from([0x80]);
      expect(() => verifyUtf8Body(null, null, invalid)).toThrow(
        "Request body must be valid UTF-8",
      );
    });

    it("throws for a buffer with an incomplete multi-byte sequence", () => {
      // 0xC4 starts a 2-byte sequence but 0x20 is not a continuation byte
      const invalid = Buffer.from([0x7b, 0xc4, 0x20, 0x7d]);
      expect(() => verifyUtf8Body(null, null, invalid)).toThrow(
        "Request body must be valid UTF-8",
      );
    });

    it("does not throw for valid ASCII bytes", () => {
      const valid = Buffer.from('{"hello":"world"}', "utf8");
      expect(() => verifyUtf8Body(null, null, valid)).not.toThrow();
    });

    it("does not throw for valid multi-byte UTF-8 (Polish diacritics)", () => {
      const valid = Buffer.from('{"text":"Zażółć gęślą jaźń"}', "utf8");
      expect(() => verifyUtf8Body(null, null, valid)).not.toThrow();
    });

    it("throws HttpError with status 400", () => {
      const invalid = Buffer.from([0x80]);
      let caught: unknown = null;
      try {
        verifyUtf8Body(null, null, invalid);
      } catch (e) {
        caught = e;
      }
      expect(caught).not.toBeNull();
      expect(caught).toBeInstanceOf(HttpError);
      expect((caught as HttpError).status).toBe(400);
    });
  });

  describe("HTTP integration", () => {
    function createAppWithErrorHandler() {
      const app = createApp();
      app.use(errorHandler);
      return app;
    }

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

    it("rejects invalid UTF-8 bytes with 400", async () => {
      const app = createAppWithErrorHandler();
      // supertest serializes Buffer to JSON, so we use raw http to send actual invalid bytes
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as { port: number }).port;
      try {
        const { status, body } = await new Promise<{ status: number; body: string }>((resolve) => {
          const req = http.request(
            { method: "POST", hostname: "127.0.0.1", port, path: "/echo", headers: { "Content-Type": "application/json" } },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => resolve({ status: res.statusCode!, body: data }));
            },
          );
          req.write(Buffer.from([0x7b, 0xc4, 0x20, 0x7d]));
          req.end();
        });
        expect(status).toBe(400);
        expect(JSON.parse(body).error).toMatch(/UTF-8/i);
      } finally {
        server.close();
      }
    });
  });
});
