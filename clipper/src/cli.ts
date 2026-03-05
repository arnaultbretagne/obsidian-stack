#!/usr/bin/env node
import { parseArgs } from "node:util";
import { clip } from "./clip.js";
import type { ClipOptions } from "./types.js";

function printUsage(): void {
  console.log(`
Usage: clip <url> [options]

Options:
  -t, --template <name>   Template (default: auto-detect or "default")
  --tags <tag1,tag2>       Additional tags
  --folder <path>          Vault subfolder (overrides template)
  --note <text>            Note to add
  --dry-run                Print Markdown without writing
  --verbose                Detailed logging
  -h, --help               Show this help
`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      template: { type: "string", short: "t" },
      tags: { type: "string" },
      folder: { type: "string" },
      note: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    printUsage();
    process.exit(values.help ? 0 : 1);
  }

  const url = positionals[0];

  const options: ClipOptions = {
    url,
    template: values.template,
    tags: values.tags?.split(",").map((t) => t.trim()),
    folder: values.folder,
    note: values.note,
    dryRun: values["dry-run"],
    verbose: values.verbose,
  };

  try {
    await clip(options);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
    if (values.verbose && err instanceof Error) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
