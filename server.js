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

/**
 * Robust Browser Management
 * - Checks if browser is truly alive before reusing
 * - Resets to null on any failure so next request gets a fresh instance
 */
const getBrowser = async () => {
  // Check if existing browser is still alive
  if (browser) {
    try {
      await browser.pages(); // Will throw if browser has crashed
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
        "--single-process", // Essential for Render Free Tier (512MB RAM)
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
      ],
    });
    console.log(`🚀 Browser launched: ${puppeteer.executablePath()}`);

    // If browser crashes unexpectedly, reset so next request relaunches it
    browser.on("disconnected", () => {
      console.warn("⚠️  Browser disconnected — will relaunch on next request");
      browser = null;
    });
  }

  return browser;
};

// Root health check
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

  // Validate required fields to avoid cryptic errors in the template
  if (!property.title || !property.price) {
    return res
      .status(400)
      .json({ error: "Property must have title and price" });
  }

  let page = null;

  try {
    const b = await getBrowser();
    page = await b.newPage();

    // Block unnecessary resources to speed up rendering on free tier
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      // Only block fonts and media — allow images (needed for property photos)
      if (["font", "media"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setViewport({ width: 1280, height: 800 });

    const templatePath = path.join(__dirname, "views", "brochureTemplate.ejs");
    const html = await ejs.renderFile(templatePath, { property });

    // networkidle0 waits for all Cloudinary images to fully load
    // Falls back gracefully if an image fails
    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    // Extra wait to ensure images are painted before PDF capture
    await new Promise((resolve) => setTimeout(resolve, 500));

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="brochure-${property._id || "property"}.pdf"`,
    );
    res.send(pdfBuffer);

    console.log(`✅ PDF generated for: ${property.title}`);
  } catch (error) {
    console.error("🚨 PDF Generation Error:", error.message);

    // If browser crashed mid-request, reset it
    if (
      error.message.includes("Target closed") ||
      error.message.includes("Session closed") ||
      error.message.includes("Protocol error")
    ) {
      browser = null;
      console.warn("⚠️  Browser reset due to crash");
    }

    res.status(500).json({
      error: "Failed to generate PDF",
      details: error.message,
    });
  } finally {
    // Always close the page to free memory — never close the browser itself
    if (page) {
      await page.close().catch((err) => {
        console.error("Error closing page:", err.message);
      });
    }
  }
});

// Lightweight ping for uptime monitoring (e.g. UptimeRobot)
app.get("/ping", (req, res) => res.status(200).send("pong"));

// Graceful shutdown — close browser on process exit
const shutdown = async () => {
  console.log("🛑 Shutting down...");
  if (browser) {
    await browser.close().catch(() => {});
  }
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ PDF Service active on port ${PORT}`);
});
