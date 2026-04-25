import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

const fetchImage = async (url) => {
  try {
    if (!url || typeof url !== "string") return null;
    const response = await axios.get(url.trim(), {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: { "User-Agent": "PropertyBulbul-PDF/1.0" },
    });
    const buf = Buffer.from(response.data);
    // Basic Magic Number check for JPEG, PNG, GIF
    if (
      buf[0] === 0xff ||
      buf[0] === 0x89 ||
      buf[0] === 0x47 ||
      buf[0] === 0x52
    )
      return buf;
    return null;
  } catch {
    return null;
  }
};

const formatPrice = (price, deal) => {
  if (!price && price !== 0) return "Price on Request";
  const formatted = Number(price).toLocaleString("en-IN");
  return deal === "Rent" ? `Rs ${formatted}/mo` : `Rs ${formatted}`;
};

const truncate = (str, len) =>
  str && str.length > len ? str.substring(0, len) + "..." : str || "";

app.post("/generate-brochure", async (req, res) => {
  const { property } = req.body;
  if (!property)
    return res.status(400).json({ error: "Property data is required" });

  const p = {
    _id: property._id || "PROPERTY001",
    title: property.title || "Property Listing",
    description: property.description || "Property details coming soon.",
    price: property.price || 0,
    deal: property.deal || "Sale",
    area: property.area || { value: 0, unit: "sq ft" },
    facilities: property.facilities || { bedrooms: 0, bathrooms: 0 },
    facing: property.facing || "N/A",
    availability: property.availability || "Available",
    furnishing: property.furnishing || "N/A",
    propertyCategory: property.propertyCategory || "Residential",
    image: Array.isArray(property.image) ? property.image.filter(Boolean) : [],
    user: property.user || {},
    location: property.location || {},
  };

  try {
    const PRIMARY = "#4161df";
    const DARK = "#111827";
    const MUTED = "#374151";
    const LIGHT = "#9ca3af";
    const BG = "#f3f4f6";
    const WHITE = "#ffffff";

    const doc = new PDFDocument({ size: "A4", margin: 0, compress: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const pdfDone = new Promise((resolve) => doc.on("end", resolve));

    const W = 595.28;
    const H = 841.89;
    const M = 36;
    const CW = W - M * 2;

    doc.rect(0, 0, W, H).fill(WHITE);

    // ── HEADER ────────────────────────────────────────────────
    doc.rect(0, 0, W, 56).fill(PRIMARY);
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text("PropertyBulbul", M, 16);

    const refId = p._id.toString().substring(0, 8).toUpperCase();
    doc
      .fontSize(8)
      .text(`REF: ${refId}`, W - M - 100, 24, { width: 100, align: "right" });

    let Y = 66;

    // ── IMAGES (FIXED CROP ISSUE) ──────────────────────────────
    const imageUrls = p.image.slice(0, 5);
    const imgBuffers = await Promise.all(imageUrls.map(fetchImage));
    const validImgs = imgBuffers.filter(Boolean);

    if (validImgs.length === 0) {
      doc.rect(M, Y, CW, 150).fill(BG);
      doc
        .fontSize(10)
        .fillColor(LIGHT)
        .text("No images available", M, Y + 70, { width: CW, align: "center" });
      Y += 160;
    } else {
      const heroH = 260; // Slightly taller for better impact

      // We use FIT instead of COVER to prevent cropping
      // We fill the background with light grey to keep the layout consistent
      doc.rect(M, Y, CW, heroH).fill(BG);

      doc.image(validImgs[0], M, Y, {
        fit: [CW, heroH],
        align: "center",
        valign: "center",
      });

      // Subtle Border
      doc.rect(M, Y, CW, heroH).lineWidth(0.5).stroke("#e5e7eb");
      Y += heroH + 15;

      // Small Thumbnails Row (if more images exist)
      if (validImgs.length > 1) {
        const thumbW = (CW - 15) / 4;
        const thumbH = 70;
        let tx = M;

        validImgs.slice(1, 5).forEach((img) => {
          doc.rect(tx, Y, thumbW, thumbH).fill(BG);
          doc.image(img, tx, Y, {
            fit: [thumbW, thumbH],
            align: "center",
            valign: "center",
          });
          doc.rect(tx, Y, thumbW, thumbH).lineWidth(0.5).stroke("#e5e7eb");
          tx += thumbW + 5;
        });
        Y += thumbH + 15;
      }
    }

    // ── DEAL & TITLE ──────────────────────────────────────────
    const dealColor = p.deal === "Rent" ? "#dc2626" : "#16a34a";
    doc.roundedRect(M, Y, 60, 18, 4).fill(dealColor);
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text(p.deal.toUpperCase(), M, Y + 5, { width: 60, align: "center" });

    Y += 25;
    doc.fontSize(18).font("Helvetica-Bold").fillColor(DARK).text(p.title, M, Y);
    Y += 25;

    // ── PRICE BAR ─────────────────────────────────────────────
    doc.rect(M, Y, CW, 40).fill(PRIMARY);
    doc
      .fontSize(10)
      .fillColor(WHITE)
      .font("Helvetica")
      .text("ASKING PRICE:", M + 15, Y + 14, { continued: true });
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(`  ${formatPrice(p.price, p.deal)}`);
    Y += 55;

    // ── SPECS GRID ────────────────────────────────────────────
    const specs = [
      { l: "BEDROOMS", v: `${p.facilities?.bedrooms || 0} BHK` },
      { l: "AREA", v: `${p.area?.value || 0} ${p.area?.unit}` },
      { l: "FACING", v: p.facing },
      { l: "FURNISHING", v: p.furnishing },
    ];

    let sx = M;
    const sw = CW / 4;
    specs.forEach((s) => {
      doc.fontSize(7).fillColor(LIGHT).text(s.l, sx, Y);
      doc
        .fontSize(10)
        .fillColor(DARK)
        .font("Helvetica-Bold")
        .text(s.v, sx, Y + 12);
      sx += sw;
    });
    Y += 40;

    // ── DESCRIPTION ───────────────────────────────────────────
    doc.rect(M, Y, CW, 1).fill("#eeeeee");
    Y += 15;
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text("DETAILS & DESCRIPTION");
    Y += 15;
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(MUTED)
      .text(p.description, M, Y, { width: CW, lineGap: 3 });

    // ── FOOTER ────────────────────────────────────────────────
    const footerY = H - 60;
    doc.rect(0, footerY, W, 60).fill(BG);
    doc
      .fontSize(8)
      .fillColor(LIGHT)
      .text("Contact for Inquiry", M, footerY + 15);
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(DARK)
      .text(p.user?.phone || "Contact via Website", M, footerY + 28);

    doc
      .fontSize(10)
      .fillColor(PRIMARY)
      .text("propertybulbul.com", W - M - 150, footerY + 25, {
        width: 150,
        align: "right",
      });

    doc.end();
    await pdfDone;

    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).send("Error generating PDF");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Service running on ${PORT}`));
