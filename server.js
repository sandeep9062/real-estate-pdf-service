import express from "express";
import htmlPdf from "html-pdf-node";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/", (req, res) => {
  res.status(200).send(`
    <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
      <h1 style="color: #2c3e50;">🚀 Property Bulbul PDF Service</h1>
      <p>Status: <span style="color: #27ae60; font-weight: bold;">ONLINE</span></p>
      <p>Ready for <code>POST /generate-brochure</code></p>
    </div>
  `);
});

app.post("/generate-brochure", async (req, res) => {
  const { property } = req.body;

  if (!property) {
    return res.status(400).json({ error: "Property data is required" });
  }

  try {
    // Sanitize property data — same as your working local version
    const sanitizedProperty = {
      ...property,
      _id: property._id || "PROPERTY001",
      title: property.title || "Property Listing",
      description: property.description || "Property details coming soon.",
      price: property.price || 0,
      area: property.area || { value: 0, unit: "sq ft" },
      facilities: property.facilities || { bedrooms: 0 },
      facing: property.facing || "Open",
      availability: property.availability || "Available",
      image: property.image || [],
      user: property.user || { email: "contact@propertybulbul.com" },
    };

    const templatePath = path.join(__dirname, "views", "brochureTemplate.ejs");
    const html = await ejs.renderFile(templatePath, {
      property: sanitizedProperty,
    });

    const options = {
      format: "A4",
      printBackground: true,
      waitUntil: "domcontentloaded",
      timeout: 60000,
      margin: {
        top: "20px",
        right: "20px",
        bottom: "20px",
        left: "20px",
      },

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process",
      ],
    };

    const file = { content: html };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="brochure.pdf"`);
    res.send(pdfBuffer);

    console.log(`✅ PDF generated for: ${sanitizedProperty.title}`);
  } catch (error) {
    console.error("🚨 PDF Generation Error:", error.message);
    res.status(500).json({
      error: "Failed to generate PDF",
      details: error.message,
    });
  }
});

app.get("/ping", (req, res) => res.status(200).send("pong"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ PDF Service active on port ${PORT}`);
});
