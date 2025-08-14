import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const statePath = path.resolve("storage/state.json");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  console.log(">> Opening LinkedIn login...");
  await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle" });
  console.log(">> Log in, then press Enter in this terminal.");
  process.stdin.resume();
  process.stdin.on("data", async () => {
    await ctx.storageState({ path: statePath });
    console.log(">> Saved session to", statePath);
    await browser.close();
    process.exit(0);
  });
})();