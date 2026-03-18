import { chromium, type Browser, type Page } from "playwright";
import { getConfig } from "../config.js";

let browser: Browser | undefined;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

// ── Playwright (primary) ─────────────────────────────────────────────

async function renderWithPlaywright(url: string, timeoutMs: number): Promise<string> {
  const b = await getBrowser();
  const page: Page = await b.newPage();

  try {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: timeoutMs,
    });
    return await page.content();
  } finally {
    await page.close();
  }
}

// ── Jina Reader (fallback) ───────────────────────────────────────────

const JINA_BASE = "https://r.jina.ai/";

async function renderWithJina(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${JINA_BASE}${url}`, {
      headers: { "X-Return-Format": "html" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Jina returned HTTP ${response.status}`);
    }

    const html = await response.text();

    if (!html || html.length < 100) {
      throw new Error("Jina returned empty or too-short content");
    }

    return html;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ───────────────────────────────────────────────────────

export async function render(url: string): Promise<string> {
  const config = getConfig();

  try {
    return await renderWithPlaywright(url, config.browserTimeoutMs);
  } catch (err) {
    if (!config.jinaFallback) {
      throw err;
    }

    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Playwright failed (${msg}), falling back to Jina Reader`);
  }

  return renderWithJina(url, config.jinaTimeoutMs);
}

export async function closeBrowser(): Promise<void> {
  if (browser?.isConnected()) {
    await browser.close();
    browser = undefined;
  }
}
