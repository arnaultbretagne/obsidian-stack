import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { clip } from "./src/clip.js";
import { getConfig } from "./src/config.js";
import type { ClipOptions, ClipResult } from "./src/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestCase {
  id: string;
  label: string;
  url: string;
  template?: string;
  options?: Partial<ClipOptions>;
  assertions: Assertion[];
}

interface Assertion {
  field: string;      // e.g. "frontmatter.title", "content", "wordCount"
  check: string;      // human-readable description
  fn: (ctx: TestContext) => boolean;
}

interface TestContext {
  result?: ClipResult;
  fileContent?: string;
  error?: string;
}

interface TestResult {
  id: string;
  label: string;
  url: string;
  template: string;
  status: "OK" | "FAIL" | "ERROR";
  title: string;
  wordCount: number;
  timeMs: number;
  filePath: string;
  error?: string;
  assertions: { check: string; passed: boolean }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(md: string): Record<string, string> {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      fm[key] = value;
    }
  }
  return fm;
}

function truncateUrl(url: string, max = 40): string {
  try {
    const u = new URL(url);
    const short = u.hostname + u.pathname;
    return short.length > max ? short.slice(0, max) + "…" : short;
  } catch {
    return url.slice(0, max);
  }
}

// ---------------------------------------------------------------------------
// Test definitions
// ---------------------------------------------------------------------------

