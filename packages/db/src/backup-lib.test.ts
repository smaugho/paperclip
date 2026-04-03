import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createBufferedTextFileWriter, runDatabaseBackup, runDatabaseRestore, verifyBackupFile } from "./backup-lib.js";
import { ensurePostgresDatabase } from "./client.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./test-embedded-postgres.js";

const cleanups: Array<() => Promise<void> | void> = [];
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

async function createTempDatabase(): Promise<string> {
  const db = await startEmbeddedPostgresTestDatabase("paperclip-db-backup-");
  cleanups.push(db.cleanup);
  return db.connectionString;
}

async function createSiblingDatabase(connectionString: string, databaseName: string): Promise<string> {
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  await ensurePostgresDatabase(adminUrl.toString(), databaseName);
  const targetUrl = new URL(connectionString);
  targetUrl.pathname = `/${databaseName}`;
  return targetUrl.toString();
}

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    await cleanup?.();
  }
});

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres backup tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describe("createBufferedTextFileWriter", () => {
  it("preserves line boundaries across buffered flushes", async () => {
    const tempDir = createTempDir("paperclip-buffered-writer-");
    const outputPath = path.join(tempDir, "backup.sql");
    const writer = createBufferedTextFileWriter(outputPath, 16);
    const lines = [
      "-- header",
      "BEGIN;",
      "",
      "INSERT INTO test VALUES (1);",
      "-- footer",
    ];

    for (const line of lines) {
      writer.emit(line);
    }

    await writer.close();

    expect(fs.readFileSync(outputPath, "utf8")).toBe(lines.join("\n"));
  });
});

describe("verifyBackupFile", () => {
  it("reports errors for an empty file", async () => {
    const tempDir = createTempDir("paperclip-verify-empty-");
    const emptyFile = path.join(tempDir, "empty.sql");
    fs.writeFileSync(emptyFile, "");
    const result = await verifyBackupFile(emptyFile);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Backup file is empty");
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reports errors for a truncated backup missing COMMIT", async () => {
    const tempDir = createTempDir("paperclip-verify-truncated-");
    const truncatedFile = path.join(tempDir, "truncated.sql");
    fs.writeFileSync(
      truncatedFile,
      [
        "-- Paperclip database backup",
        "-- Created: 2026-01-01T00:00:00.000Z",
        "",
        "BEGIN;",
        "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900",
        'CREATE TABLE "public"."test" ("id" serial PRIMARY KEY);',
        "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900",
      ].join("\n"),
    );
    const result = await verifyBackupFile(truncatedFile);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing COMMIT statement — backup may be truncated");
  });

  it("passes for a well-formed backup file", async () => {
    const tempDir = createTempDir("paperclip-verify-valid-");
    const validFile = path.join(tempDir, "valid.sql");
    fs.writeFileSync(
      validFile,
      [
        "-- Paperclip database backup",
        "-- Created: 2026-01-01T00:00:00.000Z",
        "",
        "BEGIN;",
        "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900",
        'CREATE TABLE "public"."test" ("id" serial PRIMARY KEY);',
        "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900",
        "COMMIT;",
        "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900",
        "",
      ].join("\n"),
    );
    const result = await verifyBackupFile(validFile);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    // Sidecar checksum file should be created.
    expect(fs.existsSync(`${validFile}.sha256`)).toBe(true);
  });
});

describeEmbeddedPostgres("runDatabaseBackup", () => {
  it(
    "backs up and restores large table payloads without materializing one giant string",
    async () => {
      const sourceConnectionString = await createTempDatabase();
      const restoreConnectionString = await createSiblingDatabase(
        sourceConnectionString,
        "paperclip_restore_target",
      );
      const backupDir = createTempDir("paperclip-db-backup-output-");
      const sourceSql = postgres(sourceConnectionString, { max: 1, onnotice: () => {} });
      const restoreSql = postgres(restoreConnectionString, { max: 1, onnotice: () => {} });

      try {
        await sourceSql.unsafe(`
          CREATE TYPE "public"."backup_test_state" AS ENUM ('pending', 'done');
        `);
        await sourceSql.unsafe(`
          CREATE TABLE "public"."backup_test_records" (
            "id" serial PRIMARY KEY,
            "title" text NOT NULL,
            "payload" text NOT NULL,
            "state" "public"."backup_test_state" NOT NULL,
            "metadata" jsonb,
            "created_at" timestamptz NOT NULL DEFAULT now()
          );
        `);

        const payload = "x".repeat(8192);
        for (let index = 0; index < 160; index += 1) {
          const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index));
          await sourceSql`
            INSERT INTO "public"."backup_test_records" (
              "title",
              "payload",
              "state",
              "metadata",
              "created_at"
            )
            VALUES (
              ${`row-${index}`},
              ${payload},
              ${index % 2 === 0 ? "pending" : "done"}::"public"."backup_test_state",
              ${JSON.stringify({ index, even: index % 2 === 0 })}::jsonb,
              ${createdAt}
            )
          `;
        }

        const result = await runDatabaseBackup({
          connectionString: sourceConnectionString,
          backupDir,
          retentionDays: 7,
          filenamePrefix: "paperclip-test",
        });

        expect(result.backupFile).toMatch(/paperclip-test-.*\.sql$/);
        expect(result.sizeBytes).toBeGreaterThan(1024 * 1024);
        expect(fs.existsSync(result.backupFile)).toBe(true);

        // Verification should pass for a valid backup.
        expect(result.verification.valid).toBe(true);
        expect(result.verification.errors).toEqual([]);
        expect(result.verification.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

        // Sidecar checksum file should exist.
        const checksumFilePath = `${result.backupFile}.sha256`;
        expect(fs.existsSync(checksumFilePath)).toBe(true);
        const checksumContent = fs.readFileSync(checksumFilePath, "utf8");
        expect(checksumContent).toContain(result.verification.checksumSha256);

        await runDatabaseRestore({
          connectionString: restoreConnectionString,
          backupFile: result.backupFile,
        });

        const counts = await restoreSql.unsafe<{ count: number }[]>(`
          SELECT count(*)::int AS count
          FROM "public"."backup_test_records"
        `);
        expect(counts[0]?.count).toBe(160);

        const sampleRows = await restoreSql.unsafe<{
          title: string;
          payload: string;
          state: string;
          metadata: { index: number; even: boolean };
        }[]>(`
          SELECT "title", "payload", "state"::text AS "state", "metadata"
          FROM "public"."backup_test_records"
          WHERE "title" IN ('row-0', 'row-159')
          ORDER BY "title"
        `);
        expect(sampleRows).toEqual([
          {
            title: "row-0",
            payload,
            state: "pending",
            metadata: { index: 0, even: true },
          },
          {
            title: "row-159",
            payload,
            state: "done",
            metadata: { index: 159, even: false },
          },
        ]);
      } finally {
        await sourceSql.end();
        await restoreSql.end();
      }
    },
    60_000,
  );
});
