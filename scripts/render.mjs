// Headless exporter. Drives the same renderFrame() the player uses, frame by frame.
//   node scripts/render.mjs video [baseUrl]   → out/hsm-explainer-Cursor.mp4 (+ public/media copy)
//   node scripts/render.mjs hero  [baseUrl]   → out/hero-Cursor.png (+ public/hero.png)
//   node scripts/render.mjs frames 0,150,420  → out/frames/f0000.png …
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const [mode = "video", arg2, arg3] = process.argv.slice(2);
const base = (mode === "frames" ? arg3 : arg2) ?? "http://127.0.0.1:43127/";
const executablePath = process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome";

mkdirSync("out/frames", { recursive: true });
mkdirSync("public/media", { recursive: true });

const browser = await chromium.launch({ executablePath, args: ["--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`${base}?render=1`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__hsm?.ready === true);
const canvas = page.locator("#view");

async function grab(f) {
  await page.evaluate((n) => window.__hsm.render(n), f);
  return canvas.screenshot({ type: "png" });
}

if (mode === "hero") {
  await page.evaluate(() => window.__hsm.hero());
  const png = await canvas.screenshot({ type: "png" });
  writeFileSync("out/hero-Cursor.png", png);
  copyFileSync("out/hero-Cursor.png", "public/hero.png");
  console.log("wrote out/hero-Cursor.png");
} else if (mode === "frames") {
  for (const f of (arg2 ?? "0").split(",").map(Number)) {
    writeFileSync(`out/frames/f${String(f).padStart(4, "0")}.png`, await grab(f));
    console.log("frame", f);
  }
} else {
  const total = await page.evaluate(() => window.__hsm.total);
  const out = "out/hsm-explainer-Cursor.mp4";
  const ff = spawn(
    "ffmpeg",
    ["-y", "-f", "image2pipe", "-framerate", "30", "-c:v", "png", "-i", "-",
     "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium",
     "-movflags", "+faststart", "-r", "30", out],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  for (let f = 0; f < total; f++) {
    const png = await grab(f);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 60 === 0) console.log(`frame ${f}/${total - 1}`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg ${c}`)))));
  copyFileSync(out, "public/media/hsm-explainer-Cursor.mp4");
  console.log(`wrote ${out} (${total} frames)`);
}

await browser.close();
