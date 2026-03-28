import express from "express";
import puppeteer from "puppeteer";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Increase limit because HTML with Base64 images can be large
app.use(express.json({ limit: "10mb" }));

let browser;

// High-Performance Browser Management
const getBrowser = async () => {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // Critical for Render's low memory
        "--disable-gpu",
        "--single-process", // Saves RAM
        "--no-zygote",
      ],
    });
    console.log("🚀 Browser Instance Started");
  }
  return browser;
};

app.post("/generate-brochure", async (req, res) => {
  const { property } = req.body;
  let page;

  try {
    const b = await getBrowser();
    page = await b.newPage();

    // 1. Render EJS to HTML string
    const templatePath = path.join(__dirname, "views", "brochureTemplate.ejs");
    const html = await ejs.renderFile(templatePath, { property });

    // 2. Set Content & Wait for Images/Fonts
    // 'networkidle0' ensures everything is loaded before printing
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

    // 3. Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    res.contentType("application/pdf");
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF Error:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  } finally {
    if (page) await page.close(); // Close the tab, but NOT the browser
  }
});

// Health check for Render to know the service is awake
app.get("/ping", (req, res) => res.send("pong"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ PDF Service active on port ${PORT}`));
