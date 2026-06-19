import express from "express";
import puppeteer, { Browser } from "puppeteer";
import { buildHtml, headerTemplate, footerTemplate, ReportData } from "./template";

const app = express();
app.use(express.json({ limit: "25mb" })); // allow inlined photo data URIs

// Reuse a single browser across requests; relaunch if it ever disconnects.
let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise;
    if (b.connected) return b;
    browserPromise = null; // dropped — relaunch below
  }
  browserPromise = puppeteer.launch({
    headless: true,
    // In Docker we use the distro's Chromium (set via PUPPETEER_EXECUTABLE_PATH).
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  return browserPromise;
}

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/render", async (req, res) => {
  const data = req.body as ReportData;
  if (!data?.lang || !data?.property) {
    return res.status(400).json({ error: "invalid report payload" });
  }
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(buildHtml(data), { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(data),
      footerTemplate: footerTemplate(),
      margin: { top: "36mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    await page.close();
    res.setHeader("Content-Type", "application/pdf");
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error("render failed", err);
    res.status(500).json({ error: "render failed" });
  }
});

const port = process.env.PDF_PORT ?? 4100;
app.listen(port, () => console.log(`PDF service on http://localhost:${port}`));
