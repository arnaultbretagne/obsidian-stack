import { render, closeBrowser } from "./pipeline/renderer.js";
import { extract } from "./pipeline/extractor.js";
import { convert } from "./pipeline/converter.js";
import { write } from "./pipeline/writer.js";
import { resolveTemplate } from "./templates/registry.js";
import type { ClipOptions, ClipResult } from "./types.js";

export async function clip(options: ClipOptions): Promise<ClipResult> {
  const start = performance.now();

  try {
    const template = await resolveTemplate(options.template, options.url);

    if (options.verbose) {
      console.log(`Using template: ${template.name}`);
      console.log(`Fetching: ${options.url}`);
    }

    // Pipeline: render → extract → convert → write
    const html = await render(options.url);
    if (options.verbose) console.log("Rendered page");

    const extracted = await extract(html, options.url);
    if (options.verbose) console.log(`Extracted: "${extracted.title}" (${extracted.wordCount} words)`);

    const converted = convert(extracted, options.url);
    if (options.verbose) console.log("Converted to Markdown");

    const filePath = await write(converted, template, options);

    const elapsed = Math.round(performance.now() - start);

    if (!options.dryRun) {
      console.log(`Clipped: ${filePath} (${elapsed}ms)`);
    }

    return {
      filePath,
      title: extracted.title,
      wordCount: extracted.wordCount,
      processingTimeMs: elapsed,
    };
  } finally {
    await closeBrowser();
  }
}
