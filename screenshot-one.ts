import { chromium } from "playwright";
import * as path from "path";

const url = "http://localhost:5173/";
const outPath = path.join(process.cwd(), "screenshot.png");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const consoleLogs: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleLogs.push(`[${type}] ${text}`);
  });

  await page.goto(url + "?t=" + Date.now(), { waitUntil: "networkidle", timeout: 10000 });
  await page.waitForTimeout(500);

  await page.screenshot({ path: outPath });
  await browser.close();

  console.log("Screenshot saved to:", outPath);
  const errors = consoleLogs.filter((l) => l.startsWith("[error]"));
  if (errors.length) console.log("Console errors:", errors);
  else console.log("No console errors");
}

main().catch(console.error);
