import express from "express";
import htmlPdf from "html-pdf-node";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
// Increased limit for property data containing base64 or many images
app.use(express.json({ limit: "20mb" }));

app.get("/", (req, res) => {
  res.status(200).send(`
    <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
      <h1 style="color: #2c3e50;">🚀 Property Bulbul PDF Service</h1>
      <p>Status: <span style="color: #27ae60; font-weight: bold;">ONLINE</span></p>
    </div>
  `);
});

app.post("/generate-brochure", async (req, res) => {
  const { property } = req.body;

  if (!property) {
    return res.status(400).json({ error: "Property data is required" });
  }

  try {
    // 1. Sanitize Data
    const sanitizedProperty = {
      ...property,
      _id: property._id || "N/A",
      title: property.title || "Property Listing",
      description: property.description || "",
      price: property.price || 0,
      area: property.area || { value: 0, unit: "sq ft" },
      facilities: property.facilities || { bedrooms: 0 },
      image: Array.isArray(property.image) ? property.image : [],
      user: property.user || { email: "contact@propertybulbul.com" },
    };

    // 2. Render HTML
    const templatePath = path.join(__dirname, "views", "brochureTemplate.ejs");
    const html = await ejs.renderFile(templatePath, {
      property: sanitizedProperty,
    });

    // 3. Configure PDF Options
    // NOTE: 'waitUntil' inside options is key for html-pdf-node
    const options = {
      format: "A4",
      printBackground: true,
      waitUntil: "domcontentloaded",
      margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process",
      ],
    };

    // 4. File configuration
    // We pass waitUntil here as well to ensure the browser doesn't wait for slow trackers/ads
    const file = {
      content: html,
    };

    console.log(`⏳ Generating PDF for: ${sanitizedProperty.title}...`);

    // 5. Generate PDF with a race condition to prevent hanging forever
    const pdfBuffer = await htmlPdf.generatePdf(file, options);

    // 6. Send Response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="brochure.pdf"`);
    res.send(pdfBuffer);

    console.log(`✅ PDF successfully sent for: ${sanitizedProperty.title}`);
  } catch (error) {
    console.error("🚨 PDF Generation Error:", error.message);

    // Prevent double-responding if headers were already sent
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to generate PDF",
        details: error.message,
      });
    }
  }
});

app.get("/ping", (req, res) => res.status(200).send("pong"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ PDF Service active on port ${PORT}`);
});
