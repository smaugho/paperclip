import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { stripNullBytes } from "../middleware/strip-null-bytes.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(stripNullBytes);
  app.post("/echo", (req, res) => res.json(req.body));
  return app;
}

describe("stripNullBytes middleware", () => {
  it("strips null bytes from string values", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/echo")
      .send({ body: "hello\x00world" })
      .expect(200);
    expect(res.body.body).toBe("helloworld");
  });

  it("strips null bytes from nested objects", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/echo")
      .send({ outer: { inner: "a\x00b" } })
      .expect(200);
    expect(res.body.outer.inner).toBe("ab");
  });

  it("strips null bytes from array elements", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/echo")
      .send({ items: ["a\x00b", "c\x00d"] })
      .expect(200);
    expect(res.body.items).toEqual(["ab", "cd"]);
  });

  it("preserves non-string values", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/echo")
      .send({ num: 42, bool: true, nil: null })
      .expect(200);
    expect(res.body).toEqual({ num: 42, bool: true, nil: null });
  });

  it("handles empty body", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/echo")
      .send({})
      .expect(200);
    expect(res.body).toEqual({});
  });

  it("passes through clean strings unchanged", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/echo")
      .send({ body: "no null bytes here" })
      .expect(200);
    expect(res.body.body).toBe("no null bytes here");
  });
});
