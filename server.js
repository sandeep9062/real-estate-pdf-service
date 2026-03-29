import express from "express";
import puppeteer from "puppeteer";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors"; // Added for better connectivity

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Enable CORS so your main domain can talk to this subdomain
app.use(cors());
app.use(express.json({ limit: "10mb" }));

let browser;

const getBrowser = async () => {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: "new",
      // Use the Docker-installed Chrome on Render
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });
    console.log("🚀 Browser Instance Started");
  }
  return browser;
};

// --- NEW ROOT ROUTE ---
app.get("/", (req, res) => {
  res.status(200).send(`
    <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
      <h1>🚀 Property Bulbul PDF Service</h1>
      <p>Status: <span style="color: green;">Online</span></p>
      <p>Endpoint: <code>POST /generate-brochure</code></p>
    </div>
  `);
});

app.post("/generate-brochure", async (req, res) => {
  const { property } = req.body;
  let page;

  try {
    const b = await getBrowser();
    page = await b.newPage();

    const templatePath = path.join(__dirname, "views", "brochureTemplate.ejs");
    const html = await ejs.renderFile(templatePath, { property });

    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

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
    if (page) await page.close();
  }
});

app.get("/ping", (req, res) => res.send("pong"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ PDF Service active on port ${PORT}`));
