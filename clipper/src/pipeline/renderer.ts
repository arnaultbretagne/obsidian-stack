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

export async function render(url: string): Promise<string> {
  const config = getConfig();
  const b = await getBrowser();
  const page: Page = await b.newPage();

  try {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: config.browserTimeoutMs,
    });
    return await page.content();
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser?.isConnected()) {
    await browser.close();
    browser = undefined;
  }
}
