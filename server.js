import express from "express";
import puppeteer from "puppeteer";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Enable CORS for your main backend/frontend domains
app.use(cors());
app.use(express.json({ limit: "15mb" })); // Increased limit for high-res image data

let browser;

/**
 * High-Performance Browser Management
 * Uses the built-in pptr executablePath to avoid ENOENT errors on Render
 */
const getBrowser = async () => {
  try {
    if (!browser || !browser.connected) {
      browser = await puppeteer.launch({
        headless: "new",
        // CRITICAL FIX: Automatically finds Chrome in the Docker environment
        executablePath: puppeteer.executablePath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--single-process", // Essential for Render Free Tier (512MB RAM)
        ],
      });
      console.log(
        `🚀 Browser Instance Started at: ${puppeteer.executablePath()}`,
      );
    }
    return browser;
  } catch (err) {
    console.error("❌ Failed to launch browser:", err);
    throw err;
  }
};

// Professional Root Route
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

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    // Set a reasonable viewport for the render
    await page.setViewport({ width: 1280, height: 800 });

    const templatePath = path.join(__dirname, "views", "brochureTemplate.ejs");
    const html = await ejs.renderFile(templatePath, { property });

    // 'load' is safer for Cloudinary images on Render's Free Tier
    await page.setContent(html, {
      waitUntil: "load",
      timeout: 60000,
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    res.contentType("application/pdf");
    // Explicitly set headers for filename
    res.setHeader("Content-Disposition", "attachment; filename=brochure.pdf");
    res.send(pdfBuffer);
  } catch (error) {
    console.error("🚨 PDF Generation Error:", error.message);
    res.status(500).json({
      error: "Failed to generate PDF",
      details: error.message,
    });
  } finally {
    if (page) {
      await page
        .close()
        .catch((err) => console.error("Error closing page:", err));
    }
  }
});

app.get("/ping", (req, res) => res.status(200).send("pong"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ PDF Service active on port ${PORT}`);
});
