import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeContext } from "../client/context.js";
import { readBodyFromFile, resolveCommandContext, resolveTextOption, unescapeText } from "../commands/client/common.js";

const ORIGINAL_ENV = { ...process.env };

function createTempPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-cli-common-"));
  return path.join(dir, name);
}

describe("unescapeText", () => {
  it("converts \\n to newline", () => {
    expect(unescapeText("line1\\nline2")).toBe("line1\nline2");
  });

  it("converts \\t to tab", () => {
    expect(unescapeText("col1\\tcol2")).toBe("col1\tcol2");
  });

  it("converts \\\\ to single backslash", () => {
    expect(unescapeText("path\\\\file")).toBe("path\\file");
  });

  it("handles \\\\n as literal backslash + n", () => {
    expect(unescapeText("literal\\\\n")).toBe("literal\\n");
  });

  it("returns undefined for undefined input", () => {
    expect(unescapeText(undefined)).toBeUndefined();
  });

  it("passes through strings without escape sequences", () => {
    expect(unescapeText("no escapes here")).toBe("no escapes here");
  });
});

describe("resolveCommandContext", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PAPERCLIP_API_URL;
    delete process.env.PAPERCLIP_API_KEY;
    delete process.env.PAPERCLIP_COMPANY_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses profile defaults when options/env are not provided", () => {
    const contextPath = createTempPath("context.json");

    writeContext(
      {
        version: 1,
        currentProfile: "ops",
        profiles: {
          ops: {
            apiBase: "http://127.0.0.1:9999",
            companyId: "company-profile",
            apiKeyEnvVarName: "AGENT_KEY",
          },
        },
      },
      contextPath,
    );
    process.env.AGENT_KEY = "key-from-env";

    const resolved = resolveCommandContext({ context: contextPath }, { requireCompany: true });
    expect(resolved.api.apiBase).toBe("http://127.0.0.1:9999");
    expect(resolved.companyId).toBe("company-profile");
    expect(resolved.api.apiKey).toBe("key-from-env");
  });

  it("prefers explicit options over profile values", () => {
    const contextPath = createTempPath("context.json");
    writeContext(
      {
        version: 1,
        currentProfile: "default",
        profiles: {
          default: {
            apiBase: "http://profile:3100",
            companyId: "company-profile",
          },
        },
      },
      contextPath,
    );

    const resolved = resolveCommandContext(
      {
        context: contextPath,
        apiBase: "http://override:3200",
        apiKey: "direct-token",
        companyId: "company-override",
      },
      { requireCompany: true },
    );

    expect(resolved.api.apiBase).toBe("http://override:3200");
    expect(resolved.companyId).toBe("company-override");
    expect(resolved.api.apiKey).toBe("direct-token");
  });

  it("throws when company is required but unresolved", () => {
    const contextPath = createTempPath("context.json");
    writeContext(
      {
        version: 1,
        currentProfile: "default",
        profiles: { default: {} },
      },
      contextPath,
    );

    expect(() =>
      resolveCommandContext({ context: contextPath, apiBase: "http://localhost:3100" }, { requireCompany: true }),
    ).toThrow(/Company ID is required/);
  });
});

describe("readBodyFromFile", () => {
  it("reads content from a file", () => {
    const filePath = createTempPath("body.txt");
    fs.writeFileSync(filePath, "line 1\nline 2\nline 3");
    expect(readBodyFromFile(filePath)).toBe("line 1\nline 2\nline 3");
  });

  it("throws on empty file", () => {
    const filePath = createTempPath("empty.txt");
    fs.writeFileSync(filePath, "   ");
    expect(() => readBodyFromFile(filePath)).toThrow(/File is empty/);
  });

  it("throws on missing file", () => {
    expect(() => readBodyFromFile("/nonexistent/path.txt")).toThrow();
  });
});

describe("resolveTextOption", () => {
  it("returns inline value when only inline is provided", () => {
    expect(resolveTextOption("hello", undefined, "--body", "--body-file")).toBe("hello");
  });

  it("returns file content when only file path is provided", () => {
    const filePath = createTempPath("resolve.txt");
    fs.writeFileSync(filePath, "from file");
    expect(resolveTextOption(undefined, filePath, "--body", "--body-file")).toBe("from file");
  });

  it("returns undefined when neither is provided", () => {
    expect(resolveTextOption(undefined, undefined, "--body", "--body-file")).toBeUndefined();
  });

  it("throws when both inline and file are provided", () => {
    expect(() => resolveTextOption("inline", "/some/file", "--body", "--body-file")).toThrow(
      /mutually exclusive/,
    );
  });
});
