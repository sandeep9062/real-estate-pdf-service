import express from "express";
import puppeteer from "puppeteer";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));

let browser = null;

const getBrowser = async () => {
  if (browser) {
    try {
      await browser.pages();
    } catch {
      console.warn("⚠️  Browser was dead, restarting...");
      browser = null;
    }
  }

  if (!browser) {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: puppeteer.executablePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-client-side-phishing-detection",
        "--disable-default-apps",
        "--disable-hang-monitor",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--no-first-run",
        "--safebrowsing-disable-auto-update",
        "--password-store=basic",
        "--use-mock-keychain",
        "--font-render-hinting=none",
        "--shm-size=1gb",
      ],
    });

    console.log(`🚀 Browser launched: ${puppeteer.executablePath()}`);

    browser.on("disconnected", () => {
      console.warn("⚠️  Browser disconnected — will relaunch on next request");
      browser = null;
    });
  }

  return browser;
};

app.get("/", (req, res) => {
  res.status(200).send(`
    <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
      <h1 style="color: #2c3e50;">🚀 Property Bulbul PDF Service</h1>
      <p>Status: <span style="color: #27ae60; font-weight: bold;">ONLINE</span></p>
      <p>System: Docker / Node.js / Puppeteer</p>
      <hr style="width: 50%; border: 0; border-top: 1px solid #eee; margin: 20px auto;">
      <p>Ready for <code>POST /generate-brochure</code></p>
    </div>
  `);
});

app.post("/generate-brochure", async (req, res) => {
  const { property } = req.body;

  if (!property) {
    return res.status(400).json({ error: "Property data is required" });
  }

  if (!property.title || property.price === undefined) {
    return res
      .status(400)
      .json({ error: "Property must have title and price" });
  }

  let page = null;

  try {
    const b = await getBrowser();
    page = await b.newPage();

    const pageTimeout = setTimeout(async () => {
      console.warn("⚠️  Page timeout — force closing");
      await page.close().catch(() => {});
    }, 30000);

    await page.setRequestInterception(true);
    page.on("request", (interceptedReq) => {
      const type = interceptedReq.resourceType();
      if (["font", "media", "websocket"].includes(type)) {
        interceptedReq.abort();
      } else {
        interceptedReq.continue();
      }
    });

    await page.setViewport({ width: 1280, height: 800 });

    const templatePath = path.join(__dirname, "views", "brochureTemplate.ejs");
    const html = await ejs.renderFile(templatePath, { property });

    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    await new Promise((resolve) => setTimeout(resolve, 800));

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    clearTimeout(pageTimeout);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="brochure-${property._id || "property"}.pdf"`,
    );
    res.send(pdfBuffer);

    console.log(`✅ PDF generated for: ${property.title}`);
  } catch (error) {
    console.error("🚨 PDF Generation Error:", error.message);

    if (
      error.message.includes("detached") ||
      error.message.includes("Target closed") ||
      error.message.includes("Session closed") ||
      error.message.includes("Protocol error") ||
      error.message.includes("Connection closed")
    ) {
      console.warn("⚠️  Browser reset due to crash");
      try {
        await browser?.close();
      } catch {}
      browser = null;
    }

    res.status(500).json({
      error: "Failed to generate PDF",
      details: error.message,
    });
  } finally {
    if (page) {
      await page.close().catch((err) => {
        console.error("Error closing page:", err.message);
      });
    }
  }
});

app.get("/ping", (req, res) => res.status(200).send("pong"));

const shutdown = async () => {
  console.log("🛑 Shutting down...");
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ PDF Service active on port ${PORT}`);
});