const tests: TestCase[] = [
  {
    id: "T1",
    label: "Article long, riche en metadata",
    url: "https://www.paulgraham.com/greatwork.html",
    assertions: [
      {
        field: "title", check: "titre non vide",
        fn: (ctx) => (ctx.result?.title?.length ?? 0) > 0,
      },
      {
        field: "wordCount", check: "contenu long (> 1000 mots)",
        fn: (ctx) => (ctx.result?.wordCount ?? 0) > 1000,
      },
      {
        field: "frontmatter.type", check: "type = clipping",
        fn: (ctx) => parseFrontmatter(ctx.fileContent ?? "").type === "clipping",
      },
      {
        field: "frontmatter.source", check: "source URL present",
        fn: (ctx) => parseFrontmatter(ctx.fileContent ?? "").source?.includes("paulgraham.com") ?? false,
      },
      {
        field: "frontmatter.schema_version", check: "schema_version present",
        fn: (ctx) => parseFrontmatter(ctx.fileContent ?? "").schema_version === "1",
      },
      {
        field: "content", check: "contenu markdown substantiel (> 5000 chars)",
        fn: (ctx) => (ctx.fileContent?.length ?? 0) > 5000,
      },
    ],
  },
  {
    id: "T2",
    label: "Page minimaliste",
    url: "https://example.com",
    template: "default",
    assertions: [
      {
        field: "title", check: "titre = 'Example Domain'",
        fn: (ctx) => ctx.result?.title === "Example Domain",
      },
      {
        field: "wordCount", check: "contenu court (< 100 mots)",
        fn: (ctx) => (ctx.result?.wordCount ?? 999) < 100,
      },
      {
        field: "frontmatter.source", check: "source URL present",
        fn: (ctx) => parseFrontmatter(ctx.fileContent ?? "").source === "https://example.com",
      },
    ],
  },
  {
    id: "T3",
    label: "Page avec tables (GFM)",
    url: "https://en.wikipedia.org/wiki/Markdown",
    template: "default",
    assertions: [
      {
        field: "title", check: "titre contient 'Markdown'",
        fn: (ctx) => (ctx.result?.title ?? "").includes("Markdown"),
      },
      {
        field: "content", check: "contient des tables GFM (pipes)",
        fn: (ctx) => (ctx.fileContent ?? "").includes("|"),
      },
      {
        field: "content", check: "contient des liens markdown",
        fn: (ctx) => /\[.*?\]\(.*?\)/.test(ctx.fileContent ?? ""),
      },
      {
        field: "wordCount", check: "contenu substantiel (> 500 mots)",
        fn: (ctx) => (ctx.result?.wordCount ?? 0) > 500,
      },
    ],
  },
  {
    id: "T4",
    label: "Blog technique avec code",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise",
    assertions: [
      {
        field: "title", check: "titre non vide",
        fn: (ctx) => (ctx.result?.title?.length ?? 0) > 0,
      },
      {
        field: "frontmatter.type", check: "type = clipping",
        fn: (ctx) => parseFrontmatter(ctx.fileContent ?? "").type === "clipping",
      },
      {
        field: "content", check: "contenu non trivial (> 100 mots)",
        fn: (ctx) => (ctx.result?.wordCount ?? 0) > 100,
      },
      {
        field: "content", check: "contient du code inline (backticks)",
        fn: (ctx) => /`[^`]+`/.test(ctx.fileContent ?? ""),
      },
    ],
  },
  {
    id: "T5",
    label: "Site non-anglais (UTF-8)",
    url: "https://www.lemonde.fr",
    assertions: [
      {
        field: "title", check: "titre non vide",
        fn: (ctx) => (ctx.result?.title?.length ?? 0) > 0,
      },
      {
        field: "frontmatter.domain", check: "domain = www.lemonde.fr",
        fn: (ctx) => parseFrontmatter(ctx.fileContent ?? "").domain === "www.lemonde.fr",
      },
      {
        field: "frontmatter.type", check: "type = clipping",
        fn: (ctx) => parseFrontmatter(ctx.fileContent ?? "").type === "clipping",
      },
    ],
  },
  {
    id: "T6",
    label: "Recette (auto-trigger)",
    url: "https://www.allrecipes.com/recipe/23891/grilled-cheese-sandwich/",
    assertions: [
      {
        field: "title", check: "titre non vide",
        fn: (ctx) => (ctx.result?.title?.length ?? 0) > 0,
      },
      {
        field: "frontmatter.type", check: "type = clipping",
        fn: (ctx) => parseFrontmatter(ctx.fileContent ?? "").type === "clipping",
      },
    ],
  },
  {
    id: "T7",
    label: "Page lourde JS (GitHub)",
    url: "https://github.com/anthropics/claude-code",
    template: "default",
    assertions: [
      {
        field: "title", check: "titre non vide",
        fn: (ctx) => (ctx.result?.title?.length ?? 0) > 0,
      },
      {
        field: "wordCount", check: "contenu rendu (> 50 mots)",
        fn: (ctx) => (ctx.result?.wordCount ?? 0) > 50,
      },
      {
        field: "content", check: "contient des liens markdown",
        fn: (ctx) => /\[.*?\]\(.*?\)/.test(ctx.fileContent ?? ""),
      },
    ],
  },
  {
    id: "T8",
    label: "Page 404",
    url: "https://httpbin.org/status/404",
    template: "default",
    assertions: [
      {
        field: "status", check: "graceful error handling (result or captured error)",
        fn: (ctx) => ctx.error !== undefined || ctx.result !== undefined,
      },
    ],
  },
  {
    id: "T9",
    label: "Combined CLI options",
    url: "https://example.com",
    options: {
      tags: ["test", "cli", "combo"],
      folder: "test-results/cli-combo",
      note: "Test note",
    },
    assertions: [
      {
        field: "frontmatter.tags", check: "tags present in frontmatter",
        fn: (ctx) => (ctx.fileContent ?? "").includes("test"),
      },
      {
        field: "filePath", check: "folder override applied",
        fn: (ctx) => (ctx.result?.filePath ?? "").includes("cli-combo"),
      },
      {
        field: "frontmatter.type", check: "type = clipping",
        fn: (ctx) => parseFrontmatter(ctx.fileContent ?? "").type === "clipping",
      },
    ],
  },
  {
    id: "T10",
    label: "Title with special characters",
    url: "https://en.wikipedia.org/wiki/C%2B%2B",
    template: "default",
    assertions: [
      {
        field: "title", check: "titre contient 'C++'",
        fn: (ctx) => (ctx.result?.title ?? "").includes("C++"),
      },
      {
        field: "filePath", check: "sanitized file name (no forbidden characters)",
        fn: (ctx) => !/[<>:"/\\|?*]/.test(path.basename(ctx.result?.filePath ?? "")),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runTest(tc: TestCase, vaultPath: string): Promise<TestResult> {
  const folder = tc.options?.folder ?? `test-results/${tc.template ?? "auto"}`;
  const clipOptions: ClipOptions = {
    url: tc.url,
    template: tc.template,
    verbose: false,
    ...tc.options,
    folder,
  };

  const result: TestResult = {
    id: tc.id,
    label: tc.label,
    url: tc.url,
    template: tc.template ?? "auto",
    status: "OK",
    title: "",
    wordCount: 0,
    timeMs: 0,
    filePath: "",
    assertions: [],
  };

  let ctx: TestContext = {};

  try {
    const clipResult = await clip(clipOptions);
    ctx.result = clipResult;
    result.title = clipResult.title;
    result.wordCount = clipResult.wordCount;
    result.timeMs = clipResult.processingTimeMs;
    result.filePath = clipResult.filePath;

    // Read the generated file
    const fullPath = path.join(vaultPath, clipResult.filePath);
    try {
      ctx.fileContent = await readFile(fullPath, "utf-8");
    } catch {
      ctx.fileContent = "";
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.error = msg;
    result.error = msg;
    result.status = "ERROR";
  }

  // Run assertions
  for (const assertion of tc.assertions) {
    let passed = false;
    try {
      passed = assertion.fn(ctx);
    } catch {
      passed = false;
    }
    result.assertions.push({ check: assertion.check, passed });
    if (!passed && result.status !== "ERROR") {
      result.status = "FAIL";
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateMarkdownReport(results: TestResult[]): string {
  const date = new Date().toISOString().slice(0, 19).replace("T", " ");
  const passed = results.filter((r) => r.status === "OK").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const errored = results.filter((r) => r.status === "ERROR").length;

  const lines: string[] = [];
  lines.push(`# Test Report — ${date}`);
  lines.push("");
  lines.push(`**${passed}** passed, **${failed}** failed, **${errored}** errors — ${results.length} total`);
  lines.push("");

  // Summary table
  lines.push("| # | URL | Template | Status | Title | Words | Time | File |");
  lines.push("|---|-----|----------|--------|-------|-------|------|------|");
  for (const r of results) {
    const status = r.status === "OK" ? "OK" : r.status === "FAIL" ? "FAIL" : "ERROR";
    const title = r.title ? r.title.slice(0, 40) : "(none)";
    const url = truncateUrl(r.url);
    lines.push(
      `| ${r.id} | ${url} | ${r.template} | ${status} | ${title} | ${r.wordCount} | ${r.timeMs}ms | ${r.filePath || "-"} |`,
    );
  }
  lines.push("");

  // Details
  lines.push("## Details");
  lines.push("");

  for (const r of results) {
    lines.push(`### ${r.id} — ${r.label}`);
    lines.push("");

    if (r.error) {
      lines.push(`- **Error**: ${r.error}`);
    }

    for (const a of r.assertions) {
      const icon = a.passed ? "pass" : "FAIL";
      lines.push(`- [${icon}] ${a.check}`);
    }

    if (r.filePath) {
      lines.push(`- File: \`${r.filePath}\``);
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = getConfig();
  const vaultPath = config.vaultPath;
  const resultsDir = path.join(vaultPath, "test-results");

  console.log(`Vault: ${vaultPath}`);
  console.log(`Results: ${resultsDir}`);
  console.log(`Tests: ${tests.length}`);
  console.log("");

  // Clean previous results
  try {
    await rm(resultsDir, { recursive: true, force: true });
  } catch { /* ignore */ }
  await mkdir(resultsDir, { recursive: true });

  const results: TestResult[] = [];

  for (const tc of tests) {
    const tag = `[${tc.id}] ${tc.label}`;
    process.stdout.write(`${tag} … `);
    const start = Date.now();

    const result = await runTest(tc, vaultPath);
    results.push(result);

    const elapsed = Date.now() - start;
    const icon = result.status === "OK" ? "OK" : result.status === "FAIL" ? "FAIL" : "ERROR";
    console.log(`${icon} (${elapsed}ms)`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    for (const a of result.assertions) {
      if (!a.passed) {
        console.log(`  FAIL: ${a.check}`);
      }
    }
  }

  // Write JSON report
  const jsonPath = path.join(resultsDir, "results.json");
  await writeFile(jsonPath, JSON.stringify(results, null, 2), "utf-8");

  // Write Markdown report
  const mdPath = path.join(resultsDir, "REPORT.md");
  const report = generateMarkdownReport(results);
  await writeFile(mdPath, report, "utf-8");

  // Summary
  const passed = results.filter((r) => r.status === "OK").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const errored = results.filter((r) => r.status === "ERROR").length;
  console.log("");
  console.log(`Done: ${passed} passed, ${failed} failed, ${errored} errors`);
  console.log(`Report: ${mdPath}`);
  console.log(`JSON:   ${jsonPath}`);

  process.exit(failed + errored > 0 ? 1 : 0);
}

main();
